// Potomac Crossing's pipeline hooks (Harbor Engine contract, harbor-engine/docs/ENGINE.md). Node only.
//   collectBuildings( kit )   read the title's footprints + heights from kit.readJSON( file ) and call
//                             kit.finish( id, polys, roofAbove, roofAbs, style ) once per building
//   prepareLandmarks( ctx )   Blender inputs for the title's landmark script (map.json `landmarkScript`)
export function collectBuildings() {
  return { log: { placeholder: 0 }, excluded: [] };
}

export function prepareLandmarks() {
  return { note: 'placeholder: no landmarks', landmarks: [] };
}
