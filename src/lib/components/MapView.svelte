<script lang="ts">
	import 'leaflet/dist/leaflet.css';
	import { onMount, untrack } from 'svelte';
	import { position } from '$lib/position.svelte';
	import type * as Leaflet from 'leaflet';

	type Pin = { id: string; lat: number; lng: number; label: string; paid?: boolean };
	type Bounds = { south: number; west: number; north: number; east: number };
	let {
		pins = [], selected = $bindable(null), hot = null, pickable = false, onpick,
		minZoom = 0, onzoomgate, onbounds, meCoords = null, locateTick = 0
	}: {
		pins?: Pin[];
		selected?: string | null; hot?: string | null;
		pickable?: boolean; onpick?: (p: { lat: number; lng: number }) => void;
		// Below this zoom level, pins hide and onzoomgate(true) fires — the
		// caller (the results list) mirrors that state so "no results" means
		// the same thing on the map and in the list, not just one of them.
		// 0 disables the gate entirely (the /post pin-drop map never sets it).
		minZoom?: number; onzoomgate?: (gated: boolean) => void;
		// Fires with the current viewport on every pan/zoom (and once after
		// any programmatic frame()), so the caller can filter its list to
		// "what's visible right now" the way Airbnb's results follow the
		// map — this component only reports the viewport, it never filters
		// `pins` itself (Leaflet already only draws what's on-screen).
		onbounds?: (b: Bounds) => void;
		// The "Find Me" button's target: incrementing locateTick (a click)
		// drops a marker at meCoords and flies there. meCoords alone never
		// triggers this — geolocation already resolves silently on mount to
		// feed the ranking distance term, and that must never itself yank
		// the map away from what the musician is actually looking at.
		meCoords?: { lat: number; lng: number } | null; locateTick?: number;
	} = $props();

	// Leaflet's Map instance is a stateful class the library mutates
	// internally; wrapping it in $state would fight Svelte's proxy, so it
	// stays a plain variable and `ready` is the reactive signal that it
	// exists. Same reasoning for the layer handles below.
	let el: HTMLDivElement;
	let ready = $state(false);
	let zoomGated = $state(false);
	let L: typeof Leaflet;
	let map: Leaflet.Map;
	let pinLayer: Leaflet.LayerGroup;
	let dropLayer: Leaflet.LayerGroup;
	let meLayer: Leaflet.LayerGroup;

	const WORLD_CENTER: [number, number] = [20, 10];
	const WORLD_ZOOM = 2;
	const LOCAL_ZOOM = 11;

	// Frames on the pins themselves when there are any (real tiles already
	// carry enough geographic context that a drawn region outline on top
	// of them would be redundant); otherwise centers on the searching
	// musician's own position if they've granted it, or a generic world
	// view if not — no per-country data involved either way.
	function frame() {
		if (pins.length) {
			map.fitBounds(pins.map((p) => [p.lat, p.lng] as [number, number]), { padding: [40, 40], maxZoom: 12 });
		} else {
			const p = position.coords;
			map.setView(p ? [p.lat, p.lng] : WORLD_CENTER, p ? LOCAL_ZOOM : WORLD_ZOOM);
		}
	}

	// A genuinely empty country still shows its normal empty state rather
	// than a misleading "zoom in" prompt, hence the `pins.length` guard.
	// Reads and writes `zoomGated`, so calling this from inside the pin
	// $effect below (a tracked context) would register `zoomGated` as one
	// of that effect's own dependencies — the effect then re-runs whenever
	// the gate flips, re-fitting bounds via frame() and undoing the very
	// zoom-out that triggered the gate. untrack() at the call site (not
	// here — the read/write themselves are the point) keeps that reaction
	// out of the effect's dependency list; the native 'zoomend' listener
	// calls this outside any tracked context, so it needs no such wrapping.
	function applyGate() {
		const should = minZoom > 0 && pins.length > 0 && map.getZoom() < minZoom;
		if (should === zoomGated) return;
		zoomGated = should;
		onzoomgate?.(should);
		if (should) pinLayer.removeFrom(map); else pinLayer.addTo(map);
	}

	function reportBounds() {
		const b = map.getBounds();
		onbounds?.({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
	}

	onMount(() => {
		let disposed = false;
		position.request();
		(async () => {
			const mod = await import('leaflet');
			if (disposed) return;
			L = mod.default ?? (mod as any);

			map = L.map(el, { zoomControl: false, attributionControl: true });
			L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
				attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
				className: 'lf-dark-tiles',
				maxZoom: 19
			}).addTo(map);

			pinLayer = L.layerGroup().addTo(map);
			dropLayer = L.layerGroup().addTo(map);
			meLayer = L.layerGroup().addTo(map);
			frame();
			map.on('zoomend', applyGate);
			map.on('moveend', reportBounds);

			map.on('click', (e: Leaflet.LeafletMouseEvent) => {
				if (pickable) {
					renderDrop(e.latlng);
					onpick?.({ lat: e.latlng.lat, lng: e.latlng.lng });
				} else {
					// A click that landed on a pin never reaches here: its own
					// handler below stops propagation before this fires.
					selected = null;
				}
			});

			ready = true;
			applyGate();
			reportBounds();
		})();
		return () => { disposed = true; map?.remove(); };
	});

	function pinIcon(p: Pin, isOn: boolean, isHot: boolean) {
		const w = Math.max(34, p.label.length * 5.8 + 11);
		const cls = ['lf-pin', isOn && 'on', isHot && 'hot', p.paid && 'paid'].filter(Boolean).join(' ');
		return L.divIcon({
			className: 'lf-pin-wrap',
			html: `<div class="${cls}" style="width:${w}px">
				<span class="lf-pin-label">${p.label}</span>
				<span class="lf-pin-stem"></span><span class="lf-pin-dot"></span>
			</div>`,
			iconSize: [w, 24],
			iconAnchor: [w / 2, 22]
		});
	}

	// Redraws whenever the pin set or the selected/hot ids change, and
	// once more the moment the map itself becomes ready.
	$effect(() => {
		if (!ready) return;
		pinLayer.clearLayers();
		for (const p of pins) {
			const marker = L.marker([p.lat, p.lng], { icon: pinIcon(p, selected === p.id, hot === p.id) });
			marker.on('click', (e) => {
				L.DomEvent.stopPropagation(e);
				selected = selected === p.id ? null : p.id;
			});
			marker.addTo(pinLayer);
		}
		frame();
		untrack(applyGate);
		untrack(reportBounds);
	});

	// Keyed on locateTick alone (not meCoords) so this only ever fires from
	// an actual "Find Me" click, never from geolocation quietly resolving
	// in the background for the ranking distance term.
	$effect(() => {
		if (locateTick === 0 || !map) return;
		const p = untrack(() => meCoords);
		if (!p) return;
		meLayer.clearLayers();
		L.marker([p.lat, p.lng], {
			icon: L.divIcon({
				className: 'lf-me-wrap',
				html: '<div class="lf-me"><span class="halo"></span><span class="ring"></span><span class="core"></span></div>',
				iconSize: [52, 52], iconAnchor: [26, 26]
			})
		}).addTo(meLayer);
		map.setView([p.lat, p.lng], LOCAL_ZOOM);
	});

	function renderDrop(latlng: Leaflet.LatLng) {
		dropLayer.clearLayers();
		L.marker(latlng, {
			icon: L.divIcon({
				className: 'lf-drop-wrap',
				html: '<div class="lf-drop"><span class="halo"></span><span class="ring"></span><span class="core"></span></div>',
				iconSize: [52, 52], iconAnchor: [26, 26]
			})
		}).addTo(dropLayer);
	}

	function zoom(delta: number) {
		map?.setZoom(map.getZoom() + delta);
	}
	function resetView() {
		frame();
	}
</script>

<div class="wrap">
	<div bind:this={el} class="map" class:pick={pickable}
		role="group" aria-label={pickable ? 'Click to place your rehearsal room' : 'Map of ads'}></div>

	<div class="zoom">
		<button type="button" onclick={() => zoom(1)} aria-label="Zoom in">+</button>
		<button type="button" onclick={() => zoom(-1)} aria-label="Zoom out">&minus;</button>
		<button type="button" class="rs" aria-label="Fit all pins" onclick={resetView}>ALL</button>
	</div>
	{#if pickable}
		<div class="coords">click the map to place it</div>
	{:else if zoomGated}
		<div class="coords zoomgate">zoom in to see ads here</div>
	{/if}
</div>

<style>
	.wrap { position: relative; border: 1px solid var(--line); background: var(--sea); overflow: hidden;
	        clip-path: polygon(0 10px, 10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%); }
	.map { width: 100%; height: 400px; background: var(--sea); }
	.map.pick { height: 300px; cursor: crosshair; }
	@media (max-width: 820px) { .map { height: 280px; } }

	.zoom { position: absolute; right: 8px; top: 8px; display: flex; flex-direction: column; gap: 6px; z-index: 400; }
	.zoom button { font: inherit; width: 34px; height: 34px; background: #08080acc; color: var(--ink);
	               border: 1px solid var(--line); cursor: pointer; font-size: 15px; line-height: 1; padding: 0; }
	.zoom button:hover { border-color: var(--ink); }
	.zoom .rs { font-size: 9px; }
	@media (max-width: 820px) {
		.zoom { gap: 8px; }
		.zoom button { width: 38px; height: 38px; font-size: 17px; }
		.zoom .rs { font-size: 9.5px; }
	}
	.coords { position: absolute; left: 8px; bottom: 8px; font-size: 10.5px; letter-spacing: .1em;
	          color: var(--dim); background: #08080acc; padding: 4px 7px; pointer-events: none; z-index: 400; }
	.coords.zoomgate { color: var(--marker); text-transform: uppercase; }

	/* Leaflet renders these into the map's own panes, outside Svelte's
	   template, so they can't be component-scoped; :global it is. */
	:global(.leaflet-container) { background: var(--sea); font-family: var(--mono); }
	/* OSM's own tiles are keyless but render light-only; invert+rotate
	   turns them dark without needing a dark-specific tile source. */
	:global(.lf-dark-tiles) { filter: invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.9); }
	:global(.leaflet-control-attribution) {
		background: #08080a99; color: var(--dim); font-size: 9.5px;
	}
	:global(.leaflet-control-attribution a) { color: var(--dim); }

	:global(.lf-pin-wrap), :global(.lf-drop-wrap), :global(.lf-me-wrap) { pointer-events: none; }
	:global(.lf-pin) {
		position: relative; height: 15px; cursor: pointer; pointer-events: auto;
		background: #0b0b0fee; border: 1px solid var(--ink); display: flex; align-items: center; justify-content: center;
	}
	:global(.lf-pin-label) {
		font-family: var(--mono); font-size: 8.5px; font-weight: 700; color: var(--ink); letter-spacing: .04em;
	}
	:global(.lf-pin-stem) {
		position: absolute; left: 50%; top: 100%; width: 1px; height: 6px; background: var(--ink);
	}
	:global(.lf-pin-dot) {
		position: absolute; left: 50%; top: calc(100% + 5px); width: 3.8px; height: 3.8px; margin-left: -1.9px;
		border-radius: 50%; background: var(--ink); border: .8px solid #08080a;
	}
	:global(.lf-pin.hot) { background: #2a2a34; }
	:global(.lf-pin.on) { background: var(--marker); border-color: var(--marker); }
	:global(.lf-pin.on .lf-pin-label) { color: #08080a; }
	:global(.lf-pin.on .lf-pin-stem), :global(.lf-pin.on .lf-pin-dot) { background: var(--marker); }
	:global(.lf-pin.paid) { border-color: var(--stamp); }

	:global(.lf-drop) { position: relative; width: 100%; height: 100%; }
	:global(.lf-drop .ring) {
		position: absolute; left: 50%; top: 50%; width: 18px; height: 18px; margin: -9px 0 0 -9px;
		border-radius: 50%; border: 1.4px solid var(--marker);
	}
	:global(.lf-drop .core) {
		position: absolute; left: 50%; top: 50%; width: 4.8px; height: 4.8px; margin: -2.4px 0 0 -2.4px;
		border-radius: 50%; background: var(--marker);
	}
	:global(.lf-drop .halo) {
		position: absolute; left: 50%; top: 50%; width: 52px; height: 52px; margin: -26px 0 0 -26px;
		border-radius: 50%; background: var(--marker); opacity: .13;
	}

	/* "You are here", dropped by the Find Me button — red like its button,
	   distinct from the marker-yellow pin-drop crosshair used on /post. */
	:global(.lf-me) { position: relative; width: 100%; height: 100%; }
	:global(.lf-me .ring) {
		position: absolute; left: 50%; top: 50%; width: 18px; height: 18px; margin: -9px 0 0 -9px;
		border-radius: 50%; border: 1.4px solid var(--stamp);
	}
	:global(.lf-me .core) {
		position: absolute; left: 50%; top: 50%; width: 4.8px; height: 4.8px; margin: -2.4px 0 0 -2.4px;
		border-radius: 50%; background: var(--stamp);
	}
	:global(.lf-me .halo) {
		position: absolute; left: 50%; top: 50%; width: 52px; height: 52px; margin: -26px 0 0 -26px;
		border-radius: 50%; background: var(--stamp); opacity: .13;
	}
</style>
