# Credits

Built on [Harbor Engine](https://github.com/icomppower/harbor-engine) (MIT), itself built on
[Tidewater](https://github.com/dgreenheck/tidewater) by Daniel Greenheck (MIT); the engine credits its runtime
assets (cloud noise, CC0 audio) in its own CREDITS.md. The method and pipelines come from
[SF Bay Crossing](https://github.com/icomppower/bay-crossing).

## Data

All raw data is fetched by `pipelines/data/fetch.mjs` into `data/raw/` (checksummed in MANIFEST.sha256). Open Data DC
data is licensed under CC BY 4.0: **Contains data from Open Data DC (District of Columbia, Office of the Chief
Technology Officer), CC BY 4.0.**

| File | Source | Licence |
|------|--------|---------|
| `dc-footprints.json` | Open Data DC Building Footprints (DC GIS Facility_and_Structure layer 1, planimetric, updated through 2025) | CC BY 4.0 — Open Data DC (District of Columbia, Office of the Chief Technology Officer) |
| `dc-buildings-3d.json` | Open Data DC Buildings 3D (DC GIS Facility_and_Structure layer 2): LiDAR-derived multipatch, MAX_Z / MEDIAN_Z = height above ground; LiDAR redacted inside restricted boundaries | CC BY 4.0 — Open Data DC (District of Columbia, Office of the Chief Technology Officer) |
| `osm-buildings.json` | OpenStreetMap buildings over the slice (Arlington / Virginia bank; heights for redacted DC buildings) (Overpass API) | ODbL 1.0 — © OpenStreetMap contributors |
| `osm-features.json` | OpenStreetMap landmark and waterfront features: memorials, the Capitol, the Kennedy Center, bridges, piers, ferry terminals, the Reflecting Pool and Tidal Basin (Overpass API) | ODbL 1.0 — © OpenStreetMap contributors |
| `dc-trees.json` | Open Data DC Trees (DDOT Urban Forestry, Urban_Tree_Canopy layer 11) over the Mall / Tidal Basin / waterfront core: species, height, DBH | CC BY 4.0 — Open Data DC (District of Columbia, Office of the Chief Technology Officer) |
| `terrain-3dep.tif` | USGS 3DEP elevation, 3 m resample over the slice (3DEPElevation ImageServer), NAVD88 | Public domain (US Government work, USGS) |
| `bathy-ncei.tif` | NOAA NCEI DEM mosaic (CUDEM 1/9 arc-second topobathy ncei19_n39x00_w077x25), 3 m resample over the slice (DEM_mosaics/DEM_all ImageServer), NAVD88 | Public domain (US Government work, NOAA NCEI) |
| `noaa-datums-8594900.json` | NOAA CO-OPS tidal datums, Washington DC station 8594900 (MSL, MLLW relative to NAVD88) | Public domain (US Government work, NOAA CO-OPS) |
| `naip-dc.tif` | USDA NAIP aerial orthoimagery (natural colour, 4 m resample) over the whole terrain square, for the ground colour map | Public domain (US Government work, USDA Farm Service Agency NAIP) |
| `naip-core.tif` | USDA NAIP aerial orthoimagery (natural colour, 2 m resample) over the Mall / waterfront core, for roof colours (1 m exceeds the service size limit) | Public domain (US Government work, USDA Farm Service Agency NAIP) |
| `noaa-enc-landmarks.json` | NOAA Electronic Navigational Charts (ENC Direct, harbour scale): charted landmarks — Washington Monument, Capitol dome | Public domain (US Government work, NOAA Office of Coast Survey) |
| `noaa-enc-pylons.json` | NOAA Electronic Navigational Charts (ENC Direct, harbour scale): bridge pylon / pier areas (Key Bridge, Memorial Bridge and the other Potomac crossings) | Public domain (US Government work, NOAA Office of Coast Survey) |

## Facts cited (not redistributed)

- Water taxi route and trip time (Georgetown ↔ The Wharf, about 30 min): The Wharf DC, *Water Taxi*
  (wharfdc.com/getting-here/water-taxi); City Cruises, *Potomac Water Taxi*.
- Vessel (*Potomac Taxi I*): Metal Shark press release 2017-10-16; WorkBoat, *Metal Shark delivers four water taxis to
  D.C.*; PropTalk; AIS record on VesselFinder (MMSI 368006220). See DECISIONS.md D12.
