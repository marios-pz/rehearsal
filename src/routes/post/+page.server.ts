import { fail } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { mintToken, hashToken, publicId, hashIp } from '$lib/server/token';
import { jitter, type GeoFile } from '$lib/server/geo';
import { sendVerificationEmail } from '$lib/server/email';
import { INSTRUMENTS, GENRES, COMMITMENTS, SOCIAL_KINDS, AD_KINDS } from '$lib/taxonomy';
import { env } from '$env/dynamic/private';
import countries from '$lib/data/countries.json';

const INSTRUMENT_SLUGS: Set<string> = new Set(INSTRUMENTS.map(([slug]) => slug));
const GENRE_SLUGS: Set<string> = new Set(GENRES.map(([slug]) => slug));
const COMMITMENT_SLUGS: Set<string> = new Set(COMMITMENTS.map(([slug]) => slug));
const SOCIAL_KIND_SLUGS: Set<string> = new Set(SOCIAL_KINDS.map(([slug]) => slug));
const AD_KIND_SLUGS: Set<string> = new Set(AD_KINDS.map(([slug]) => slug));

const GEO = import.meta.glob('$lib/data/geo/*.json', { eager: true, import: 'default' });
const geoFor = (cc: string) =>
	(Object.entries(GEO).find(([p]) => p.endsWith(`/${cc}.json`))?.[1] as GeoFile) ?? null;

export const load: PageServerLoad = async () => ({
	countries,
	withGeo: Object.keys(GEO).map((p) => p.split('/').pop()!.replace('.json', ''))
});

export const actions: Actions = {
	default: async ({ request, getClientAddress, url }) => {
		const f = await request.formData();
		const bandName = String(f.get('band_name') ?? '').trim();
		const blurb = String(f.get('blurb') ?? '').trim().slice(0, 600);
		const cc = String(f.get('country') ?? '').toUpperCase();
		const regionCode = String(f.get('region') ?? '').trim();
		const commitment = String(f.get('commitment') ?? 'casual');
		const kind = String(f.get('kind') ?? 'member');
		// Sent as a full ISO string, converted client-side from a
		// datetime-local input using the browser's own timezone: parsing a
		// bare "2026-09-10T19:00" here, on the server, would use the
		// server's timezone instead of the poster's.
		const eventAtRaw = String(f.get('event_at') ?? '').trim();
		const eventAt = kind !== 'member' && eventAtRaw ? new Date(eventAtRaw) : null;
		const email = String(f.get('email') ?? '').trim();
		const address = String(f.get('address') ?? '').trim() || null;
		const lat = Number(f.get('pin_lat')), lng = Number(f.get('pin_lng'));
		const instruments = f.getAll('instrument').map(String).filter((i) => INSTRUMENT_SLUGS.has(i));
		const genres = f.getAll('genre').map(String).filter((g) => GENRE_SLUGS.has(g));
		const paid = f.get('paid') === 'on';

		// Kept as parallel arrays, index-aligned by the template's own
		// each-block order, then zipped and cleaned here in one place.
		const socialKinds = f.getAll('social_kind').map(String);
		const socialUrls = f.getAll('social_url').map(String);
		const socials = socialKinds
			.map((kind, i) => ({ kind, url: socialUrls[i]?.trim() ?? '' }))
			.filter((s) => SOCIAL_KIND_SLUGS.has(s.kind) && s.url);

		const values = {
			bandName, blurb, cc, regionCode, commitment, kind,
			eventAt: eventAtRaw, email, address, instruments, genres, paid
		};

		const geo = geoFor(cc);
		if (!bandName) return fail(400, { ...values, error: 'The band needs a name.' });
		if (!geo) return fail(400, { ...values, error: 'No map for that country yet.' });
		if (!regionCode) return fail(400, { ...values, error: 'Pick a region.' });
		if (!Number.isFinite(lat) || !Number.isFinite(lng))
			return fail(400, { ...values, error: 'Drop the pin on the map so people know where to come.' });
		if (!instruments.length)
			return fail(400, { ...values, error: 'Pick at least one instrument you need.' });
		if (!COMMITMENT_SLUGS.has(commitment))
			return fail(400, { ...values, error: 'Pick how serious this is.' });
		if (!AD_KIND_SLUGS.has(kind))
			return fail(400, { ...values, error: 'Pick what kind of post this is.' });
		if (kind !== 'member' && (!eventAt || isNaN(eventAt.getTime()) || eventAt.getTime() <= Date.now()))
			return fail(400, { ...values, error: 'Pick a date and time for it, still ahead of now.' });
		// A generous pad around the country's own frame, not a strict border
		// check: Leaflet lets you click just past the edge while panning.
		const [LO0, LO1, LA0, LA1] = geo.bx;
		const pad = Math.max(LO1 - LO0, LA1 - LA0) * 0.5;
		if (lng < LO0 - pad || lng > LO1 + pad || lat < LA0 - pad || lat > LA1 + pad)
			return fail(400, { ...values, error: 'That pin landed outside the country. Drop it again.' });
		if (!socials.length)
			return fail(400, { ...values, error: 'Give at least one place where you want to be contacted, with a real link.' });
		if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
			return fail(400, { ...values, error: 'The email is only used for the renewal link. It is never shown.' });

		const shown = jitter(lat, lng, 700);
		// Not the edit token: that one is minted only once verify_ad()
		// succeeds, so it never exists in plaintext before the poster has
		// proven they hold this inbox.
		const verifyToken = mintToken();
		const id = publicId();

		try {
			await db.transaction(async (tx) => {
				const rows = await tx.execute(sql`
					insert into ad (public_id, band_name, blurb, commitment, kind, event_at, paid,
					                country_code, region_code,
					                lat, lng, address, display_lat, display_lng,
					                contact_email, status, verify_token_hash, verify_expires_at,
					                created_ip_hash)
					values (${id}, ${bandName}, ${blurb}, ${commitment}, ${kind}::ad_kind,
					        ${eventAt ? eventAt.toISOString() : null}, ${paid},
					        ${cc}, ${regionCode},
					        ${lat}, ${lng}, ${address}, ${shown.lat}, ${shown.lng},
					        ${email}, 'unverified', ${hashToken(verifyToken)}, now() + interval '24 hours',
					        ${hashIp(getClientAddress(), env.IP_SALT ?? 'dev')})
					returning id
				`);
				const adId = (rows as unknown as { id: string }[])[0].id;
				for (const { kind, url } of socials) {
					await tx.execute(sql`
						insert into ad_link (ad_id, kind, handle) values (${adId}, ${kind}::link_kind, ${url})
					`);
				}
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

		try {
			// Fixed origin, not the request's own: the request could come in
			// on 127.0.0.1 or an internal LAN address depending on how this
			// instance is reached, but an email is read from anywhere, so
			// the link inside it needs a host that means something there.
			// Same ORIGIN adapter-node already requires for its own
			// same-origin form check (see docker-compose.yml) and the one
			// send-reminders.js already uses for its renewal links.
			const origin = env.ORIGIN ?? url.origin;
			const verifyUrl = `${origin}/verify?id=${id}&token=${verifyToken}`;
			await sendVerificationEmail(email, bandName, verifyUrl);
		} catch (err) {
			console.error('verification email failed', err);
			return fail(500, {
				...values,
				error: 'The ad was saved but the confirmation email could not be sent. Try posting again.'
			});
		}

		return { posted: true, bandName, email };
	}
};
