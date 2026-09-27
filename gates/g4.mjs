// G4 Water taxi: the Georgetown → Wharf crossing completes in the real App (FerryController physics, the
// helmsman on public/ferry/route.json); its duration lies within the cited range — from the planned route
// length at Potomac Taxi I's published top speed (24 kn) to the published trip time (The Wharf DC: about 30 min);
// the hull is never over water shallower than its draft on the way; and it passes under every bridge on the
// route with clearance: charted NOAA vertical clearances (over MHW) for Roosevelt and the 14th Street bridges,
// the model's arch soffit for Arlington Memorial Bridge (no charted figure), and Key Bridge's charted span for
// the helm upstream of the Georgetown landing (D18).
// --negative: a shoal on the route, a slow helmsman, an unreachable berth and a vessel too tall for the bridges
// must each fail.
import 'harbor-engine/tools/lib/configured.mjs';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from 'harbor-engine/gates/lib/tiles.mjs';
import { FERRY, KNOT } from 'harbor-engine/src/world/VesselSpec.js';
import { planRoute } from 'harbor-engine/tools/ferry/route.mjs';
import { toUTM as utm } from 'harbor-engine/tools/geo/utm.mjs';
import { parseGLB } from 'harbor-engine/src/engine/loaders/GLTF.js';

const NEG = process.argv.includes( '--negative' );
const schedule = JSON.parse( readFileSync( join( root, 'public/ferry/schedule.json' ), 'utf8' ) );
const route = JSON.parse( readFileSync( join( root, 'public/ferry/route.json' ), 'utf8' ) );

// the cited range: the planned route length at the published top speed, to the published trip time
const T_MIN = route.length / ( FERRY.topSpeedKn * KNOT ) / 60, T_MAX = Math.max( ...schedule.publishedMinutes.toWharf );
const MHW = 2.284 - 1.859; // NOAA 8594900: mean high water above local MSL (m)
const MARGIN = 0.5; // m of air above the vessel under every bridge

// ---- the crossing (child process: one App per process)
async function sail( sabotage ) {

	const { bootApp } = await import( 'harbor-engine/tools/headless/app.mjs' );
	const H = await bootApp( { width: 320, height: 180, query: '?fly&noAudio' } );
	const app = H.app, b = app.boatCtl;
	app.renderEnabled = false;
	if ( sabotage === 'shoal' ) {

		// a 1 m deep bank 300 m across on the open-water leg, halfway along the route
		const [ a, c ] = [ route.waypoints[ 1 ], route.waypoints[ 2 ] ], mx = ( a[ 0 ] + c[ 0 ] ) / 2, mz = ( a[ 1 ] + c[ 1 ] ) / 2;
		const T = app.terrainData, n = T.res;
		for ( let j = 0; j < n; j ++ ) for ( let i = 0; i < n; i ++ ) {

			const x = T.origin + ( i + 0.5 ) * T.texel, z = T.origin + ( j + 0.5 ) * T.texel;
			if ( Math.hypot( x - mx, z - mz ) < 150 ) T.heights[ j * n + i ] = Math.max( T.heights[ j * n + i ], - 1.0 );

		}

	}

	H.frames( 30, 0.1 );
	await H.settle();
	b.minDepthUnderHull = Infinity; b.groundContacts = 0; // count from the departure
	app.setAutopilot( true );
	if ( sabotage === 'slow' ) { app.autopilot.cruise = 5 * KNOT; app.autopilot.harbour = 5 * KNOT; }
	if ( sabotage === 'unreachable' ) { const e = app.autopilot.pts.at( - 1 ); e[ 0 ] -= 350; e[ 1 ] -= 250; }
	let t = 0, k = 0;
	while ( t < 45 * 60 && ! app.autopilot.arrived ) {

		H.frames( 1, 0.1 ); t += 0.1;
		if ( ++ k % 50 === 0 ) await H.settle();

	}

	const end = route.waypoints.at( - 1 );
	return {
		arrived: app.autopilot.arrived, minutes: t / 60, endDistance: Math.hypot( b.position.x - end[ 0 ], b.position.z - end[ 1 ] ),
		minDepth: b.minDepthUnderHull, contacts: b.groundContacts, errors: H.errors.length,
	};

}

if ( process.argv.includes( '--sail' ) ) {

	const s = ( process.argv.find( ( a ) => a.startsWith( '--sabotage=' ) ) || '' ).split( '=' )[ 1 ];
	console.log( 'SAIL ' + JSON.stringify( await sail( s ) ) );
	process.exit( 0 );

}

function sailChild( sabotage = '' ) {

	const r = spawnSync( process.execPath, [ fileURLToPath( import.meta.url ), '--sail', ...( sabotage ? [ '--sabotage=' + sabotage ] : [] ) ], { encoding: 'utf8', maxBuffer: 1 << 26 } );
	const line = ( r.stdout || '' ).split( '\n' ).find( ( l ) => l.startsWith( 'SAIL ' ) );
	if ( ! line ) throw new Error( 'crossing crashed: ' + ( r.stderr || '' ).slice( - 800 ) );
	return JSON.parse( line.slice( 5 ) );

}

function judge( s ) {

	const fail = [];
	console.log( `crossing: arrived ${ s.arrived }, ${ s.minutes.toFixed( 2 ) } min (range ${ T_MIN.toFixed( 2 ) }–${ T_MAX } min), ${ s.endDistance.toFixed( 1 ) } m from the berth, min depth under the hull ${ s.minDepth.toFixed( 2 ) } m (draft ${ FERRY.draft } m), keel contacts ${ s.contacts }` );
	if ( s.errors ) fail.push( `render: ${ s.errors } console/GPU errors` );
	if ( ! s.arrived || s.endDistance > 30 ) fail.push( `arrival: the crossing did not complete (${ s.endDistance.toFixed( 0 ) } m from the Wharf berth after ${ s.minutes.toFixed( 1 ) } min)` );
	// past the published timetable is a duration failure whether or not the ferry got there
	if ( s.minutes > T_MAX || ( s.arrived && s.minutes < T_MIN ) ) fail.push( `duration: ${ s.arrived ? '' : 'still sailing after ' }${ s.minutes.toFixed( 2 ) } min, outside ${ T_MIN.toFixed( 2 ) }–${ T_MAX } min` );
	if ( ! ( s.minDepth >= FERRY.draft ) || s.contacts > 0 ) fail.push( `draft: the hull was over ${ s.minDepth.toFixed( 2 ) } m of water (draft ${ FERRY.draft } m), ${ s.contacts } keel contacts` );
	return fail;

}

// bridges the route passes under, and the helm's Key Bridge span: clearance above the vessel's air draft
export function bridgeChecks( airDraft = FERRY.airDraft ) {

	const fail = [], rows = [];
	const enc = JSON.parse( readFileSync( join( root, 'data/raw/noaa-enc-bridges.json' ), 'utf8' ) ).features;
	const MAP = JSON.parse( readFileSync( join( root, 'map.json' ), 'utf8' ) );
	const loc = ( lat, lon ) => { const [ E, N ] = utm( lat, lon ); return [ E - MAP.frame.originE, MAP.frame.originN - N ]; };
	const inside = ( r, x, z ) => { let c = false; for ( let i = 0, j = r.length - 1; i < r.length; j = i ++ ) { const [ xi, zi ] = r[ i ], [ xj, zj ] = r[ j ]; if ( ( zi > z ) !== ( zj > z ) && x < ( xj - xi ) * ( z - zi ) / ( zj - zi ) + xi ) c = ! c; } return c; };
	// sample the route every 3 m
	const path = [];
	for ( let k = 1; k < route.waypoints.length; k ++ ) { const [ a, b ] = [ route.waypoints[ k - 1 ], route.waypoints[ k ] ], n = Math.ceil( Math.hypot( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ] ) / 3 ); for ( let i = 0; i <= n; i ++ ) path.push( [ a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * i / n, a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * i / n ] ); }
	for ( const f of enc ) {

		const ring = f.geometry.rings[ 0 ].map( ( [ lon, lat ] ) => loc( lat, lon ) );
		if ( ! path.some( ( [ x, z ] ) => inside( ring, x, z ) ) ) continue;
		const name = f.attributes.OBJNAM || f.attributes.INFORM || 'bridge', clr = f.attributes.VERCLR;
		if ( clr > 0 ) { rows.push( `${ name }: charted ${ clr } m over MHW` ); if ( ! ( clr >= airDraft + MARGIN ) ) fail.push( `clearance: under ${ name } the charted ${ clr } m leaves less than ${ MARGIN } m over the ${ airDraft } m air draft` ); }

	}

	// Arlington Memorial Bridge: no charted clearance — the model's soffit over the route, above MHW
	const lmDir = join( root, 'public/landmarks' ), li = JSON.parse( readFileSync( join( lmDir, 'index.json' ), 'utf8' ) );
	const mb = li.landmarks.find( ( l ) => l.slug === 'memorial-bridge' );
	const buf = readFileSync( join( lmDir, mb.lods[ 0 ].name ) ), g = parseGLB( buf.buffer.slice( buf.byteOffset, buf.byteOffset + buf.length ) );
	let soffit = Infinity, crossed = false;
	const half = FERRY.beam / 2 + 1;
	for ( const n of g.nodes ) if ( n.mesh !== undefined ) for ( const p of g.meshes[ n.mesh ] ) {

		const P = p.attributes.POSITION.array;
		for ( let v = 0; v < P.length; v += 3 ) {

			const x = P[ v ] + n.t[ 0 ], y = P[ v + 1 ] + n.t[ 1 ], z = P[ v + 2 ] + n.t[ 2 ];
			if ( path.some( ( q ) => Math.hypot( q[ 0 ] - x, q[ 1 ] - z ) < half ) ) { crossed = true; soffit = Math.min( soffit, y ); }

		}

	}

	if ( ! crossed ) fail.push( 'clearance: the route does not pass under Arlington Memorial Bridge' );
	else { rows.push( `Arlington Memorial Bridge: model soffit ${ ( soffit - MHW ).toFixed( 1 ) } m over MHW` ); if ( ! ( soffit - MHW >= airDraft + MARGIN ) ) fail.push( `clearance: under Arlington Memorial Bridge the arch leaves ${ ( soffit - MHW - airDraft ).toFixed( 1 ) } m over the ${ airDraft } m air draft` ); }
	// Key Bridge (the helm, upstream of the Georgetown landing): its charted span
	const kb = enc.find( ( f ) => f.attributes.OBJNAM === 'Key Bridge' );
	rows.push( `Key Bridge: charted ${ kb && kb.attributes.VERCLR } m over MHW (helm)` );
	if ( ! kb || ! ( kb.attributes.VERCLR >= airDraft + MARGIN ) ) fail.push( 'clearance: Key Bridge\'s charted span is too low for the vessel' );
	console.log( 'bridges: ' + rows.join( '; ' ) );
	return fail;

}

function staticChecks() {

	const fail = [];
	// D3 / D12: the hull is built from the cited dimensions of Potomac Taxi I
	const cited = { length: 26.8, beam: 7.0, topSpeedKn: 24 };
	for ( const [ k, v ] of Object.entries( cited ) ) if ( FERRY[ k ] !== v ) fail.push( `hull: FERRY.${ k } = ${ FERRY[ k ] }, cited ${ v }` );
	const out = join( root, '.verify', 'g4-route.json' );
	mkdirSync( join( root, '.verify' ), { recursive: true } );
	writeFileSync( out, JSON.stringify( planRoute(), null, 1 ) + '\n' );
	if ( readFileSync( out, 'utf8' ) !== readFileSync( join( root, 'public/ferry/route.json' ), 'utf8' ) ) fail.push( 'route: public/ferry/route.json differs from a fresh plan (run node node_modules/harbor-engine/tools/ferry/route.mjs)' );
	rmSync( out, { force: true } );
	if ( ! ( route.minDepthAlong >= FERRY.draft ) ) fail.push( `route: planned legs cross ${ route.minDepthAlong } m of water (draft ${ FERRY.draft } m)` );
	return [ ...fail, ...bridgeChecks() ];

}

if ( ! NEG ) {

	const fail = [ ...staticChecks(), ...judge( sailChild() ) ];
	if ( fail.length ) { console.log( 'G4 FAIL\n- ' + fail.join( '\n- ' ) ); process.exit( 1 ); }
	console.log( 'G4 PASS — Georgetown → Wharf crossing completes within the cited range, never over water shallower than the draft, clear under every bridge' );
	process.exit( 0 );

}

const MUTATIONS = [
	[ 'a 1 m shoal on the route', 'draft:', 'shoal' ],
	[ 'a helmsman at 5 kn', 'duration:', 'slow' ],
	[ 'the berth moved ashore (unreachable)', 'arrival:', 'unreachable' ],
	[ 'a vessel 8 m tall (air draft)', 'clearance:', null ],
];
let missed = 0;
for ( const [ name, label, sabotage ] of MUTATIONS ) {

	const fail = ( sabotage ? judge( sailChild( sabotage ) ) : bridgeChecks( 8 ) ).filter( ( m ) => m.startsWith( label ) );
	console.log( `${ fail.length ? 'caught  ' : 'MISSED  ' } ${ name }${ fail.length ? ' — ' + fail[ 0 ] : '' }` );
	if ( ! fail.length ) missed ++;

}

console.log( `NEGATIVE ${ MUTATIONS.length - missed }/${ MUTATIONS.length }` ); // verify.sh requires every mutation caught
process.exit( missed ? 0 : 1 );
