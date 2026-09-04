/** Shared with the seed lists in scripts/bootstrap.js. Slugs are the API
 *  contract; labels are display only. Used by both the filter form and
 *  the results page, so it lives here rather than duplicated in each. */
export const INSTRUMENTS = [
	['drums', 'Drums'], ['bass', 'Bass'], ['rhythm-guitar', 'Rhythm guitar'],
	['lead-guitar', 'Lead guitar'], ['vocals', 'Vocals'], ['keys', 'Keys'], ['violin', 'Violin'],
	['sax', 'Sax'], ['harmonica', 'Harmonica']
] as const;

export const GENRES = [
	['thrash', 'Thrash'], ['death-metal', 'Death metal'], ['black-metal', 'Black metal'],
	['heavy-metal', 'Heavy metal'], ['doom-stoner', 'Doom / Stoner'], ['hardcore', 'Hardcore'],
	['punk', 'Punk'], ['grunge', 'Grunge'], ['alt-rock', 'Alt rock'], ['prog', 'Prog'],
	['classic-rock', 'Classic rock'], ['blues-rock', 'Blues rock'], ['post-rock', 'Post-rock'],
	['indie', 'Indie']
] as const;

/** Matches the `commitment` enum in schema.ts. A ranking weight like genre,
 *  never a hard filter, and never coupled to the separate `paid` boolean. */
export const COMMITMENTS = [
	['casual', 'Casual'], ['serious', 'Serious'], ['professional', 'Professional']
] as const;

/** Matches the `ad_kind` enum in schema.ts. `gig` and `rehearsal` are the
 *  same mechanism underneath (a dated, short-term ask with `event_at` set)
 *  and differ only in label; `member` is the original, undated, standing
 *  "wanted" post. */
export const AD_KINDS = [
	['member', 'Looking for a member'], ['gig', 'One-off gig'], ['rehearsal', 'Rehearsal / fill-in']
] as const;

/** Matches the `link_kind` enum in schema.ts, minus `email`: that one stays
 *  the private renewal-link address, not a public contact option here. */
export const SOCIAL_KINDS = [
	['instagram', 'Instagram'], ['facebook', 'Facebook'], ['twitter', 'Twitter / X'],
	['tiktok', 'TikTok'], ['youtube', 'YouTube'], ['spotify', 'Spotify'],
	['bandcamp', 'Bandcamp'], ['soundcloud', 'SoundCloud'], ['website', 'Website']
] as const;

export const LABEL: Record<string, string> = Object.fromEntries([
	...INSTRUMENTS, ...GENRES, ...COMMITMENTS, ...SOCIAL_KINDS, ...AD_KINDS
]);
