import {
	pgTable, pgEnum, text, uuid, char, bigint, integer, smallint, boolean,
	doublePrecision, timestamp, customType, primaryKey, index, uniqueIndex, check
} from 'drizzle-orm/pg-core';
import { sql, relations } from 'drizzle-orm';

/** citext and bytea have no first-class Drizzle types; declare them once. */
const citext = customType<{ data: string }>({ dataType: () => 'citext' });
const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

export const adStatus = pgEnum('ad_status', ['unverified', 'published', 'expired', 'hidden', 'removed']);
export const commitment = pgEnum('commitment', ['casual', 'serious', 'professional']);
export const linkKind = pgEnum('link_kind', [
	'instagram', 'facebook', 'youtube', 'tiktok', 'spotify', 'bandcamp', 'soundcloud', 'website', 'email'
]);

/* ------------------------------------------------------------------ */
/* Reference data. Lookup tables rather than enums: instruments and    */
/* genres get added constantly and ALTER TYPE is a nuisance in a       */
/* migration. Slugs are the API contract, labels are display only.     */
/* ------------------------------------------------------------------ */

export const country = pgTable('country', {
	code: char('code', { length: 2 }).primaryKey(),
	nameEn: text('name_en').notNull(),
	hasGeo: boolean('has_geo').notNull().default(false)
});

export const region = pgTable('region', {
	countryCode: char('country_code', { length: 2 }).notNull().references(() => country.code),
	code: text('code').notNull(),
	nameEn: text('name_en').notNull()
}, (t) => [primaryKey({ columns: [t.countryCode, t.code] })]);

export const instrument = pgTable('instrument', {
	slug: text('slug').primaryKey(),
	labelEn: text('label_en').notNull(),
	sort: smallint('sort').notNull().default(0)
});

export const genre = pgTable('genre', {
	slug: text('slug').primaryKey(),
	labelEn: text('label_en').notNull(),
	sort: smallint('sort').notNull().default(0)
});

/* ------------------------------------------------------------------ */
/* The ad. This is the whole product: a standing musicians-wanted post */
/* owned by whoever holds its edit token. No accounts anywhere.        */
/* ------------------------------------------------------------------ */

export const ad = pgTable('ad', {
	id: uuid('id').primaryKey().defaultRandom(),
	publicId: text('public_id').notNull().unique(),
	bandName: text('band_name').notNull(),
	blurb: text('blurb').notNull().default(''),
	commitment: commitment('commitment').notNull(),
	paid: boolean('paid').notNull().default(false),

	countryCode: char('country_code', { length: 2 }).notNull().references(() => country.code),
	regionCode: text('region_code'),

	// Exact position of the rehearsal room, plus the optional street
	// address. Neither is ever sent to a browser.
	lat: doublePrecision('lat').notNull(),
	lng: doublePrecision('lng').notNull(),
	address: text('address'),

	// What the public map draws: the same point pushed up to ~700m in a
	// deterministic direction, so a band is findable without publishing
	// the location of a room full of gear.
	displayLat: doublePrecision('display_lat').notNull(),
	displayLng: doublePrecision('display_lng').notNull(),
	showExact: boolean('show_exact').notNull().default(false),

	// Not public. Used for verification, the edit link, the renewal nudge.
	// Without accounts this is the only proof a real person is behind it.
	contactEmail: citext('contact_email').notNull(),

	status: adStatus('status').notNull().default('unverified'),
	verifiedAt: timestamp('verified_at', { withTimezone: true }),
	publishedAt: timestamp('published_at', { withTimezone: true }),

	// Ads die after 14 days and are deleted, not archived. A board of dead
	// bands is worse than the stories it replaces: the ad still looks live,
	// the musician writes, nobody answers.
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
		.default(sql`now() + interval '14 days'`),
	renewedCount: integer('renewed_count').notNull().default(0),
	remindedAt: timestamp('reminded_at', { withTimezone: true }),

	// SHA-256 of a token shown exactly once. Storing the hash means a
	// database leak does not hand out edit rights to every ad on the board.
	editTokenHash: bytea('edit_token_hash').notNull(),

	acceptsApplications: boolean('accepts_applications').notNull().default(true),
	createdIpHash: bytea('created_ip_hash'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [
	index('ad_country_idx').on(t.countryCode, t.regionCode, t.expiresAt),
	index('ad_expiry_idx').on(t.expiresAt),
	uniqueIndex('ad_public_id_idx').on(t.publicId),
	check('band_name_len', sql`length(btrim(${t.bandName})) between 1 and 80`),
	check('blurb_len', sql`length(${t.blurb}) <= 600`),
	check('lat_range', sql`${t.lat} between -90 and 90`),
	check('lng_range', sql`${t.lng} between -180 and 180`),
	check('published_implies_verified',
		sql`${t.status} <> 'published' or ${t.verifiedAt} is not null`)
]);

/* An ad routinely needs a drummer AND a bassist and fills them at
   different times, so open positions are rows with their own filled_at
   rather than a column on the ad. */
export const adRole = pgTable('ad_role', {
	adId: uuid('ad_id').notNull().references(() => ad.id, { onDelete: 'cascade' }),
	instrument: text('instrument').notNull().references(() => instrument.slug),
	filledAt: timestamp('filled_at', { withTimezone: true })
}, (t) => [
	primaryKey({ columns: [t.adId, t.instrument] }),
	index('ad_role_open_idx').on(t.instrument)
]);

export const adGenre = pgTable('ad_genre', {
	adId: uuid('ad_id').notNull().references(() => ad.id, { onDelete: 'cascade' }),
	genre: text('genre').notNull().references(() => genre.slug)
}, (t) => [
	primaryKey({ columns: [t.adId, t.genre] }),
	index('ad_genre_genre_idx').on(t.genre)
]);

/* The public contact points. The actual product: you find the ad here
   and message the band wherever the band already is. */
export const adLink = pgTable('ad_link', {
	adId: uuid('ad_id').notNull().references(() => ad.id, { onDelete: 'cascade' }),
	kind: linkKind('kind').notNull(),
	handle: text('handle').notNull()
}, (t) => [primaryKey({ columns: [t.adId, t.kind, t.handle] })]);

export const report = pgTable('report', {
	id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
	adId: uuid('ad_id').notNull().references(() => ad.id, { onDelete: 'cascade' }),
	reason: text('reason').notNull(),
	detail: text('detail'),
	ipHash: bytea('ip_hash'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [
	index('report_ad_idx').on(t.adId),
	check('reason_known',
		sql`${t.reason} in ('spam','impersonation','offensive','stale','other')`)
]);

/* Fixed-window counter keyed on hashed IP plus action. With no accounts
   this and the report table are the only levers against abuse. */
export const rateBucket = pgTable('rate_bucket', {
	key: text('key').primaryKey(),
	hits: integer('hits').notNull().default(0),
	windowStart: timestamp('window_start', { withTimezone: true }).notNull().defaultNow()
});

export const adRelations = relations(ad, ({ many }) => ({
	roles: many(adRole),
	genres: many(adGenre),
	links: many(adLink)
}));
export const adRoleRelations = relations(adRole, ({ one }) => ({
	ad: one(ad, { fields: [adRole.adId], references: [ad.id] })
}));
export const adGenreRelations = relations(adGenre, ({ one }) => ({
	ad: one(ad, { fields: [adGenre.adId], references: [ad.id] })
}));
export const adLinkRelations = relations(adLink, ({ one }) => ({
	ad: one(ad, { fields: [adLink.adId], references: [ad.id] })
}));

export type Ad = typeof ad.$inferSelect;
export type NewAd = typeof ad.$inferInsert;
