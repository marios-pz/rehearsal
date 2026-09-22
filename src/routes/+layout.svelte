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
	<!-- The board still needs one h1 for search and for screen readers; it
	     just isn't the thing you look at any more. -->
	<h1 class="sr-only">Rehearsals</h1>
	<div class="top">
		<a class="mark" href="/support" aria-label="Rehearsals, about and support">
			<span aria-hidden="true">R</span>
		</a>
		<nav class="switch">
			<a href="/" aria-current={page.url.pathname === '/' ? 'page' : undefined}>Find</a>
			<a href="/post" aria-current={page.url.pathname === '/post' ? 'page' : undefined}>Post</a>
			<a href="/renew" aria-current={page.url.pathname === '/renew' ? 'page' : undefined}>Renew</a>
			<a href="/support" aria-current={page.url.pathname === '/support' ? 'page' : undefined}
				>Support</a
			>
		</nav>
	</div>
	{@render children()}
	<a
		class="coffee-fab"
		href="https://buymeacoffee.com/mariospz"
		target="_blank"
		rel="noopener noreferrer"
	>
		Buy me a coffee
	</a>
</div>
