# State

| Gate | Status | Last run | Notes |
|------|--------|----------|-------|
| G0 Data | PASS | 2026-09-26 | re-run on the 8.4 km frame: 12 sources; 29,915 DC footprints: 28,380 LiDAR, 1,087 redacted (flat LiDAR), 275 newer, 173 unmatched; 5/5 negatives |
| G1 Clean title | PASS | 2026-09-26 | no SF content; build, dependency audit, headless ocean + sky render (placeholder terrain on the DC frame); 5/5 negatives |
| G2a Terrain + water bodies | PASS | 2026-09-26 | 196 tiles + water mask byte-identical ×2 = public; Potomac connected Key Bridge→Washington Channel; Tidal Basin 43.8 ha (pub. 43.3), bed carved 3 m; Reflecting Pool 30,339 m², 618 m, LiDAR σ 0.048 m, level 1.97 m; 7/7 negatives |
| G2b Buildings | PASS | 2026-09-27 | 44,440 buildings (28,378 DC LiDAR, 14,528 Virginia OSM) in 185 tiles byte-identical ×2 = public; Old Post Office 94.2 m (96), Rosslyn 125 m; all 1,087 redacted + newer/unmatched have logged fallbacks (1,534); 71 % NAIP roofs; 8/8 negatives |
| G2c Landmarks + LOD | PASS | 2026-09-27 | 7 Blender landmarks × 3 LODs at published heights (Monument 169.3, Capitol 87.8, Lincoln 30.2, Jefferson 39.3, KC LiDAR 48, Key Br. clearance 18.5); caps frozen city 344,954 / frame 1,882,779 / 251 draws / tile 56,500; 7/7 negatives |
| G3 Georeference | PASS | 2026-09-27 | 6 control points 0.9–6.8 m vs NOAA ENC (Monument, Capitol dome, Key Bridge outline), DC LiDAR (Lincoln, Jefferson), DC 2023 docks (Wharf berth); tolerance 10 m frozen; 2/2 shifted datasets fail |
| G4 Water taxi | PASS | 2026-09-27 | Georgetown → Wharf (9.45 km round Hains Point) in 21.45 min (range 12.75–30), min 3.17 m under a 1.5 m draft, 0 contacts; clear under Roosevelt 7.3, 14th St 5.4 (air draft 4.6), Memorial model 7.7, Key 18.5 m; 4/4 negatives |
| G5 M4 budget | — | — | |
| G6 Baseline-GPU compile | — | — | |
| G7 Reflections | — | — | |
| G8 Look (advisory) | — | — | |

## Current

Bootstrapped 2026-09-26 with `new-title` (placeholder island data). Next: G0.
