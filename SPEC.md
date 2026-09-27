# Potomac Crossing — SPEC

The full brief is the Notion page **"Potomac Crossing — DC SPEC.md (Opus 5.5)"** (3e81f269eaea81ccb174f2a5ce6b4878).
Local essentials only.

- **Objective:** real-data Washington, DC waterfront: walk the National Mall (Lincoln Memorial → Reflecting Pool →
  Washington Monument → Capitol), loop the Tidal Basin (Jefferson Memorial), ride a water taxi on the Potomac from
  Georgetown to The Wharf past the Kennedy Center. Golden hour to night, monuments lit. Desktop first, mobile kept.
- **Base:** Harbor Engine title (`new-title potomac-crossing`), engine pinned at v1.x; the redacted-LiDAR building
  height fallback lives in `hooks.js`.
- **Gates (`./verify.sh`, `gates/gates.json`):** G0 data · G1 clean title · G2a terrain + water bodies · G2b buildings ·
  G2c landmarks + LOD · G3 georeference · G4 water taxi · G5 M4 budget · G6 baseline-GPU compile · G7 reflections ·
  G8 look (advisory). DONE = G0–G7 green in one clean run → `DONE` + Notion status page.
- **Protocol:** lowest non-green gate → negative fails first → implement → verify → STATE.md → RUNLOG.md →
  commit `<gate>: <pass|fail> — <summary>`. Stop (BLOCKED.md + Notion) on 3 failed attempts, manual-only data
  whose fallback fails, or a frozen threshold / §3 change.
- **Guardrails:** M4 16 GB, one browser, never Blender with a dev server, no subagents, raw downloads cached +
  checksummed in `data/raw/`, never lower a threshold.
