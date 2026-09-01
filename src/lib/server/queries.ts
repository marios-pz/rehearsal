import { sql } from 'drizzle-orm';
import { db } from './db';

export type AdRow = {
	public_id: string; band_name: string; blurb: string;
	region_code: string; country_code: string;
	display_lat: number; display_lng: number;
	commitment: 'casual' | 'serious' | 'professional';
	paid: boolean; days_left: number;
	needs: string[]; genres: string[];
	link_kind: string | null; link_handle: string | null;
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
		       a.display_lat, a.display_lng, a.commitment, a.paid,
		       greatest(0, ceil(extract(epoch from a.expires_at - now()) / 86400))::int as days_left,
		       coalesce(array(select r.instrument from ad_role r
		                       where r.ad_id = a.id and r.filled_at is null), '{}') as needs,
		       coalesce(array(select g.genre from ad_genre g where g.ad_id = a.id), '{}') as genres,
		       (select l.kind::text from ad_link l where l.ad_id = a.id limit 1) as link_kind,
		       (select l.handle from ad_link l where l.ad_id = a.id limit 1) as link_handle
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

export async function pingAd(publicId: string, token: string): Promise<Date | null> {
	const rows = await db.execute(sql`
		select ping_ad(${publicId}, ${token.trim().toUpperCase()}) as expires_at
	`);
	const v = (rows as unknown as { expires_at: string | null }[])[0]?.expires_at;
	return v ? new Date(v) : null;
}
