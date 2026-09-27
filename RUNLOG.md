# Run log

| Date | Gate | Result | Notes |
|------|------|--------|-------|
| 2026-09-26 | G0 | PASS | 12 sources cached + checksummed + licensed; 29,423 DC footprints: 28,019 LiDAR heights, 955 redacted (flat LiDAR), 250 newer than LiDAR, 199 unmatched; 5/5 negatives |
| 2026-09-26 | G1 | PASS | no SF content; build, dependency audit, headless ocean + sky render (placeholder terrain on the DC frame); 5/5 negatives |
| 2026-09-26 | G0 | PASS | re-run on the 8.4 km frame: 12 sources; 29,915 DC footprints: 28,380 LiDAR, 1,087 redacted (flat LiDAR), 275 newer, 173 unmatched; 5/5 negatives |
| 2026-09-26 | G2a | PASS | 196 tiles + water mask byte-identical ×2 = public; Potomac connected Key Bridge→Washington Channel; Tidal Basin 43.8 ha (pub. 43.3), bed carved 3 m; Reflecting Pool 30,339 m², 618 m, LiDAR σ 0.048 m, level 1.97 m; 7/7 negatives |
| 2026-09-27 | G2b | PASS | 44,440 buildings (28,378 DC LiDAR, 14,528 Virginia OSM) in 185 tiles byte-identical ×2 = public; Old Post Office 94.2 m (96), Rosslyn 125 m; all 1,087 redacted + newer/unmatched have logged fallbacks (1,534); 71 % NAIP roofs; 8/8 negatives |
| 2026-09-27 | G2c | PASS | 7 Blender landmarks × 3 LODs at published heights (Monument 169.3, Capitol 87.8, Lincoln 30.2, Jefferson 39.3, KC LiDAR 48, Key Br. clearance 18.5); caps frozen city 344,954 / frame 1,882,779 / 251 draws / tile 56,500; 7/7 negatives |
