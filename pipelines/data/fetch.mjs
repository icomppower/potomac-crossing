// Potomac Crossing's raw sources (SOURCES); the engine's fetchSources() downloads each into data/raw/ once and
// writes MANIFEST.sha256 + sources.json (licence, URL, fetch time).   node pipelines/data/fetch.mjs [--force]
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toUTM } from 'harbor-engine/tools/geo/utm.mjs';
import { fetchSources } from 'harbor-engine/tools/data/fetch.mjs';
import { isMain } from 'harbor-engine/tools/lib/title.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const map = JSON.parse(readFileSync(join(root, 'map.json'), 'utf8'));
const { minE, minN, maxE, maxN } = map.slice.extent;
const W = (maxE - minE) / 3, H = (maxN - minN) / 3; // 3 m grid (the terrain grid)
const B = map.bbox; // the slice in WGS84 (covers the UTM square)
const SR = '32618';
// the National Mall / Tidal Basin / waterfront core: street trees and 1 m roof imagery (D14)
export const CORE = { south: 38.874, west: -77.060, north: 38.896, east: -77.005 };
const DCGIS = 'https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA';
const CCBY = { licence: 'CC BY 4.0 — Open Data DC (District of Columbia, Office of the Chief Technology Officer)', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/' };
const OSM = { licence: 'ODbL 1.0 — © OpenStreetMap contributors', licenceUrl: 'https://www.openstreetmap.org/copyright' };
const USPD = (who, url) => ({ licence: `Public domain (US Government work, ${ who })`, licenceUrl: url });

function exportImage(service, extra = {}) {
  return `${service}/exportImage?` + new URLSearchParams({
    bbox: `${minE},${minN},${maxE},${maxN}`, bboxSR: SR, imageSR: SR, size: `${W},${H}`,
    format: 'tiff', pixelType: 'F32', noDataInterpretation: 'esriNoDataMatchAny',
    interpolation: 'RSP_BilinearInterpolation', compression: 'LZ77', f: 'image', ...extra,
  });
}

// NAIP natural colour over a UTM box at `cell` m
export function naipBox(box) {
  const c = [[box.south, box.west], [box.south, box.east], [box.north, box.west], [box.north, box.east]].map(([la, lo]) => toUTM(la, lo));
  // whole multiples of 4 m, so every export cell size used here gives an integer pixel grid
  const lo = v => Math.floor(v / 4) * 4, hi = v => Math.ceil(v / 4) * 4;
  return { minE: lo(Math.min(...c.map(p => p[0]))), maxE: hi(Math.max(...c.map(p => p[0]))), minN: lo(Math.min(...c.map(p => p[1]))), maxN: hi(Math.max(...c.map(p => p[1]))) };
}
// the whole terrain square at 4 m for the ground colour map (NAIP_ALL); 2 m over the core for roof colours
export const NAIP_ALL = { minE, minN, maxE, maxN, cell: 4 };
function naipExport(b, cell) {
  return 'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage?' + new URLSearchParams({
    bbox: `${b.minE},${b.minN},${b.maxE},${b.maxN}`, bboxSR: SR, imageSR: SR, size: `${(b.maxE - b.minE) / cell},${(b.maxN - b.minN) / cell}`,
    format: 'tiff', pixelType: 'U8', bandIds: '0,1,2', compression: 'LZ77', interpolation: 'RSP_BilinearInterpolation', f: 'image',
  });
}

// every feature of an ArcGIS layer inside a WGS84 box, paged (the services return at most 1000–2000 per request),
// ordered by OBJECTID so the file is the same on every fetch of the same data
function arcgisPaged(layer, box, { outFields = '*', where = '1=1', page = 1000, geometry = true } = {}) {
  return async ({ download }) => {
    const all = [];
    let fields = null;
    for (let offset = 0; ; offset += page) {
      const u = `${layer}/query?` + new URLSearchParams({
        where, geometry: `${box.west},${box.south},${box.east},${box.north}`, geometryType: 'esriGeometryEnvelope', inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects', outSR: '4326', outFields, returnGeometry: String(geometry), returnZ: 'true',
        orderByFields: 'OBJECTID', resultOffset: String(offset), resultRecordCount: String(page), f: 'json',
      });
      const j = JSON.parse((await download(u)).toString('utf8'));
      if (j.error) throw new Error(`${layer}: ${JSON.stringify(j.error)}`);
      fields = fields || j.fields;
      all.push(...j.features);
      if (!j.exceededTransferLimit && j.features.length < page) break;
    }
    return Buffer.from(JSON.stringify({ layer, box, fields, count: all.length, features: all }));
  };
}

const overpass = (q) => 'data=' + encodeURIComponent(`[out:json][timeout:180];${q}`);
const bb = (b) => `${b.south},${b.west},${b.north},${b.east}`;

export const SOURCES = [
  {
    file: 'dc-footprints.json', key: 'dc-footprints', ...CCBY,
    title: 'Open Data DC Building Footprints (DC GIS Facility_and_Structure layer 1, planimetric, updated through 2025)',
    url: `${DCGIS}/Facility_and_Structure/MapServer/1`,
    fetch: arcgisPaged(`${DCGIS}/Facility_and_Structure/MapServer/1`, B, { outFields: 'OBJECTID,FEATURECODE,DESCRIPTION,CAPTUREYEAR' }),
  },
  {
    file: 'dc-buildings-3d.json', key: 'dc-buildings-3d', ...CCBY,
    title: 'Open Data DC Buildings 3D (DC GIS Facility_and_Structure layer 2): LiDAR-derived multipatch, MAX_Z / MEDIAN_Z = height above ground; LiDAR redacted inside restricted boundaries',
    url: `${DCGIS}/Facility_and_Structure/MapServer/2`,
    fetch: arcgisPaged(`${DCGIS}/Facility_and_Structure/MapServer/2`, B, { outFields: 'OBJECTID,GIS_ID,MAX_Z,MIN_Z,MEDIAN_Z,CAPTUREYEAR' }),
  },
  {
    file: 'osm-buildings.json', key: 'osm-buildings', ...OSM,
    title: 'OpenStreetMap buildings over the slice (Arlington / Virginia bank; heights for redacted DC buildings) (Overpass API)',
    url: 'https://overpass-api.de/api/interpreter',
    body: overpass(`(way["building"](${bb(B)});relation["building"](${bb(B)});way["building:part"](${bb(B)}););out geom tags qt;`),
  },
  {
    file: 'osm-features.json', key: 'osm-features', ...OSM,
    title: 'OpenStreetMap landmark and waterfront features: memorials, the Capitol, the Kennedy Center, bridges, piers, ferry terminals, the Reflecting Pool and Tidal Basin (Overpass API)',
    url: 'https://overpass-api.de/api/interpreter',
    body: overpass(`(
      nwr["name"~"^(Washington Monument|Lincoln Memorial|Thomas Jefferson Memorial|Jefferson Memorial|United States Capitol|John F. Kennedy Center for the Performing Arts|Francis Scott Key Bridge|Arlington Memorial Bridge|Lincoln Memorial Reflecting Pool|Tidal Basin|Capitol Reflecting Pool|Theodore Roosevelt Bridge)$"](${bb(B)});
      way["bridge"]["highway"](38.895,-77.075,38.910,-77.065);
      way["bridge"]["highway"](38.882,-77.060,38.888,-77.048);
      nwr["man_made"="pier"](${bb(B)});
      nwr["amenity"="ferry_terminal"](${bb(B)});
      nwr["natural"="water"](${bb(CORE)});
    );out geom tags qt;`),
  },
  {
    file: 'dc-trees.json', key: 'dc-trees', ...CCBY,
    title: 'Open Data DC Trees (DDOT Urban Forestry, Urban_Tree_Canopy layer 11) over the Mall / Tidal Basin / waterfront core: species, height, DBH',
    url: `${DCGIS}/Urban_Tree_Canopy/MapServer/11`,
    fetch: arcgisPaged(`${DCGIS}/Urban_Tree_Canopy/MapServer/11`, CORE, { outFields: 'OBJECTID,TREE_ID,GENUS_NAME,COMMON_NAME,HEIGHT,DBH,OWNERSHIP', page: 2000 }),
  },
  {
    file: 'terrain-3dep.tif', key: 'terrain-3dep', ...USPD('USGS', 'https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits'),
    title: 'USGS 3DEP elevation, 3 m resample over the slice (3DEPElevation ImageServer), NAVD88',
    url: exportImage('https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer'),
  },
  {
    file: 'bathy-ncei.tif', key: 'bathy-ncei', ...USPD('NOAA NCEI', 'https://www.ncei.noaa.gov/products/coastal-elevation-models'),
    title: 'NOAA NCEI DEM mosaic (CUDEM 1/9 arc-second topobathy ncei19_n39x00_w077x25), 3 m resample over the slice (DEM_mosaics/DEM_all ImageServer), NAVD88',
    url: exportImage('https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_all/ImageServer'),
  },
  {
    file: 'noaa-datums-8594900.json', key: 'noaa-datums', ...USPD('NOAA CO-OPS', 'https://tidesandcurrents.noaa.gov/datums.html?id=8594900'),
    title: 'NOAA CO-OPS tidal datums, Washington DC station 8594900 (MSL, MLLW relative to NAVD88)',
    url: 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/8594900/datums.json?units=metric',
  },
  {
    file: 'naip-dc.tif', key: 'naip-dc', ...USPD('USDA Farm Service Agency NAIP', 'https://naip-usdaonline.hub.arcgis.com/'),
    title: 'USDA NAIP aerial orthoimagery (natural colour, 4 m resample) over the whole terrain square, for the ground colour map',
    url: naipExport(NAIP_ALL, NAIP_ALL.cell),
  },
  {
    file: 'naip-core.tif', key: 'naip-core', ...USPD('USDA Farm Service Agency NAIP', 'https://naip-usdaonline.hub.arcgis.com/'),
    title: 'USDA NAIP aerial orthoimagery (natural colour, 2 m resample) over the Mall / waterfront core, for roof colours (1 m exceeds the service size limit)',
    url: naipExport(naipBox(CORE), 2),
  },
  {
    file: 'noaa-enc-landmarks.json', key: 'noaa-enc-landmarks', ...USPD('NOAA Office of Coast Survey', 'https://nauticalcharts.noaa.gov/data/enc-direct-to-gis.html'),
    title: 'NOAA Electronic Navigational Charts (ENC Direct, harbour scale): charted landmarks — Washington Monument, Capitol dome',
    url: `https://encdirect.noaa.gov/arcgis/rest/services/encdirect/enc_harbour/MapServer/26/query?` + new URLSearchParams({ geometry: `${B.west},${B.south},${B.east},${B.north}`, geometryType: 'esriGeometryEnvelope', inSR: '4326', outSR: '4326', outFields: '*', returnGeometry: 'true', orderByFields: 'OBJECTID', f: 'json' }),
  },
  {
    file: 'noaa-enc-pylons.json', key: 'noaa-enc-pylons', ...USPD('NOAA Office of Coast Survey', 'https://nauticalcharts.noaa.gov/data/enc-direct-to-gis.html'),
    title: 'NOAA Electronic Navigational Charts (ENC Direct, harbour scale): bridge pylon / pier areas (Key Bridge, Memorial Bridge and the other Potomac crossings)',
    url: `https://encdirect.noaa.gov/arcgis/rest/services/encdirect/enc_harbour/MapServer/149/query?` + new URLSearchParams({ geometry: `${B.west},${B.south},${B.east},${B.north}`, geometryType: 'esriGeometryEnvelope', inSR: '4326', outSR: '4326', outFields: '*', returnGeometry: 'true', orderByFields: 'OBJECTID', f: 'json' }),
  },
  {
    file: 'noaa-enc-bridges.json', key: 'noaa-enc-bridges', ...USPD('NOAA Office of Coast Survey', 'https://nauticalcharts.noaa.gov/data/enc-direct-to-gis.html'),
    title: 'NOAA Electronic Navigational Charts (ENC Direct, harbour scale): bridge areas with charted vertical / horizontal clearances (Key Bridge, Roosevelt Bridge, the 14th Street bridges …)',
    url: `https://encdirect.noaa.gov/arcgis/rest/services/encdirect/enc_harbour/MapServer/141/query?` + new URLSearchParams({ geometry: `${B.west},${B.south},${B.east},${B.north}`, geometryType: 'esriGeometryEnvelope', inSR: '4326', outSR: '4326', outFields: '*', returnGeometry: 'true', orderByFields: 'OBJL', f: 'json' }),
  },
  {
    file: 'noaa-enc-shoreline.json', key: 'noaa-enc-shoreline', ...USPD('NOAA Office of Coast Survey', 'https://nauticalcharts.noaa.gov/data/enc-direct-to-gis.html'),
    title: 'NOAA Electronic Navigational Charts (ENC Direct, harbour scale): shoreline constructions (piers, seawalls) — the Wharf and Georgetown waterfront piers',
    url: `https://encdirect.noaa.gov/arcgis/rest/services/encdirect/enc_harbour/MapServer/85/query?` + new URLSearchParams({ geometry: `${B.west},${B.south},${B.east},${B.north}`, geometryType: 'esriGeometryEnvelope', inSR: '4326', outSR: '4326', outFields: '*', returnGeometry: 'true', f: 'json' }),
  },
  {
    file: 'dc-hydro-lines.json', key: 'dc-hydro-lines', ...CCBY,
    title: 'Open Data DC Planimetrics 2023: hydrography lines (docks and piers, sea walls) (DC GIS Planimetrics_2023 layer 6)',
    url: `${DCGIS}/Planimetrics_2023/MapServer/6`,
    fetch: arcgisPaged(`${DCGIS}/Planimetrics_2023/MapServer/6`, B, { outFields: 'OBJECTID,FEATURECODE,DESCRIPTION,CAPTUREYEAR' }),
  },
];

if (isMain(import.meta.url)) await fetchSources(SOURCES, { userAgent: 'potomac-crossing-data-fetch/1.0' });
