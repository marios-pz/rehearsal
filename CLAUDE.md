# CLAUDE.md

Instructions for working on this codebase.

## What this is

A board of standing "musicians wanted" ads. A band posts what it is missing and where. A musician filters by instrument and genre and then contacts the band on the socials it already uses.

The thesis, which every design decision follows from: **the ad is persistent and searchable, and contact happens off-platform.** This replaces the Instagram story, where you had to already follow the band and be looking within 24 hours.

What this is deliberately _not_, and should not drift into:

- not a matching app. No double opt-in, no swiping, no compatibility score shown to both sides
- not a messaging app. No chat, no inbox, no notifications
- not a profile site. No user accounts, no CVs, no portfolios, no reputation
- not a marketplace. No payments, no escrow, no fees

If a change adds one of those, push back before writing it. Each one has been considered and rejected, and each one is how comparable products got heavy.

## Commands

```bash
npm install
npm run build          # must work without a database
npm start              # bootstrap gate, then serve
npm run dev            # bootstrap gate, then vite dev
npm run db:generate    # drizzle-kit generate, after editing schema.ts
npm run check          # svelte-check, keep at 0 errors 0 warnings
```

## Invariants

Do not break these without saying so explicitly.

**Ranking, never filtering.** `liveAds()` returns everything live in a country; the client sorts by score (instrument 46, each genre overlap 20, correct region 24). Nothing is hidden. Hard filters produce empty pages, and an empty page on a first visit kills a board before its network exists. If asked to "filter by genre", implement it as a weight.

**Tokens are stored hashed, never in plaintext.** `edit_token_hash` is `sha256(token)`. The token appears exactly once, in the action return value rendered on `/post`. Never log it, never email it in a way that persists it server-side, never add a recovery flow. The UI says it is unrecoverable and that must stay true.

**Exact positions never reach a browser.** `lat`, `lng` and `address` are private. `display_lat` and `display_lng` are the same point jittered up to 700m and are the only ones in any query, any API response, any prop. When adding a query, select the display pair. There is no reason for a band's rehearsal room address to be scrapeable.

**Ads live 14 days and are deleted.** Not archived, not soft-deleted. A board of dead bands is worse than the stories it replaces: the ad still looks live, the musician writes, nobody answers.

**Ping does not stack.** `greatest(expires_at, now() + interval '14 days')`. The earlier `greatest(now(), expires_at) + 14 days` let ten pings on day one buy half a year, which defeats the timer. Do not "fix" it back.

**The renew endpoint is deliberately vague.** A wrong token and a missing ad return the same message. Distinguishing them lets someone walk the `public_id` space to learn which ads exist.

**Migrations are immutable.** `scripts/bootstrap.js` stores each applied migration's SHA-256 and refuses to boot if one changed. To alter something, add a new migration. Do not edit a file in `drizzle/` that has run anywhere.

## Gotchas found the hard way

These cost time once. Do not rediscover them.

**The build must not need a database.** SvelteKit's analyse step imports every server module, so connecting at module load makes `npm run build` require a live Postgres. `src/lib/server/db/index.ts` is a lazy singleton behind a Proxy for exactly this reason. Keep it lazy.

**Extensions run before migrations, not inside them.** `citext` is used as a column type, so `create extension` has to happen first. That list lives in `EXTENSIONS` in `bootstrap.js`, not in `drizzle/`.

**`sveltekit` comes from `@sveltejs/kit/vite`**, not from `@sveltejs/vite-plugin-svelte`. The wrong import fails with a confusing "does not provide an export named 'sveltekit'".

**Map region geometry is still build-time; the basemap underneath it is not.** `tools/build-geo.py` produces `src/lib/data/geo/*.json` (pre-projected SVG paths, 13-38 KB per country) exactly as before — do not add a runtime GeoJSON fetch or a geocoding API for that part. What sits underneath changed: `MapView.svelte` now renders real Leaflet tiles from `tile.openstreetmap.org` (dark look via a CSS filter, not a dark-specific tile source, since the free keyless dark CDNs now gate behind an API key). `src/lib/geo.ts` has `pathToLatLngRings()`, which unprojects a region's stored path back to lat/lng so it can be drawn on top of real tiles. If a future dark tile source needs a key, that's one URL to change in `MapView.svelte`, nothing else.

**Overseas territories wreck map framing.** The Netherlands GeoJSON carries the Caribbean and the UK carries out to Gibraltar. Framing on the full bounding box shrinks the mainland to two pixels and the speck filter then deletes it. `build-geo.py` keeps only geometry near the largest landmass. Any new country needs a look at the rendered output, not just a byte count.

**Natural Earth granularity varies wildly.** Greece gets 14 admin-1 units, Germany 16, the UK 232 districts. The UK is dissolved into its 16 ITL-1 regions via the `region` property, configured in `GROUP_BY`. Check the region count when adding a country; anything over about 25 needs grouping or the picker is unusable.

**Leaflet's map instance gets exactly one teardown path.** `MapView.svelte` creates its `L.map()` in `onMount` and removes it in the function `onMount` returns. Also registering a separate `onDestroy(() => map.remove())` calls `.remove()` twice on unmount, which leaves the container in a state where the next `L.map()` on it throws "Map container is being reused by another instance" — intermittently, and only once something actually remounts onto that DOM node, which made it look like a race condition rather than what it was. One cleanup path, not two.

**Form POSTs need a matching origin.** adapter-node rejects cross-site form submissions. When testing with curl, set `ORIGIN` on the server and send an `Origin` header, and send `Accept: text/html` or you get the action payload as JSON instead of a rendered page.

## Conventions

**Svelte 5 runes.** `$state`, `$derived`, `$props`, `$effect`, `$bindable`. No stores, no `export let`. Where local state is seeded from `data`, wrap the initialiser in `untrack()` and say why in a comment.

**One combobox.** `Combobox.svelte` serves country, region, instruments and genres, single or multi. If a new picker is needed, extend it rather than writing a second one. The fuzzy scorer in `src/lib/fuzzy.ts` is shared: exact > prefix > substring > subsequence.

**Country search must accept local spellings.** The keys in `countries.json` come from three sources: mledoze native names and altSpellings, CLDR names for the viewer's locale, and a hand list for what people actually type. CLDR calls the Netherlands "Κάτω Χώρες"; nobody writes that, so "ολλανδια" is in the hand list. Expect a few of these per locale.

**Styling uses the CSS variables in `app.css`.** Do not introduce a framework, a component library, or a second colour palette. Display type is `--disp`, everything else is `--mono`.

**No em dashes in user-facing copy.** Use a full stop or a comma. This applies to labels, hints, errors and README prose.

**Progressive reveal is functional, not decorative.** Country unlocks region, region unlocks the map and the instrument picker, instruments unlock genre, genre unlocks results. Do not render a later step early "to save a click". Respect `prefers-reduced-motion`, which `.veil` already does.

## Adding things

**A country:** add it to `CITIES` in `tools/build-geo.py`, run the script, check the rendered map, commit the new `geo/XX.json`. `bootstrap.js` picks up regions automatically on next boot.

**An instrument or genre:** add to the arrays in `bootstrap.js` and to the matching constant in `src/lib/taxonomy.ts` (shared by the filter form and the results page). Seeding is idempotent, so it lands on the next deploy. Lookup tables, not enums, precisely so this is not a migration.

**A schema change:** edit `src/lib/server/db/schema.ts`, run `npm run db:generate`, review the SQL, commit both. For functions and views, write the migration by hand in `drizzle/` with `--> statement-breakpoint` between statements.

## Known gaps

Do not treat these as bugs; they are unbuilt.

- Email: verification, the day 11 renewal nudge, forwarding applications. `ad_needs_reminder` selects the rows, nothing sends them.
- `reap_expired_ads()` exists but nothing schedules it. Harmless: expiry is a predicate in `ad_live`, so this only reclaims rows.
- `rate_bucket` exists and is unused.
- Impersonation. Anyone can post an ad pointing at someone else's Instagram. `report` has a reason for it; the real fix is procedural, not schema.
- Hard deletion means no analytics survive. If metrics are wanted, write an anonymous row on delete (country, region, instruments, whether renewed). Never the name or the email.
