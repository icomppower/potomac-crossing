// G2a Terrain + water bodies: cached 3DEP + NCEI → terrain tiles and the water mask, byte-identical across two
// offline runs and equal to public/terrain; heights plausible, no land/sea seam cliffs, the ground colour map
// sane, the runtime loader exact; and the water masks correct against independent evidence:
//   Potomac          open water at the river probes (Key Bridge, Memorial Bridge, Washington Channel), one
//                    connected river from Key Bridge to the Washington Channel, dry at the land probes
//                    (Theodore Roosevelt Island, the Monument, Arlington House)
//   Tidal Basin      at its centre; area within 10 % of the published 107 acres (43.3 ha); bed carved (D15)
//   Reflecting Pool  area within 10 % of the published 2,029 × 167 ft (31,480 m²), 590–640 m long east–west,
//                    and the raw LiDAR inside the mask is still water (flat: σ < 0.1 m)
// --negative: each mutation must trip the check it targets.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, readdirSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import 'harbor-engine/tools/lib/configured.mjs';
import { root, compareDirs, runOffline, decodeTerrain } from 'harbor-engine/gates/lib/tiles.mjs';
import { readTiff, writeTiff } from 'harbor-engine/tools/geo/tiff.mjs';
import { toUTM } from 'harbor-engine/tools/geo/utm.mjs';
import { RAW } from 'harbor-engine/tools/data/cache.mjs';

const NEG = process.argv.includes( '--negative' );
const work = join( root, '.verify', 'g2a' );
const SHIPPED = join( root, 'public/terrain' );
const map = JSON.parse( readFileSync( join( root, 'map.json' ), 'utf8' ) );
const { size, originE, originN } = map.frame, res = size / 3, texel = 3;
const cellOf = ( lat, lon ) => { const [ E, N ] = toUTM( lat, lon ); return Math.floor( ( originN + size / 2 - N ) / texel ) * res + Math.floor( ( E - originE + size / 2 ) / texel ); };

function build( rawDir, outDir ) {

	const r = runOffline( 'tools/terrain/build.mjs', [ '--raw', rawDir, '--out', outDir ] );
	return r.status === 0 ? [] : [ `pipeline: build failed — ${ ( r.stderr || '' ).trim().split( '\n' ).find( ( l ) => /^\w*Error:/.test( l.trim() ) ) || r.status }` ];

}

function heights( h ) {

	const fail = [], at = ( lat, lon ) => h[ cellOf( lat, lon ) ];
	const want = ( name, v, lo, hi ) => { if ( ! ( v >= lo && v <= hi ) ) fail.push( `heights: ${ name } ${ v.toFixed( 1 ) } m, expected ${ lo }…${ hi }` ); };
	want( 'Arlington House', at( 38.8822, - 77.0727 ), 50, 70 );
	want( 'Capitol plaza', at( 38.8899, - 77.0080 ), 20, 32 );
	want( 'Washington Monument grounds', at( 38.8893, - 77.0350 ), 8, 16 );
	want( 'Potomac at Memorial Bridge', at( 38.8870, - 77.0560 ), - 15, - 5 );
	want( 'Potomac at Key Bridge', at( 38.9020, - 77.0700 ), - 12, - 3 );
	want( 'Washington Channel', at( 38.8760, - 77.0240 ), - 12, - 3 );
	want( 'Tidal Basin centre (authored bed)', at( 38.8842, - 77.0390 ), - 3.2, - 2.5 );
	let wet = 0; for ( const v of h ) if ( v < 0 ) wet ++;
	want( 'water fraction %', 100 * wet / h.length, 10, 35 );
	return fail;

}

function seams( h, rawDir ) {

	const land = readTiff( readFileSync( join( rawDir, 'terrain-3dep.tif' ) ) ), sea = readTiff( readFileSync( join( rawDir, 'bathy-ncei.tif' ) ) );
	const src = ( t, i, j ) => t.data[ Math.min( t.height - 1, j ) * t.width + Math.min( t.width - 1, i ) ];
	let n = 0;
	for ( let j = 0; j < res - 1; j ++ ) for ( let i = 0; i < res - 1; i ++ ) for ( const [ di, dj ] of [ [ 1, 0 ], [ 0, 1 ] ] ) {

		const step = Math.abs( h[ j * res + i ] - h[ ( j + dj ) * res + i + di ] );
		if ( step <= 15 ) continue;
		if ( step > Math.max( Math.abs( src( land, i, j ) - src( land, i + di, j + dj ) ), Math.abs( src( sea, i, j ) - src( sea, i + di, j + dj ) ) ) + 5 ) n ++;

	}

	return n ? [ `seam: ${ n } cliff steps (> 15 m) introduced by the land/sea merge` ] : [];

}

function aerial( dir, h ) {

	const idx = JSON.parse( readFileSync( join( dir, 'index.json' ), 'utf8' ) ), A = idx.aerial;
	if ( ! A || ! existsSync( join( dir, A.file ) ) ) return [ 'aerial: no ground colour map in the terrain tiles' ];
	const rgb = inflateSync( readFileSync( join( dir, A.file ) ) );
	if ( rgb.length !== A.width * A.height * 3 || A.width * A.cell !== size ) return [ `aerial: ${ A.width }×${ A.height } at ${ A.cell } m does not cover the ${ size } m square` ];
	let land = 0, landLit = 0, deep = 0, deepLit = 0; const lumas = [];
	for ( let y = 0; y < A.height; y += 3 ) for ( let x = 0; x < A.width; x += 3 ) {

		const hh = h[ Math.min( res - 1, Math.floor( ( y + 0.5 ) * A.cell / texel ) ) * res + Math.min( res - 1, Math.floor( ( x + 0.5 ) * A.cell / texel ) ) ];
		const k = ( y * A.width + x ) * 3, sum = rgb[ k ] + rgb[ k + 1 ] + rgb[ k + 2 ];
		if ( hh > 2 ) { land ++; if ( sum > 0 ) { landLit ++; lumas.push( 0.3 * rgb[ k ] + 0.59 * rgb[ k + 1 ] + 0.11 * rgb[ k + 2 ] ); } }
		if ( hh < - 3 ) { deep ++; if ( sum > 0 ) deepLit ++; }

	}

	lumas.sort( ( a, b ) => a - b );
	const med = lumas[ lumas.length >> 1 ] || 0, fail = [];
	if ( ! ( landLit >= 0.98 * land ) ) fail.push( `aerial: only ${ ( 100 * landLit / land ).toFixed( 1 ) } % of land has colour` );
	if ( deepLit > 0.001 * deep ) fail.push( `aerial: ${ deepLit } deep-water pixels carry colour (should be zero)` );
	if ( ! ( med >= 95 && med <= 115 ) ) fail.push( `aerial: median land brightness ${ med.toFixed( 0 ) }, expected 95–115` );
	console.log( `aerial: ${ A.width }×${ A.height } at ${ A.cell } m, land coloured ${ ( 100 * landLit / land ).toFixed( 1 ) } %, median land luma ${ med.toFixed( 0 ) }` );
	return fail;

}

function masks( dir, rawDir ) {

	const idx = JSON.parse( readFileSync( join( dir, 'index.json' ), 'utf8' ) ), W = idx.water, fail = [];
	if ( ! W || ! existsSync( join( dir, W.file ) ) ) return [ 'mask: no water mask in the terrain tiles' ];
	const m = inflateSync( readFileSync( join( dir, W.file ) ) );
	if ( m.length !== res * res ) return [ `mask: ${ m.length } cells, expected ${ res * res }` ];
	const body = ( id ) => W.bodies.find( ( b ) => b.id === id );
	const code = ( lat, lon ) => m[ cellOf( lat, lon ) ];
	// Potomac: open water at the river probes, dry land at the land probes, one connected river
	const RIVER = [ [ 'Key Bridge', 38.9020, - 77.0700 ], [ 'Memorial Bridge', 38.8870, - 77.0560 ], [ 'off the Kennedy Center', 38.8960, - 77.0590 ], [ 'Washington Channel', 38.8760, - 77.0240 ] ];
	for ( const [ n, la, lo ] of RIVER ) if ( code( la, lo ) !== 1 ) fail.push( `mask: Potomac — ${ n } is not open water (code ${ code( la, lo ) })` );
	for ( const [ n, la, lo ] of [ [ 'Theodore Roosevelt Island', 38.8963, - 77.0645 ], [ 'the Washington Monument', 38.8895, - 77.0353 ], [ 'Arlington House', 38.8822, - 77.0727 ], [ 'the Lincoln Memorial', 38.8893, - 77.0502 ] ] )
		if ( code( la, lo ) !== 0 ) fail.push( `mask: ${ n } is marked as water (code ${ code( la, lo ) })` );
	const seen = new Uint8Array( m.length ), start = cellOf( RIVER[ 0 ][ 1 ], RIVER[ 0 ][ 2 ] ), q = [ start ];
	seen[ start ] = 1;
	while ( q.length ) { const k = q.pop(); for ( const n of [ k - 1, k + 1, k - res, k + res ] ) if ( n >= 0 && n < m.length && ! seen[ n ] && m[ n ] === 1 ) { seen[ n ] = 1; q.push( n ); } }
	for ( const [ n, la, lo ] of RIVER.slice( 1 ) ) if ( ! seen[ cellOf( la, lo ) ] ) fail.push( `mask: Potomac — ${ n } is not connected to Key Bridge by open water` );
	// Tidal Basin
	const tb = body( 'tidal-basin' );
	if ( ! tb ) fail.push( 'mask: no Tidal Basin body' );
	else {

		if ( code( 38.8842, - 77.0390 ) !== tb.code ) fail.push( 'mask: Tidal Basin — its centre is not in the body' );
		if ( Math.abs( tb.area - 433000 ) > 43300 ) fail.push( `mask: Tidal Basin area ${ ( tb.area / 1e4 ).toFixed( 1 ) } ha, expected 43.3 ha ± 10 %` );
		if ( tb.level !== 0 || tb.preset !== 'still-pool' ) fail.push( `mask: Tidal Basin should be a still pool at MSL (level ${ tb.level }, ${ tb.preset })` );

	}

	// Reflecting Pool: size, shape, and still water in the raw LiDAR
	const rp = body( 'reflecting-pool' );
	if ( ! rp ) fail.push( 'mask: no Reflecting Pool body' );
	else {

		if ( Math.abs( rp.area - 31480 ) > 3148 ) fail.push( `mask: Reflecting Pool area ${ rp.area } m², expected 31,480 m² ± 10 %` );
		const land = readTiff( readFileSync( join( rawDir, 'terrain-3dep.tif' ) ) );
		let i0 = Infinity, i1 = - Infinity, s = 0, s2 = 0, n = 0;
		for ( let k = 0; k < m.length; k ++ ) if ( m[ k ] === rp.code ) { const i = k % res; i0 = Math.min( i0, i ); i1 = Math.max( i1, i ); const v = land.data[ k ]; s += v; s2 += v * v; n ++; }
		const len = ( i1 - i0 + 1 ) * texel, sd = Math.sqrt( Math.max( 0, s2 / n - ( s / n ) ** 2 ) );
		if ( ! ( len >= 590 && len <= 640 ) ) fail.push( `mask: Reflecting Pool is ${ len } m long east–west, expected 590–640 (2,029 ft)` );
		if ( ! ( sd < 0.1 ) ) fail.push( `mask: Reflecting Pool — the LiDAR inside it is not still water (σ ${ sd.toFixed( 2 ) } m, expected < 0.1)` );
		if ( ! ( rp.level > 1 && rp.level < 3 ) ) fail.push( `mask: Reflecting Pool level ${ rp.level } m, expected 1–3 m above MSL` );
		console.log( `mask: Reflecting Pool ${ rp.area } m², ${ len } m long, LiDAR σ ${ sd.toFixed( 3 ) } m, level ${ rp.level } m; Tidal Basin ${ tb && ( tb.area / 1e4 ).toFixed( 1 ) } ha` );

	}

	return fail;

}

async function loaderMatches( dir, h ) {

	const netFetch = globalThis.fetch;
	globalThis.fetch = async ( u ) => new Response( readFileSync( join( dir, String( u ).replace( /^\/?terrain\//, '' ) ) ) );
	try {

		const { loadHeightField } = await import( 'harbor-engine/src/world/TerrainTiles.js' );
		const hf = await loadHeightField( '/' );
		let bad = 0;
		for ( let k = 0; k < h.length; k += 997 ) if ( hf.heights[ k ] !== h[ k ] ) bad ++;
		return bad ? [ `loader: ${ bad } sampled heights differ between TerrainTiles.js and the tiles` ] : [];

	} catch ( e ) {

		return [ `loader: TerrainTiles.js failed on these tiles — ${ String( e.message || e ).split( '\n' )[ 0 ] }` ];

	} finally { globalThis.fetch = netFetch; }

}

async function check( { rawDir = RAW, shipped = SHIPPED, tamperRun2 = null } = {} ) {

	rmSync( work, { recursive: true, force: true } );
	const a = join( work, 'run1' ), b = join( work, 'run2' );
	const fail = [ ...build( rawDir, a ), ...build( rawDir, b ) ];
	if ( fail.length ) return fail;
	if ( tamperRun2 ) tamperRun2( b );
	fail.push( ...compareDirs( a, b, 'determinism (run1 vs run2)' ), ...compareDirs( a, shipped, 'shipped tiles (public/terrain vs pipeline)' ) );
	const { h } = decodeTerrain( a );
	fail.push( ...heights( h ), ...seams( h, rawDir ), ...aerial( a, h ), ...masks( a, rawDir ), ...await loaderMatches( a, h ) );
	return fail;

}

if ( ! NEG ) {

	const fail = await check();
	rmSync( work, { recursive: true, force: true } );
	if ( fail.length ) { console.log( 'G2a FAIL\n- ' + fail.join( '\n- ' ) ); process.exit( 1 ); }
	console.log( `G2a PASS — ${ ( res / 200 ) ** 2 } tiles + water mask, byte-identical across two offline runs, match public/terrain; heights, seams, colour map, loader and the Potomac / Tidal Basin / Reflecting Pool masks correct` );
	process.exit( 0 );

}

// ---- negative fixtures
const fxRaw = join( root, '.verify', 'g2a-raw' ), fxShip = join( root, '.verify', 'g2a-ship' );
const reManifest = ( d ) => {

	const lines = readFileSync( join( RAW, 'MANIFEST.sha256' ), 'utf8' ).trim().split( '\n' ).map( ( l ) => { const f = l.split( /\s+/ )[ 1 ]; return `${ createHash( 'sha256' ).update( readFileSync( join( d, f ) ) ).digest( 'hex' ) }  ${ f }`; } );
	rmSync( join( d, 'MANIFEST.sha256' ) ); writeFileSync( join( d, 'MANIFEST.sha256' ), lines.join( '\n' ) + '\n' );

};
const rawFixture = ( mutate ) => {

	rmSync( fxRaw, { recursive: true, force: true } ); mkdirSync( fxRaw, { recursive: true } );
	for ( const f of readdirSync( RAW ) ) symlinkSync( join( RAW, f ), join( fxRaw, f ) );
	mutate( fxRaw );
	return fxRaw;

};
// move / scale an OSM water polygon in a copy of the cache
const editWay = ( id, fn ) => rawFixture( ( d ) => {

	const j = JSON.parse( readFileSync( join( RAW, 'osm-features.json' ), 'utf8' ) );
	const w = j.elements.find( ( e ) => e.id === id );
	const c = [ w.geometry.reduce( ( s, g ) => s + g.lat, 0 ) / w.geometry.length, w.geometry.reduce( ( s, g ) => s + g.lon, 0 ) / w.geometry.length ];
	w.geometry = w.geometry.map( ( g ) => fn( g, c ) );
	rmSync( join( d, 'osm-features.json' ) ); writeFileSync( join( d, 'osm-features.json' ), JSON.stringify( j ) ); reManifest( d );

} );
const MUTATIONS = [
	[ 'second run encodes a tile differently', 'determinism', () => check( { tamperRun2: ( b ) => { const p = join( b, 't_3_3.bin' ); writeFileSync( p, deflateSync( inflateSync( readFileSync( p ) ), { level: 1 } ) ); } } ) ],
	[ 'shipped tiles stale', 'shipped tiles', () => { rmSync( fxShip, { recursive: true, force: true } ); cpSync( SHIPPED, fxShip, { recursive: true } ); const p = join( fxShip, 't_5_5.bin' ); const t = inflateSync( readFileSync( p ) ); t[ 100 ] ^= 4; writeFileSync( p, deflateSync( t, { level: 9, memLevel: 9 } ) ); return check( { shipped: fxShip } ); } ],
	[ 'land-only DEM used as the Potomac depth', 'heights: Potomac', () => check( { rawDir: rawFixture( ( d ) => { rmSync( join( d, 'bathy-ncei.tif' ) ); cpSync( join( RAW, 'terrain-3dep.tif' ), join( d, 'bathy-ncei.tif' ) ); reManifest( d ); } ) } ) ],
	[ 'a dam of land across the Potomac at Memorial Bridge', 'mask: Potomac', () => check( { rawDir: rawFixture( ( d ) => {

		for ( const f of [ 'bathy-ncei.tif', 'terrain-3dep.tif' ] ) {

			const t = readTiff( readFileSync( join( RAW, f ) ) ), data = Float32Array.from( t.data ), j = Math.floor( cellOf( 38.8850, - 77.0560 ) / res );
			for ( let i = 0; i < res; i ++ ) for ( const jj of [ j, j + 1 ] ) data[ jj * res + i ] = Math.max( data[ jj * res + i ], 3 );
			rmSync( join( d, f ) );
			writeFileSync( join( d, f ), writeTiff( { width: t.width, height: t.height, data, tie: t.tags[ 33922 ], scale: t.tags[ 33550 ] } ) );

		}

		reManifest( d );

	} ) } ) ],
	[ 'Reflecting Pool polygon 60 m north (onto the lawn)', 'mask: Reflecting Pool', () => check( { rawDir: editWay( 990979896, ( g ) => ( { ...g, lat: g.lat + 0.00054 } ) ) } ) ],
	[ 'Tidal Basin polygon shrunk to half its size', 'mask: Tidal Basin', () => check( { rawDir: editWay( 26755238, ( g, c ) => ( { ...g, lat: c[ 0 ] + ( g.lat - c[ 0 ] ) * 0.7, lon: c[ 1 ] + ( g.lon - c[ 1 ] ) * 0.7 } ) ) } ) ],
	[ 'land DEM 20 m too high (seam cliffs)', 'seam:', () => check( { rawDir: rawFixture( ( d ) => {

		const t = readTiff( readFileSync( join( RAW, 'terrain-3dep.tif' ) ) );
		rmSync( join( d, 'terrain-3dep.tif' ) );
		writeFileSync( join( d, 'terrain-3dep.tif' ), writeTiff( { width: t.width, height: t.height, data: Float32Array.from( t.data, ( v ) => v + 20 ), tie: t.tags[ 33922 ], scale: t.tags[ 33550 ] } ) );
		reManifest( d );

	} ) } ) ],
];
let missed = 0;
for ( const [ name, label, run ] of MUTATIONS ) {

	const fail = ( await run() ).filter( ( m ) => m.startsWith( label ) );
	console.log( `${ fail.length ? 'caught  ' : 'MISSED  ' } ${ name }${ fail.length ? ' — ' + fail[ 0 ] : '' }` );
	if ( ! fail.length ) missed ++;

}

for ( const d of [ work, fxRaw, fxShip ] ) rmSync( d, { recursive: true, force: true } );
console.log( `NEGATIVE ${ MUTATIONS.length - missed }/${ MUTATIONS.length }` );
process.exit( missed ? 0 : 1 );
