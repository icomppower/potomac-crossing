// Water-taxi facts → public/ferry/schedule.json: the terminals (OSM ferry landings) and the published trip time
// (The Wharf DC / City Cruises: Wharf ↔ Georgetown about 30 minutes; facts only). Each terminal's x, z is its
// berth: the nearest point to the landing (within 60 m) with at least draft + 1.5 m of water under it and
// draft + 0.5 m everywhere within half the hull's length + 2 m (the shipped terrain) — the landing nodes sit on
// the quay edge, where a hull would ground.
//   node pipelines/ferry/prepare.mjs [--raw <dir>] [--out <file>]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain, loadMap } from 'harbor-engine/tools/lib/title.mjs';
import { readCached, RAW } from 'harbor-engine/tools/data/cache.mjs';
import { toUTM } from 'harbor-engine/tools/geo/utm.mjs';
import { decodeTerrain } from 'harbor-engine/gates/lib/tiles.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const R3 = v => Math.round(v * 1000) / 1000;
export const PUBLISHED_MINUTES = 30; // The Wharf DC, "Water Taxi": approximate trip time Wharf → Georgetown 30 min

export function prepareFerry({ rawDir = RAW } = {}) {
  const { originE, originN } = loadMap().frame;
  const osm = JSON.parse(readCached('osm-features.json', rawDir).toString('utf8')).elements;
  const { vessel } = loadMap(), T = decodeTerrain(join(root, 'public/terrain')), { res, size } = T.index;
  const depth = (x, z) => { const i = Math.floor((x + size / 2) / 3), j = Math.floor((z + size / 2) / 3); return i < 0 || j < 0 || i >= res || j >= res ? 0 : -T.h[j * res + i]; };
  const clear = vessel.length / 2 + 2; // the hull may lie any way round at the berth
  const berthOf = (x0, z0) => {
    let best = null;
    for (let dz = -60; dz <= 60; dz += 3) for (let dx = -60; dx <= 60; dx += 3) {
      const x = x0 + dx, z = z0 + dz, d = Math.hypot(dx, dz);
      if (best && d >= best.d) continue;
      if (depth(x, z) < vessel.draft + 1.5) continue;
      let ok = true;
      for (let a = 0; a < 16 && ok; a++) ok = depth(x + Math.cos(a * Math.PI / 8) * clear, z + Math.sin(a * Math.PI / 8) * clear) >= vessel.draft + 0.5;
      if (ok) best = { x, z, d };
    }
    if (!best) throw new Error(`ferry: no berth with ${vessel.draft + 1.5} m of water within 60 m of (${x0}, ${z0})`);
    return best;
  };
  const stop = name => {
    const n = osm.find(e => e.type === 'node' && e.tags?.amenity === 'ferry_terminal' && e.tags.name === name);
    if (!n) throw new Error(`ferry: no OSM ferry terminal "${name}"`);
    const [E, N] = toUTM(n.lat, n.lon), lx = E - originE, lz = originN - N, b = berthOf(lx, lz);
    return { stopId: 'osm' + n.id, name, lat: n.lat, lon: n.lon, landing: [R3(lx), R3(lz)], x: R3(b.x), z: R3(b.z), offset: R3(b.d) };
  };
  return {
    source: 'Terminals: OpenStreetMap ferry landings (ODbL). Trip time: The Wharf DC, "Water Taxi" (wharfdc.com/getting-here/water-taxi) and City Cruises, "Potomac Water Taxi"; facts only',
    terminals: { georgetown: [stop('Georgetown Ferry Landing')], wharf: [stop('The Wharf Ferry Landing')] },
    publishedMinutes: { toWharf: [PUBLISHED_MINUTES], toGeorgetown: [PUBLISHED_MINUTES] },
  };
}

if (isMain(import.meta.url)) {
  const out = arg('--out', join(root, 'public/ferry/schedule.json'));
  mkdirSync(dirname(out), { recursive: true });
  const s = prepareFerry({ rawDir: arg('--raw', RAW) });
  writeFileSync(out, JSON.stringify(s, null, 1) + '\n');
  console.log(`ferry: ${s.terminals.georgetown[0].name} (${s.terminals.georgetown[0].x}, ${s.terminals.georgetown[0].z}) → ${s.terminals.wharf[0].name} (${s.terminals.wharf[0].x}, ${s.terminals.wharf[0].z}), ${PUBLISHED_MINUTES} min published`);
}
