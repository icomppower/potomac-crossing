// G3 control points: where the shipped scene puts a feature vs. where an independent source puts it.
// Scene side reads shipped artifacts (public/landmarks, public/ferry); references: NOAA ENC (charted landmarks,
// the Key Bridge outline), the Open Data DC LiDAR buildings (the memorials' roofs) and DC's 2023 planimetric
// docks and piers (the Wharf; harbour-scale charts predate its 2017 piers).
import 'harbor-engine/tools/lib/configured.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from 'harbor-engine/gates/lib/tiles.mjs';
import { parseGLB } from 'harbor-engine/src/engine/loaders/GLTF.js';
import { toUTM } from 'harbor-engine/tools/geo/utm.mjs';
import { joinDC } from '../../pipelines/dc/buildings.mjs';

const MAP = JSON.parse( readFileSync( join( root, 'map.json' ), 'utf8' ) );
const local = ( lat, lon ) => { const [ E, N ] = toUTM( lat, lon ); return [ E - MAP.frame.originE, MAP.frame.originN - N ]; };
const mean = ( pts ) => [ pts.reduce( ( s, p ) => s + p[ 0 ], 0 ) / pts.length, pts.reduce( ( s, p ) => s + p[ 1 ], 0 ) / pts.length ];

function verts( dir, slug ) {

	const buf = readFileSync( join( dir, `${ slug }_lod0.glb` ) );
	const g = parseGLB( buf.buffer.slice( buf.byteOffset, buf.byteOffset + buf.length ) ), out = [];
	for ( const n of g.nodes ) if ( n.mesh !== undefined ) for ( const p of g.meshes[ n.mesh ] ) { const P = p.attributes.POSITION.array; for ( let v = 0; v < P.length; v += 3 ) out.push( [ P[ v ] + n.t[ 0 ], P[ v + 1 ] + n.t[ 1 ], P[ v + 2 ] + n.t[ 2 ] ] ); }
	return out;

}

export function sceneControls( { landmarks = join( root, 'public/landmarks' ), ferry = join( root, 'public/ferry/schedule.json' ) } = {} ) {

	const idx = JSON.parse( readFileSync( join( landmarks, 'index.json' ), 'utf8' ) ), L = ( s ) => idx.landmarks.find( ( l ) => l.slug === s );
	const xz = ( vs ) => vs.length ? mean( vs.map( ( v ) => [ v[ 0 ], v[ 2 ] ] ) ) : [ NaN, NaN ];
	const above = ( slug, h ) => xz( verts( landmarks, slug ).filter( ( v ) => v[ 1 ] > L( slug ).ground + h ) );
	// Key Bridge: the deck-top line (vertices within 1 m of the highest)
	const kb = verts( landmarks, 'key-bridge' ), top = Math.max( ...kb.map( ( v ) => v[ 1 ] ) );
	const deck = kb.filter( ( v ) => v[ 1 ] > top - 1 ).map( ( v ) => [ v[ 0 ], v[ 2 ] ] );
	const c = mean( deck );
	let sxx = 0, szz = 0, sxz = 0; for ( const [ x, z ] of deck ) { sxx += ( x - c[ 0 ] ) ** 2; szz += ( z - c[ 1 ] ) ** 2; sxz += ( x - c[ 0 ] ) * ( z - c[ 1 ] ); }
	const a = 0.5 * Math.atan2( 2 * sxz, sxx - szz );
	const f = JSON.parse( readFileSync( ferry, 'utf8' ) );
	return {
		'Washington Monument': above( 'washington-monument', 150 ),
		'Capitol dome': above( 'capitol', 75 ),
		'Lincoln Memorial': above( 'lincoln-memorial', 22 ),
		'Jefferson Memorial': above( 'jefferson-memorial', 30 ),
		keyBridgeAxis: { c, d: [ Math.cos( a ), Math.sin( a ) ] },
		wharfBerth: [ f.terminals.wharf[ 0 ].x, f.terminals.wharf[ 0 ].z ],
	};

}

export function referenceControls( raw = join( root, 'data/raw' ) ) {

	const J = ( f ) => JSON.parse( readFileSync( join( raw, f ), 'utf8' ) );
	const enc = J( 'noaa-enc-landmarks.json' ).features;
	const pt = ( pred ) => { const f = enc.find( ( e ) => pred( e.attributes ) ); return f ? local( f.geometry.y, f.geometry.x ) : null; };
	// the memorials' roofs in the DC LiDAR (roof-area centroid of the 3D building at each memorial)
	const dc = joinDC( J( 'dc-footprints.json' ), J( 'dc-buildings-3d.json' ) );
	const lidar = ( lat, lon ) => { const l = dc.lidar.filter( ( q ) => Math.hypot( ( q.lat - lat ) * 111000, ( q.lon - lon ) * 86500 ) < 40 ).sort( ( p, q ) => q.roofArea - p.roofArea )[ 0 ]; return l ? local( l.lat, l.lon ) : null; };
	const kb = J( 'noaa-enc-bridges.json' ).features.find( ( f ) => f.attributes.OBJNAM === 'Key Bridge' );
	const piers = J( 'dc-hydro-lines.json' ).features.filter( ( f ) => f.attributes.DESCRIPTION === 'Dock or Pier' ).flatMap( ( f ) => f.geometry.paths.map( ( p ) => p.map( ( [ lon, lat ] ) => local( lat, lon ) ) ) );
	return {
		'Washington Monument': [ 'NOAA ENC landmark "Washington Monument"', pt( ( a ) => a.OBJNAM === 'Washington Monument' ) ],
		'Capitol dome': [ 'NOAA ENC landmark "dome"', pt( ( a ) => a.CATLMK === 'dome' ) ],
		'Lincoln Memorial': [ 'DC LiDAR building roof', lidar( 38.88931, - 77.05017 ) ],
		'Jefferson Memorial': [ 'DC LiDAR building roof', lidar( 38.88140, - 77.03650 ) ],
		keyBridge: kb ? mean( kb.geometry.rings[ 0 ].slice( 0, - 1 ).map( ( [ lon, lat ] ) => local( lat, lon ) ) ) : null,
		piers,
	};

}

const segDist = ( [ ax, az ], [ bx, bz ], [ x, z ] ) => { const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1e-9, t = Math.max( 0, Math.min( 1, ( ( x - ax ) * dx + ( z - az ) * dz ) / L ) ); return Math.hypot( ax + t * dx - x, az + t * dz - z ); };

// every control point's error (m); all six are gated
export function controlErrors( opts = {} ) {

	const S = sceneControls( opts ), R = referenceControls( opts.raw );
	const rows = [];
	for ( const name of [ 'Washington Monument', 'Capitol dome', 'Lincoln Memorial', 'Jefferson Memorial' ] ) {

		const [ ref, p ] = R[ name ], s = S[ name ];
		rows.push( { name, ref, error: p && Number.isFinite( s[ 0 ] ) ? Math.hypot( s[ 0 ] - p[ 0 ], s[ 1 ] - p[ 1 ] ) : Infinity } );

	}

	// Key Bridge: the charted outline's centre against the model's deck line (cross-axis offset; no open source
	// publishes the pier positions, D17)
	const A = S.keyBridgeAxis, k = R.keyBridge;
	rows.push( { name: 'Key Bridge (deck line)', ref: 'NOAA ENC "Key Bridge" outline centre, cross-axis', error: k ? Math.abs( ( k[ 0 ] - A.c[ 0 ] ) * - A.d[ 1 ] + ( k[ 1 ] - A.c[ 1 ] ) * A.d[ 0 ] ) : Infinity } );
	// the Wharf berth: the water-taxi landing must lie on a charted pier
	let d = Infinity;
	for ( const line of R.piers ) for ( let i = 0; i + 1 < line.length; i ++ ) d = Math.min( d, segDist( line[ i ], line[ i + 1 ], S.wharfBerth ) );
	rows.push( { name: 'Wharf pier (water-taxi berth)', ref: 'Open Data DC Planimetrics 2023 "Dock or Pier"', error: d } );
	return rows;

}
