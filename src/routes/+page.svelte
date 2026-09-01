<script lang="ts">
	import Combobox from '$lib/components/Combobox.svelte';
	import MapView from '$lib/components/MapView.svelte';
	import { fold } from '$lib/fuzzy';
	import { untrack } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const INSTRUMENTS = [['drums','Drums'],['bass','Bass'],['rhythm-guitar','Rhythm guitar'],
		['lead-guitar','Lead guitar'],['vocals','Vocals'],['keys','Keys'],['violin','Violin'],
		['sax','Sax'],['harmonica','Harmonica']] as const;
	const GENRES = [['thrash','Thrash'],['death-metal','Death metal'],['black-metal','Black metal'],
		['heavy-metal','Heavy metal'],['doom-stoner','Doom / Stoner'],['hardcore','Hardcore'],
		['punk','Punk'],['grunge','Grunge'],['alt-rock','Alt rock'],['prog','Prog'],
		['classic-rock','Classic rock'],['blues-rock','Blues rock'],['post-rock','Post-rock'],
		['indie','Indie']] as const;
	const LABEL = Object.fromEntries([...INSTRUMENTS, ...GENRES]);

	// Seeded from the server load, then owned by the client: switching
	// country refetches into these rather than navigating.
	let cc = $state(untrack(() => data.cc));
	let geo = $state<any>(untrack(() => data.geo));
	let ads = $state<any[]>(untrack(() => data.ads));
	let region = $state<string | null>(null);
	let inst = $state<string[]>([]);
	let gen = $state<string[]>([]);
	let selected = $state<string | null>(null);
	let hot = $state<string | null>(null);

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
		cc = v; region = null; inst = []; gen = []; selected = null;
		ads = await (await fetch(`/api/ads?c=${v}`)).json();
		geo = (await import(`$lib/data/geo/${v}.json`).catch(() => ({ default: null }))).default;
		history.replaceState(null, '', `?c=${v}`);
	}

	const score = (a: any) =>
		(a.needs.some((n: string) => inst.includes(n)) ? 46 : 0) +
		20 * a.genres.filter((g: string) => gen.includes(g)).length +
		(a.region_code === region ? 24 : 0);
	const ranked = (list: any[]) => [...list].sort((x, y) => score(y) - score(x));

	const here = $derived(ranked(ads.filter((a: any) => a.region_code === region)));
	const near = $derived(ranked(ads.filter((a: any) => a.region_code !== region)).slice(0, 8));
	const ready = $derived(!!region && inst.length > 0 && gen.length > 0);

	// The map needs frame coordinates; the database stores lat/lng.
	function toXY(a: any) {
		const [LO0, LO1, , LA1] = geo.bx;
		const s = geo.w / (LO1 - LO0);
		const m = (la: number) => (Math.log(Math.tan(Math.PI / 4 + (la * Math.PI) / 360)) * 180) / Math.PI;
		return { x: (a.display_lng - LO0) * s, y: (m(LA1) - m(a.display_lat)) * s };
	}
	const pins = $derived(
		!ready ? [] : here.map((a: any) => ({
			id: a.public_id, ...toXY(a), paid: a.paid,
			label: (a.needs[0] ?? '').split('-')[0].toUpperCase()
		}))
	);
	const open = $derived(ads.find((a: any) => a.public_id === selected));
</script>

<div class="step veil">
	<p class="lab">Where are you looking?</p>
	<p class="hint">Type a country in any spelling. Ελλάδα, Deutschland and Holland all work.</p>
	<Combobox items={countryItems} value={cc} flag label="Country"
		placeholder="Search a country" group="Where bands are posting"
		noMatch="No country matches. Try the local spelling."
		onchange={(v) => v && switchCountry(v)} />
</div>

<div class="step veil" style="animation-delay:.07s">
	<p class="lab">Which region?</p>
	<p class="hint">The map opens once you pick one.</p>
	{#if geo}
		<Combobox items={regionItems} bind:value={region} label="Region"
			placeholder="Search a region" group="Busiest first" noMatch="No region matches that."
			onchange={() => (selected = null)} />
		{#if region}
			<div class="step veil" style="margin:12px 0 0">
				<MapView {geo} {region} {pins} bind:selected {hot} />
			</div>
		{/if}
	{:else}
		<p class="hint">No map for this country yet. Post the first ad and it gets one.</p>
	{/if}
</div>

{#if region}
	<div class="step veil">
		<p class="lab">I play</p>
		<p class="hint">Start typing. Add as many as you'd actually show up with.</p>
		<Combobox items={INSTRUMENTS.map(([id, l]) => ({ id, label: l, keys: [fold(l), id] }))}
			bind:value={inst} multi label="Instruments" placeholder="drums, bass, vocals"
			group="Instruments" noMatch="No instrument matches. Try a shorter word." />
	</div>
{/if}

{#if region && inst.length}
	<div class="step veil">
		<p class="lab">Genre</p>
		<p class="hint">Two or three beats one. Bands rarely sit in a single box.</p>
		<Combobox items={GENRES.map(([id, l]) => ({ id, label: l, keys: [fold(l), id] }))}
			bind:value={gen} multi label="Genres" placeholder="thrash, doom, post-rock"
			group="Genres" noMatch="No genre matches that." />
	</div>
{/if}

{#if ready}
	<div class="step veil">
		<div class="split">
			<div>
				<p class="count">{here.length} ad{here.length === 1 ? '' : 's'} in {region}</p>
				<div class="list">
					{#each here as a (a.public_id)}
						<button class="card" class:on={selected === a.public_id}
							onclick={() => (selected = selected === a.public_id ? null : a.public_id)}
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
						<div class="divider">Elsewhere in this country</div>
						{#each near as a (a.public_id)}
							<button class="card" class:on={selected === a.public_id}
								onclick={() => (selected = selected === a.public_id ? null : a.public_id)}>
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
				{#if open}
					<div class="prev">
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
				{:else}
					<div class="prev empty">Pick a pin or a card. The ad opens here.</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
