// G2b Buildings: DC footprints + LiDAR heights (and OSM for Virginia) → extruded building tiles, byte-identical
// across two offline runs; shipped tiles (public/buildings) are exactly that output; geometry is sound (outward
// winding, walls reach the ground, roofs above it); LiDAR heights are used (the Old Post Office tower, 96 m);
// every redacted-area building has an OSM or logged fallback height; the in-app loader reproduces the tiles.
// --negative: each mutation must trip the check it targets.
import { mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync, cpSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { root, compareDirs, runOffline, decodeTerrain } from 'harbor-engine/gates/lib/tiles.mjs';
import { parseGLB } from 'harbor-engine/src/engine/loaders/GLTF.js';
import { writeGLB } from 'harbor-engine/tools/geo/glb.mjs';
import { toUTM } from 'harbor-engine/tools/geo/utm.mjs';
import { RAW } from 'harbor-engine/tools/data/cache.mjs';
import 'harbor-engine/tools/lib/configured.mjs';
import { joinDC } from '../pipelines/dc/buildings.mjs';

const MAP = JSON.parse( readFileSync( join( root, 'map.json' ), 'utf8' ) ), OE = MAP.frame.originE, ON = MAP.frame.originN;
const at = ( lat, lon ) => { const [ E, N ] = toUTM( lat, lon ); return [ E - OE, ON - N ]; };

const NEG = process.argv.includes( '--negative' );
const work = join( root, '.verify', 'g2b' );
const SHIPPED = join( root, 'public/buildings' );
const terrain = decodeTerrain( join( root, 'public/terrain' ) );
const tH = ( x, z ) => { const { res, size } = terrain.index, t = size / res, fx = ( x + size / 2 ) / t - 0.5, fz = ( z + size / 2 ) / t - 0.5; const i = Math.max( 0, Math.min( res - 2, Math.floor( fx ) ) ), j = Math.max( 0, Math.min( res - 2, Math.floor( fz ) ) ); const a = Math.min( 1, Math.max( 0, fx - i ) ), b = Math.min( 1, Math.max( 0, fz - j ) ), H = terrain.h, k = j * res + i; return ( H[ k ] * ( 1 - a ) + H[ k + 1 ] * a ) * ( 1 - b ) + ( H[ k + res ] * ( 1 - a ) + H[ k + res + 1 ] * a ) * b; };

const readTile = ( p ) => { const g = parseGLB( inflateSync( readFileSync( p ) ).buffer.slice( 0 ) ); const n = g.nodes[ 0 ], m = g.meshes[ n.mesh ][ 0 ]; return { t: n.t, pos: m.attributes.POSITION.array, nrm: m.attributes.NORMAL.array, uv: m.attributes.TEXCOORD_0.array, col: m.attributes.COLOR_0.array, idx: m.indices, name: n.name }; };
const writeTile = ( p, T ) => writeFileSync( p, deflateSync( writeGLB( { meshes: [ { name: T.name, translation: T.t, position: T.pos, normal: T.nrm, uv: T.uv, color: T.col, index: T.idx } ] } ), { level: 9, memLevel: 9 } ) );

function build( rawDir, outDir ) {

	const r = runOffline( 'tools/buildings/build.mjs', [ '--raw', rawDir, '--out', outDir ] );
	return r.status === 0 ? [] : [ `pipeline: build failed — ${ ( r.stderr || '' ).trim().split( '\n' ).find( ( l ) => /^\w*Error:/.test( l.trim() ) ) || r.status }` ];

}

function content( dir, rawDir = RAW ) {

	const fail = [], index = JSON.parse( readFileSync( join( dir, 'index.json' ), 'utf8' ) );
	let badWinding = 0, floating = 0, lowRoofs = 0, tris = 0, tallest = 0, opo = 0, rosslyn = 0;
	const wallCols = new Set(), roofCols = new Set(); // distinct colours (5-bit per channel)
	// the Old Post Office clock tower (96 m, DC's tallest ordinary building) and the Rosslyn towers (Virginia, OSM)
	const [ ox, oz ] = at( 38.8943, - 77.0277 ), [ rx, rz ] = at( 38.8958, - 77.0710 );
	for ( const f of index.files ) {

		const T = readTile( join( dir, f.name ) );
		tris += T.idx.length / 3;
		for ( let k = 0; k < T.idx.length; k += 3 ) {

			const [ a, b, c ] = [ T.idx[ k ] * 3, T.idx[ k + 1 ] * 3, T.idx[ k + 2 ] * 3 ];
			const ux = T.pos[ b ] - T.pos[ a ], uy = T.pos[ b + 1 ] - T.pos[ a + 1 ], uz = T.pos[ b + 2 ] - T.pos[ a + 2 ];
			const vx = T.pos[ c ] - T.pos[ a ], vy = T.pos[ c + 1 ] - T.pos[ a + 1 ], vz = T.pos[ c + 2 ] - T.pos[ a + 2 ];
			const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
			if ( Math.hypot( nx, ny, nz ) < 2e-3 ) continue; // degenerate
			if ( nx * T.nrm[ a ] + ny * T.nrm[ a + 1 ] + nz * T.nrm[ a + 2 ] < 0 ) badWinding ++;

		}

		for ( let v = 0; v < T.pos.length / 3; v ++ ) {

			const x = T.pos[ v * 3 ] + T.t[ 0 ], y = T.pos[ v * 3 + 1 ], z = T.pos[ v * 3 + 2 ] + T.t[ 2 ];
			const roof = T.nrm[ v * 3 + 1 ] > 0.5;
			const q = ( ( T.col[ v * 4 ] >> 3 ) << 10 ) | ( ( T.col[ v * 4 + 1 ] >> 3 ) << 5 ) | ( T.col[ v * 4 + 2 ] >> 3 );
			( roof ? roofCols : wallCols ).add( q );
			if ( ! roof && T.uv[ v * 2 + 1 ] === 0 && y > Math.max( tH( x, z ), - 2 ) + 0.05 ) floating ++;
			if ( roof ) {

				const above = y - Math.max( tH( x, z ), 0 );
				if ( y < tH( x, z ) + 1.5 ) lowRoofs ++;
				tallest = Math.max( tallest, above );
				if ( Math.hypot( x - ox, z - oz ) < 60 ) opo = Math.max( opo, above );
				if ( Math.hypot( x - rx, z - rz ) < 60 ) rosslyn = Math.max( rosslyn, above );

			}

		}

	}

	if ( badWinding ) fail.push( `winding: ${ badWinding } triangles face against their normals` );
	if ( floating ) fail.push( `ground: ${ floating } wall-bottom vertices float above the terrain` );
	if ( lowRoofs ) fail.push( `ground: ${ lowRoofs } roof vertices less than 1.5 m above the terrain` );
	if ( ! ( opo >= 85 && opo <= 100 ) ) fail.push( `heights: Old Post Office tower ${ opo.toFixed( 1 ) } m above ground, expected 85–100 (96 m; LiDAR)` );
	if ( ! ( rosslyn >= 60 && rosslyn <= 135 ) ) fail.push( `heights: Rosslyn towers ${ rosslyn.toFixed( 1 ) } m, expected 60–135 (Virginia bank, OSM)` );
	if ( ! ( tallest <= 135 ) ) fail.push( `heights: tallest roof ${ tallest.toFixed( 1 ) } m above ground, expected ≤ 135 (landmarks excluded)` );
	const ex = [ ...new Set( ( index.landmarkExclusions || [] ).map( ( e ) => e.landmark ) ) ].sort().join( ', ' );
	const EX = 'John F. Kennedy Center for the Performing Arts, Lincoln Memorial, Thomas Jefferson Memorial, United States Capitol, Washington Monument';
	if ( ex !== EX ) fail.push( `landmarks: footprints replaced by landmark models are [${ ex }], expected ${ EX }` );
	// every DC footprint without a LiDAR height (redacted, newer, unmatched) has a logged fallback height
	const L = index.heights && index.heights.log;
	const dc = joinDC( JSON.parse( readFileSync( join( rawDir, 'dc-footprints.json' ), 'utf8' ) ), JSON.parse( readFileSync( join( rawDir, 'dc-buildings-3d.json' ), 'utf8' ) ) );
	const exIds = new Set( ( index.landmarkExclusions || [] ).map( ( e ) => e.id ) ), fb = new Map( ( L && L.fallbacks || [] ).map( ( f ) => [ f.id, f ] ) );
	const missing = dc.footprints.filter( ( f ) => f.missing && ! exIds.has( 'dc' + f.id ) && ! fb.has( 'dc' + f.id ) );
	const bad = [ ...fb.values() ].filter( ( f ) => ! [ 'osm-height', 'osm-levels', 'default' ].includes( f.source ) || ! ( f.height > 0 ) );
	const redacted = dc.footprints.filter( ( f ) => f.missing === 'redacted' ).length;
	if ( missing.length ) fail.push( `fallback: ${ missing.length } DC buildings without LiDAR have no logged fallback height (e.g. dc${ missing[ 0 ].id }, ${ missing[ 0 ].missing })` );
	if ( bad.length ) fail.push( `fallback: ${ bad.length } fallback entries without a source / height` );
	if ( ! L || ! ( L.dcLidar > 25000 ) || ! ( L.virginia > 5000 ) || L.dcLidar + L.redacted + L.newer + L.unmatched + L.virginia !== index.totals.buildings )
		fail.push( `heights: height-source log missing or inconsistent (${ L && JSON.stringify( { ...L, fallbacks: L.fallbacks.length } ) })` );
	// colour (D38): typed wall palettes with per-building variation, roofs from NAIP aerial imagery
	const C = index.colours && index.colours.roofs;
	if ( ! ( wallCols.size >= 40 ) ) fail.push( `colour: only ${ wallCols.size } distinct wall colours (want ≥ 40)` );
	if ( ! ( roofCols.size >= 300 ) ) fail.push( `colour: only ${ roofCols.size } distinct roof colours (want ≥ 300)` );
	if ( ! C || ! ( C.naip >= 0.6 * index.totals.buildings ) ) fail.push( `colour: roofs from NAIP ${ C && C.naip } of ${ index.totals.buildings } (want ≥ 60 %)` );
	if ( ! ( index.totals.buildings >= 35000 ) ) fail.push( `count: ${ index.totals.buildings } buildings, expected ≥ 35000` );
	if ( tris !== index.totals.triangles ) fail.push( `count: index says ${ index.totals.triangles } triangles, tiles hold ${ tris }` );
	console.log( `colours: ${ wallCols.size } wall / ${ roofCols.size } roof (5-bit), NAIP roofs ${ C && C.naip }` );
	console.log( `buildings: ${ index.totals.buildings }, ${ tris } triangles, tallest ${ tallest.toFixed( 1 ) } m, Old Post Office ${ opo.toFixed( 1 ) } m, Rosslyn ${ rosslyn.toFixed( 1 ) } m; ${ redacted } redacted-area buildings, ${ fb.size } logged fallbacks (${ [ ...fb.values() ].filter( ( f ) => f.why === 'redacted' && f.source !== 'default' ).length } redacted from OSM)` );
	return fail;

}

async function loaderMatches( dir ) {

	const netFetch = globalThis.fetch;
	globalThis.fetch = async ( u ) => new Response( readFileSync( join( dir, String( u ).replace( /^\/?buildings\//, '' ) ) ) );
	try {

		const { loadBuildingTiles } = await import( 'harbor-engine/src/world/BuildingTiles.js' );
		const g = await loadBuildingTiles( '/' );
		const index = JSON.parse( readFileSync( join( dir, 'index.json' ), 'utf8' ) );
		let bad = 0;
		for ( const tile of g.children ) {

			const f = tile.userData.tile, want = [ f.triangles, ...f.lods.map( ( l ) => l.triangles ) ];
			tile.userData.lods.forEach( ( m, k ) => { if ( m.geometry.index.count / 3 !== want[ k ] ) bad ++; } );

		}

		return bad || g.children.length !== index.files.length ? [ `loader: ${ g.children.length } tiles / ${ bad } LOD triangle-count mismatches vs index` ] : [];

	} finally { globalThis.fetch = netFetch; }

}

async function check( { rawDir = RAW, shipped = SHIPPED, tamper = null } = {} ) {

	rmSync( work, { recursive: true, force: true } );
	const a = join( work, 'run1' ), b = join( work, 'run2' );
	const fail = [ ...build( rawDir, a ), ...build( rawDir, b ) ];
	if ( fail.length ) return fail;
	if ( tamper ) tamper( a, b );
	fail.push( ...compareDirs( a, b, 'determinism (run1 vs run2)' ) );
	fail.push( ...compareDirs( a, shipped, 'shipped tiles (public/buildings vs pipeline)' ) );
	fail.push( ...content( a, rawDir ), ...await loaderMatches( a ) );
	return fail;

}

if ( ! NEG ) {

	const fail = await check();
	rmSync( work, { recursive: true, force: true } );
	if ( fail.length ) { console.log( 'G2b FAIL\n- ' + fail.join( '\n- ' ) ); process.exit( 1 ); }
	console.log( 'G2b PASS — building tiles byte-identical across two offline runs, match public/buildings, sound geometry, LiDAR heights, every redacted-area building has a logged fallback, loader exact' );
	process.exit( 0 );

}

// ---- negative fixtures
const fxRaw = join( root, '.verify', 'g2b-raw' ), fxShip = join( root, '.verify', 'g2b-ship' );
const rawFixture = ( mutate ) => {

	rmSync( fxRaw, { recursive: true, force: true } ); mkdirSync( fxRaw, { recursive: true } );
	for ( const f of readdirSync( RAW ) ) symlinkSync( join( RAW, f ), join( fxRaw, f ) );
	mutate( fxRaw );
	const lines = readFileSync( join( RAW, 'MANIFEST.sha256' ), 'utf8' ).trim().split( '\n' ).map( ( l ) => { const f = l.split( /\s+/ )[ 1 ]; return `${ createHash( 'sha256' ).update( readFileSync( join( fxRaw, f ) ) ).digest( 'hex' ) }  ${ f }`; } );
	rmSync( join( fxRaw, 'MANIFEST.sha256' ) ); writeFileSync( join( fxRaw, 'MANIFEST.sha256' ), lines.join( '\n' ) + '\n' );
	return fxRaw;

};
const both = ( fn ) => ( a, b ) => { for ( const d of [ a, b ] ) for ( const f of readdirSync( d ).filter( ( n ) => n.endsWith( '.deflate' ) ) ) { const T = readTile( join( d, f ) ); fn( T ); writeTile( join( d, f ), T ); } };
const MUTATIONS = [
	[ 'second run encodes a tile differently', 'determinism', () => check( { tamper: ( a, b ) => { const p = join( b, readdirSync( b ).find( ( n ) => n.endsWith( '.deflate' ) ) ); writeFileSync( p, deflateSync( inflateSync( readFileSync( p ) ), { level: 1 } ) ); } } ) ],
	[ 'shipped tiles stale', 'shipped tiles', () => { rmSync( fxShip, { recursive: true, force: true } ); cpSync( SHIPPED, fxShip, { recursive: true } ); rmSync( join( fxShip, readdirSync( fxShip ).find( ( n ) => n.endsWith( '.deflate' ) ) ) ); return check( { shipped: fxShip } ); } ],
	[ 'cached footprints tampered', 'pipeline:', () => { const d = rawFixture( () => {} ); rmSync( join( d, 'dc-footprints.json' ) ); const b = readFileSync( join( RAW, 'dc-footprints.json' ) ); b[ 100 ] ^= 1; writeFileSync( join( d, 'dc-footprints.json' ), b ); return check( { rawDir: d } ); } ],
	[ 'LiDAR heights dropped (all flat)', 'heights:', () => check( { rawDir: rawFixture( ( d ) => { const j = JSON.parse( readFileSync( join( RAW, 'dc-buildings-3d.json' ), 'utf8' ) ); for ( const f of j.features ) f.attributes.MAX_Z = 0; rmSync( join( d, 'dc-buildings-3d.json' ) ); writeFileSync( join( d, 'dc-buildings-3d.json' ), JSON.stringify( j ) ); } ) } ) ],
	[ 'a redacted building without a logged fallback', 'fallback:', () => check( { tamper: ( a, b ) => { for ( const d of [ a, b ] ) { const p = join( d, 'index.json' ), j = JSON.parse( readFileSync( p, 'utf8' ) ); j.heights.log.fallbacks = j.heights.log.fallbacks.filter( ( f ) => f.why !== 'redacted' ).concat( j.heights.log.fallbacks.filter( ( f ) => f.why === 'redacted' ).slice( 1 ) ); writeFileSync( p, JSON.stringify( j, null, 1 ) + '\n' ); } } } ) ],
	[ 'triangles wound inward', 'winding:', () => check( { tamper: both( ( T ) => { for ( let k = 0; k < T.idx.length; k += 3 ) { const t = T.idx[ k + 1 ]; T.idx[ k + 1 ] = T.idx[ k + 2 ]; T.idx[ k + 2 ] = t; } } ) } ) ],
	[ 'every building one colour', 'colour:', () => check( { tamper: both( ( T ) => { for ( let v = 0; v < T.col.length; v += 4 ) { T.col[ v ] = 214; T.col[ v + 1 ] = 206; T.col[ v + 2 ] = 190; } } ) } ) ],
	[ 'buildings floating 5 m up', 'ground:', () => check( { tamper: both( ( T ) => { for ( let v = 0; v < T.pos.length / 3; v ++ ) T.pos[ v * 3 + 1 ] += 5; } ) } ) ],
];
let missed = 0;
for ( const [ name, label, run ] of MUTATIONS ) {

	const fail = ( await run() ).filter( ( m ) => m.startsWith( label ) );
	console.log( `${ fail.length ? 'caught  ' : 'MISSED  ' } ${ name }${ fail.length ? ' — ' + fail[ 0 ] : '' }` );
	if ( ! fail.length ) missed ++;

}

for ( const d of [ work, fxRaw, fxShip ] ) rmSync( d, { recursive: true, force: true } );
console.log( `NEGATIVE ${ MUTATIONS.length - missed }/${ MUTATIONS.length }` ); // verify.sh requires every mutation caught
process.exit( missed ? 0 : 1 );
