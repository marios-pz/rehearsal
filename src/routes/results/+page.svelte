<script lang="ts">
	import MapView from '$lib/components/MapView.svelte';
	import { LABEL } from '$lib/taxonomy';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const cc = $derived(data.cc);
	const region = $derived(data.region);
	const inst = $derived(data.inst);
	const gen = $derived(data.gen);
	const commit = $derived(data.commit);
	const ads = $derived(data.ads);
	const geo = $derived(data.geo);

	let selected = $state<string | null>(null);
	let hot = $state<string | null>(null);

	// Recruit (standing member posts) is the board's original purpose and
	// stays the default; Gigs is the opt-in, mutually exclusive view. Not
	// persisted across visits, same as `selected` — a fresh visit always
	// starts on Recruit.
	let view = $state<'gigs' | 'recruit'>('recruit');
	const showGigs = $derived(view === 'gigs');
	const showStanding = $derived(view === 'recruit');

	// commitment is its own independent signal, same weight class as a
	// single genre match — never coupled to `paid`, which stays its own
	// untouched boolean throughout.
	const score = (a: any) =>
		(a.needs.some((n: string) => inst.includes(n)) ? 46 : 0) +
		20 * a.genres.filter((g: string) => gen.includes(g)).length +
		(a.region_code === region ? 24 : 0) +
		(commit.includes(a.commitment) ? 15 : 0);
	const ranked = (list: any[]) => [...list].sort((x, y) => score(y) - score(x));

	const here = $derived(ads.filter((a: any) => a.region_code === region));
	const near = $derived(ads.filter((a: any) => a.region_code !== region));

	// A gig or a rehearsal is a dated, short-term ask, so it sorts by
	// soonest first rather than by relevance score: a plausible-but-distant
	// match is less useful than an exact one an hour before it starts.
	// "Looking for a member" ads have no date and keep the original ranking.
	const byWhen = (x: any, y: any) => new Date(x.event_at).getTime() - new Date(y.event_at).getTime();
	const standing = (list: any[]) => ranked(list.filter((a: any) => a.kind === 'member'));
	const dated = (list: any[]) => [...list.filter((a: any) => a.kind !== 'member')].sort(byWhen);

	const hereStanding = $derived(standing(here));
	const hereDated = $derived(dated(here));
	const nearStanding = $derived(standing(near).slice(0, 8));
	const nearDated = $derived(dated(near).slice(0, 8));

	const visibleHere = $derived([
		...(showGigs ? hereDated : []),
		...(showStanding ? hereStanding : [])
	]);
	const visibleNear = $derived([
		...(showGigs ? nearDated : []),
		...(showStanding ? nearStanding : [])
	]);

	function formatEventAt(iso: string): string {
		const d = new Date(iso);
		const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
		const dayDiff = Math.round((startOfDay(d) - startOfDay(new Date())) / 86400000);
		if (dayDiff === 0) return `Today, ${time}`;
		if (dayDiff === 1) return `Tomorrow, ${time}`;
		return `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`;
	}

	const pins = $derived(visibleHere.map((a: any) => ({
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
		<div class="meta">{LABEL[a.kind]} · {a.region_code}</div>
		<div class="row">
			{#each a.needs as n}<span class="tag" class:hit={inst.includes(n)}>Needs {LABEL[n] ?? n}</span>{/each}
		</div>
	</button>
{/snippet}

<a class="back" href="/">&larr; Change filters</a>

<div class="switch" style="margin-bottom:16px">
	<button type="button" class="switchbtn" class:on={view === 'gigs'} onclick={() => (view = 'gigs')}>Gigs</button>
	<button type="button" class="switchbtn" class:on={view === 'recruit'} onclick={() => (view = 'recruit')}>Recruit</button>
</div>

<div class="board veil">
	<div class="split">
		<div>
			<p class="count">{visibleHere.length} ad{visibleHere.length === 1 ? '' : 's'} in {region}</p>
			<div class="list">
				{#if showGigs && hereDated.length}
					<div class="divider">Gigs &amp; fill-ins in {region}</div>
					{#each hereDated as a (a.public_id)}{@render gigCard(a)}{/each}
				{/if}

				{#if showStanding}
					{#each hereStanding as a (a.public_id)}
						<button class="card" class:on={selected === a.public_id}
							onclick={() => pick(a.public_id)}
							onpointerenter={() => (hot = a.public_id)} onpointerleave={() => (hot = null)}>
							<h3>{a.band_name}</h3><span class="lvl" class:hit={commit.includes(a.commitment)}>{a.commitment}</span>
							<span class="views" title="{viewCount(a)} view{viewCount(a) === 1 ? '' : 's'}">
								{@render eye()}{viewCount(a)}
							</span>
							<div class="meta">
								{a.region_code}{#if a.paid} · <span class="paid">Paid</span>{/if}
								· <span class="expiry" class:soon={a.days_left <= 3}>{a.days_left}d left</span>
							</div>
							<div class="row">
								{#each a.needs as n}<span class="tag" class:hit={inst.includes(n)}>Needs {LABEL[n] ?? n}</span>{/each}
								{#each a.genres as g}<span class="tag" class:hit={gen.includes(g)}>{LABEL[g] ?? g}</span>{/each}
							</div>
						</button>
					{/each}
				{/if}

				{#if !visibleHere.length}
					<p class="hint">
						No {view === 'gigs' ? 'gigs' : 'open spots'} here yet.
						The nearest ones are below.
					</p>
				{/if}

				{#if visibleNear.length}
					<div class="divider">Elsewhere in {cc}</div>
					{#if showGigs}{#each nearDated as a (a.public_id)}{@render gigCard(a)}{/each}{/if}
					{#if showStanding}
						{#each nearStanding as a (a.public_id)}
							<button class="card" class:on={selected === a.public_id} onclick={() => pick(a.public_id)}>
								<h3>{a.band_name}</h3><span class="lvl" class:hit={commit.includes(a.commitment)}>{a.commitment}</span>
								<span class="views" title="{viewCount(a)} view{viewCount(a) === 1 ? '' : 's'}">
									{@render eye()}{viewCount(a)}
								</span>
								<div class="meta">{a.region_code} · {a.days_left}d left</div>
								<div class="row">
									{#each a.needs as n}<span class="tag" class:hit={inst.includes(n)}>Needs {LABEL[n] ?? n}</span>{/each}
								</div>
							</button>
						{/each}
					{/if}
				{/if}
			</div>
		</div>

		<div class="right">
			<MapView {geo} {pins} bind:selected {hot} />
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
				<span style="color:var(--marker)">{formatEventAt(open.event_at)}</span> ·
				{LABEL[open.kind]} · {open.region_code}
			{:else}
				{open.region_code} · {open.commitment}{#if open.paid} · <span class="paid">Paid</span>{/if}
			{/if}
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
