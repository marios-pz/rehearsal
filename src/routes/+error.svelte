<script lang="ts">
	import { page } from '$app/state';
	const err = $derived(page.error);
</script>

<div class="down-backdrop">
	<div class="down-modal torn" class:alarm={err?.dbDown}>
		{#if err?.dbDown}
			<p class="down-big">Database down</p>
			<p class="down-mid">We are in the process of fixing it.</p>
			<p class="down-small">please contact admin on marios-pz@proton.me</p>
		{:else}
			<p class="down-big">{page.status}</p>
			<p class="down-mid">{err?.message ?? 'Something went wrong.'}</p>
			<a class="social" href="/">&larr; Back to the board</a>
		{/if}
	</div>
</div>

<style>
	/* A true popup: fixed over the whole viewport, nav and brand included,
	   rather than just swapping out the page content in place. A dead
	   database means there is nothing behind it worth seeing anyway. */
	.down-backdrop {
		position: fixed; inset: 0; z-index: 500; display: flex;
		align-items: center; justify-content: center; padding: 20px;
		background: rgba(5, 5, 8, .88); backdrop-filter: blur(2px);
	}
	.down-modal {
		max-width: 420px; width: 100%; background: var(--pane); border: 1px solid var(--line);
		padding: 26px 24px; text-align: center; transform: rotate(-1deg);
	}
	.down-modal.alarm { border-color: var(--stamp); }
	.down-big {
		font-family: var(--disp); text-transform: uppercase; font-weight: 400;
		font-size: clamp(26px, 6vw, 38px); line-height: .95; margin: 0 0 10px;
		color: var(--stamp); text-shadow: 3px 3px 0 var(--marker);
	}
	.down-mid { font-size: 14px; color: var(--ink); margin: 0 0 16px; }
	.down-small {
		font-size: 10.5px; letter-spacing: .05em; color: var(--dim); margin: 0;
		text-transform: none;
	}
</style>
