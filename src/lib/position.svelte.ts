/**
 * One shared, one-shot geolocation request. MapView (to center/frame the
 * map) and the results ranking (to score by distance) both read from this
 * instead of each independently prompting for permission.
 *
 * Coordinates live only in memory: never sent to the server, never put in
 * a URL. If the musician denies or the browser has no geolocation, every
 * reader just sees `coords: null` and degrades gracefully — nothing here
 * is required for the board to work.
 */
let coords = $state<{ lat: number; lng: number } | null>(null);
let status = $state<'idle' | 'pending' | 'granted' | 'denied'>('idle');

function request() {
	if (status !== 'idle' || typeof navigator === 'undefined' || !navigator.geolocation) return;
	status = 'pending';
	navigator.geolocation.getCurrentPosition(
		(p) => { coords = { lat: p.coords.latitude, lng: p.coords.longitude }; status = 'granted'; },
		() => { status = 'denied'; },
		{ maximumAge: 5 * 60_000, timeout: 8000 }
	);
}

export const position = {
	get coords() { return coords; },
	get status() { return status; },
	request
};
