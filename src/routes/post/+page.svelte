<script lang="ts">
	import { enhance } from '$app/forms';
	import Combobox from '$lib/components/Combobox.svelte';
	import MapView from '$lib/components/MapView.svelte';
	import { fold } from '$lib/fuzzy';
	import { INSTRUMENTS, GENRES } from '$lib/taxonomy';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let cc = $state('GR');
	let region = $state<string | null>(null);
	let geo = $state<any>(null);
	let pin = $state<{ lat: number; lng: number } | null>(null);
	let bandName = $state('');
	let inst = $state<string[]>([]);
	let gen = $state<string[]>([]);
	let paid = $state(false);
	let social = $state('');
	let email = $state('');
	let copied = $state(false);

	$effect(() => { loadGeo(cc); });
	async function loadGeo(c: string) {
		geo = data.withGeo.includes(c)
			? (await import(`$lib/data/geo/${c}.json`)).default
			: null;
		region = null; pin = null;
	}

	const countryItems = $derived(
		data.countries.map((c: any) => ({
			id: c.c, label: c.n, sub: c.v && c.v !== c.n ? c.v : null, keys: c.k,
			right: data.withGeo.includes(c.c) ? '' : 'no map yet'
		}))
	);
	const regionItems = $derived(
		(geo?.regions ?? []).map((r: any) => ({ id: r.k, label: r.k, keys: [fold(r.k)] }))
	);
	const ready = $derived(!!(bandName && region && pin && inst.length && social && email));

	async function copy(text: string) {
		try { await navigator.clipboard.writeText(text); copied = true; } catch { copied = false; }
	}
</script>

{#if form?.posted}
	<div class="form step veil">
		<div class="tokenbox">
			<h2>Save this now</h2>
			<p style="font-size:13px;margin:0">
				The ad for <b>{form.bandName}</b> is live in {form.regionCode}.
			</p>

			<p class="hint" style="margin:14px 0 4px">Ad code</p>
			<div class="tokenval" style="border-style:solid;border-color:var(--line);color:var(--dim)">
				{form.publicId}
			</div>

			<p class="hint" style="margin:14px 0 4px">Token, shown once</p>
			<div class="tokenval">{form.token}</div>
			<button class="copy" type="button" onclick={() => copy(`${form.publicId}  ${form.token}`)}>
				{copied ? 'Copied' : 'Copy both'}
			</button>

			<div class="warn">
				This is the only thing that proves the ad is yours. It is shown once.
				<b>Leave this page and it is gone for good.</b> The server keeps a SHA-256 of it,
				so nobody, including us, can recover or reset it.
			</div>
			<p class="hint">
				Without it you cannot edit the ad, mark a spot as filled, take it down early, or ping it
				for another 14 days. A renewal link also goes to your email on day 11, so a lost token
				is survivable as long as the inbox works.
			</p>
			<a class="social" href="/post">Post another</a>
		</div>
	</div>
{:else}
	<form class="form step veil" method="POST" use:enhance>
		<p class="lab">Post an ad</p>
		<p class="hint">No account, no password. It runs for 14 days and then it is deleted.</p>

		<label for="band_name">Band name</label>
		<input id="band_name" name="band_name" type="text" maxlength="80"
			bind:value={bandName} placeholder="Rust Verdict" />

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
		<input id="address" name="address" type="text" placeholder="Kallidromiou 42, Exarchia" />

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

		<label class="checkline">
			<input type="checkbox" name="paid" bind:checked={paid} />
			This is a paid position
		</label>

		<label for="social">Where you want to be contacted</label>
		<input id="social" name="social" type="text" bind:value={social}
			placeholder="instagram.com/yourband" />

		<label for="email">Your email, for the renewal link only</label>
		<input id="email" name="email" type="email" bind:value={email} placeholder="you@example.com" />

		{#if form?.error}<p class="err">{form.error}</p>{/if}

		<button class="go" type="submit" disabled={!ready}>Send</button>
	</form>
{/if}
