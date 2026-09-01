<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	let { children } = $props();
	const TITLES: Record<string, string> = {
		'/': 'Find a band',
		'/results': 'Results',
		'/post': 'Post an ad',
		'/renew': 'Renew an ad'
	};
	const title = $derived(TITLES[page.url.pathname] ?? 'Find a band');
</script>

<div class="shell">
	<div class="top">
		<div>
			<p class="kicker">Musicians wanted, standing ads</p>
			<h1>{title}</h1>
		</div>
		<nav class="switch">
			<a href="/" aria-current={page.url.pathname === '/' ? 'page' : undefined}>Find</a>
			<a href="/post" aria-current={page.url.pathname === '/post' ? 'page' : undefined}>Post</a>
			<a href="/renew" aria-current={page.url.pathname === '/renew' ? 'page' : undefined}>Renew</a>
		</nav>
	</div>
	{@render children()}
</div>
