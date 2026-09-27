# Decisions

SPEC §3 (Notion), applied as written:

- **D1** Base pinned (now: Harbor Engine v1.x via `new-title`, per the SPEC's 2026-09-26 update); never pull upstream Tidewater.
- **D2** Run-1 slice: Lincoln Memorial → Capitol along the Mall; Tidal Basin loop; Potomac from Key Bridge
  (Georgetown) to The Wharf; Arlington bank as distant low-LOD. Expand only after G6 is green.
- **D3** Water taxi: procedural hull from published dimensions of a vessel on the route; cite the source.
- **D4** Buildings extruded from footprint + height with stone/brick palettes (Height Act low-rise); landmarks
  procedural or CC0, processed offline in Blender into 3 LODs: Washington Monument, Capitol, Lincoln Memorial,
  Jefferson Memorial, Kennedy Center, Key Bridge, Arlington Memorial Bridge. Exterior massing only, public-view
  detail; no interiors or security features.
- **D5** Water presets: calm river (Potomac), still pool (Reflecting Pool, Tidal Basin): low fetch, small waves,
  strong mirror reflections; ocean swell off.
- **D6** Quality tiers `low` (M4, gated), `mobile`, `high` (reserved for PC).
- **D7** Keep engine, sky, post, player, boat controller, TouchControls, pipelines, gates framework; replace data,
  landmarks, vessel, ground palette.
- **D8** CREDITS.md lists every source + licence (DC data CC BY 4.0: attribution required).
- **D9** One Max 20x account; stop cleanly on the usage limit. **D10** Sessions started by the user; no auto-relaunch.
- Owner (2026-09-26): name Potomac Crossing; cherry blossoms as a season toggle (default peak bloom), no extra
  gate; no streaming in run 1.

New decisions:

- **D11** World frame: UTM 18N (EPSG:32618, WGS84), origin E 322900 N 4304850, 8.4 km square (3 m grid, 2800²,
  14 × 14 tiles of 600 m): Key Bridge / Rosslyn to the Capitol, Georgetown to Hains Point, and the Arlington bank.
  First set at 6.6 km; widened south when G2a's river-connectivity check showed the Washington Channel (and so the
  Wharf) joins the Potomac only at Hains Point, outside the first square. Heights: local MSL at NOAA station
  8594900 (Washington, DC).
- **D12** Vessel: *Potomac Taxi I* (Potomac Riverboat Co. / City Cruises), one of four BMT-designed Metal Shark
  aluminium catamarans on the Wharf–Georgetown water taxi: 88 ft (26.8 m) LOA, 149 passengers, 24 kn, twin Scania
  DI13 with propellers (Metal Shark 2017-10-16 release; WorkBoat; PropTalk). Beam 7 m from its AIS record
  (VesselFinder, MMSI 368006220). Draft is not published: **estimated 1.5 m** (props below the demihulls of a
  27 m passenger cat), demihull 1.8 m wide on 5.2 m centres, main deck 1.9 m, loaded displacement 62 t (all
  estimates, logged here).
- **D13** Buildings: DC GIS *Buildings – 3D* (Facility_and_Structure/MapServer/2, LiDAR multipatch with
  MAX_Z / MEDIAN_Z = height above ground; CC BY 4.0) decoded to footprints + heights, because the footprint layer
  has no height and the DC surface models are published only as rendered map services. Inside the Secret Service
  redaction (only ground returns kept) a building has no LiDAR height: OSM `height` / `building:levels`, else a
  logged default, and every such building is logged (hooks.js).
- **D14** Trees and 2 m roof imagery cover the Mall / Tidal Basin / waterfront core (38.874–38.896 N,
  77.060–77.005 W): 42,872 DC trees incl. the Mall elms and the Tidal Basin cherries; 1 m NAIP exceeds the
  service's size limit, so 2 m. Roofs elsewhere take 4 m NAIP.
- **D15** Authored shallow basins (terrain hooks, logged by the build): Tidal Basin bed 3.0 m below MSL with a
  25 m shelf (the topobathy has only its surface); the reflecting pools at their LiDAR water level (Lincoln 1.97 m,
  Capitol 2.91 m above MSL) with 0.6 m / 0.5 m beds.
- **D16** Building fallbacks: OSM `height`, else `building:levels` × 3.5 m (DC floor-to-floor), else 6 m, or 18 m
  for a redacted footprint over 1500 m² (the federal core); redacted buildings use the federal limestone palette.
  `buildings.baseAllRings` is on (courtyards on lower ground). Every fallback is in public/buildings/index.json.
- **D17** G3 references: the Lincoln and Jefferson Memorials against their roofs in the DC LiDAR; Key Bridge by
  its deck line against the charted NOAA outline (no open source publishes its pier positions, so the model
  spaces its seven arches evenly over the river); the Wharf pier against DC's 2023 planimetric "Dock or Pier"
  lines (harbour-scale charts predate the 2017 Wharf piers).
