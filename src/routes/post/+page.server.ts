import { fail } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { mintToken, hashToken, publicId, hashIp } from '$lib/server/token';
import { jitter, type GeoFile } from '$lib/server/geo';
import { INSTRUMENTS, GENRES } from '$lib/taxonomy';
import { env } from '$env/dynamic/private';
import countries from '$lib/data/countries.json';

const INSTRUMENT_SLUGS: Set<string> = new Set(INSTRUMENTS.map(([slug]) => slug));
const GENRE_SLUGS: Set<string> = new Set(GENRES.map(([slug]) => slug));

const GEO = import.meta.glob('$lib/data/geo/*.json', { eager: true, import: 'default' });
const geoFor = (cc: string) =>
	(Object.entries(GEO).find(([p]) => p.endsWith(`/${cc}.json`))?.[1] as GeoFile) ?? null;

export const load: PageServerLoad = async () => ({
	countries,
	withGeo: Object.keys(GEO).map((p) => p.split('/').pop()!.replace('.json', ''))
});

export const actions: Actions = {
	default: async ({ request, getClientAddress }) => {
		const f = await request.formData();
		const bandName = String(f.get('band_name') ?? '').trim();
		const cc = String(f.get('country') ?? '').toUpperCase();
		const regionCode = String(f.get('region') ?? '').trim();
		const social = String(f.get('social') ?? '').trim();
		const email = String(f.get('email') ?? '').trim();
		const address = String(f.get('address') ?? '').trim() || null;
		const lat = Number(f.get('pin_lat')), lng = Number(f.get('pin_lng'));
		const instruments = f.getAll('instrument').map(String).filter((i) => INSTRUMENT_SLUGS.has(i));
		const genres = f.getAll('genre').map(String).filter((g) => GENRE_SLUGS.has(g));
		const paid = f.get('paid') === 'on';
		const values = { bandName, cc, regionCode, social, email, address, instruments, genres, paid };

		const geo = geoFor(cc);
		if (!bandName) return fail(400, { ...values, error: 'The band needs a name.' });
		if (!geo) return fail(400, { ...values, error: 'No map for that country yet.' });
		if (!regionCode) return fail(400, { ...values, error: 'Pick a region.' });
		if (!Number.isFinite(lat) || !Number.isFinite(lng))
			return fail(400, { ...values, error: 'Drop the pin on the map so people know where to come.' });
		if (!instruments.length)
			return fail(400, { ...values, error: 'Pick at least one instrument you need.' });
		// A generous pad around the country's own frame, not a strict border
		// check: Leaflet lets you click just past the edge while panning.
		const [LO0, LO1, LA0, LA1] = geo.bx;
		const pad = Math.max(LO1 - LO0, LA1 - LA0) * 0.5;
		if (lng < LO0 - pad || lng > LO1 + pad || lat < LA0 - pad || lat > LA1 + pad)
			return fail(400, { ...values, error: 'That pin landed outside the country. Drop it again.' });
		if (!social) return fail(400, { ...values, error: 'Give one place where you want to be contacted.' });
		if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
			return fail(400, { ...values, error: 'The email is only used for the renewal link. It is never shown.' });

		const shown = jitter(lat, lng, 700);
		const token = mintToken();
		const id = publicId();
		const kind = /instagram/i.test(social) ? 'instagram'
			: /youtu/i.test(social) ? 'youtube'
			: /bandcamp/i.test(social) ? 'bandcamp'
			: /soundcloud/i.test(social) ? 'soundcloud'
			: /tiktok/i.test(social) ? 'tiktok' : 'website';

		try {
			await db.transaction(async (tx) => {
				const rows = await tx.execute(sql`
					insert into ad (public_id, band_name, blurb, commitment, paid, country_code, region_code,
					                lat, lng, address, display_lat, display_lng,
					                contact_email, status, verified_at, published_at, edit_token_hash,
					                created_ip_hash)
					values (${id}, ${bandName}, '', 'casual', ${paid}, ${cc}, ${regionCode},
					        ${lat}, ${lng}, ${address}, ${shown.lat}, ${shown.lng},
					        ${email}, 'published', now(), now(), ${hashToken(token)},
					        ${hashIp(getClientAddress(), env.IP_SALT ?? 'dev')})
					returning id
				`);
				const adId = (rows as unknown as { id: string }[])[0].id;
				await tx.execute(sql`
					insert into ad_link (ad_id, kind, handle) values (${adId}, ${kind}::link_kind, ${social})
				`);
				for (const slug of instruments) {
					await tx.execute(sql`insert into ad_role (ad_id, instrument) values (${adId}, ${slug})`);
				}
				for (const slug of genres) {
					await tx.execute(sql`insert into ad_genre (ad_id, genre) values (${adId}, ${slug})`);
				}
			});
		} catch (err) {
			console.error('ad insert failed', err);
			return fail(500, { ...values, error: 'Could not save the ad. Try again.' });
		}

		// The only time the plaintext token exists. It is not stored, not
		// logged, and not recoverable: the row holds a SHA-256 of it.
		return { posted: true, publicId: id, token, bandName, regionCode, cc };
	}
};
