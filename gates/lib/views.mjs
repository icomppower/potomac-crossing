// Fixed camera viewpoints shared by the budget / look gates (G2c caps, G5 path, G6 limits, G7 reflections, G8 shots).
// [ name, lat, lon, eye y (m above MSL), look-at lat, lon, y ]
import 'harbor-engine/tools/lib/configured.mjs';

export const VIEWS = [
	[ 'lincoln-steps', 38.88931, - 77.04945, 22, 38.88950, - 77.03524, 70 ],
	[ 'tidal-basin-west', 38.88520, - 77.04230, 4, 38.88140, - 77.03650, 22 ],
	[ 'potomac-kennedy', 38.89640, - 77.06040, 5, 38.88700, - 77.05600, 8 ],
	[ 'aerial-mall', 38.88100, - 77.06800, 320, 38.88950, - 77.02000, 0 ],
	[ 'wharf-channel', 38.87580, - 77.02300, 4, 38.87950, - 77.02450, 6 ],
	[ 'key-bridge-upstream', 38.90420, - 77.07900, 6, 38.90200, - 77.07000, 14 ],
];

export async function poseFor( view ) {

	const { toLocal } = await import( 'harbor-engine/src/world/Frame.js' );
	const { toUTM } = await import( 'harbor-engine/tools/geo/utm.mjs' );
	const [ , lat, lon, y, tlat, tlon, ty ] = view;
	const p = toLocal( ...toUTM( lat, lon ) ), t = toLocal( ...toUTM( tlat, tlon ) );
	return { x: p.x, y, z: p.z, yaw: Math.atan2( - ( t.x - p.x ), - ( t.z - p.z ) ), pitch: Math.atan2( ty - y, Math.hypot( t.x - p.x, t.z - p.z ) ) };

}
