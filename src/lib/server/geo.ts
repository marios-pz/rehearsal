/**
 * The map files are pre-projected to a fixed SVG frame per country, and
 * carry the lon/lat window they came from. That lets the browser turn a
 * click into coordinates, and lets the server turn coordinates back into
 * a point on the same frame, without either side re-deriving a projection.
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

/**
 * The public position. Bands should be findable without publishing the
 * street address of a room full of gear, so the pin the world sees is the
 * real one pushed up to `metres` in a random direction. Uniform inside the
 * disc, not the naive lat+rand which clusters at the centre.
 */
export function jitter(lat: number, lng: number, metres = 700) {
	const ang = Math.random() * 2 * Math.PI;
	const rad = Math.sqrt(Math.random()) * metres;
	return {
		lat: +(lat + (rad * Math.cos(ang)) / 111_320).toFixed(6),
		lng: +(lng + (rad * Math.sin(ang)) / (111_320 * Math.cos((lat * Math.PI) / 180))).toFixed(6)
	};
}
