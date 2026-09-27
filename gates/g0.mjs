// G0 Data: buildings + heights, terrain, Potomac depth and trees are downloaded by script (pipelines/data/fetch.mjs),
// cached in data/raw/, checksummed, plausible, and their licences recorded (sources.json + CREDITS.md); the
// redacted-area building count is reported (DC LiDAR: all returns but ground removed inside restricted boundaries).
// --negative: each mutation of a temp copy of the cache must be caught.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import 'harbor-engine/tools/lib/configured.mjs';
import { readTiff } from 'harbor-engine/tools/geo/tiff.mjs';
import { toUTM } from 'harbor-engine/tools/geo/utm.mjs';
import { SOURCES, naipBox, NAIP_ALL, CORE } from '../pipelines/data/fetch.mjs';
import { joinDC } from '../pipelines/dc/buildings.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const map = JSON.parse(readFileSync(join(root, 'map.json'), 'utf8'));
const { minE, minN, maxE, maxN } = map.slice.extent;
const G = 3, W = (maxE - minE) / G, H = (maxN - minN) / G;
const LICENCE_WORD = f => /^dc-/.test(f) ? 'CC BY 4.0' : /^osm-/.test(f) ? 'ODbL' : 'Public domain';

function check(dir, credits, report = null) {
  const fail = [];
  const req = (ok, msg) => { if (!ok) fail.push(msg); return ok; };
  const json = f => JSON.parse(readFileSync(join(dir, f), 'utf8'));

  // 1. cache + checksums
  const manPath = join(dir, 'MANIFEST.sha256');
  if (!req(existsSync(manPath), 'MANIFEST.sha256 missing')) return fail;
  const manifest = Object.fromEntries(readFileSync(manPath, 'utf8').trim().split('\n').map(l => l.split(/\s+/).reverse()));
  for (const s of SOURCES) {
    const p = join(dir, s.file);
    if (!req(existsSync(p), `${s.file} missing from cache`)) continue;
    req(manifest[s.file] === createHash('sha256').update(readFileSync(p)).digest('hex'), `${s.file} checksum does not match MANIFEST`);
  }
  if (fail.length) return fail;

  // 2. licences: sources.json per file; CREDITS.md names the file with its licence
  const sources = json('sources.json');
  for (const s of SOURCES) {
    req(sources[s.file]?.licence, `${s.file} has no licence in sources.json`);
    const line = credits.split('\n').find(l => l.includes('`' + s.file + '`'));
    req(line && line.includes(LICENCE_WORD(s.file)), `CREDITS.md does not record ${s.file} with its ${LICENCE_WORD(s.file)} licence`);
  }
  req(/Contains data from Open Data DC/.test(credits), 'CREDITS.md lacks the Open Data DC CC BY attribution line');

  // 3. DC buildings: footprints joined to LiDAR heights; the redaction shows as flat LiDAR buildings
  const dc = joinDC(json('dc-footprints.json'), json('dc-buildings-3d.json'));
  const c = { lidar: 0, redacted: 0, newer: 0, unmatched: 0 };
  for (const f of dc.footprints) c[f.missing || 'lidar']++;
  req(dc.footprints.length >= 15000, `DC footprints: ${dc.footprints.length} buildings, expected ≥ 15000`);
  req(c.lidar >= 0.9 * dc.footprints.length, `DC buildings: only ${c.lidar}/${dc.footprints.length} have a LiDAR height`);
  const tallest = Math.max(...dc.lidar.map(l => l.maxZ));
  req(tallest >= 160 && tallest <= 175, `DC LiDAR: tallest structure ${tallest.toFixed(1)} m above ground, expected 160–175 (Washington Monument 169 m)`);
  req(c.redacted >= 50, `DC LiDAR: only ${c.redacted} redacted (flat) buildings — the restricted boundaries should blank the Capitol, the White House …`);
  const inside = (r, x, y) => { let q = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) q = !q; } return q; };
  const at = (lat, lon) => dc.footprints.find(f => lon >= f.bbox[0] && lon <= f.bbox[2] && lat >= f.bbox[1] && lat <= f.bbox[3] && inside(f.rings[0], lon, lat));
  for (const [n, lat, lon] of [['the Capitol', 38.88990, -77.00910], ['the White House', 38.89768, -77.03655]]) req(at(lat, lon)?.missing === 'redacted', `DC LiDAR: ${n} is not in the redacted set`);
  req(!at(38.89567, -77.05560)?.missing && at(38.89567, -77.05560)?.above > 25, 'DC LiDAR: the Kennedy Center has no LiDAR height (> 25 m)');
  if (report) Object.assign(report, { footprints: dc.footprints.length, ...c, lidarYear: dc.lidarYear });

  // 4. OSM buildings: the Virginia bank, and heights to fall back on
  const osm = json('osm-buildings.json').elements || [];
  const ways = osm.filter(e => e.type === 'way' && e.tags?.building && e.geometry?.length >= 4);
  const va = ways.filter(w => w.geometry[0].lon < -77.06 && w.geometry[0].lat < 38.895);
  req(ways.length >= 10000, `OSM buildings: ${ways.length}, expected ≥ 10000`);
  req(va.length >= 500, `OSM buildings: ${va.length} on the Virginia bank (Rosslyn / Arlington), expected ≥ 500`);
  req(ways.filter(w => w.tags.height || w.tags['building:levels']).length >= 1000, 'OSM buildings: fewer than 1000 with height or levels to fall back on');

  // 5. terrain + topobathy grids on the slice
  const probe = (t, lat, lon) => { const [E, N] = toUTM(lat, lon); return t.data[Math.floor((maxN - N) / G) * t.width + Math.floor((E - minE) / G)]; };
  const grids = {};
  for (const file of ['terrain-3dep.tif', 'bathy-ncei.tif']) {
    const t = grids[file] = readTiff(readFileSync(join(dir, file)));
    req(t.width === W && t.height === H, `${file}: ${t.width}×${t.height}, expected ${W}×${H}`);
    const tie = t.tags[33922], scale = t.tags[33550];
    req(tie?.[3] === minE && tie?.[4] === maxN && scale?.[0] === G && scale?.[1] === G, `${file}: georeference does not match the slice extent`);
    let bad = 0; for (const v of t.data) if (!Number.isFinite(v) || Math.abs(v) > 1e4 || (t.noData !== null && v === t.noData)) bad++;
    req(bad === 0, `${file}: ${bad} no-data / non-finite cells`);
    const ah = probe(t, 38.8822, -77.0727), cap = probe(t, 38.8899, -77.0080), mon = probe(t, 38.8893, -77.0350);
    req(ah >= 50 && ah <= 70, `${file}: Arlington House ${ah?.toFixed(1)} m, expected 50–70`);
    req(cap >= 20 && cap <= 32, `${file}: Capitol plaza ${cap?.toFixed(1)} m, expected 20–32`);
    req(mon >= 8 && mon <= 16, `${file}: Washington Monument grounds ${mon?.toFixed(1)} m, expected 8–16`);
  }
  const bt = grids['bathy-ncei.tif'];
  const mb = probe(bt, 38.8870, -77.0560), kb = probe(bt, 38.9020, -77.0700), wc = probe(bt, 38.8760, -77.0240);
  req(mb < -5, `Potomac depth: at Memorial Bridge ${mb.toFixed(1)} m, expected < −5`);
  req(kb < -3, `Potomac depth: at Key Bridge ${kb.toFixed(1)} m, expected < −3`);
  req(wc < -3, `Potomac depth: Washington Channel ${wc.toFixed(1)} m, expected < −3`);
  let wet = 0; for (const v of bt.data) if (v < 0) wet++;
  req(wet / bt.data.length >= 0.1, `Potomac depth: only ${(100 * wet / bt.data.length).toFixed(0)}% of cells below datum, expected ≥ 10%`);
  const datums = json('noaa-datums-8594900.json');
  const dv = n => datums.datums?.find(d => d.name === n)?.value;
  const msl = dv('MSL') - dv('NAVD88');
  req(datums.OrthometricDatum === 'NAVD88' && msl > -0.5 && msl < 0.5, `datums: MSL − NAVD88 = ${msl}, expected −0.5 to 0.5 m`);

  // 6. trees: the Mall elms and the Tidal Basin cherries
  const trees = json('dc-trees.json').features || [];
  req(trees.length >= 20000, `trees: ${trees.length}, expected ≥ 20000 in the core`);
  const inBox = (f, s, w, n, e) => f.geometry && f.geometry.y >= s && f.geometry.y <= n && f.geometry.x >= w && f.geometry.x <= e;
  const cherries = trees.filter(f => f.attributes.GENUS_NAME === 'Prunus' && inBox(f, 38.878, -77.045, 38.888, -77.030)).length;
  const elms = trees.filter(f => f.attributes.GENUS_NAME === 'Ulmus' && inBox(f, 38.886, -77.050, 38.892, -77.010)).length;
  req(cherries >= 200, `trees: ${cherries} cherries (Prunus) around the Tidal Basin, expected ≥ 200`);
  req(elms >= 500, `trees: ${elms} elms (Ulmus) along the Mall, expected ≥ 500`);
  req(trees.filter(f => f.attributes.HEIGHT > 0).length >= 0.5 * trees.length, 'trees: fewer than half have a height');

  // 7. landmark / waterfront features, charted references
  const feat = json('osm-features.json').elements || [];
  for (const n of ['Washington Monument', 'Lincoln Memorial', 'Jefferson Memorial', 'United States Capitol', 'John F. Kennedy Center for the Performing Arts', 'Francis Scott Key Bridge', 'Arlington Memorial Bridge', 'Reflecting Pool', 'Tidal Basin', 'Georgetown Ferry Landing', 'The Wharf Ferry Landing'])
    req(feat.some(e => e.tags?.name === n), `osm-features: no ${n}`);
  const enc = json('noaa-enc-landmarks.json').features || [];
  req(enc.some(f => f.attributes.OBJNAM === 'Washington Monument'), 'noaa-enc-landmarks: no Washington Monument');
  req(enc.some(f => f.attributes.CATLMK === 'dome' && Math.abs(f.geometry.x + 77.009) < 0.002), 'noaa-enc-landmarks: no Capitol dome');
  req((json('noaa-enc-pylons.json').features || []).length >= 4, 'noaa-enc-pylons: fewer than 4 bridge piers');

  // 8. NAIP imagery: 3 bands, the box asked for, not blank
  for (const [file, b, cell] of [['naip-dc.tif', NAIP_ALL, 4], ['naip-core.tif', naipBox(CORE), 2]]) {
    const t = readTiff(readFileSync(join(dir, file)));
    req(t.bands.length === 3 && t.width === (b.maxE - b.minE) / cell && t.height === (b.maxN - b.minN) / cell && t.tags[33922]?.[3] === b.minE && t.tags[33922]?.[4] === b.maxN && t.tags[33550]?.[0] === cell,
      `${file}: expected 3-band ${cell} m imagery over E ${b.minE}–${b.maxE}, N ${b.minN}–${b.maxN}`);
    let s1 = 0, s2 = 0; const n = Math.min(t.data.length, 2e6);
    for (let k = 0; k < n; k++) { const v = t.bands[1][k * Math.floor(t.data.length / n)]; s1 += v; s2 += v * v; }
    const mean = s1 / n, sd = Math.sqrt(s2 / n - mean * mean);
    req(mean > 30 && mean < 220 && sd > 12, `${file}: imagery looks blank (mean ${mean.toFixed(0)}, sd ${sd.toFixed(0)})`);
  }
  return fail;
}

const credits = readFileSync(join(root, 'CREDITS.md'), 'utf8');
const rawDir = join(root, 'data/raw');

if (!process.argv.includes('--negative')) {
  const report = {};
  const fail = check(rawDir, credits, report);
  console.log(`buildings: ${report.footprints} DC footprints — ${report.lidar} with LiDAR heights, ${report.redacted} in the redacted area (flat LiDAR: OSM / default fallback), ${report.newer} newer than the ${report.lidarYear} LiDAR, ${report.unmatched} unmatched`);
  if (fail.length) { console.log('G0 FAIL\n- ' + fail.join('\n- ')); process.exit(1); }
  console.log(`G0 PASS — ${SOURCES.length} sources cached, checksummed, plausible, licences recorded; ${report.redacted} redacted-area buildings reported`);
  process.exit(0);
}

function fixture(mutate) {
  const d = mkdtempSync(join(tmpdir(), 'g0neg-'));
  for (const f of ['MANIFEST.sha256', 'sources.json', ...SOURCES.map(s => s.file)]) symlinkSync(join(rawDir, f), join(d, f));
  const reManifest = () => { rmSync(join(d, 'MANIFEST.sha256')); writeFileSync(join(d, 'MANIFEST.sha256'), SOURCES.map(s => `${createHash('sha256').update(readFileSync(join(d, s.file))).digest('hex')}  ${s.file}`).join('\n') + '\n'); };
  const own = f => { rmSync(join(d, f)); cpSync(join(rawDir, f), join(d, f)); };
  const rewrite = (f, fn) => { const p = join(d, f); const j = JSON.parse(readFileSync(p, 'utf8')); fn(j); rmSync(p); writeFileSync(p, JSON.stringify(j)); reManifest(); };
  let c = credits;
  mutate({ d, own, reManifest, rewrite, setCredits: v => { c = v; } });
  return { d, credits: c };
}
const MUTATIONS = {
  'corrupted terrain byte': ({ d, own }) => { own('terrain-3dep.tif'); const p = join(d, 'terrain-3dep.tif'); const b = readFileSync(p); b[b.length >> 1] ^= 0xff; writeFileSync(p, b); },
  'land-only terrain used as the Potomac depth': ({ d, reManifest }) => { rmSync(join(d, 'bathy-ncei.tif')); cpSync(join(rawDir, 'terrain-3dep.tif'), join(d, 'bathy-ncei.tif')); reManifest(); },
  'LiDAR heights stripped': ({ rewrite }) => rewrite('dc-buildings-3d.json', j => { for (const f of j.features) f.attributes.MAX_Z = 0; }),
  'trees without cherries': ({ rewrite }) => rewrite('dc-trees.json', j => { j.features = j.features.filter(f => f.attributes.GENUS_NAME !== 'Prunus'); }),
  'licences missing from CREDITS': ({ setCredits }) => setCredits(credits.replace(/CC BY 4\.0|ODbL|Public domain/g, 'unknown')),
};
const baseline = new Set(check(rawDir, credits));
let uncaught = 0;
for (const [name, mutate] of Object.entries(MUTATIONS)) {
  const fx = fixture(mutate);
  const fresh = check(fx.d, fx.credits).filter(m => !baseline.has(m));
  rmSync(fx.d, { recursive: true, force: true });
  console.log(`${fresh.length ? 'caught  ' : 'MISSED  '} ${name}${fresh.length ? ' — ' + fresh[0] : ''}`);
  if (!fresh.length) uncaught++;
}
console.log(`NEGATIVE ${Object.keys(MUTATIONS).length - uncaught}/${Object.keys(MUTATIONS).length}`);
process.exit(uncaught ? 0 : 1);
