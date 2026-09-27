// Water-taxi facts → public/ferry/schedule.json: the terminals (OSM ferry landings, frame metres) and the
// published trip time (The Wharf DC / City Cruises: Wharf ↔ Georgetown about 30 minutes; facts only).
//   node pipelines/ferry/prepare.mjs [--raw <dir>] [--out <file>]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain, loadMap } from 'harbor-engine/tools/lib/title.mjs';
import { readCached, RAW } from 'harbor-engine/tools/data/cache.mjs';
import { toUTM } from 'harbor-engine/tools/geo/utm.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const R3 = v => Math.round(v * 1000) / 1000;
export const PUBLISHED_MINUTES = 30; // The Wharf DC, "Water Taxi": approximate trip time Wharf → Georgetown 30 min

export function prepareFerry({ rawDir = RAW } = {}) {
  const { originE, originN } = loadMap().frame;
  const osm = JSON.parse(readCached('osm-features.json', rawDir).toString('utf8')).elements;
  const stop = name => {
    const n = osm.find(e => e.type === 'node' && e.tags?.amenity === 'ferry_terminal' && e.tags.name === name);
    if (!n) throw new Error(`ferry: no OSM ferry terminal "${name}"`);
    const [E, N] = toUTM(n.lat, n.lon);
    return { stopId: 'osm' + n.id, name, lat: n.lat, lon: n.lon, x: R3(E - originE), z: R3(originN - N) };
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
