// DC buildings: planimetric footprints (DC GIS layer 1, through 2025) joined to LiDAR heights (DC GIS layer 2,
// "Buildings – 3D", LiDAR multipatch). A footprint takes the height of the 3D building whose roof centroid lies
// inside it. Footprints without a usable LiDAR height are classed by why (D13):
//   redacted — the LiDAR building is flat on the ground (MAX_Z, height above ground, < REDACTED_BELOW): inside the
//              Secret Service restricted boundaries all returns but ground and water were removed (the Capitol,
//              the White House, the Treasury …)
//   newer    — no LiDAR building at all and the footprint was captured after the LiDAR: new construction
//   unmatched — no LiDAR building at all, footprint older than the LiDAR
// Both fall back to OSM height / building:levels, else a logged default (hooks.js).
import { decodeMultipatch } from './multipatch.mjs';

export const REDACTED_BELOW = 2.5; // m above ground: no real building roof is this low
export const BUILDING_CODES = new Set([2000]); // FEATURECODE 2000 "Building"; canopies, garages' decks etc. are not

// area-weighted centroid and typical roof elevation (area-weighted median z of up-facing triangles) of a 3D building
export function roofOf(mp) {
  const tris = [];
  for (const p of mp.parts) {
    const P = p.points;
    if (p.type === 6) for (let k = 0; k + 2 < P.length; k += 3) tris.push([P[k], P[k + 1], P[k + 2]]);
    else if (p.type === 0) for (let k = 0; k + 2 < P.length; k++) tris.push([P[k], P[k + 1], P[k + 2]]);
    else if (p.type === 1) for (let k = 1; k + 1 < P.length; k++) tris.push([P[0], P[k], P[k + 1]]);
  }
  // lon/lat → local metres for areas (the building is small: flat-earth scale at its latitude)
  const lat0 = mp.bbox[1] * Math.PI / 180, mx = 111320 * Math.cos(lat0), my = 110540;
  let A = 0, cx = 0, cy = 0;
  const roofs = [];
  for (const [a, b, c] of tris) {
    const ux = (b[0] - a[0]) * mx, uy = (b[1] - a[1]) * my, uz = b[2] - a[2], vx = (c[0] - a[0]) * mx, vy = (c[1] - a[1]) * my, vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, len = Math.hypot(nx, ny, nz);
    if (len < 1e-6) continue;
    const area = len / 2, up = Math.abs(nz) / len;
    if (up > 0.7) {
      const z = (a[2] + b[2] + c[2]) / 3, ax = Math.abs(nz) / 2; // plan area
      roofs.push([z, ax]);
      A += ax; cx += ax * (a[0] + b[0] + c[0]) / 3; cy += ax * (a[1] + b[1] + c[1]) / 3;
    }
  }
  if (!A) return null;
  roofs.sort((p, q) => p[0] - q[0]);
  let acc = 0, median = roofs[roofs.length - 1][0];
  for (const [z, a] of roofs) { acc += a; if (acc >= A / 2) { median = z; break; } }
  return { lon: cx / A, lat: cy / A, roofZ: median, topZ: mp.zRange[1], baseZ: mp.zRange[0], roofArea: A };
}

const inside = (r, x, y) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };

// join footprints to LiDAR buildings; returns footprints (lon/lat rings) with { lidar } or { missing: 'newer' | 'redacted' }
export function joinDC(footprintsJSON, lidarJSON) {
  const lidar = [];
  let lidarYear = 0;
  for (const f of lidarJSON.features) {
    const r = roofOf(decodeMultipatch(f.geometry.binaryPatches));
    if (!r) continue;
    lidarYear = Math.max(lidarYear, f.attributes.CAPTUREYEAR || 0);
    lidar.push({ id: f.attributes.GIS_ID, maxZ: f.attributes.MAX_Z, ...r });
  }
  // grid index of footprints (~0.001° cells)
  const cell = 0.001, grid = new Map(), key = (x, y) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
  const fps = footprintsJSON.features.filter(f => BUILDING_CODES.has(f.attributes.FEATURECODE) && f.geometry?.rings?.length).map(f => {
    const rings = f.geometry.rings;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of rings[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return { id: f.attributes.OBJECTID, year: f.attributes.CAPTUREYEAR || 0, rings, bbox: [x0, y0, x1, y1], lidar: [] };
  });
  for (const fp of fps) for (let gx = Math.floor(fp.bbox[0] / cell); gx <= Math.floor(fp.bbox[2] / cell); gx++) for (let gy = Math.floor(fp.bbox[1] / cell); gy <= Math.floor(fp.bbox[3] / cell); gy++) {
    const k = `${gx},${gy}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(fp);
  }
  let orphans = 0;
  for (const l of lidar) {
    const hit = (grid.get(key(l.lon, l.lat)) || []).find(fp => l.lon >= fp.bbox[0] && l.lon <= fp.bbox[2] && l.lat >= fp.bbox[1] && l.lat <= fp.bbox[3] && inside(fp.rings[0], l.lon, l.lat));
    if (hit) hit.lidar.push(l); else orphans++;
  }
  for (const fp of fps) {
    if (fp.lidar.length) {
      // several LiDAR parts in one footprint: the largest roof sets the typical roof, the highest the top
      fp.lidar.sort((a, b) => b.roofArea - a.roofArea);
      fp.roofZ = fp.lidar[0].roofZ; fp.topZ = Math.max(...fp.lidar.map(l => l.topZ)); fp.above = Math.max(...fp.lidar.map(l => l.maxZ));
      if (!(fp.above >= REDACTED_BELOW)) fp.missing = 'redacted';
    } else fp.missing = fp.year > lidarYear ? 'newer' : 'unmatched';
  }
  return { footprints: fps, lidar, orphans, lidarYear: new Date(lidarYear).getUTCFullYear() };
}
