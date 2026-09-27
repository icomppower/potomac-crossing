# Calibrated thresholds (frozen)

Measured at first run and frozen (SPEC §5). Each line: key, value, how it was measured. Never lowered to pass;
changing a frozen value needs a BLOCKED.md.

- `G2c.cityTriangles`: 344954 — building + landmark LOD triangles submitted per frame, fixed views (gates/lib/views.mjs); measured max 229969 at potomac-kennedy on 2026-09-27; cap = 1.5 × measured
- `G2c.frameTriangles`: 1882779 — triangles per frame, all passes, 1920×1080, fixed views (gates/lib/views.mjs); measured max 1506223 at key-bridge-upstream on 2026-09-27; cap = 1.25 × measured (terrain + ocean dominate)
- `G2c.frameDraws`: 251 — draw calls per frame, all passes, same views; measured max 167 at key-bridge-upstream on 2026-09-27; cap = 1.5 × measured
- `G2c.tileTriangles`: 56500 — LOD0 triangles in one 600 m building tile; measured max 45200 on 2026-09-27; cap = 1.25 × measured
- `G3.toleranceMetres`: 10 — horizontal control-point tolerance; worst gated error 6.77 m on 2026-09-27; tolerance = min( 10, ceil( 1.5 × worst ) )
