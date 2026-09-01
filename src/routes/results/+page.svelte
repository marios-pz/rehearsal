<script lang="ts">
	import MapView from '$lib/components/MapView.svelte';
	import { LABEL } from '$lib/taxonomy';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const cc = $derived(data.cc);
	const region = $derived(data.region);
	const inst = $derived(data.inst);
	const gen = $derived(data.gen);
	const ads = $derived(data.ads);
	const geo = $derived(data.geo);

	let selected = $state<string | null>(null);
	let hot = $state<string | null>(null);

	const score = (a: any) =>
		(a.needs.some((n: string) => inst.includes(n)) ? 46 : 0) +
		20 * a.genres.filter((g: string) => gen.includes(g)).length +
		(a.region_code === region ? 24 : 0);
	const ranked = (list: any[]) => [...list].sort((x, y) => score(y) - score(x));

	const here = $derived(ranked(ads.filter((a: any) => a.region_code === region)));
	const near = $derived(ranked(ads.filter((a: any) => a.region_code !== region)).slice(0, 8));

	const pins = $derived(here.map((a: any) => ({
		id: a.public_id, lat: a.display_lat, lng: a.display_lng, paid: a.paid,
		label: (a.needs[0] ?? '').split('-')[0].toUpperCase()
	})));

	const open = $derived(ads.find((a: any) => a.public_id === selected));
	function pick(id: string) {
		selected = selected === id ? null : id;
	}
</script>

<a class="back" href="/">&larr; Change filters</a>

<div class="board veil">
	<div class="split">
		<div>
			<p class="count">{here.length} ad{here.length === 1 ? '' : 's'} in {region}</p>
			<div class="list">
				{#each here as a (a.public_id)}
					<button class="card" class:on={selected === a.public_id}
						onclick={() => pick(a.public_id)}
						onpointerenter={() => (hot = a.public_id)} onpointerleave={() => (hot = null)}>
						<h3>{a.band_name}</h3><span class="lvl">{a.commitment}</span>
						<div class="meta">
							{a.region_code}{#if a.paid} · <span class="paid">Paid</span>{/if}
							· <span class="expiry" class:soon={a.days_left <= 3}>{a.days_left}d left</span>
						</div>
						<div class="row">
							{#each a.needs as n}<span class="tag" class:hit={inst.includes(n)}>Needs {LABEL[n] ?? n}</span>{/each}
							{#each a.genres as g}<span class="tag" class:hit={gen.includes(g)}>{LABEL[g] ?? g}</span>{/each}
						</div>
					</button>
				{:else}
					<p class="hint">No open spots here yet. The nearest ones are below.</p>
				{/each}

				{#if near.length}
					<div class="divider">Elsewhere in {cc}</div>
					{#each near as a (a.public_id)}
						<button class="card" class:on={selected === a.public_id} onclick={() => pick(a.public_id)}>
							<h3>{a.band_name}</h3><span class="lvl">{a.commitment}</span>
							<div class="meta">{a.region_code} · {a.days_left}d left</div>
							<div class="row">
								{#each a.needs as n}<span class="tag" class:hit={inst.includes(n)}>Needs {LABEL[n] ?? n}</span>{/each}
							</div>
						</button>
					{/each}
				{/if}
			</div>
		</div>

		<div class="right">
			<MapView {geo} {region} {pins} bind:selected {hot} />
			<p class="hint" style="margin-top:8px">Click a card or a pin to see the full ad below.</p>
		</div>
	</div>
</div>

{#if open}
	<div class="board detail veil">
		<h2>{open.band_name}</h2>
		<div class="meta">
			{open.region_code} · {open.commitment}{#if open.paid} · <span class="paid">Paid</span>{/if}
		</div>
		<p class="note">{open.blurb}</p>
		<div class="row">
			{#each open.needs as n}<span class="tag" class:hit={inst.includes(n)}>Needs {LABEL[n] ?? n}</span>{/each}
			{#each open.genres as g}<span class="tag" class:hit={gen.includes(g)}>{LABEL[g] ?? g}</span>{/each}
		</div>
		{#if open.link_handle}
			<a class="social" href="#contact" onclick={(e) => e.preventDefault()}>
				Message on {open.link_kind} &rarr;
			</a>
		{/if}
		<p class="hint" style="margin-top:10px">
			Contact happens on their socials. This board only holds the ad, and it comes down
			in {open.days_left} day{open.days_left === 1 ? '' : 's'} unless they renew.
			The pin is accurate to about 700m, not to the door.
		</p>
	</div>
{/if}
