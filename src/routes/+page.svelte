<script lang="ts">
	import Combobox from '$lib/components/Combobox.svelte';
	import MapView from '$lib/components/MapView.svelte';
	import { INSTRUMENTS, GENRES, COMMITMENTS, LABEL } from '$lib/taxonomy';
	import { fold } from '$lib/fuzzy';
	import { haversineKm } from '$lib/geo';
	import { position } from '$lib/position.svelte';
	import { page } from '$app/state';
	import { untrack, onMount } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Seeded from the server load, then owned by the client: switching
	// country refetches into these rather than navigating.
	let cc = $state(untrack(() => data.cc));
	let ads = $state<any[]>(untrack(() => data.ads));

	const fromUrl = (key: string) =>
		untrack(() => (page.url.searchParams.get(key) ?? '').split(',').filter(Boolean));
	let inst = $state<string[]>(fromUrl('i'));
	let gen = $state<string[]>(fromUrl('g'));
	let commit = $state<string[]>(fromUrl('m'));

	// Session-only, not localStorage: a stray refresh shouldn't throw the
	// whole selection away, but a filter chosen last week has no business
	// resurfacing. A URL that already carries filters (a shared link, or
	// the old /results redirect) wins over session state outright.
	const SESSION_KEY = 'rehearsal:filters';
	let restored = $state(false);

	onMount(() => {
		position.request();
		try {
			const raw = page.url.searchParams.size === 0 && sessionStorage.getItem(SESSION_KEY);
			if (!raw) { restored = true; return; }
			const saved = JSON.parse(raw);
			const apply = () => {
				inst = Array.isArray(saved.inst) ? saved.inst : [];
				gen = Array.isArray(saved.gen) ? saved.gen : [];
				commit = Array.isArray(saved.commit) ? saved.commit : [];
				restored = true;
			};
			if (saved.cc && saved.cc !== cc) switchCountry(saved.cc).then(apply);
			else apply();
		} catch {
			restored = true;
		}
	});

	$effect(() => {
		if (!restored) return;
		const snapshot = { cc, inst, gen, commit };
		try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(snapshot)); } catch { /* private mode etc */ }
		const q = new URLSearchParams({ c: cc });
		if (inst.length) q.set('i', inst.join(','));
		if (gen.length) q.set('g', gen.join(','));
		if (commit.length) q.set('m', commit.join(','));
		history.replaceState(null, '', `?${q}`);
	});

	const countryItems = $derived(
		data.countries.map((c: any) => ({
			id: c.c, label: c.n, sub: c.v && c.v !== c.n ? c.v : null, keys: c.k,
			right: data.counts[c.c] ? `<b>${data.counts[c.c]}</b> ads` : 'be the first'
		})).sort((a: any, b: any) => (data.counts[b.id] ?? 0) - (data.counts[a.id] ?? 0))
	);

	async function switchCountry(v: string) {
		cc = v;
		ads = await (await fetch(`/api/ads?c=${v}`)).json();
	}

	let selected = $state<string | null>(null);
	let hot = $state<string | null>(null);
	let zoomGated = $state(false);

	// The list follows the map, same idea as Airbnb: pins aren't filtered
	// (Leaflet already only draws what's on-screen), but the list panel is,
	// so it always matches the area currently in view rather than the
	// whole country regardless of where the map is pointed.
	let mapBounds = $state<{ south: number; west: number; north: number; east: number } | null>(null);
	function withinBounds(a: any): boolean {
		if (!mapBounds) return true;
		return a.display_lat >= mapBounds.south && a.display_lat <= mapBounds.north &&
			a.display_lng >= mapBounds.west && a.display_lng <= mapBounds.east;
	}

	// The "Find Me" button. locateTick is the actual trigger MapView reacts
	// to (see its own comment) — a click either fires it immediately, if a
	// position is already known, or arms wantsLocate so the effect below
	// fires it the moment geolocation resolves instead of silently doing
	// nothing on a cold, not-yet-answered permission prompt.
	let locateTick = $state(0);
	let wantsLocate = $state(false);
	let locateAttempted = $state(false);
	function findMe() {
		locateAttempted = true;
		position.request();
		if (position.coords) locateTick++;
		else wantsLocate = true;
	}
	$effect(() => {
		if (wantsLocate && position.coords) {
			wantsLocate = false;
			locateTick++;
		}
	});

	// Recruit (standing member posts) is the board's original purpose and
	// stays the default; Gigs is the opt-in, mutually exclusive view. Not
	// persisted across visits, same as `selected` — a fresh visit always
	// starts on Recruit.
	let view = $state<'gigs' | 'recruit'>('recruit');
	const showGigs = $derived(view === 'gigs');
	const showStanding = $derived(view === 'recruit');

	// Replaces the old same-region bonus: a smooth falloff (halves every
	// 50km, same peak weight the region bonus had at 0km) rather than a
	// hard in/out bucket. Drops out entirely — never a filter — when
	// geolocation is denied or unavailable; the board stays fully usable.
	const DISTANCE_MAX = 24, DISTANCE_HALFLIFE_KM = 50;
	function distanceScore(a: any): number {
		const p = position.coords;
		if (!p) return 0;
		return DISTANCE_MAX * Math.pow(2, -haversineKm(p, { lat: a.display_lat, lng: a.display_lng }) / DISTANCE_HALFLIFE_KM);
	}
	function distanceLabel(a: any): string | null {
		const p = position.coords;
		if (!p) return null;
		return `${Math.round(haversineKm(p, { lat: a.display_lat, lng: a.display_lng }))} km away`;
	}

	// commitment is its own independent signal, same weight class as a
	// single genre match — never coupled to `paid`, which stays its own
	// untouched boolean throughout.
	const score = (a: any) =>
		(a.needs.some((n: string) => inst.includes(n)) ? 46 : 0) +
		20 * a.genres.filter((g: string) => gen.includes(g)).length +
		distanceScore(a) +
		(commit.includes(a.commitment) ? 15 : 0);
	const ranked = (list: any[]) => [...list].sort((x, y) => score(y) - score(x));

	// A gig or a rehearsal is a dated, short-term ask, so it sorts by
	// soonest first rather than by relevance score: a plausible-but-distant
	// match is less useful than an exact one an hour before it starts.
	// "Looking for a member" ads have no date and keep the original ranking.
	const byWhen = (x: any, y: any) => new Date(x.event_at).getTime() - new Date(y.event_at).getTime();
	const standing = $derived(ranked(ads.filter((a: any) => a.kind === 'member')));
	const dated = $derived([...ads.filter((a: any) => a.kind !== 'member')].sort(byWhen));
	const visible = $derived(showGigs ? dated : standing);

	// Pins (fed to the map) stay the full set above; these, used only for
	// the list panel and its count, additionally narrow to what's in view.
	const standingInView = $derived(standing.filter(withinBounds));
	const datedInView = $derived(dated.filter(withinBounds));
	const visibleInView = $derived(showGigs ? datedInView : standingInView);

	function formatEventAt(iso: string): string {
		const d = new Date(iso);
		const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
		const dayDiff = Math.round((startOfDay(d) - startOfDay(new Date())) / 86400000);
		if (dayDiff === 0) return `Today, ${time}`;
		if (dayDiff === 1) return `Tomorrow, ${time}`;
		return `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`;
	}

	const pins = $derived(visible.map((a: any) => ({
		id: a.public_id, lat: a.display_lat, lng: a.display_lng, paid: a.paid,
		label: (a.needs[0] ?? '').split('-')[0].toUpperCase()
	})));

	const open = $derived(ads.find((a: any) => a.public_id === selected));
	function pick(id: string) {
		selected = selected === id ? null : id;
	}

	// The server is the one actually counting (see /api/ads/[id]/view and
	// record_ad_view()), so this only needs to fire once per ad per page
	// load. Refresh-spam and repeat clicks are already absorbed server-side
	// by a per-viewer window; this set just skips the redundant request.
	const viewOverrides = $state<Record<string, number>>({});
	const viewCount = (a: { public_id: string; view_count: number }) =>
		viewOverrides[a.public_id] ?? a.view_count;
	const seenViews = new Set<string>();
	$effect(() => {
		const id = selected;
		if (!id || seenViews.has(id)) return;
		seenViews.add(id);
		fetch(`/api/ads/${id}/view`, { method: 'POST' })
			.then((r) => (r.ok ? r.json() : null))
			.then((res) => { if (res?.view_count != null) viewOverrides[id] = res.view_count; })
			.catch(() => { /* a missed view count is not worth surfacing an error for */ });
	});

	// Links are stored as whatever URL the poster pasted; only missing the
	// scheme gets fixed up, nothing else about the link is second-guessed.
	const toHref = (url: string) => /^https?:\/\//i.test(url) ? url : `https://${url}`;
</script>

{#snippet eye()}
	<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor"
		stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" />
		<circle cx="12" cy="12" r="3" />
	</svg>
{/snippet}

{#snippet gigCard(a: any)}
	<button class="card gigcard" class:on={selected === a.public_id} onclick={() => pick(a.public_id)}>
		<div class="gigwhen">{formatEventAt(a.event_at)}</div>
		<h3>{a.band_name}</h3>
		<span class="views" title="{viewCount(a)} view{viewCount(a) === 1 ? '' : 's'}">
			{@render eye()}{viewCount(a)}
		</span>
		<div class="meta">{LABEL[a.kind]}{#if distanceLabel(a)} · {distanceLabel(a)}{/if}</div>
		<div class="row">
			{#each a.needs as n}<span class="tag" class:hit={inst.includes(n)}>Needs {LABEL[n] ?? n}</span>{/each}
		</div>
	</button>
{/snippet}

<div class="filterbar step veil">
	<div class="filtercol">
		<label for="country">Country</label>
		<Combobox items={countryItems} value={cc} flag label="Country"
			placeholder="Search a country" group="Where bands are posting"
			noMatch="No country matches. Try the local spelling."
			onchange={(v) => v && switchCountry(v)} />
	</div>
	<div class="filtercol">
		<label for="instruments">I play</label>
		<Combobox items={INSTRUMENTS.map(([id, l]) => ({ id, label: l, keys: [fold(l), id] }))}
			bind:value={inst} multi label="Instruments" placeholder="drums, bass, vocals"
			group="Instruments" noMatch="No instrument matches. Try a shorter word." />
	</div>
	<div class="filtercol">
		<label for="genres">Genre</label>
		<Combobox items={GENRES.map(([id, l]) => ({ id, label: l, keys: [fold(l), id] }))}
			bind:value={gen} multi label="Genres" placeholder="thrash, doom, post-rock"
			group="Genres" noMatch="No genre matches that." />
	</div>
	<div class="filtercol">
		<label for="commitment">How serious</label>
		<Combobox items={COMMITMENTS.map(([id, l]) => ({ id, label: l, keys: [fold(l), id] }))}
			bind:value={commit} multi label="Commitment" placeholder="casual, serious, professional"
			group="Commitment" noMatch="No match for that." />
	</div>
</div>

<div class="findmerow">
	<button type="button" class="findme" onclick={findMe}>
		<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
			<path d="M12 2C7.58 2 4 5.58 4 10c0 5.25 7 12 8 12s8-6.75 8-12c0-4.42-3.58-8-8-8Zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z" />
		</svg>
		Find Me
	</button>
	{#if locateAttempted && position.status === 'denied'}
		<p class="hint" style="text-align:center;margin-top:6px">Location access was denied.</p>
	{/if}
</div>

<div class="switch" style="margin-bottom:16px">
	<button type="button" class="switchbtn" class:on={view === 'gigs'} onclick={() => (view = 'gigs')}>Gigs</button>
	<button type="button" class="switchbtn" class:on={view === 'recruit'} onclick={() => (view = 'recruit')}>Recruit</button>
</div>

<div class="board veil">
	<div class="split">
		<div>
			<p class="count">{visibleInView.length} ad{visibleInView.length === 1 ? '' : 's'} in view</p>
			<div class="list">
				{#if zoomGated}
					<p class="hint">Zoom in on the map to see ads in that area.</p>
				{:else if showGigs}
					{#each datedInView as a (a.public_id)}{@render gigCard(a)}{/each}
					{#if !dated.length}
						<p class="hint">No gigs posted yet.</p>
					{:else if !datedInView.length}
						<p class="hint">No gigs in this part of the map. Pan or zoom out to see more.</p>
					{/if}
				{:else}
					{#each standingInView as a (a.public_id)}
						<button class="card" class:on={selected === a.public_id}
							onclick={() => pick(a.public_id)}
							onpointerenter={() => (hot = a.public_id)} onpointerleave={() => (hot = null)}>
							<h3>{a.band_name}</h3><span class="lvl" class:hit={commit.includes(a.commitment)}>{a.commitment}</span>
							<span class="views" title="{viewCount(a)} view{viewCount(a) === 1 ? '' : 's'}">
								{@render eye()}{viewCount(a)}
							</span>
							<div class="meta">
								{#if distanceLabel(a)}{distanceLabel(a)} · {/if}
								{#if a.paid}<span class="paid">Paid</span> · {/if}
								<span class="expiry" class:soon={a.days_left <= 3}>{a.days_left}d left</span>
							</div>
							<div class="row">
								{#each a.needs as n}<span class="tag" class:hit={inst.includes(n)}>Needs {LABEL[n] ?? n}</span>{/each}
								{#each a.genres as g}<span class="tag" class:hit={gen.includes(g)}>{LABEL[g] ?? g}</span>{/each}
							</div>
						</button>
					{/each}
					{#if !standing.length}
						<p class="hint">No open spots yet. Be the first to post one.</p>
					{:else if !standingInView.length}
						<p class="hint">No open spots in this part of the map. Pan or zoom out to see more.</p>
					{/if}
				{/if}
			</div>
		</div>

		<div class="right">
			<MapView {pins} bind:selected {hot} minZoom={8} meCoords={position.coords} {locateTick}
				onzoomgate={(g) => (zoomGated = g)} onbounds={(b) => (mapBounds = b)} />
			<p class="hint" style="margin-top:8px">Click a card or a pin to see the full ad below.</p>
		</div>
	</div>
</div>

{#if open}
	<div class="board detail veil">
		<div class="detailhead">
			<h2>{open.band_name}</h2>
			<span class="views" title="{viewCount(open)} view{viewCount(open) === 1 ? '' : 's'}">
				{@render eye()}{viewCount(open)}
			</span>
		</div>
		<div class="meta">
			{#if open.kind !== 'member' && open.event_at}
				<span style="color:var(--marker)">{formatEventAt(open.event_at)}</span> · {LABEL[open.kind]}
			{:else}
				{open.commitment}{#if open.paid} · <span class="paid">Paid</span>{/if}
			{/if}
			{#if distanceLabel(open)} · {distanceLabel(open)}{/if}
		</div>
		<p class="note">{open.blurb}</p>
		<div class="row">
			{#each open.needs as n}<span class="tag" class:hit={inst.includes(n)}>Needs {LABEL[n] ?? n}</span>{/each}
			{#each open.genres as g}<span class="tag" class:hit={gen.includes(g)}>{LABEL[g] ?? g}</span>{/each}
		</div>
		<div class="row" style="margin-top:10px">
			{#each open.links as l}
				<a class="social" href={toHref(l.handle)} target="_blank" rel="noopener noreferrer nofollow">
					Message on {l.kind} &rarr;
				</a>
			{/each}
		</div>
		<p class="hint" style="margin-top:10px">
			Contact happens on their socials. This board only holds the ad, and it comes down
			in {open.days_left} day{open.days_left === 1 ? '' : 's'} unless they renew.
			The pin is accurate to about 700m, not to the door.
		</p>
	</div>
{/if}
