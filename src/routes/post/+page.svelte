<script lang="ts">
	import { enhance } from '$app/forms';
	import Combobox from '$lib/components/Combobox.svelte';
	import MapView from '$lib/components/MapView.svelte';
	import { fold } from '$lib/fuzzy';
	import { INSTRUMENTS, GENRES, COMMITMENTS, SOCIAL_KINDS, AD_KINDS } from '$lib/taxonomy';
	import { onMount } from 'svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let cc = $state('GR');
	let region = $state<string | null>(null);
	let geo = $state<any>(null);
	let pin = $state<{ lat: number; lng: number } | null>(null);
	let bandName = $state('');
	let blurb = $state('');
	let address = $state('');
	let inst = $state<string[]>([]);
	let gen = $state<string[]>([]);
	let commitment = $state<string>('casual');
	let kind = $state<string>('member');
	// A bare datetime-local value ("2026-09-10T19:00") has no timezone, so
	// it's converted to a real ISO instant right here, in the browser,
	// using the browser's own timezone (the poster's) — the hidden field
	// actually submitted carries that ISO string, not the raw input value.
	let eventAtLocal = $state('');
	const eventAtIso = $derived(eventAtLocal ? new Date(eventAtLocal).toISOString() : '');
	let paid = $state(false);
	let socialKinds = $state<string[]>([]);
	let socialLinks = $state<Record<string, string>>({});
	let email = $state('');

	const socialsReady = $derived(socialKinds.some((k) => socialLinks[k]?.trim()));

	$effect(() => { loadGeo(cc); });
	async function loadGeo(c: string) {
		geo = data.withGeo.includes(c)
			? (await import(`$lib/data/geo/${c}.json`)).default
			: null;
		region = null; pin = null;
	}

	// A half-written ad is real work too, same reasoning as the find-page
	// filters: session-only (not localStorage), and cleared the moment a
	// submission actually goes through so the next visit starts blank.
	const SESSION_KEY = 'rehearsal:post-draft';
	let restored = $state(false);
	// region/pin are set by loadGeo's own country-change reset, so a
	// restored draft's region/pin are staged here and only applied once
	// `geo` has settled for the restored country — otherwise loadGeo's
	// reset (which runs asynchronously, after `cc` is restored) would
	// stomp them right back to null.
	let pendingRegion = $state<string | null>(null);
	let pendingPin = $state<{ lat: number; lng: number } | null>(null);

	onMount(() => {
		try {
			const raw = sessionStorage.getItem(SESSION_KEY);
			if (raw) {
				const saved = JSON.parse(raw);
				bandName = saved.bandName ?? '';
				blurb = saved.blurb ?? '';
				address = saved.address ?? '';
				commitment = saved.commitment ?? 'casual';
				kind = saved.kind ?? 'member';
				eventAtLocal = saved.eventAtLocal ?? '';
				paid = !!saved.paid;
				inst = Array.isArray(saved.inst) ? saved.inst : [];
				gen = Array.isArray(saved.gen) ? saved.gen : [];
				socialKinds = Array.isArray(saved.socialKinds) ? saved.socialKinds : [];
				socialLinks = saved.socialLinks && typeof saved.socialLinks === 'object' ? saved.socialLinks : {};
				email = saved.email ?? '';
				pendingRegion = saved.region ?? null;
				pendingPin = saved.pin ?? null;
				if (saved.cc) cc = saved.cc;
			}
		} catch {
			/* ignore a corrupt or inaccessible session entry */
		} finally {
			restored = true;
		}
	});

	$effect(() => {
		if (!geo || (!pendingRegion && !pendingPin)) return;
		region = pendingRegion;
		pin = pendingPin;
		pendingRegion = null;
		pendingPin = null;
	});

	$effect(() => {
		if (!restored) return;
		const snapshot = {
			cc, region, pin, bandName, blurb, address, inst, gen, commitment, kind, eventAtLocal, paid,
			socialKinds, socialLinks, email
		};
		try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(snapshot)); } catch { /* private mode etc */ }
	});

	$effect(() => {
		if (form?.posted) {
			try { sessionStorage.removeItem(SESSION_KEY); } catch { /* private mode etc */ }
		}
	});

	const countryItems = $derived(
		data.countries.map((c: any) => ({
			id: c.c, label: c.n, sub: c.v && c.v !== c.n ? c.v : null, keys: c.k,
			right: data.withGeo.includes(c.c) ? '' : 'no map yet'
		}))
	);
	const regionItems = $derived(
		(geo?.regions ?? []).map((r: any) => ({ id: r.k, label: r.k, keys: [fold(r.k)] }))
	);
	const ready = $derived(!!(
		bandName && region && pin && inst.length && socialsReady && email &&
		(kind === 'member' || eventAtLocal)
	));
</script>

{#if form?.posted}
	<div class="form step veil">
		<div class="tokenbox" style="border-color:var(--marker)">
			<h2 style="color:var(--marker)">Check your email</h2>
			<p style="font-size:13px;margin:0">
				A confirm link just went to <b>{form.email}</b>. Click it and {form.bandName} goes live.
			</p>
			<p class="hint" style="margin-top:12px">
				Your ad code and edit token arrive by email too, right after you confirm. Neither is
				shown on this site at any point, and neither can be recovered if the email is lost.
			</p>
			<a class="social" href="/post">Post another</a>
		</div>
	</div>
{:else}
	<form class="form step veil" method="POST" use:enhance>
		<p class="lab">Post an ad</p>
		<p class="hint">No account, no password. It runs for 14 days and then it is deleted.</p>

		<label for="kind">What kind of post is this</label>
		<div class="radiorow">
			{#each AD_KINDS as [id, l]}
				<label class="radiopill" class:on={kind === id}>
					<input type="radio" name="kind" value={id} bind:group={kind} />
					{l}
				</label>
			{/each}
		</div>

		{#if kind !== 'member'}
			<label for="event_at">{kind === 'gig' ? 'When the gig is' : 'When the rehearsal is'}</label>
			<input id="event_at" type="datetime-local" bind:value={eventAtLocal} />
			<p class="hint" style="margin-top:5px">
				How urgent this reads takes care of itself: a rehearsal tonight looks different from
				one three weeks out just from the date, nothing else is needed for that.
			</p>
		{/if}
		<input type="hidden" name="event_at" value={kind !== 'member' ? eventAtIso : ''} />

		<label for="band_name">Band name</label>
		<input id="band_name" name="band_name" type="text" maxlength="80"
			bind:value={bandName} placeholder="Rust Verdict" />

		<label for="blurb">What are you looking for</label>
		<textarea id="blurb" name="blurb" maxlength="600" rows="3" bind:value={blurb}
			placeholder="Rehearsal twice a week, gigs by spring, into Sabbath and Kyuss more than technical stuff."
		></textarea>

		<label for="instruments">What do you need</label>
		<Combobox items={INSTRUMENTS.map(([id, l]) => ({ id, label: l, keys: [fold(l), id] }))}
			bind:value={inst} multi label="Instruments" placeholder="drums, bass, vocals"
			group="Instruments" noMatch="No instrument matches. Try a shorter word." />
		{#each inst as i}<input type="hidden" name="instrument" value={i} />{/each}

		<label for="country">Country</label>
		<Combobox items={countryItems} bind:value={cc} flag label="Country"
			placeholder="Search a country" group="Countries" />
		<input type="hidden" name="country" value={cc} />

		<label for="region">Region</label>
		{#if geo}
			<Combobox items={regionItems} bind:value={region} label="Region"
				placeholder="Search a region" group="Regions" noMatch="No region matches that." />
		{:else}
			<p class="hint">No map for this country yet, so ads cannot be placed on it.</p>
		{/if}
		<input type="hidden" name="region" value={region ?? ''} />

		<label for="address">Rehearsal room or studio address</label>
		<input id="address" name="address" type="text" bind:value={address} placeholder="Kallidromiou 42, Exarchia" />

		<p class="fieldname">Drop the pin{region ? '' : ' (pick a region first)'}</p>
		{#if geo && region}
			<MapView {geo} pickable onpick={(p) => (pin = p)} />
			<p class="hint" style="margin-top:7px">
				The public map shows this shifted by up to 700m. Nobody gets the exact address of a
				room full of gear out of a browser.
			</p>
		{:else}
			<p class="hint">The map opens once a region is chosen.</p>
		{/if}
		<input type="hidden" name="pin_lat" value={pin?.lat ?? ''} />
		<input type="hidden" name="pin_lng" value={pin?.lng ?? ''} />

		<label for="genres">Genre</label>
		<Combobox items={GENRES.map(([id, l]) => ({ id, label: l, keys: [fold(l), id] }))}
			bind:value={gen} multi label="Genres" placeholder="thrash, doom, post-rock"
			group="Genres" noMatch="No genre matches that." />
		{#each gen as g}<input type="hidden" name="genre" value={g} />{/each}

		<label for="commitment">How serious</label>
		<div class="radiorow">
			{#each COMMITMENTS as [id, l]}
				<label class="radiopill" class:on={commitment === id}>
					<input type="radio" name="commitment" value={id} bind:group={commitment} />
					{l}
				</label>
			{/each}
		</div>

		<label class="checkline">
			<input type="checkbox" name="paid" bind:checked={paid} />
			This is a paid position
		</label>

		<label for="socials">Where you want to be contacted</label>
		<p class="hint" style="margin:0 0 7px">Pick every platform you actually check, then paste each link.</p>
		<Combobox items={SOCIAL_KINDS.map(([id, l]) => ({ id, label: l, keys: [fold(l), id] }))}
			bind:value={socialKinds} multi label="Socials" placeholder="instagram, facebook, tiktok"
			group="Socials" noMatch="No platform matches that." />
		{#each socialKinds as kind (kind)}
			<input type="hidden" name="social_kind" value={kind} />
			<label for="social-{kind}" class="fieldname" style="margin-top:10px">
				{SOCIAL_KINDS.find(([id]) => id === kind)?.[1] ?? kind} link
			</label>
			<input id="social-{kind}" name="social_url" type="text"
				value={socialLinks[kind] ?? ''}
				oninput={(e) => (socialLinks[kind] = e.currentTarget.value)}
				placeholder="https://{kind}.com/yourband" />
		{/each}

		<label for="email">Your email, for the renewal link only</label>
		<input id="email" name="email" type="email" bind:value={email} placeholder="you@example.com" />

		{#if form?.error}<p class="err">{form.error}</p>{/if}

		<button class="go" type="submit" disabled={!ready}>Send</button>
	</form>
{/if}
