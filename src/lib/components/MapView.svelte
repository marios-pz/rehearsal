<script lang="ts">
	import 'leaflet/dist/leaflet.css';
	import { onMount } from 'svelte';
	import { pathToLatLngRings, type GeoFile } from '$lib/geo';
	import type * as Leaflet from 'leaflet';

	type Pin = { id: string; lat: number; lng: number; label: string; paid?: boolean };
	let {
		geo, region = null, pins = [], selected = $bindable(null), hot = null, pickable = false,
		onpick
	}: {
		geo: GeoFile; region?: string | null; pins?: Pin[];
		selected?: string | null; hot?: string | null;
		pickable?: boolean; onpick?: (p: { lat: number; lng: number }) => void;
	} = $props();

	// Leaflet's Map instance is a stateful class the library mutates
	// internally; wrapping it in $state would fight Svelte's proxy, so it
	// stays a plain variable and `ready` is the reactive signal that it
	// exists. Same reasoning for the layer handles below.
	let el: HTMLDivElement;
	let ready = $state(false);
	let L: typeof Leaflet;
	let map: Leaflet.Map;
	let regionLayer: Leaflet.Polygon | null = null;
	let pinLayer: Leaflet.LayerGroup;
	let dropLayer: Leaflet.LayerGroup;

	const countryBounds = (): Leaflet.LatLngBoundsExpression => {
		const [LO0, LO1, LA0, LA1] = geo.bx;
		return [[LA0, LO0], [LA1, LO1]];
	};

	onMount(() => {
		let disposed = false;
		(async () => {
			const mod = await import('leaflet');
			if (disposed) return;
			L = mod.default ?? (mod as any);

			map = L.map(el, { zoomControl: false, attributionControl: true }).fitBounds(countryBounds());
			L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
				attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
				className: 'lf-dark-tiles',
				maxZoom: 19
			}).addTo(map);

			pinLayer = L.layerGroup().addTo(map);
			dropLayer = L.layerGroup().addTo(map);

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
	});

	// Highlights the chosen region's outline (converted from its
	// pre-projected path back to lat/lng) and frames the map on it; with
	// none chosen, frames the whole country instead.
	$effect(() => {
		if (!ready) return;
		if (regionLayer) { regionLayer.remove(); regionLayer = null; }
		const r = geo.regions.find((x) => x.k === region);
		if (r) {
			regionLayer = L.polygon(pathToLatLngRings(geo, r.d), {
				color: '#e4ff32', weight: 1.6, opacity: 0.9, fillColor: '#1e1e26', fillOpacity: 0.45
			}).addTo(map);
			map.fitBounds(regionLayer.getBounds(), { padding: [40, 40] });
		} else {
			map.fitBounds(countryBounds());
		}
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
		if (!map) return;
		const r = geo.regions.find((x) => x.k === region);
		map.fitBounds(r ? L.polygon(pathToLatLngRings(geo, r.d)).getBounds() : countryBounds());
	}
</script>

<div class="wrap">
	<div bind:this={el} class="map" class:pick={pickable}
		role="group" aria-label={pickable ? 'Click to place your rehearsal room' : 'Map of ads'}></div>

	<div class="zoom">
		<button type="button" onclick={() => zoom(1)} aria-label="Zoom in">+</button>
		<button type="button" onclick={() => zoom(-1)} aria-label="Zoom out">&minus;</button>
		<button type="button" class="rs" aria-label="Whole region" onclick={resetView}>ALL</button>
	</div>
	{#if pickable}
		<div class="coords">click the map to place it</div>
	{/if}
</div>

<style>
	.wrap { position: relative; border: 1px solid var(--line); background: var(--sea); overflow: hidden; }
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

	:global(.lf-pin-wrap), :global(.lf-drop-wrap) { pointer-events: none; }
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
</style>
