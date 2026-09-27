// Potomac Crossing's terrain hooks (engine tools/terrain/build.mjs): authored shallow basins and water bodies
// (D5, D15). The topobathy has no depths inside the Tidal Basin (only its flat surface) and the LiDAR sees the
// pools' water surfaces, so their beds are authored and logged here:
//   Tidal Basin      tidal, at local MSL; bed carved to 3.0 m (≈ 10 ft, NPS) with a 25 m shelving edge
//   Reflecting Pool  still pool; level = median LiDAR water surface inside the pool; bed 0.6 m below it
//                    (NPS: 18–30 in deep); vertical coping
//   Capitol Reflecting Pool  still pool; level as above; bed 0.5 m below it
import { readCached } from 'harbor-engine/tools/data/cache.mjs';

const POOLS = [
  { osm: 26755238, id: 'tidal-basin', name: 'Tidal Basin', preset: 'still-pool', tidal: true, depth: 3.0, shelf: 25 },
  { osm: 990979896, id: 'reflecting-pool', name: 'Lincoln Memorial Reflecting Pool', preset: 'still-pool', depth: 0.6 },
  { osm: 24238580, id: 'capitol-reflecting-pool', name: 'Capitol Reflecting Pool', preset: 'still-pool', depth: 0.5 },
];

function polygons(kit) {
  const osm = JSON.parse(readCached('osm-features.json', kit.rawDir).toString('utf8')).elements;
  return POOLS.map(p => {
    const w = osm.find(e => e.type === 'way' && e.id === p.osm);
    if (!w) throw new Error(`terrain hooks: OSM way ${p.osm} (${p.name}) not in osm-features.json`);
    return { ...p, rings: [[w.geometry.map(g => [g.lat, g.lon])]] };
  });
}

const median = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
let cache = null;
// the pools with their cells and levels, measured once on the unshaped heights
function measure(kit) {
  if (cache && cache.kit === kit) return cache.pools;
  const pools = polygons(kit).map(p => {
    const cells = p.rings.flatMap(r => kit.cellsIn(r));
    const level = p.tidal ? 0 : median(cells.map(kit.height));
    return { ...p, cells, level };
  });
  cache = { kit, pools };
  return pools;
}

export function shapeTerrain(kit) {
  const log = {};
  for (const p of measure(kit)) {
    const d = kit.edgeDistance(p.cells);
    let lowered = 0;
    for (const k of p.cells) {
      const bed = p.level - (p.shelf ? Math.min(p.depth, 0.5 + (p.depth - 0.5) * Math.min(1, (d.get(k) - kit.texel) / p.shelf)) : p.depth);
      if (bed < kit.height(k)) { kit.setHeight(k, bed); lowered++; }
    }
    log[p.id] = { level: +p.level.toFixed(3), bed: p.depth, cells: p.cells.length, lowered };
  }
  return log;
}

export function waterBodies(kit) {
  return measure(kit).map(p => ({ id: p.id, name: p.name, preset: p.preset, level: p.level, rings: p.rings }));
}
