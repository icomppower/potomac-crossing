# Potomac Crossing

Washington, DC in the browser, built from real data: walk the National Mall from the Lincoln Memorial past the
Reflecting Pool and the Washington Monument toward the Capitol, loop the Tidal Basin to the Jefferson Memorial, and
ride the water taxi on the Potomac from Georgetown past the Kennedy Center and under Memorial Bridge to the Wharf —
golden hour to night, with the monuments lit. A [Harbor Engine](https://github.com/icomppower/harbor-engine) title.

**Play it:** https://icomppower.github.io/potomac-crossing/

## What's real

- **Buildings:** Open Data DC footprints (through 2025) with heights from the District's LiDAR buildings; inside the
  Secret Service redaction, where the LiDAR keeps only the ground, heights fall back to OpenStreetMap or a logged
  default. The Virginia bank from OpenStreetMap.
- **Terrain and river:** USGS 3DEP elevation and NOAA's CUDEM topobathy of the Potomac, at local mean sea level
  (NOAA station 8594900); the Tidal Basin and the reflecting pools as authored shallow basins at their LiDAR levels.
- **Landmarks:** the Washington Monument, the Capitol, the Lincoln and Jefferson Memorials, the Kennedy Center, Key
  Bridge and Memorial Bridge, modelled in Blender from published dimensions (exterior massing only).
- **The water taxi:** *Potomac Taxi I*, an 88 ft Metal Shark catamaran, on the Georgetown–Wharf route round Hains
  Point, under bridge clearances charted by NOAA.

## Controls

WASD to walk, mouse to look, E to take the helm at the Georgetown landing, G for the autopilot, T to run the day,
F for the free camera, 1–9 for the viewpoints, K for the landmark signs.

## Gates

`./verify.sh` runs G0–G8 (`gates/gates.json`); state in `STATE.md`, frozen thresholds in `SPEC-THRESHOLDS.md`.
Sources and licences are in `CREDITS.md` (Open Data DC: CC BY 4.0).
