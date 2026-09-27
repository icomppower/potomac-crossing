# State

| Gate | Status | Last run | Notes |
|------|--------|----------|-------|
| G0 Data | PASS | 2026-09-26 | re-run on the 8.4 km frame: 12 sources; 29,915 DC footprints: 28,380 LiDAR, 1,087 redacted (flat LiDAR), 275 newer, 173 unmatched; 5/5 negatives |
| G1 Clean title | PASS | 2026-09-26 | no SF content; build, dependency audit, headless ocean + sky render (placeholder terrain on the DC frame); 5/5 negatives |
| G2a Terrain + water bodies | PASS | 2026-09-26 | 196 tiles + water mask byte-identical ×2 = public; Potomac connected Key Bridge→Washington Channel; Tidal Basin 43.8 ha (pub. 43.3), bed carved 3 m; Reflecting Pool 30,339 m², 618 m, LiDAR σ 0.048 m, level 1.97 m; 7/7 negatives |
| G2b Buildings | — | — | |
| G2c Landmarks + LOD | — | — | |
| G3 Georeference | — | — | |
| G4 Water taxi | — | — | |
| G5 M4 budget | — | — | |
| G6 Baseline-GPU compile | — | — | |
| G7 Reflections | — | — | |
| G8 Look (advisory) | — | — | |

## Current

Bootstrapped 2026-09-26 with `new-title` (placeholder island data). Next: G0.
