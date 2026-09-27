# Run log

| Date | Gate | Result | Notes |
|------|------|--------|-------|
| 2026-09-26 | G0 | PASS | 12 sources cached + checksummed + licensed; 29,423 DC footprints: 28,019 LiDAR heights, 955 redacted (flat LiDAR), 250 newer than LiDAR, 199 unmatched; 5/5 negatives |
| 2026-09-26 | G1 | PASS | no SF content; build, dependency audit, headless ocean + sky render (placeholder terrain on the DC frame); 5/5 negatives |
| 2026-09-26 | G0 | PASS | re-run on the 8.4 km frame: 12 sources; 29,915 DC footprints: 28,380 LiDAR, 1,087 redacted (flat LiDAR), 275 newer, 173 unmatched; 5/5 negatives |
| 2026-09-26 | G2a | PASS | 196 tiles + water mask byte-identical ×2 = public; Potomac connected Key Bridge→Washington Channel; Tidal Basin 43.8 ha (pub. 43.3), bed carved 3 m; Reflecting Pool 30,339 m², 618 m, LiDAR σ 0.048 m, level 1.97 m; 7/7 negatives |
| 2026-09-27 | G2b | PASS | 44,440 buildings (28,378 DC LiDAR, 14,528 Virginia OSM) in 185 tiles byte-identical ×2 = public; Old Post Office 94.2 m (96), Rosslyn 125 m; all 1,087 redacted + newer/unmatched have logged fallbacks (1,534); 71 % NAIP roofs; 8/8 negatives |
| 2026-09-27 | G2c | PASS | 7 Blender landmarks × 3 LODs at published heights (Monument 169.3, Capitol 87.8, Lincoln 30.2, Jefferson 39.3, KC LiDAR 48, Key Br. clearance 18.5); caps frozen city 344,954 / frame 1,882,779 / 251 draws / tile 56,500; 7/7 negatives |
| 2026-09-27 | G3 | PASS | 6 control points 0.9–6.8 m vs NOAA ENC (Monument, Capitol dome, Key Bridge outline), DC LiDAR (Lincoln, Jefferson), DC 2023 docks (Wharf berth); tolerance 10 m frozen; 2/2 shifted datasets fail |
| 2026-09-27 | G4 | PASS | Georgetown → Wharf (9.45 km round Hains Point) in 21.45 min (range 12.75–30), min 3.17 m under a 1.5 m draft, 0 contacts; clear under Roosevelt 7.3, 14th St 5.4 (air draft 4.6), Memorial model 7.7, Key 18.5 m; 4/4 negatives |
| 2026-09-27 | G5 | PASS | 53.7 fps p95 @1080p low (floor 43 frozen), GPU memory 680 MB (cap 851), 0 swap-outs; 3/3 negatives |
| 2026-09-27 | G6 | PASS | low/mobile/high × taxi/fly at WebGPU default limits: 0 failed pipelines (incl. the new water-level texture); 6/6 negatives |
| 2026-09-27 | G7 | PASS | night: Reflecting Pool reflection 61.8 (threshold 31.6 frozen, 1.4 without reflections), Potomac 39.2 (33.0, 26.8 without); floodlit Monument / Kennedy Center; 1/1 negative |
| 2026-09-27 | G8 | PASS | advisory: shots/golden-hour-lincoln-steps.png, blue-hour-tidal-basin.png, night-potomac.png for owner review |
| 2026-09-27 | DONE | PASS | G0–G7 green in one clean run (G8 advisory) |
