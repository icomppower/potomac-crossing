// G6 Baseline-GPU compile (the 2026-09-26 Chrome setPipeline crash): every pipeline compiles and every frame validates
// in headless Dawn behind an adapter with only WebGPU's default limits and no optional features — the real App on
// this title's data, low / mobile / high tiers, water-taxi mode and free flight over the fixed views; a failed
// pipeline never reaches setPipeline. The machinery is the engine's (harbor-engine/gates/lib/baseline.mjs, E2).
// --negative: each engine fix reverted in a copy of the engine must fail, and so must a run without the clamp.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBaselineGate } from 'harbor-engine/gates/lib/baseline.mjs';

runBaselineGate( { views: join( dirname( fileURLToPath( import.meta.url ) ), 'lib/views.mjs' ), label: 'G6' } );
