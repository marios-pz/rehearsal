<script lang="ts">
	import Combobox from '$lib/components/Combobox.svelte';
	import { INSTRUMENTS, GENRES } from '$lib/taxonomy';
	import { fold } from '$lib/fuzzy';
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Seeded from the server load, then owned by the client: switching
	// country refetches into these rather than navigating.
	let cc = $state(untrack(() => data.cc));
	let geo = $state<any>(untrack(() => data.geo));
	let ads = $state<any[]>(untrack(() => data.ads));
	let region = $state<string | null>(null);
	let inst = $state<string[]>([]);
	let gen = $state<string[]>([]);

	const countryItems = $derived(
		data.countries.map((c: any) => ({
			id: c.c, label: c.n, sub: c.v && c.v !== c.n ? c.v : null, keys: c.k,
			right: data.counts[c.c] ? `<b>${data.counts[c.c]}</b> ads` : 'be the first'
		})).sort((a: any, b: any) => (data.counts[b.id] ?? 0) - (data.counts[a.id] ?? 0))
	);
	const regionItems = $derived(
		(geo?.regions ?? []).map((r: any) => {
			const n = ads.filter((a: any) => a.region_code === r.k).length;
			return { id: r.k, label: r.k, keys: [fold(r.k)], right: n ? `<b>${n}</b> ads` : 'none yet' };
		}).sort((a: any, b: any) => (b.right.includes('<b>') ? 1 : 0) - (a.right.includes('<b>') ? 1 : 0))
	);

	async function switchCountry(v: string) {
		cc = v; region = null; gen = [];
		ads = await (await fetch(`/api/ads?c=${v}`)).json();
		geo = (await import(`$lib/data/geo/${v}.json`).catch(() => ({ default: null }))).default;
		history.replaceState(null, '', `?c=${v}`);
	}

	const ready = $derived(inst.length > 0 && !!cc && !!region && gen.length > 0);

	function continue_() {
		if (!ready) return;
		const q = new URLSearchParams({ c: cc, r: region as string, i: inst.join(','), g: gen.join(',') });
		goto(`/results?${q}`);
	}
</script>

<div class="step veil">
	<p class="lab">I play</p>
	<p class="hint">Start typing. Add as many as you'd actually show up with.</p>
	<Combobox items={INSTRUMENTS.map(([id, l]) => ({ id, label: l, keys: [fold(l), id] }))}
		bind:value={inst} multi label="Instruments" placeholder="drums, bass, vocals"
		group="Instruments" noMatch="No instrument matches. Try a shorter word." />
</div>

<div class="step veil" style="animation-delay:.07s">
	<p class="lab">I live in</p>
	<p class="hint">Type a country in any spelling. Ελλάδα, Deutschland and Holland all work.</p>
	<Combobox items={countryItems} value={cc} flag label="Country"
		placeholder="Search a country" group="Where bands are posting"
		noMatch="No country matches. Try the local spelling."
		onchange={(v) => v && switchCountry(v)} />
</div>

{#if cc}
	<div class="step veil">
		<p class="lab">Which region?</p>
		<p class="hint">Busiest regions are listed first.</p>
		{#if geo}
			<Combobox items={regionItems} bind:value={region} label="Region"
				placeholder="Search a region" group="Busiest first" noMatch="No region matches that." />
		{:else}
			<p class="hint">No board for this country yet. Post the first ad and it gets one.</p>
		{/if}
	</div>
{/if}

{#if region}
	<div class="step veil">
		<p class="lab">Genre</p>
		<p class="hint">Two or three beats one. Bands rarely sit in a single box.</p>
		<Combobox items={GENRES.map(([id, l]) => ({ id, label: l, keys: [fold(l), id] }))}
			bind:value={gen} multi label="Genres" placeholder="thrash, doom, post-rock"
			group="Genres" noMatch="No genre matches that." />
	</div>
{/if}

<div class="step veil">
	<button class="go" disabled={!ready} onclick={continue_}>Continue</button>
</div>
