/**
 * The map files are pre-projected to a fixed SVG frame per country, and
 * carry the lon/lat window they came from. That lets the browser turn a
 * click into coordinates, and lets the server turn coordinates back into
 * a point on the same frame, without either side re-deriving a projection.
 *
 * Client-safe (no `server/` in the path) because MapView needs `unproject`
 * to turn a region's pre-projected polygon back into lat/lng for Leaflet.
 * `jitter` stays server-only in `server/geo.ts`; nothing about it is
 * sensitive, there's just no reason for the client to call it.
 */
export type GeoFile = {
	w: number; h: number;
	bx: [number, number, number, number];   // LO0, LO1, LA0, LA1
	regions: { k: string; d: string; b: [number, number, number, number] }[];
	pins: { n: string; r: string; x: number; y: number }[];
};

const merc = (lat: number) => (Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * 180) / Math.PI;
const invMerc = (m: number) => (Math.atan(Math.exp((m * Math.PI) / 180)) * 360) / Math.PI - 90;

export function project(geo: GeoFile, lat: number, lng: number) {
	const [LO0, LO1, , LA1] = geo.bx;
	const s = geo.w / (LO1 - LO0);
	return { x: +((lng - LO0) * s).toFixed(1), y: +((merc(LA1) - merc(lat)) * s).toFixed(1) };
}

export function unproject(geo: GeoFile, x: number, y: number) {
	const [LO0, LO1, , LA1] = geo.bx;
	const s = geo.w / (LO1 - LO0);
	return { lat: +invMerc(merc(LA1) - y / s).toFixed(5), lng: +(LO0 + x / s).toFixed(5) };
}

/** Parses the "M x y L x y ... Z M x y ... Z" path this repo's geo/*.json
 *  regions store, back into lat/lng rings for a Leaflet polygon. */
export function pathToLatLngRings(geo: GeoFile, d: string): [number, number][][] {
	return d
		.split('Z')
		.map((seg) => seg.trim())
		.filter(Boolean)
		.map((seg) =>
			seg
				.replace(/^M/, '')
				.split('L')
				.map((pair) => {
					const [x, y] = pair.trim().split(/\s+/).map(Number);
					const { lat, lng } = unproject(geo, x, y);
					return [lat, lng] as [number, number];
				})
		);
}
