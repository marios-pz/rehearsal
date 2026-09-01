<script lang="ts">
	import type { GeoFile } from '$lib/server/geo';

	type Pin = { id: string; x: number; y: number; label: string; paid?: boolean };
	let {
		geo, region = null, pins = [], selected = $bindable(null), hot = null, pickable = false,
		onpick
	}: {
		geo: GeoFile; region?: string | null; pins?: Pin[];
		selected?: string | null; hot?: string | null;
		pickable?: boolean; onpick?: (p: { x: number; y: number }) => void;
	} = $props();

	const PIN_REF = 900;   // viewBox width at which a pin is drawn 1:1
	let svg: SVGSVGElement;
	let vb = $state({ x: 0, y: 0, w: 1000, h: 1000 });
	let drop = $state<{ x: number; y: number } | null>(null);

	// Frame on the chosen region whenever the region or the country changes.
	$effect(() => {
		const r = geo.regions.find((x: { k: string }) => x.k === region);
		const b = r?.b;
		vb = b
			? (() => { const m = Math.max(b[2], b[3]) * 0.3;
			           return { x: b[0] - m, y: b[1] - m, w: b[2] + 2 * m, h: b[3] + 2 * m }; })()
			: { x: 0, y: 0, w: geo.w, h: geo.h };
	});

	// Counter-scale, so a pin holds one screen size at every zoom level.
	// Zooming in then sharpens the location instead of inflating the label.
	const k = $derived(vb.w / PIN_REF);

	function toFrame(e: PointerEvent | WheelEvent | MouseEvent) {
		const r = svg.getBoundingClientRect();
		const s = Math.min(r.width / vb.w, r.height / vb.h);
		return {
			x: vb.x + (e.clientX - r.left - (r.width - vb.w * s) / 2) / s,
			y: vb.y + (e.clientY - r.top - (r.height - vb.h * s) / 2) / s
		};
	}
	function wheel(e: WheelEvent) {
		e.preventDefault();
		const p = toFrame(e), f = e.deltaY > 0 ? 1.18 : 1 / 1.18;
		const w = Math.min(geo.w * 1.3, Math.max(40, vb.w * f)), h = vb.h * (w / vb.w);
		vb = { x: p.x - (p.x - vb.x) * (w / vb.w), y: p.y - (p.y - vb.y) * (h / vb.h), w, h };
	}
	let drag: { p: { x: number; y: number }; moved: number } | null = null;
	function down(e: PointerEvent) {
		drag = { p: toFrame(e), moved: 0 };
		svg.setPointerCapture(e.pointerId);
	}
	function move(e: PointerEvent) {
		if (!drag) return;
		drag.moved++;
		const p = toFrame(e);
		vb = { ...vb, x: vb.x - (p.x - drag.p.x), y: vb.y - (p.y - drag.p.y) };
	}
	function up(e: PointerEvent) {
		const wasDrag = drag && drag.moved > 3;
		drag = null;
		if (wasDrag) return;
		if (pickable) {
			const p = toFrame(e);
			drop = { x: +p.x.toFixed(1), y: +p.y.toFixed(1) };
			onpick?.(drop);
			return;
		}
		const g = (e.target as Element).closest('[data-pin]');
		if (g) selected = selected === g.getAttribute('data-pin') ? null : g.getAttribute('data-pin');
	}
	function zoom(f: number) {
		const cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2;
		const w = Math.min(geo.w * 1.3, Math.max(40, vb.w * f)), h = vb.h * (w / vb.w);
		vb = { x: cx - w / 2, y: cy - h / 2, w, h };
	}
</script>

<div class="wrap">
	<svg bind:this={svg} class="map" class:pick={pickable}
		viewBox="{vb.x} {vb.y} {vb.w} {vb.h}" preserveAspectRatio="xMidYMid meet"
		onwheel={wheel} onpointerdown={down} onpointermove={move} onpointerup={up}
		onpointercancel={() => (drag = null)}
		role="group" aria-label={pickable ? 'Click to place your rehearsal room' : 'Map of ads'}>
		{#each geo.regions as r (r.k)}
			<path class="rg" class:on={r.k === region} d={r.d} />
		{/each}

		{#each pins as p (p.id)}
			{@const w = Math.max(34, p.label.length * 5.8 + 11)}
			<g class="pin" class:on={selected === p.id} class:hot={hot === p.id} class:paid={p.paid}
				data-pin={p.id} transform="translate({p.x},{p.y}) scale({k})">
				<rect x={-w / 2} y="-21" width={w} height="15" />
				<text y="-13.2">{p.label}</text>
				<line class="stem" x1="0" y1="-6" x2="0" y2="-1.6" />
				<circle class="dot" cx="0" cy="0" r="1.9" />
			</g>
		{/each}

		{#if drop}
			<g class="drop" transform="translate({drop.x},{drop.y}) scale({k})">
				<circle class="halo" r="26" /><circle class="ring" r="9" /><circle class="core" r="2.4" />
			</g>
		{/if}
	</svg>

	<div class="zoom">
		<button type="button" onclick={() => zoom(1 / 1.45)} aria-label="Zoom in">+</button>
		<button type="button" onclick={() => zoom(1.45)} aria-label="Zoom out">&minus;</button>
		<button type="button" class="rs" aria-label="Whole country"
			onclick={() => (vb = { x: 0, y: 0, w: geo.w, h: geo.h })}>ALL</button>
	</div>
	{#if pickable}
		<div class="coords">{drop ? 'placed' : 'click the map to place it'}</div>
	{/if}
</div>

<style>
	.wrap { position: relative; border: 1px solid var(--line); background: var(--sea); overflow: hidden; }
	.map { display: block; width: 100%; height: 400px; touch-action: none; cursor: grab; }
	.map.pick { cursor: crosshair; height: 300px; }
	@media (max-width: 820px) { .map { height: 280px; } }
	.rg { fill: var(--land); stroke: #3c3c44; stroke-width: 1; vector-effect: non-scaling-stroke;
	      transition: fill .25s var(--ease); }
	.rg.on { fill: var(--land2); stroke: var(--marker); stroke-width: 1.6; }
	.pin { cursor: pointer; }
	.pin rect { fill: #0b0b0fee; stroke: var(--ink); stroke-width: 1.1; vector-effect: non-scaling-stroke; }
	.pin text { font-family: var(--mono); font-size: 8.5px; font-weight: 700; fill: var(--ink);
	            letter-spacing: .04em; text-anchor: middle; dominant-baseline: middle; }
	.pin .dot { fill: var(--ink); stroke: #08080a; stroke-width: .8; vector-effect: non-scaling-stroke; }
	.pin .stem { stroke: var(--ink); stroke-width: .8; vector-effect: non-scaling-stroke; }
	.pin.hot rect { fill: #2a2a34; }
	.pin.on rect { fill: var(--marker); stroke: var(--marker); }
	.pin.on text { fill: #08080a; }
	.pin.on .dot, .pin.on .stem { fill: var(--marker); stroke: var(--marker); }
	.pin.paid rect { stroke: var(--stamp); }
	.drop .ring { fill: none; stroke: var(--marker); stroke-width: 1.4; vector-effect: non-scaling-stroke; }
	.drop .core { fill: var(--marker); }
	.drop .halo { fill: var(--marker); opacity: .13; }
	.zoom { position: absolute; right: 8px; top: 8px; display: flex; flex-direction: column; gap: 4px; }
	.zoom button { font: inherit; width: 27px; height: 27px; background: #08080acc; color: var(--ink);
	               border: 1px solid var(--line); cursor: pointer; font-size: 13px; line-height: 1; padding: 0; }
	.zoom button:hover { border-color: var(--ink); }
	.zoom .rs { font-size: 8px; }
	.coords { position: absolute; left: 8px; bottom: 8px; font-size: 10.5px; letter-spacing: .1em;
	          color: var(--dim); background: #08080acc; padding: 4px 7px; pointer-events: none; }
</style>
