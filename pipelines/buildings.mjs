// Potomac Crossing's buildings (engine tools/buildings/build.mjs → hooks.js collectBuildings):
//   DC      planimetric footprints (DC GIS, through 2025) with the LiDAR roof (typical roof = area-weighted median of
//           the 3D building's up-facing triangles, NAVD88 → local MSL), walls typed by class (D4 stone and brick)
//   fallback footprints without a LiDAR height — redacted (flat LiDAR in the restricted boundaries), newer than the
//           LiDAR, or unmatched — take the OSM building covering them: `height`, else `building:levels` × 3.5 m
//           (DC floor-to-floor), else a logged default (6 m; 18 m for a redacted footprint over 1500 m², the federal
//           core). Every one is listed in the build log (index.json heights.log.fallbacks). Redacted buildings use the
//           federal limestone palette.
//   Virginia OSM buildings with no DC footprint (Rosslyn, Arlington): OSM height / levels / default, brick and glass.
// Roofs: NAIP colour (2 m core imagery for DC, 4 m for the rest) where it can be trusted.
import { joinDC } from './dc/buildings.mjs';

const LEVEL = 3.5, FEDERAL_DEFAULT = 18, FEDERAL_AREA = 1500;
const parseH = v => parseFloat(String(v || '').replace(/[^\d.]/g, ''));

export function collectBuildings(kit) {
  const { local, cleanRing, inside, area2, finish, msl, DEFAULT_HEIGHT } = kit;
  const log = { dcLidar: 0, redacted: 0, newer: 0, unmatched: 0, osmHeight: 0, osmLevels: 0, defaults: 0, virginia: 0, skipped: 0, fallbacks: [] };
  const core = kit.naip('naip-core.tif'), all = kit.naip('naip-dc.tif');
  const naip = rings => core(rings) || all(rings);
  const style = { dc: { walls: null, roofs: 'city', naip, src: 'dc' }, federal: { walls: 'federal', roofs: 'city', naip, src: 'dc' }, va: { walls: 'arlington', roofs: 'city', naip: all, src: 'osm' } };
  const anchors = kit.landmarkAnchors();
  const excluded = [];

  // OSM building ways in local metres, gridded by 100 m for lookups
  const osm = kit.readJSON('osm-buildings.json').elements.filter(e => e.type === 'way' && e.tags?.building && e.geometry?.length >= 4).sort((a, b) => a.id - b.id)
    .map(w => ({ w, ring: cleanRing(w.geometry.map(g => local(g.lat, g.lon))) })).filter(o => o.ring && Math.abs(area2(o.ring)) >= 2);
  const G = 100, grid = new Map(), cellKey = (x, z) => `${Math.floor(x / G)},${Math.floor(z / G)}`;
  const bbox = r => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return [x0, z0, x1, z1]; };
  const index = (item, r) => { const [x0, z0, x1, z1] = bbox(r); for (let i = Math.floor(x0 / G); i <= Math.floor(x1 / G); i++) for (let j = Math.floor(z0 / G); j <= Math.floor(z1 / G); j++) { const k = `${i},${j}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(item); } };
  for (const o of osm) index({ osm: o }, o.ring);
  const centroid = r => { let A = 0, cx = 0, cz = 0; for (let i = 0; i < r.length; i++) { const [x0, z0] = r[i], [x1, z1] = r[(i + 1) % r.length], c = x0 * z1 - x1 * z0; A += c; cx += (x0 + x1) * c; cz += (z0 + z1) * c; } return Math.abs(A) < 1e-9 ? r[0] : [cx / (3 * A), cz / (3 * A)]; };
  const osmAt = ([x, z]) => (grid.get(cellKey(x, z)) || []).map(e => e.osm).filter(Boolean).find(o => inside(o.ring, x, z));
  const landmarkIn = polys => anchors.find(a => polys.some(poly => inside(poly[0], a.p[0], a.p[1])));

  // DC footprints + LiDAR
  const dc = joinDC(kit.readJSON('dc-footprints.json'), kit.readJSON('dc-buildings-3d.json'));
  const dcCells = new Map();
  for (const f of dc.footprints) {
    const polys = [f.rings.map(r => cleanRing(r.map(([lon, lat]) => local(lat, lon)))).filter(Boolean)].filter(p => p.length && Math.abs(area2(p[0])) > 1);
    if (!polys.length) { log.skipped++; continue; }
    const id = 'dc' + f.id, c = centroid(polys[0][0]);
    // DC coverage, to leave out duplicate OSM buildings
    const k = cellKey(c[0], c[1]); if (!dcCells.has(k)) dcCells.set(k, []); dcCells.get(k).push(polys[0][0]);
    const lm = landmarkIn(polys);
    if (lm) { excluded.push({ landmark: lm.name, id }); continue; }
    if (!f.missing) { log.dcLidar++; finish(id, polys, f.above, f.roofZ - msl, style.dc); continue; }
    log[f.missing]++;
    const o = osmAt(c), area = Math.abs(area2(polys[0][0])) / 2;
    let h, source;
    if (o && parseH(o.w.tags.height) > 0) { h = parseH(o.w.tags.height); source = 'osm-height'; log.osmHeight++; }
    else if (o && parseFloat(o.w.tags['building:levels']) > 0) { h = parseFloat(o.w.tags['building:levels']) * LEVEL; source = 'osm-levels'; log.osmLevels++; }
    else { h = f.missing === 'redacted' && area > FEDERAL_AREA ? FEDERAL_DEFAULT : DEFAULT_HEIGHT; source = 'default'; log.defaults++; }
    log.fallbacks.push({ id, why: f.missing, source, height: Math.round(h * 10) / 10, osm: o ? o.w.id : null });
    finish(id, polys, h, null, f.missing === 'redacted' ? style.federal : style.dc);
  }

  // Virginia (and anything else DC does not map): OSM buildings whose centroid is in no DC footprint
  for (const o of osm) {
    const c = centroid(o.ring);
    const covered = [-1, 0, 1].some(di => [-1, 0, 1].some(dj => (dcCells.get(`${Math.floor(c[0] / G) + di},${Math.floor(c[1] / G) + dj}`) || []).some(r => inside(r, c[0], c[1]) || inside(o.ring, ...centroid(r)))));
    if (covered) continue;
    const polys = [[o.ring]], lm = landmarkIn(polys);
    if (lm) { excluded.push({ landmark: lm.name, id: 'osm' + o.w.id }); continue; }
    const hT = parseH(o.w.tags.height), lv = parseFloat(o.w.tags['building:levels']);
    const h = hT > 0 ? hT : lv > 0 ? lv * LEVEL : DEFAULT_HEIGHT;
    log.virginia++;
    finish('osm' + o.w.id, polys, h, null, style.va);
  }
  return { log, excluded };
}
