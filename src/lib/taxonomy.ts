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

export const LABEL: Record<string, string> = Object.fromEntries([...INSTRUMENTS, ...GENRES]);
