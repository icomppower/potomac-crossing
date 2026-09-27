// Landmark inputs for the offline Blender build (pipelines/landmarks/build.py), from the checksummed cache:
// anchors, footprints (local metres relative to the anchor; x east, z south), ground heights on the shaped terrain
// (local MSL), bridge axes and piers. Dimensions the footprints cannot give are published figures, set in
// build.py and cited in CREDITS.md.
import { readCached } from 'harbor-engine/tools/data/cache.mjs';
import { toUTM } from 'harbor-engine/tools/geo/utm.mjs';
import { joinDC } from '../dc/buildings.mjs';

const R3 = v => Math.round(v * 1000) / 1000;

export async function prepareLandmarks({ rawDir, grid, shapedHeights }) {
  const merged = await shapedHeights({ rawDir });
  const { res, size, originE, originN } = grid, texel = size / res;
  const local = (lat, lon) => { const [E, N] = toUTM(lat, lon); return [R3(E - originE), R3(originN - N)]; };
  const ground = ([x, z]) => merged.heights[Math.max(0, Math.min(res - 1, Math.floor((z + size / 2) / texel))) * res + Math.max(0, Math.min(res - 1, Math.floor((x + size / 2) / texel)))] / 100;
  const osm = JSON.parse(readCached('osm-features.json', rawDir).toString('utf8')).elements;
  const way = id => { const w = osm.find(e => e.type === 'way' && e.id === id); if (!w) throw new Error(`landmarks: OSM way ${id} missing`); return w; };
  const ringOf = w => { const r = w.geometry.map(g => local(g.lat, g.lon)); if (r.length > 1 && r[0][0] === r.at(-1)[0] && r[0][1] === r.at(-1)[1]) r.pop(); return r; };
  const centroid = pts => {
    let A = 0, cx = 0, cz = 0;
    for (let i = 0; i < pts.length; i++) { const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % pts.length], c = x0 * z1 - x1 * z0; A += c; cx += (x0 + x1) * c; cz += (z0 + z1) * c; }
    return Math.abs(A) < 1e-6 ? [R3(pts.reduce((s, p) => s + p[0], 0) / pts.length), R3(pts.reduce((s, p) => s + p[1], 0) / pts.length)] : [R3(cx / (3 * A)), R3(cz / (3 * A))];
  };
  const rel = (r, a) => r.map(([x, z]) => [R3(x - a[0]), R3(z - a[1])]);
  const minGround = (r) => Math.min(...r.map(ground));
  const building = (slug, name, id, extra = {}) => {
    const r = ringOf(way(id)), a = centroid(r);
    return { slug, name, anchor: a, ground: R3(minGround(r)), footprint: rel(r, a), ...extra };
  };

  // bridges: the axis is the principal direction of the outline / road points; ends at the outline's extremes
  const axisOf = (pts) => {
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    let sxx = 0, szz = 0, sxz = 0; for (const [x, z] of pts) { sxx += (x - cx) ** 2; szz += (z - cz) ** 2; sxz += (x - cx) * (z - cz); }
    const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz), d = [Math.cos(ang), Math.sin(ang)];
    const t = pts.map(([x, z]) => (x - cx) * d[0] + (z - cz) * d[1]), t0 = Math.min(...t), t1 = Math.max(...t);
    const n = [-d[1], d[0]], w = pts.map(([x, z]) => (x - cx) * n[0] + (z - cz) * n[1]);
    return { c: [cx, cz], d, a: [R3(cx + d[0] * t0), R3(cz + d[1] * t0)], b: [R3(cx + d[0] * t1), R3(cz + d[1] * t1)], width: R3(Math.max(...w) - Math.min(...w)) };
  };
  const pylons = JSON.parse(readCached('noaa-enc-pylons.json', rawDir).toString('utf8')).features
    .map(f => centroid(f.geometry.rings[0].map(([lon, lat]) => local(lat, lon))));
  const bridge = (slug, name, pts, width = null) => {
    const ax = axisOf(pts), a = [R3((ax.a[0] + ax.b[0]) / 2), R3((ax.a[1] + ax.b[1]) / 2)];
    const len = Math.hypot(ax.b[0] - ax.a[0], ax.b[1] - ax.a[1]);
    // piers: charted pylons within 30 m of the axis, as distances along it from end A
    const piers = pylons.map(p => ({ t: (p[0] - ax.a[0]) * ax.d[0] + (p[1] - ax.a[1]) * ax.d[1], off: Math.abs((p[0] - ax.a[0]) * -ax.d[1] + (p[1] - ax.a[1]) * ax.d[0]) }))
      .filter(p => p.off < 30 && p.t > 0 && p.t < len).map(p => R3(p.t)).sort((x, y) => x - y);
    // the ground / riverbed profile along the axis every 6 m (for abutments and pier bases)
    const profile = []; for (let t = 0; t <= len; t += 6) profile.push(R3(ground([ax.a[0] + ax.d[0] * t, ax.a[1] + ax.d[1] * t])));
    return { slug, name, anchor: a, ground: 0, ends: [rel([ax.a], a)[0], rel([ax.b], a)[0]], length: R3(len), width: width || ax.width, piers, profile, profileStep: 6 };
  };

  const monument = building('washington-monument', 'Washington Monument', 766761337);
  const lincoln = building('lincoln-memorial', 'Lincoln Memorial', 398769543, { site: rel(ringOf(way(1332068226)), centroid(ringOf(way(398769543)))) });
  const jefferson = building('jefferson-memorial', 'Thomas Jefferson Memorial', 248460669);
  const capitol = building('capitol', 'United States Capitol', 66418809);
  // the Kennedy Center's roof from the DC LiDAR (it stands on a raised plaza over the freeway approaches)
  const dc = joinDC(JSON.parse(readCached('dc-footprints.json', rawDir).toString('utf8')), JSON.parse(readCached('dc-buildings-3d.json', rawDir).toString('utf8')));
  const inside = (r, x, y) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  const kcFp = dc.footprints.find(f => !f.missing && inside(f.rings[0], -77.05560, 38.89567));
  if (!kcFp) throw new Error('landmarks: no LiDAR footprint for the Kennedy Center');
  const msl = merged.msl;
  const kennedy = building('kennedy-center', 'Kennedy Center', 66418634, { roof: R3(kcFp.roofZ - msl), top: R3(kcFp.topZ - msl), above: R3(kcFp.above) });
  const keyPts = [6059971, 47920788, 116044305, 469146395].flatMap(id => ringOf(way(id)));
  const key = bridge('key-bridge', 'Francis Scott Key Bridge', keyPts, 27.4);
  const memorial = bridge('memorial-bridge', 'Arlington Memorial Bridge', ringOf(way(368707612)));
  return {
    note: 'Generated by pipelines/landmarks/prepare.mjs from data/raw (checksummed). Local metres: x east, z south; heights above local MSL.',
    landmarks: [monument, capitol, lincoln, jefferson, kennedy, key, memorial],
  };
}
