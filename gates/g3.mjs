// G3 Georeference: 6 control points — Washington Monument, Capitol dome, Lincoln Memorial, Jefferson Memorial,
// Key Bridge, the Wharf pier — where the shipped scene puts a feature vs. an independent source (NOAA ENC, the DC
// LiDAR), within a tolerance calibrated on first run (≤ 10 m, frozen in SPEC-THRESHOLDS.md). A shifted dataset
// must fail: --negative shifts a source 15 m in a raw fixture and rebuilds through the real pipelines.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { root, resolveScript } from 'harbor-engine/gates/lib/tiles.mjs';
import { readThresholds, freeze } from 'harbor-engine/gates/lib/thresholds.mjs';
import { controlErrors } from './lib/controls.mjs';
import { RAW } from 'harbor-engine/tools/data/cache.mjs';

const NEG = process.argv.includes( '--negative' );

function check( opts = {} ) {

	const rows = controlErrors( opts );
	const tol = readThresholds()[ 'G3.toleranceMetres' ];
	const fail = [];
	for ( const r of rows ) console.log( `  ${ r.name.padEnd( 30 ) } ${ r.error.toFixed( 2 ).padStart( 7 ) } m  vs ${ r.ref }` );
	const gated = rows;
	if ( gated.length < 6 ) fail.push( `controls: only ${ gated.length } control points (need ≥ 6)` );
	for ( const r of gated ) if ( ! ( r.error <= tol ) ) fail.push( `georef: ${ r.name } is ${ r.error.toFixed( 1 ) } m from ${ r.ref } (tolerance ${ tol } m)` );
	return { fail, rows };

}

// calibrate on first run: tolerance = min( 10, ceil( 1.5 × worst gated error ) ), then frozen
if ( ! ( 'G3.toleranceMetres' in readThresholds() ) ) {

	const worst = Math.max( ...controlErrors().map( ( r ) => r.error ) );
	freeze( 'G3.toleranceMetres', Math.min( 10, Math.ceil( 1.5 * worst ) ), `horizontal control-point tolerance; worst gated error ${ worst.toFixed( 2 ) } m on ${ new Date().toISOString().slice( 0, 10 ) }; tolerance = min( 10, ceil( 1.5 × worst ) )` );

}

if ( ! NEG ) {

	const { fail } = check();
	if ( fail.length ) { console.log( 'G3 FAIL\n- ' + fail.join( '\n- ' ) ); process.exit( 1 ); }
	console.log( `G3 PASS — 6 control points within ${ readThresholds()[ 'G3.toleranceMetres' ] } m of independent references` );
	process.exit( 0 );

}

// ---- negative fixtures: shift a source 15 m in a raw fixture, rebuild, the controls must fail
const work = join( root, '.verify', 'g3' );
const DLON = 15 / ( 111320 * Math.cos( 38.89 * Math.PI / 180 ) ), DLAT = 15 / 110540;
const fixtureRaw = ( file, rewrite ) => {

	const d = join( work, 'raw' );
	rmSync( work, { recursive: true, force: true } ); mkdirSync( d, { recursive: true } );
	for ( const f of readdirSync( RAW ) ) if ( f !== file ) symlinkSync( join( RAW, f ), join( d, f ) );
	writeFileSync( join( d, file ), rewrite( readFileSync( join( RAW, file ) ) ) );
	const lines = readFileSync( join( RAW, 'MANIFEST.sha256' ), 'utf8' ).trim().split( '\n' ).map( ( l ) => { const f = l.split( /\s+/ )[ 1 ]; return `${ createHash( 'sha256' ).update( readFileSync( join( d, f ) ) ).digest( 'hex' ) }  ${ f }`; } );
	rmSync( join( d, 'MANIFEST.sha256' ) ); writeFileSync( join( d, 'MANIFEST.sha256' ), lines.join( '\n' ) + '\n' );
	return d;

};
const run = ( script, args ) => {

	const r = spawnSync( process.execPath, [ resolveScript( script ), ...args ], { cwd: root, encoding: 'utf8', env: { ...process.env, BLENDER: process.env.BLENDER || '/opt/homebrew/bin/blender' }, maxBuffer: 1 << 26 } );
	if ( r.status !== 0 ) throw new Error( `${ script } failed: ${ ( r.stderr || r.stdout ).slice( - 400 ) }` );

};
const MUTATIONS = [
	[ 'OSM landmark features shifted 15 m east (landmarks + ferry landings rebuilt)', () => {

		const raw = fixtureRaw( 'osm-features.json', ( b ) => { const j = JSON.parse( b ); for ( const e of j.elements ) { if ( e.lon !== undefined ) e.lon += DLON; for ( const g of e.geometry || [] ) g.lon += DLON; } return Buffer.from( JSON.stringify( j ) ); } );
		run( 'tools/landmarks/build.mjs', [ '--raw', raw, '--out', join( work, 'landmarks' ) ] );
		run( 'pipelines/ferry/prepare.mjs', [ '--raw', raw, '--out', join( work, 'schedule.json' ) ] );
		return check( { landmarks: join( work, 'landmarks' ), ferry: join( work, 'schedule.json' ) } ).fail;

	} ],
	[ 'DC LiDAR buildings shifted 15 m north (reference side)', () => {

		const raw = fixtureRaw( 'dc-buildings-3d.json', ( b ) => {

			const j = JSON.parse( b );
			for ( const f of j.features ) {

				// the multipatch keeps its own coordinates: rewrite them (zlib shape buffer after a 12-byte header)
				const zlib = process.getBuiltinModule( 'node:zlib' ), raw = Buffer.from( f.geometry.binaryPatches, 'base64' ), rec = zlib.inflateSync( raw.subarray( 12 ) );
				const nParts = rec.readInt32LE( 36 ), nPts = rec.readInt32LE( 40 ), xy0 = 44 + 8 * nParts;
				for ( let k = 0; k < nPts; k ++ ) rec.writeDoubleLE( rec.readDoubleLE( xy0 + k * 16 + 8 ) + DLAT, xy0 + k * 16 + 8 );
				f.geometry.binaryPatches = Buffer.concat( [ raw.subarray( 0, 12 ), zlib.deflateSync( rec ) ] ).toString( 'base64' );

			}

			return Buffer.from( JSON.stringify( j ) );

		} );
		return check( { raw } ).fail;

	} ],
];
let missed = 0;
for ( const [ name, fn ] of MUTATIONS ) {

	const fail = fn().filter( ( m ) => m.startsWith( 'georef:' ) );
	console.log( `${ fail.length ? 'caught  ' : 'MISSED  ' } ${ name }${ fail.length ? ' — ' + fail[ 0 ] : '' }` );
	if ( ! fail.length ) missed ++;

}

rmSync( work, { recursive: true, force: true } );
console.log( `NEGATIVE ${ MUTATIONS.length - missed }/${ MUTATIONS.length }` );
process.exit( missed ? 0 : 1 );
