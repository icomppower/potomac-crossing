// Potomac Crossing's pipeline hooks (Harbor Engine contract, harbor-engine/docs/ENGINE.md). Node only.
//   collectBuildings( kit )    DC footprints + LiDAR heights; the redacted-LiDAR fallback (OSM / logged default)
//   prepareLandmarks( ctx )    Blender inputs for pipelines/landmarks/build.py
//   shapeTerrain( kit )        authored shallow basins (Tidal Basin, reflecting pools)
//   waterBodies( kit )         still pools and the tidal basin for the water mask
export { shapeTerrain, waterBodies } from './pipelines/terrain.mjs';
export { collectBuildings } from './pipelines/buildings.mjs';
export { prepareLandmarks } from './pipelines/landmarks/prepare.mjs';
