<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
	let id = $state('');
	let token = $state('');
	const viaNudge = $derived(!!(data.nudgeId && data.nudge) && !form?.renewed);
</script>

{#if viaNudge}
	<form class="form step veil" method="POST" action="?/nudge" use:enhance>
		<p class="lab">Renew an ad</p>
		<p class="hint">One click and it's up for another 14 days.</p>
		<input type="hidden" name="id" value={data.nudgeId} />
		<input type="hidden" name="nudge" value={data.nudge} />
		<button class="go" type="submit">Renew now</button>
	</form>
{/if}

<form class="form step veil" method="POST" action="?/ping" use:enhance>
	<p class="lab">{viaNudge ? 'Or renew by hand' : 'Renew an ad'}</p>
	<p class="hint">Paste the token you saved. Every ping keeps the ad up for another 14 days.</p>

	<label for="public_id">Ad code</label>
	<input id="public_id" name="public_id" type="text" bind:value={id} placeholder="k3f9qa" />

	<label for="token">Token</label>
	<input id="token" name="token" type="text" bind:value={token} placeholder="XXXX-XXXX-XXXX-XXXX" />

	<button class="go" type="submit" disabled={!id || !token}>Ping</button>

	{#if form?.renewed}
		<div class="tokenbox step veil" style="border-color:var(--marker);margin-top:20px">
			<h2 style="color:var(--marker)">Alive until {form.until}</h2>
			<p style="font-size:13px;margin:0">
				Ping it again any time before then. The clock restarts from today rather than stacking,
				so an ad cannot be pushed out half a year on the day it is posted.
			</p>
		</div>
	{:else if form?.error}
		<p class="err">{form.error}</p>
	{/if}

	<p class="hint" style="margin-top:16px">
		A one click renewal link also goes to the email on the ad three days before it expires.
	</p>
</form>
