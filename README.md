# find-a-band

Standing "musicians wanted" ads. A band posts what it is missing and where;
a musician filters by instrument and genre and contacts the band on the
socials it already uses. No accounts, no matching, no chat, no CVs.

The thing this replaces is the Instagram story: you had to already follow the
band, and be looking within 24 hours. Here the ad sits still and is searchable.
The counterweight is a hard 14 day life, so nothing on the board is stale.

## Running it

```bash
cp .env.example .env      # set DATABASE_URL
npm install
npm run build
npm start
```

`npm start` and `npm run dev` both run `scripts/bootstrap.js` first. Nothing
else needs doing to a fresh Postgres.

## The database gate

`scripts/bootstrap.js` is the only thing standing between a deploy and a
half-migrated database serving traffic. It:

1. refuses to continue without `DATABASE_URL`, with a message saying so
2. creates the extensions the schema needs, before any migration runs
   (`citext` is used as a column type, so it cannot wait)
3. decides whether the database is **empty** or **populated** by counting
   tables in `public`, and says which out loud
4. applies every migration in `drizzle/` that has not run, each in its own
   transaction
5. loads reference data (instruments, genres, 194 countries, 58 regions),
   idempotently, so new entries arrive with the next deploy
6. seeds demo ads only on a fresh database and only when `SEED_DEMO=true`

If any step throws, it prints the failing migration and the Postgres error
and exits `1`. `npm start` stops there. The server never comes up against a
schema it does not understand, because a partly-migrated site fails per
request in ways that look like application bugs.

Two guards worth knowing about:

- **Immutable history.** Each applied migration's SHA-256 is stored. Editing
  a migration that has already run is refused, rather than silently skipped.
- **Advisory lock.** Two instances booting at once cannot both migrate.

```
$ npm start
  find-a-band  database bootstrap
   extensions ok (pgcrypto, citext, cube, earthdistance, pg_trgm)
   database is empty, creating the schema from scratch
   applied 3 migrations: 0000_supreme_champions.sql, 0001_functions.sql, ...
   reference data: 10 instruments, 14 genres, 194 countries, 58 regions
   ready
```

```
$ npm start          # with a broken migration
   bootstrap failed, the server will not start
   migration 0003_broken.sql failed and was rolled back.
     column "oops" of relation "ad" contains null values
```

## No accounts

An ad belongs to whoever holds its edit token. The token is 20 random bytes,
shown once on screen, and the row stores only `sha256(token)`. It cannot be
recovered or reset, which is stated plainly on the screen that shows it.

The email on an ad is never public. It exists for the renewal link, which is
the escape hatch when the token is lost.

`ping_ad(public_id, token)` extends an ad by 14 days. It uses
`greatest(expires_at, now() + 14 days)`, so pings do not stack: an ad cannot
be pushed out half a year on the day it is posted. It returns `null` for both
a wrong token and a missing ad, so the endpoint cannot be used to discover
which `public_id`s exist.

## Location

Ads carry two positions. `lat/lng` is where the rehearsal room actually is,
with an optional street address, and neither is ever sent to a browser.
`display_lat/display_lng` is the same point pushed up to 700m in a random
direction, and that is what the map draws. A band should be findable without
publishing the location of a room full of gear.

## Maps

No tile server, no API key. `src/lib/data/geo/*.json` holds pre-projected SVG
paths per country: admin-1 regions dissolved from Natural Earth, simplified
with Ramer-Douglas-Peucker to about one output pixel, 13-38 KB each. Each file
carries the lon/lat window it was projected from, so the browser can turn a
click into coordinates and the server can turn coordinates back into a point
on the same frame.

Only the selected country's file loads. Adding a country is a build-time
script, not a runtime cost.

Pins counter-scale against the viewBox, so they hold one size on screen at
every zoom level. Zooming in sharpens the location rather than inflating the
label.

## Ranking, not filtering

`liveAds()` returns everything live in a country and the client ranks it:
instrument match 46, each genre overlap 20, right region 24. Nothing is
hidden. Hard filters produce empty pages, and an empty page on a first visit
is what kills a board before its network exists.

## Layout

```
scripts/bootstrap.js        the gate described above
drizzle/                    migrations, applied in filename order
src/lib/server/db/schema.ts Drizzle schema, the source of truth
src/lib/server/geo.ts       project / unproject / jitter
src/lib/server/token.ts     mint, hash, constant-time compare
src/lib/components/         Combobox, MapView
src/routes/                 / (find), /post, /renew, /api/ads
src/lib/data/               countries, per-country geometry, demo ads
```

## Not built yet

- Email: verification, the renewal nudge on day 11, forwarding applications.
  `ad_needs_reminder` selects the rows; nothing sends them.
- `reap_expired_ads()` exists but nothing calls it on a schedule. Expiry is a
  predicate in `ad_live`, so this only reclaims rows.
- Rate limiting: the `rate_bucket` table is there, unused. With no accounts
  this and `report` are the only levers against abuse.
- Impersonation: anyone can post an ad pointing at someone else's Instagram.
  The `report` table has a reason for it; the real fix is procedural.
