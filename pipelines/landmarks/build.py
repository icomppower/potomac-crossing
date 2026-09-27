# Offline landmark builder (Blender 5.2, headless): procedural exterior massing (public-view detail only, no
# interiors or security features, D4) from published dimensions and the prepared footprints / bridge axes
# (pipelines/landmarks/prepare.mjs via hooks.js), exported as three LOD GLBs per landmark.
#   blender -b --factory-startup --python pipelines/landmarks/build.py -- <input.json> <out_dir>
# Blender axes: X east, Y north, Z up (the glTF exporter turns this into x east, y up, z south).
# Published dimensions are cited in CREDITS.md (Landmarks).
import bpy, json, math, sys, os

args = sys.argv[sys.argv.index('--') + 1:]
INP, OUT = args[0], args[1]
data = json.load(open(INP))
os.makedirs(OUT, exist_ok=True)

def srgb(r, g, b):
    f = lambda c: (c / 255) / 12.92 if c / 255 <= 0.04045 else (((c / 255) + 0.055) / 1.055) ** 2.4
    return (f(r), f(g), f(b), 1.0)

PALETTE = {  # name: (sRGB, roughness, metallic)
    'marble': ((234, 231, 222), 0.5, 0.0),      # Maryland / Colorado Yule marble, Georgia white marble
    'sandstone': ((226, 219, 204), 0.7, 0.0),   # the Capitol's painted sandstone / marble wings
    'granite': ((184, 180, 172), 0.8, 0.0),     # Memorial Bridge facing, Lincoln Memorial terraces
    'concrete': ((178, 174, 166), 0.9, 0.0),    # Key Bridge
    'dome': ((240, 238, 232), 0.45, 0.0),       # the Capitol's painted cast-iron dome
    'roof': ((108, 112, 110), 0.7, 0.1),
    'bronze': ((120, 96, 62), 0.45, 0.7),       # Kennedy Center columns, lamp posts
    'dark': ((64, 66, 68), 0.6, 0.3),
    'glass': ((70, 80, 86), 0.15, 0.2),
}
MATS = {}

def make_materials():
    MATS.clear()
    for name, (rgb, rough, metal) in PALETTE.items():
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        p = m.node_tree.nodes.get('Principled BSDF')
        p.inputs['Base Color'].default_value = srgb(*rgb)
        p.inputs['Roughness'].default_value = rough
        p.inputs['Metallic'].default_value = metal
        MATS[name] = m

def area(r): return sum(r[i][0] * r[(i + 1) % len(r)][1] - r[(i + 1) % len(r)][0] * r[i][1] for i in range(len(r))) / 2
def bl(p): return (p[0], -p[1])  # local (x east, z south) -> Blender (x east, y north)
def centroid(r): return (sum(p[0] for p in r) / len(r), sum(p[1] for p in r) / len(r))
def pca_angle(ring):
    cx, cy = centroid(ring)
    sxx = sum((p[0] - cx) ** 2 for p in ring); syy = sum((p[1] - cy) ** 2 for p in ring); sxy = sum((p[0] - cx) * (p[1] - cy) for p in ring)
    return 0.5 * math.atan2(2 * sxy, sxx - syy)
def extent(ring, ang):
    c, s = math.cos(-ang), math.sin(-ang)
    xs = [p[0] * c - p[1] * s for p in ring]; ys = [p[0] * s + p[1] * c for p in ring]
    return max(xs) - min(xs), max(ys) - min(ys), ((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2)
def rot(x, y, ang): c, s = math.cos(ang), math.sin(ang); return (x * c - y * s, x * s + y * c)
def mean_radius(ring): cx, cy = centroid(ring); return sum(math.hypot(x - cx, y - cy) for x, y in ring) / len(ring)

class Builder:
    def __init__(self): self.parts = {}
    def add(self, material, verts, faces):
        v, f = self.parts.setdefault(material, ([], []))
        o = len(v); v.extend(verts); f.extend([tuple(i + o for i in face) for face in faces])
    def box(self, m, cx, cy, z0, sx, sy, h, ang=0.0, top_scale=1.0):
        c, s = math.cos(ang), math.sin(ang)
        pts = []
        for z, k in ((z0, 1.0), (z0 + h, top_scale)):
            for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                x, y = dx * sx / 2 * k, dy * sy / 2 * k
                pts.append((cx + x * c - y * s, cy + x * s + y * c, z))
        self.add(m, pts, [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)])
    def prism(self, m, ring, z0, z1, scale_top=1.0, centre=(0, 0)):
        if area(ring) < 0: ring = ring[::-1]
        n = len(ring); cx, cy = centre
        bot = [(x, y, z0) for x, y in ring]
        top = [(cx + (x - cx) * scale_top, cy + (y - cy) * scale_top, z1) for x, y in ring]
        faces = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)] + [tuple(range(n, 2 * n))]
        self.add(m, bot + top, faces)
    def cylinder(self, m, cx, cy, r0, r1, z0, z1, seg, cap=True):
        ring0 = [(cx + math.cos(2 * math.pi * i / seg) * r0, cy + math.sin(2 * math.pi * i / seg) * r0, z0) for i in range(seg)]
        ring1 = [(cx + math.cos(2 * math.pi * i / seg) * r1, cy + math.sin(2 * math.pi * i / seg) * r1, z1) for i in range(seg)]
        faces = [(i, (i + 1) % seg, seg + (i + 1) % seg, seg + i) for i in range(seg)] + ([tuple(range(seg, 2 * seg))] if cap else [])
        self.add(m, ring0 + ring1, faces)
    def dome(self, m, cx, cy, r, z0, h, seg, rings):
        # a surface of revolution: radius r at z0 closing to a point h above (an elliptical profile)
        verts, faces = [], []
        for k in range(rings + 1):
            a = (math.pi / 2) * k / rings
            rr, zz = r * math.cos(a), z0 + h * math.sin(a)
            for i in range(seg):
                t = 2 * math.pi * i / seg
                verts.append((cx + math.cos(t) * rr, cy + math.sin(t) * rr, zz))
        for k in range(rings):
            for i in range(seg):
                a0, a1 = k * seg + i, k * seg + (i + 1) % seg
                faces.append((a0, a1, a1 + seg, a0 + seg))
        self.add(m, verts, faces)
    def strip_wall(self, m, pts, bottoms, tops, half):
        # a wall of thickness 2·half along a polyline (x, y) with per-point bottom / top heights
        n = len(pts)
        dirs = []
        for i in range(n):
            a, b = pts[max(i - 1, 0)], pts[min(i + 1, n - 1)]
            d = (b[0] - a[0], b[1] - a[1]); l = math.hypot(*d) or 1; dirs.append((-d[1] / l, d[0] / l))
        verts = []
        for i in range(n):
            nx, ny = dirs[i]
            for side in (-1, 1):
                x, y = pts[i][0] + side * half * nx, pts[i][1] + side * half * ny
                verts += [(x, y, bottoms[i]), (x, y, tops[i])]
        faces = []
        for i in range(n - 1):
            L0, L1 = i * 4, (i + 1) * 4  # per point: [left-bottom, left-top, right-bottom, right-top]
            faces += [(L0, L1, L1 + 1, L0 + 1), (L0 + 2, L0 + 3, L1 + 3, L1 + 2), (L0 + 1, L1 + 1, L1 + 3, L0 + 3), (L0, L0 + 2, L1 + 2, L1)]
        faces += [(0, 1, 3, 2), ((n - 1) * 4, (n - 1) * 4 + 2, (n - 1) * 4 + 3, (n - 1) * 4 + 1)]
        self.add(m, verts, faces)
    def build(self, name, location):
        for mname, (v, f) in sorted(self.parts.items()):
            me = bpy.data.meshes.new(f'{name}_{mname}')
            me.from_pydata(v, [], f)
            me.validate(); me.update()
            for poly in me.polygons: poly.use_smooth = False
            me.materials.append(MATS[mname])
            ob = bpy.data.objects.new(f'{name}_{mname}', me)
            ob.location = location
            bpy.context.scene.collection.objects.link(ob)

SEG = (32, 16, 8)  # round parts per LOD

# ------------------------------------------------------------------------------------------- the landmarks

def washington_monument(L, lod):
    # Washington Monument (1884): 555 ft 5 1/8 in (169.29 m); shaft 55 ft 1 1/2 in (16.80 m) square at the base
    # tapering to 34 ft 5 5/8 in (10.51 m) at 500 ft (152.4 m); pyramidion 55 ft (16.8 m). Square to the compass.
    B = Builder(); g = L['ground']
    k = 10.51 / 16.80
    B.box('marble', 0, 0, g - 1, 16.80, 16.80, 152.4 + 1, 0.0, k)
    B.box('marble', 0, 0, g + 152.4, 10.51, 10.51, 169.29 - 152.4, 0.0, 0.02)
    if lod < 2:  # the round plaza and its low retaining ring
        B.cylinder('granite', 0, 0, 38.0, 38.0, g - 1.5, g + 0.25, SEG[lod])
    return B

def capitol(L, lod):
    # United States Capitol: wings and centre from the OSM footprint (751 ft x 350 ft); roofline 25 m above the
    # east plaza; the dome (1866): peristyle drum, attic, cast-iron dome 96 ft (29.3 m) across, tholos and the
    # Statue of Freedom, 288 ft (87.8 m) above the east front plaza.
    B = Builder(); g = L['ground']
    ring = [bl(p) for p in L['footprint']]
    B.prism('sandstone', ring, g - 1, g + 25.0)
    if lod < 2: B.prism('roof', ring, g + 25.0, g + 26.5, 0.97, centroid(ring))
    s = SEG[lod]
    B.cylinder('sandstone', 0, 0, 20.5, 20.5, g + 26.5, g + 31.0, s)            # rotunda base
    if lod == 0:
        for i in range(36):                                                     # the peristyle's 36 columns
            a = 2 * math.pi * i / 36
            B.cylinder('dome', math.cos(a) * 19.2, math.sin(a) * 19.2, 0.75, 0.68, g + 31.0, g + 41.5, 8)
        B.cylinder('dome', 0, 0, 17.0, 17.0, g + 31.0, g + 41.5, s)            # drum behind the columns
    else:
        B.cylinder('dome', 0, 0, 19.2, 19.2, g + 31.0, g + 41.5, s)
    B.cylinder('dome', 0, 0, 19.8, 19.8, g + 41.5, g + 43.5, s)                # entablature
    B.cylinder('dome', 0, 0, 16.6, 16.2, g + 43.5, g + 51.0, s)                # attic
    B.dome('dome', 0, 0, 14.65, g + 51.0, 21.0, s, (8, 5, 3)[lod])            # the dome (to 72 m)
    B.cylinder('dome', 0, 0, 3.6, 3.0, g + 72.0, g + 80.0, max(8, s // 2))     # tholos
    B.cylinder('bronze', 0, 0, 1.4, 0.5, g + 80.0, g + 87.8, 8)               # Statue of Freedom (massing)
    return B

def lincoln_memorial(L, lod):
    # Lincoln Memorial (1922): colonnade 189.7 ft x 118.5 ft (57.8 x 36.1 m), 36 Doric columns 44 ft (13.4 m)
    # high, 7.5 ft (2.3 m) at the base; nearly 100 ft (30.2 m) high; on a terraced base; faces east.
    B = Builder(); g = L['ground']
    ring = [bl(p) for p in L['footprint']]
    ang = pca_angle(ring)                    # the long (north-south) axis
    ln, wd, (ox, oy) = extent(ring, ang)
    cx, cy = rot(ox, oy, ang)
    B.box('marble', cx, cy, g - 1, ln + 3.2, wd + 3.9, 1 + 3.4, ang)           # stylobate
    z0, zc = g + 3.4, g + 3.4 + 13.4
    if lod == 0:
        n_long, n_short = 12, 8                                                 # 36 columns round the colonnade
        pts = [(-ln / 2 + ln * i / (n_long - 1), s * wd / 2) for s in (-1, 1) for i in range(n_long)] \
            + [(s * ln / 2, -wd / 2 + wd * i / (n_short - 1)) for s in (-1, 1) for i in range(1, n_short - 1)]
        for px, py in pts:
            x, y = rot(px, py, ang)
            B.cylinder('marble', cx + x, cy + y, 1.15, 0.9, z0, zc, 12)
        B.box('marble', cx, cy, z0, ln - 8.0, wd - 8.0, zc - z0, ang)          # the cella walls
    else:
        B.box('marble', cx, cy, z0, ln, wd, zc - z0, ang)
    B.box('marble', cx, cy, zc, ln + 1.0, wd + 1.0, 4.0, ang)                   # entablature and frieze
    B.box('marble', cx, cy, zc + 4.0, ln - 6.0, wd - 6.0, g + 30.2 - zc - 4.0, ang)  # attic
    # (the terraced grounds and approach steps are in the LiDAR terrain; no separate site slab)
    return B

def jefferson_memorial(L, lod):
    # Thomas Jefferson Memorial (1943): circular colonnade of 26 Ionic columns 41 ft (12.5 m) high, shallow dome
    # rising 129 ft (39.3 m) above the ground; portico to the north; on a raised plinth and steps.
    B = Builder(); g = L['ground']
    ring = [bl(p) for p in L['footprint']]
    R = mean_radius(ring)
    s = SEG[lod]
    B.prism('granite', ring, g - 1, g + 1.0)                                    # the site / terrace
    B.cylinder('marble', 0, 0, R * 0.62, R * 0.62, g + 1.0, g + 7.5, s)        # plinth
    zc0, zc1 = g + 7.5, g + 7.5 + 12.5
    rc = R * 0.52
    if lod == 0:
        for i in range(26):
            a = 2 * math.pi * i / 26
            B.cylinder('marble', math.cos(a) * rc, math.sin(a) * rc, 0.8, 0.65, zc0, zc1, 10)
        B.cylinder('marble', 0, 0, rc - 4.0, rc - 4.0, zc0, zc1, s)             # the inner wall
    else:
        B.cylinder('marble', 0, 0, rc, rc, zc0, zc1, s)
    B.cylinder('marble', 0, 0, rc + 1.0, rc + 1.0, zc1, zc1 + 3.0, s)           # entablature
    B.cylinder('marble', 0, 0, rc * 0.92, rc * 0.9, zc1 + 3.0, zc1 + 6.0, s)    # attic steps
    B.dome('dome', 0, 0, rc * 0.9, zc1 + 6.0, g + 39.3 - zc1 - 6.0, s, (8, 5, 3)[lod])
    # portico facing north (towards the White House): 8 columns across, pediment
    py = rc + 7.0
    if lod > 0: B.box('marble', 0, py, zc0, 30.0, 14.0, 12.5, 0.0)
    if lod == 0:
        for i in range(8):
            B.cylinder('marble', -13.5 + i * 27.0 / 7, rc + 13.0, 0.8, 0.65, zc0, zc1, 10)
    B.box('marble', 0, py, zc1, 31.0, 15.0, 3.0, 0.0)
    B.box('marble', 0, py, zc1 + 3.0, 31.0, 15.0, 6.0, 0.0, 0.05)              # pediment (massing)
    B.box('granite', 0, py + 12.0, g + 1.0, 34.0, 14.0, 6.5, 0.0, 0.6)          # the steps
    return B

def kennedy_center(L, lod):
    # Kennedy Center (1971): 630 ft x 300 ft x 100 ft (192 x 91 x 30.5 m) white marble box; the roof slab
    # overhangs the walls, carried by slender bronze-coloured columns round a perimeter terrace. Heights from the
    # DC LiDAR (roof, top, plaza), not a published figure.
    B = Builder(); g = L['ground']
    ring = [bl(p) for p in L['footprint']]
    ang = pca_angle(ring)
    ln, wd, (ox, oy) = extent(ring, ang)
    cx, cy = rot(ox, oy, ang)
    top = L['roof']                           # DC LiDAR: typical roof above local MSL
    plaza = L['top'] - L['above']            # the raised plaza the building stands on (LiDAR top − height)
    base = min(g, plaza) - 1
    B.box('granite', cx, cy, base, ln + 10, wd + 10, plaza - base, ang)         # the plaza / river terrace
    B.box('marble', cx, cy, plaza, ln - 8.0, wd - 8.0, top - plaza - 2.0, ang)  # the marble walls, set back
    B.box('marble', cx, cy, top - 2.0, ln + 2.0, wd + 2.0, 2.0, ang)            # roof slab
    if lod == 0:
        step = 6.4
        for side in (-1, 1):
            for i in range(int(ln // step) + 1):
                x, y = rot(-ln / 2 + i * step, side * wd / 2, ang)
                B.box('bronze', cx + x, cy + y, plaza, 0.9, 0.9, top - 2.0 - plaza, ang)
            for i in range(1, int(wd // step)):
                x, y = rot(side * ln / 2, -wd / 2 + i * step, ang)
                B.box('bronze', cx + x, cy + y, plaza, 0.9, 0.9, top - 2.0 - plaza, ang)
    if lod < 2: B.box('roof', cx, cy, top, ln - 20.0, wd - 20.0, max(0.5, L['top'] - top), ang)  # rooftop pavilions to the LiDAR top
    return B

def arch_bridge(L, lod, deck, springs, crown_below, material, spandrel_open=False, pier_w=4.0):
    # piers at `springs` (distances along the axis from end A); between them arches whose soffit rises from
    # the pier bases to `deck - crown_below`; solid spandrels (masonry) or open ones with posts (concrete).
    B = Builder()
    (ax, ay), (bx, by) = bl(L['ends'][0]), bl(L['ends'][1])
    ln = math.hypot(bx - ax, by - ay); d = ((bx - ax) / ln, (by - ay) / ln)
    at = lambda t: (ax + d[0] * t, ay + d[1] * t)
    prof, step = L['profile'], L['profileStep']
    gnd = lambda t: prof[max(0, min(len(prof) - 1, int(round(t / step))))]
    half = L['width'] / 2
    stops = [0.0] + list(springs) + [ln]
    n_seg = (24, 12, 6)[lod]
    for i in range(len(stops) - 1):
        t0, t1 = stops[i], stops[i + 1]
        spring = max(0.8, min(gnd(t0 + 1), gnd(t1 - 1), deck - crown_below - 2) + 0.5) if 0 < i < len(stops) - 2 else None
        pts, bots, tops = [], [], []
        for k in range(n_seg + 1):
            t = t0 + (t1 - t0) * k / n_seg
            u = (t - t0) / (t1 - t0)
            if spring is None:   # abutment spans: solid down to the ground
                soffit = gnd(t) - 1
            else:
                soffit = spring + (deck - crown_below - spring) * math.sin(math.pi * u) ** 0.6
            pts.append(at(t)); bots.append(soffit); tops.append(deck)
        if spandrel_open and spring is not None and lod < 2:
            # open spandrel: the arch rib (1.8 m deep) plus posts to the deck slab
            B.strip_wall(material, pts, bots, [b + 1.8 for b in bots], half - 1.0)
            for k in range(2, n_seg - 1, 2 if lod == 0 else 4):
                x, y = pts[k]
                for side in (-1, 1):
                    px, py = x + side * (half - 2.5) * -d[1], y + side * (half - 2.5) * d[0]
                    B.box(material, px, py, bots[k] + 1.8, 1.2, 1.2, deck - 1.2 - bots[k] - 1.8, math.atan2(d[1], d[0]))
            B.strip_wall(material, pts, [deck - 1.2] * len(pts), tops, half)
        else:
            B.strip_wall(material, pts, bots, tops, half)
    for t in springs:  # piers down to the bed, with cutwaters
        x, y = at(t)
        B.box(material, x, y, gnd(t) - 2, pier_w, L['width'] + 3.0, deck - 1.0 - gnd(t) + 2, math.atan2(d[1], d[0]))
    B.strip_wall(material, [at(0), at(ln)], [deck, deck], [deck + 1.1, deck + 1.1], half)  # parapets / railing (massing)
    return B

def key_bridge(L, lod):
    # Francis Scott Key Bridge (1923): reinforced-concrete open-spandrel arch bridge, 1,781 ft (543 m), seven
    # arches; charted vertical clearance 18.5 m over the 24.3 m navigation width (NOAA ENC); 91 ft wide.
    # No charted piers: seven equal spans over the river length.
    ln = L['length']
    springs = [ln * k / 7 for k in range(1, 7)]
    deck = 0.47 + 18.5 + 2.6  # MHW above local MSL (NOAA 8594900) + charted clearance + rib and deck depth
    return arch_bridge(L, lod, deck, springs, 2.6, 'concrete', spandrel_open=True, pier_w=5.0)

def memorial_bridge(L, lod):
    # Arlington Memorial Bridge (1932): nine spans of granite-faced concrete arches (the centre one a former
    # bascule), 2,163 ft (659 m), 90 ft (27.4 m) wide deck with sidewalks; piers from the NOAA ENC pylons.
    prof = L['profile']
    deck = max(prof[0], prof[-1]) + 0.6  # level with its approaches
    return arch_bridge(L, lod, deck, L['piers'], 1.4, 'granite', spandrel_open=False, pier_w=6.0)

BUILDERS = {'washington-monument': washington_monument, 'capitol': capitol, 'lincoln-memorial': lincoln_memorial,
            'jefferson-memorial': jefferson_memorial, 'kennedy-center': kennedy_center, 'key-bridge': key_bridge,
            'memorial-bridge': memorial_bridge}

for L in data['landmarks']:
    for lod in (0, 1, 2):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        make_materials()
        B = BUILDERS[L['slug']](L, lod)
        ax, az = L['anchor']
        B.build(f"{L['slug']}_lod{lod}", (ax, -az, 0.0))
        path = os.path.join(OUT, f"{L['slug']}_lod{lod}.glb")
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_yup=True, export_apply=True,
                                  export_materials='EXPORT', export_texcoords=False, export_normals=True,
                                  export_extras=False, export_cameras=False, export_lights=False, use_selection=False)
        print('wrote', path)
