<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	let { children } = $props();

	// `.veil`'s entrance animation ends holding a resolved-but-not-literal
	// `transform`/`filter` (an identity matrix, blur(0px)) even with
	// fill-forwards; either one creates a stacking context, which then
	// traps a descendant dropdown's z-index inside that step, unable to
	// paint above the *next* step once that step has content under it.
	// Dropping the class once the animation ends removes every animated
	// property outright, so nothing lingers to create one.
	function clearVeil(e: AnimationEvent) {
		(e.target as HTMLElement).classList?.remove('veil');
	}
</script>

<div class="shell" onanimationend={clearVeil}>
	<div class="top">
		<div>
			<p class="kicker">Find your band</p>
			<h1 class="pop">Rehearsals</h1>
		</div>
		<nav class="switch">
			<a class="pop" href="/" aria-current={page.url.pathname === '/' ? 'page' : undefined}>Find</a>
			<a class="pop" href="/post" aria-current={page.url.pathname === '/post' ? 'page' : undefined}>Post</a>
			<a class="pop" href="/renew" aria-current={page.url.pathname === '/renew' ? 'page' : undefined}>Renew</a>
			<a class="pop" href="/support" aria-current={page.url.pathname === '/support' ? 'page' : undefined}>Support</a>
		</nav>
	</div>
	{@render children()}
	<a class="coffee-fab torn" href="https://buymeacoffee.com/mariospz" target="_blank" rel="noopener noreferrer">
		Buy me a coffee
	</a>
</div>
