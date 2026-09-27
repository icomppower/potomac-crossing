// Esri multipatch (ArcGIS REST `binaryPatches`): base64 → a 12-byte header, then a zlib-compressed shapefile
// MultiPatch record: shapeType, bbox, numParts, numPoints, parts[], partTypes[], XY[], Z range, Z[] (M ignored).
// Part types: 0 triangle strip, 1 triangle fan, 2 outer ring, 3 inner ring, 4 first ring, 5 ring, 6 triangles.
import { inflateSync } from 'node:zlib';

export function decodeMultipatch(b64) {
  const raw = Buffer.from(b64, 'base64');
  const b = inflateSync(raw.subarray(12));
  let o = 0;
  const i32 = () => { const v = b.readInt32LE(o); o += 4; return v; };
  const f64 = () => { const v = b.readDoubleLE(o); o += 8; return v; };
  const shapeType = i32() & 0xff;
  const bbox = [f64(), f64(), f64(), f64()];
  const numParts = i32(), numPoints = i32();
  const parts = Array.from({ length: numParts }, i32);
  const types = Array.from({ length: numParts }, () => i32() & 0xf);
  const xy = Array.from({ length: numPoints }, () => [f64(), f64()]);
  const zr = [f64(), f64()];
  const z = Array.from({ length: numPoints }, f64);
  const out = [];
  for (let p = 0; p < numParts; p++) {
    const s = parts[p], e = p + 1 < numParts ? parts[p + 1] : numPoints;
    out.push({ type: types[p], points: xy.slice(s, e).map(([x, y], k) => [x, y, z[s + k]]) });
  }
  return { shapeType, bbox, zRange: zr, parts: out };
}
