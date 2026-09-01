<script lang="ts">
	import { fold, score, highlight } from '$lib/fuzzy';

	type Item = { id: string; label: string; sub?: string | null; keys: string[]; right?: string };

	let {
		items, value = $bindable(), multi = false, placeholder = '', label = '',
		group = 'Matches', noMatch = 'Nothing matches that.', flag = false, onchange
	}: {
		items: Item[];
		value: string | string[] | null;
		multi?: boolean;
		placeholder?: string;
		label?: string;
		group?: string;
		noMatch?: string;
		flag?: boolean;
		onchange?: (v: any) => void;
	} = $props();

	let q = $state('');
	let open = $state(false);
	let cur = $state(0);
	let input: HTMLInputElement;
	const listId = `cb-${Math.random().toString(36).slice(2, 8)}`;

	const chosen = $derived(multi ? ((value as string[]) ?? []) : value ? [value as string] : []);
	const matches = $derived.by(() => {
		const f = fold(q);
		let list = items.filter((i) => !chosen.includes(i.id));
		if (f) {
			list = list
				.map((it) => ({ it, s: score(it.keys, f) }))
				.filter((x) => x.s > 0)
				.sort((a, b) => b.s - a.s || a.it.label.length - b.it.label.length)
				.map((x) => x.it);
		}
		return list.slice(0, 60);
	});

	const flagOf = (cc: string) =>
		String.fromCodePoint(...[...cc].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));

	function pick(id: string) {
		value = multi ? [...chosen, id] : id;
		q = ''; cur = 0;
		if (!multi) open = false;
		onchange?.(value);
	}
	function remove(id: string) {
		value = multi ? chosen.filter((x) => x !== id) : null;
		onchange?.(value);
	}
	function key(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') { e.preventDefault(); open = true; cur = Math.min(cur + 1, matches.length - 1); }
		else if (e.key === 'ArrowUp') { e.preventDefault(); cur = Math.max(cur - 1, 0); }
		else if (e.key === 'Enter' && open && matches[cur]) { e.preventDefault(); pick(matches[cur].id); }
		else if (e.key === 'Escape') open = false;
		else if (e.key === 'Backspace' && !q && chosen.length) remove(chosen[chosen.length - 1]);
	}
	const labelOf = (id: string) => items.find((i) => i.id === id)?.label ?? id;
</script>

<div class="cb">
	<div class="field" class:focus={open} onclick={() => input.focus()} role="presentation">
		{#each chosen as id (id)}
			<span class="token">
				{#if flag}<span class="flg">{flagOf(id)}</span>{/if}{labelOf(id)}
				<button type="button" aria-label="Remove {labelOf(id)}"
					onmousedown={(e) => { e.preventDefault(); remove(id); }}>&times;</button>
			</span>
		{/each}
		<input bind:this={input} bind:value={q} type="text" autocomplete="off" role="combobox"
			aria-expanded={open} aria-controls={listId} aria-label={label}
			placeholder={chosen.length && multi ? 'add another' : placeholder}
			onfocus={() => (open = true)}
			onblur={() => setTimeout(() => (open = false), 130)}
			oninput={() => { open = true; cur = 0; }}
			onkeydown={key} />
	</div>

	{#if open}
		<div class="menu" id={listId} role="listbox">
			{#if matches.length}
				<div class="grp">{group}</div>
				{#each matches as it, i (it.id)}
					{@const [a, m, z] = highlight(it.label, fold(q))}
					<button class="opt" class:cur={i === cur} role="option" aria-selected={i === cur}
						type="button" onmousedown={(e) => { e.preventDefault(); pick(it.id); }}>
						{#if flag}<span class="flg">{flagOf(it.id)}</span>{/if}
						<span>{a}<mark>{m}</mark>{z}{#if it.sub}<span class="sub">{it.sub}</span>{/if}</span>
						{#if it.right}<span class="rt">{@html it.right}</span>{/if}
					</button>
				{/each}
			{:else}
				<div class="empty">{noMatch}</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.cb { position: relative; }
	.field {
		display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
		background: var(--pane); border: 1px solid var(--line); padding: 7px 9px; cursor: text;
		transition: border-color .2s var(--ease), box-shadow .2s var(--ease);
	}
	.field.focus { border-color: var(--ink); box-shadow: 0 0 0 1px var(--ink); }
	.field input {
		font: inherit; flex: 1; min-width: 110px; background: transparent;
		color: var(--ink); border: 0; outline: 0; padding: 4px 2px;
	}
	.field input::placeholder { color: var(--dim); }
	.token {
		display: inline-flex; align-items: center; gap: 6px; background: var(--marker);
		color: #08080a; font-size: 11.5px; font-weight: 700; letter-spacing: .05em;
		text-transform: uppercase; padding: 4px 5px 4px 8px; animation: pop .22s var(--ease);
		transform: rotate(-1.6deg);
	}
	.token:nth-child(even) { transform: rotate(1.4deg); }
	@keyframes pop { from { transform: scale(.8); opacity: 0; } }
	.token button {
		font: inherit; background: none; border: 0; color: #08080a; cursor: pointer;
		font-size: 13px; line-height: 1; padding: 6px 4px; margin: -6px -4px -6px 2px; opacity: .65;
	}
	.token button:hover { opacity: 1; }
	.menu {
		position: absolute; z-index: 40; left: 0; right: 0; top: calc(100% + 4px);
		background: var(--pane); border: 1px solid var(--ink); max-height: 250px;
		overflow: auto; animation: drop .18s var(--ease);
	}
	@keyframes drop { from { opacity: 0; transform: translateY(-6px); } }
	.grp {
		font-size: 9px; letter-spacing: .2em; text-transform: uppercase;
		color: var(--dim); padding: 8px 11px 4px;
	}
	.opt {
		font: inherit; display: flex; align-items: center; gap: 9px; width: 100%;
		text-align: left; background: transparent; border: 0; color: var(--ink);
		padding: 8px 11px; cursor: pointer; font-size: 13px;
	}
	.opt:hover, .opt.cur { background: #22222a; }
	.opt .rt {
		margin-left: auto; font-size: 10px; letter-spacing: .07em;
		text-transform: uppercase; color: var(--dim); white-space: nowrap;
	}
	.opt .sub { font-size: 11px; color: var(--dim); margin-left: 6px; }
	mark { background: none; color: var(--marker); }
	.empty { padding: 12px 11px; font-size: 12px; color: var(--dim); }
	.flg { font-size: 17px; line-height: 1; }
</style>
