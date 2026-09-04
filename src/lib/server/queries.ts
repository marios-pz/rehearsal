import { sql } from 'drizzle-orm';
import { db } from './db';

export type AdLink = { kind: string; handle: string };

export type AdRow = {
	public_id: string; band_name: string; blurb: string;
	region_code: string; country_code: string;
	display_lat: number; display_lng: number;
	commitment: 'casual' | 'serious' | 'professional';
	kind: 'member' | 'gig' | 'rehearsal';
	event_at: string | null;
	paid: boolean; days_left: number;
	view_count: number;
	needs: string[]; genres: string[];
	links: AdLink[];
};

/**
 * Everything live in one country. Deliberately unfiltered by instrument or
 * genre: the client ranks and never hides a row. Hard filters produce empty
 * pages, and an empty page on a first visit is what kills a board before
 * the network exists.
 */
export async function liveAds(countryCode: string): Promise<AdRow[]> {
	const rows = await db.execute(sql`
		select a.public_id, a.band_name, a.blurb, a.region_code, a.country_code,
		       a.display_lat, a.display_lng, a.commitment, a.kind, a.event_at,
		       a.paid, a.view_count,
		       greatest(0, ceil(extract(epoch from a.expires_at - now()) / 86400))::int as days_left,
		       coalesce(array(select r.instrument from ad_role r
		                       where r.ad_id = a.id and r.filled_at is null), '{}') as needs,
		       coalesce(array(select g.genre from ad_genre g where g.ad_id = a.id), '{}') as genres,
		       coalesce((select json_agg(json_build_object('kind', l.kind::text, 'handle', l.handle))
		                 from ad_link l where l.ad_id = a.id), '[]') as links
		from ad_live a
		where a.country_code = ${countryCode}
		order by a.published_at desc
	`);
	return rows as unknown as AdRow[];
}

export async function adCountsByCountry(): Promise<Record<string, number>> {
	const rows = await db.execute(sql`
		select country_code, count(*)::int as n from ad_live group by country_code
	`);
	return Object.fromEntries(
		(rows as unknown as { country_code: string; n: number }[]).map((r) => [r.country_code, r.n])
	);
}

/** The click that opens an ad's full detail. Counted in the database, keyed
 *  on a hashed viewer so refresh-spam on the same ad within the window is
 *  absorbed rather than inflating the count; see record_ad_view(). Returns
 *  null for an id that is not (or no longer) live, same as a bad token
 *  elsewhere: nothing here distinguishes "wrong id" from "expired". */
export async function recordAdView(publicId: string, viewerHash: Buffer): Promise<number | null> {
	const rows = await db.execute(sql`
		select record_ad_view(${publicId}, ${viewerHash.toString('hex')}) as view_count
	`);
	const v = (rows as unknown as { view_count: number | null }[])[0]?.view_count;
	return v ?? null;
}

export async function pingAd(publicId: string, token: string): Promise<Date | null> {
	const rows = await db.execute(sql`
		select ping_ad(${publicId}, ${token.trim().toUpperCase()}) as expires_at
	`);
	const v = (rows as unknown as { expires_at: string | null }[])[0]?.expires_at;
	return v ? new Date(v) : null;
}

/** The verify-link click. On success the ad flips to published; the edit
 *  token itself is minted separately, by the caller, only once this
 *  returns true. */
export async function verifyAd(publicId: string, verifyToken: string): Promise<boolean> {
	const rows = await db.execute(sql`
		select verify_ad(${publicId}, ${verifyToken.trim().toUpperCase()}) as ok
	`);
	return Boolean((rows as unknown as { ok: boolean }[])[0]?.ok);
}

/** The day-11 reminder email's "renew now" link: a single-use token minted
 *  just for that email, never the real edit token (see the migration
 *  comment for why). */
export async function renewViaNudge(publicId: string, nudgeToken: string): Promise<Date | null> {
	const rows = await db.execute(sql`
		select renew_via_nudge(${publicId}, ${nudgeToken.trim().toUpperCase()}) as expires_at
	`);
	const v = (rows as unknown as { expires_at: string | null }[])[0]?.expires_at;
	return v ? new Date(v) : null;
}
