// G7 Reflections: at night the floodlit monuments show as visible reflections on the Reflecting Pool and on the
// Potomac. In the real App (headless Dawn, 1920×1080, low tier) at night, the mirror image of a landmark across
// the water plane is projected to the screen; the mean luminance of that reflection region is measured with the
// water's reflections on, and must clear a threshold calibrated once (frozen in SPEC-THRESHOLDS.md) halfway
// between the reflections-off and reflections-on measurements.
//   Reflecting Pool: from its west end (below the Lincoln Memorial steps) toward the Washington Monument
//   Potomac: from the river off Theodore Roosevelt Island toward the Kennedy Center
// --negative: the water's reflections disabled (screen-space and planar reflection strength 0) must fail.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import 'harbor-engine/tools/lib/configured.mjs';
import { root } from 'harbor-engine/gates/lib/tiles.mjs';
import { readThresholds, freeze } from 'harbor-engine/gates/lib/thresholds.mjs';
import { toUTM } from 'harbor-engine/tools/geo/utm.mjs';

const NEG = process.argv.includes( '--negative' );
const MAP = JSON.parse( readFileSync( join( root, 'map.json' ), 'utf8' ) );
const loc = ( lat, lon ) => { const [ E, N ] = toUTM( lat, lon ); return [ E - MAP.frame.originE, MAP.frame.originN - N ]; };
const pool = JSON.parse( readFileSync( join( root, 'public/terrain/index.json' ), 'utf8' ) ).water.bodies.find( ( b ) => b.id === 'reflecting-pool' );
const LM = JSON.parse( readFileSync( join( root, 'public/landmarks/index.json' ), 'utf8' ) ).landmarks;
const lm = ( slug ) => LM.find( ( l ) => l.slug === slug );

// [ name, eye lat, lon, eye height above the water, landmark slug, landmark top above its ground, water level ]
const SCENES = [
	[ 'reflecting-pool', 38.88935, - 77.04880, 2.2, 'washington-monument', 169.3, pool.level ],
	[ 'potomac', 38.89330, - 77.06080, 3.0, 'kennedy-center', 35.0, 0 ],
];
const NIGHT = 21.0; // local solar time: the sun ~20° below the horizon in late September

async function measure( reflectionsOff ) {

	const { bootApp } = await import( 'harbor-engine/tools/headless/app.mjs' );
	const { Vector3 } = await import( 'harbor-engine/src/engine/index.js' );
	const H = await bootApp( { width: 1920, height: 1080, query: '?fly&noAudio&tier=low' } );
	const app = H.app, cam = app.camera;
	if ( reflectionsOff ) { app.waterMaterial.params.ssr.value = 0; app.waterMaterial.params.reflectionStrength.value = 0; }
	const out = [];
	for ( const [ name, lat, lon, eyeH, slug, top, level ] of SCENES ) {

		const [ ex, ez ] = loc( lat, lon ), L = lm( slug ), [ ax, az ] = L.anchor;
		const baseY = Math.max( level, L.ground ), topY = L.ground + top;
		// look at the landmark's mid-height, slightly down so the reflection is framed too
		const dx = ax - ex, dz = az - ez, dist = Math.hypot( dx, dz );
		const yaw = Math.atan2( - dx, - dz ), pitch = Math.atan2( level - ( level + eyeH ), dist ) * 0.5;
		app.settings.timeOfDay = NIGHT;
		app.fly.setPose( new Vector3( ex, level + eyeH, ez ), yaw, pitch );
		H.frames( 40, 1 / 30 );
		const px = await H.readPixels();
		cam.updateMatrixWorld();
		// the landmark's axis and its mirror image across the water plane, on screen
		const proj = ( y ) => { const v = new Vector3( ax, y, az ).project( cam ); return [ ( v.x * 0.5 + 0.5 ) * H.width, ( 0.5 - v.y * 0.5 ) * H.height ]; };
		const [ cx ] = proj( topY ), mTop = proj( 2 * level - topY )[ 1 ], mBase = proj( 2 * level - baseY )[ 1 ];
		const halfW = Math.max( 3, ( proj( topY )[ 1 ] - proj( baseY )[ 1 ] ) === 0 ? 3 : Math.abs( proj( baseY )[ 1 ] - proj( topY )[ 1 ] ) * 0.06 );
		const y0 = Math.max( 0, Math.floor( Math.min( mBase, mTop ) ) ), y1 = Math.min( H.height - 1, Math.ceil( Math.max( mBase, mTop ) ) );
		const x0 = Math.max( 0, Math.floor( cx - halfW ) ), x1 = Math.min( H.width - 1, Math.ceil( cx + halfW ) );
		let s = 0, n = 0, lit = 0, litN = 0;
		for ( let y = y0; y <= y1; y ++ ) for ( let x = x0; x <= x1; x ++ ) { const k = ( y * H.width + x ) * 4; s += 0.2126 * px[ k ] + 0.7152 * px[ k + 1 ] + 0.0722 * px[ k + 2 ]; n ++; }
		// the lit landmark itself (above the water line), for scale
		const t0 = Math.max( 0, Math.floor( proj( topY )[ 1 ] ) ), t1 = Math.min( H.height - 1, Math.ceil( proj( baseY )[ 1 ] ) );
		for ( let y = t0; y <= t1; y ++ ) for ( let x = x0; x <= x1; x ++ ) { const k = ( y * H.width + x ) * 4; lit += 0.2126 * px[ k ] + 0.7152 * px[ k + 1 ] + 0.0722 * px[ k + 2 ]; litN ++; }
		out.push( { name, reflection: n ? s / n : 0, landmark: litN ? lit / litN : 0, box: [ x0, y0, x1, y1 ], dist: Math.round( dist ) } );

	}

	return { scenes: out, errors: H.errors.length };

}

if ( process.argv.includes( '--measure' ) ) {

	console.log( 'MEASURE ' + JSON.stringify( await measure( process.argv.includes( '--off' ) ) ) );
	process.exit( 0 );

}

function child( off = false ) {

	const r = spawnSync( process.execPath, [ fileURLToPath( import.meta.url ), '--measure', ...( off ? [ '--off' ] : [] ) ], { encoding: 'utf8', maxBuffer: 1 << 26 } );
	const line = ( r.stdout || '' ).split( '\n' ).find( ( l ) => l.startsWith( 'MEASURE ' ) );
	if ( ! line ) throw new Error( 'measurement crashed: ' + ( r.stderr || '' ).slice( - 800 ) );
	return JSON.parse( line.slice( 8 ) );

}

// calibrate once: threshold halfway between reflections off and on, per scene
let T = readThresholds();
if ( ! SCENES.every( ( [ n ] ) => `G7.reflection.${ n }` in T ) ) {

	const on = child( false ), off = child( true ), today = new Date().toISOString().slice( 0, 10 );
	for ( const [ n ] of SCENES ) {

		const a = on.scenes.find( ( s ) => s.name === n ).reflection, b = off.scenes.find( ( s ) => s.name === n ).reflection;
		freeze( `G7.reflection.${ n }`, Math.round( ( b + ( a - b ) / 2 ) * 100 ) / 100, `mean luminance (sRGB 0–255) of the landmark's mirror-image region on the water at night; measured ${ a.toFixed( 2 ) } with reflections, ${ b.toFixed( 2 ) } without, on ${ today }; threshold = halfway` );

	}

	T = readThresholds();

}

function judge( m ) {

	const fail = [];
	if ( m.errors ) fail.push( `render: ${ m.errors } console/GPU errors` );
	for ( const s of m.scenes ) {

		const t = T[ `G7.reflection.${ s.name }` ];
		console.log( `${ s.name.padEnd( 16 ) } reflection luminance ${ s.reflection.toFixed( 2 ) } (threshold ${ t }), the lit landmark ${ s.landmark.toFixed( 1 ) }, ${ s.dist } m away, region ${ s.box.join( ',' ) }` );
		if ( ! ( s.reflection >= t ) ) fail.push( `reflection: on the ${ s.name === 'potomac' ? 'Potomac' : 'Reflecting Pool' } the night reflection region measures ${ s.reflection.toFixed( 2 ) }, below ${ t }` );

	}

	return fail;

}

if ( ! NEG ) {

	const fail = judge( child( false ) );
	if ( fail.length ) { console.log( 'G7 FAIL\n- ' + fail.join( '\n- ' ) ); process.exit( 1 ); }
	console.log( 'G7 PASS — the floodlit Washington Monument and Kennedy Center reflect visibly on the Reflecting Pool and the Potomac at night' );
	process.exit( 0 );

}

const fail = judge( child( true ) ).filter( ( m ) => m.startsWith( 'reflection:' ) );
console.log( `${ fail.length ? 'caught  ' : 'MISSED  ' } reflections disabled${ fail.length ? ' — ' + fail[ 0 ] : '' }` );
console.log( `NEGATIVE ${ fail.length ? 1 : 0 }/1` );
process.exit( fail.length ? 1 : 0 );
