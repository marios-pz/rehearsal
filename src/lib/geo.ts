/**
 * The shape of a country's geo/*.json file. `regions` still supplies the
 * region name list (the Region combobox) and `bx` is a plain real-world
 * lon/lat bounding box used to frame the map on the whole country — both
 * client-safe, no server/ in the path.
 *
 * `regions[].d`/`.b` (pre-projected SVG paths, for drawing region outlines
 * on a build-time map) and the project()/unproject() pixel<->latlng math
 * that went with them are gone: MapView draws real Leaflet + OpenStreetMap
 * tiles now, which already carry that geographic context, so a second,
 * hand-drawn region outline on top of them was redundant custom logic.
 */
export type GeoFile = {
	w: number; h: number;
	bx: [number, number, number, number];   // LO0, LO1, LA0, LA1
	regions: { k: string; d: string; b: [number, number, number, number] }[];
	pins: { n: string; r: string; x: number; y: number }[];
};
