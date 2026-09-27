// G1 Clean title: no SF (Bay Crossing) content came along; `vite build` passes; the dependency audit is clean;
// water + sky render in headless Dawn (the engine's generic checks, harbor-engine/gates/lib/clean.mjs).
// --negative: SF content planted in the title, a broken import, an undeclared package, a never-drawn ocean and
// a sun frozen at noon must each be caught.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runCleanGate } from 'harbor-engine/gates/lib/clean.mjs';
import { root } from 'harbor-engine/gates/lib/tiles.mjs';
import 'harbor-engine/tools/lib/configured.mjs';
import { VIEWS, poseFor } from './lib/views.mjs';

// Bay Crossing's names, coordinates and data files: none may appear in this title (this file excepted)
const SF = [ 'san francisco', 'sausalito', 'golden gate', 'embarcadero', 'alcatraz', 'coit tower', 'transamerica', 'ferry building', 'bay crossing', 'sf-buildings', 'ggt-gtfs', '9414290', '549504', '4186800', '-122.' ];

export function sfContent( extra = {} ) {

	const files = execFileSync( 'git', [ 'ls-files', '-co', '--exclude-standard' ], { cwd: root, encoding: 'utf8' } ).trim().split( '\n' )
		.filter( ( f ) => f && f !== 'gates/g1.mjs' && ! /\.(png|jpg|bin|glb|deflate|tif)$/i.test( f ) && ! f.startsWith( 'public/' ) );
	const fail = [];
	for ( const [ f, text ] of [ ...files.map( ( f ) => { try { return [ f, readFileSync( join( root, f ), 'utf8' ) ]; } catch { return [ f, '' ]; } } ), ...Object.entries( extra ) ] ) {

		const low = text.toLowerCase(), t = SF.find( ( s ) => low.includes( s ) );
		if ( t ) fail.push( `sf-content: ${ f } contains "${ t }"` );

	}

	return fail;

}

// the render check looks down the Potomac from off the Kennedy Center (open water: gates/lib/views.mjs)
const P = await poseFor( VIEWS.find( ( v ) => v[ 0 ] === 'potomac-kennedy' ) );
runCleanGate( { label: 'G1', pose: { x: P.x, z: P.z, yaw: P.yaw }, extra: [ [ 'sf-content', () => sfContent() ] ],
	negatives: [ [ 'SF content planted in src/', 'sf-content:', () => sfContent( { 'src/planted.js': '// the ferry to Sausalito\n' } ) ] ] } );
