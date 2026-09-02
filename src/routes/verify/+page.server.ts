import { fail } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { verifyAd } from '$lib/server/queries';
import { mintToken, hashToken } from '$lib/server/token';
import { sendTokenEmail } from '$lib/server/email';

export const load: PageServerLoad = async ({ url }) => ({
	id: url.searchParams.get('id') ?? '',
	token: url.searchParams.get('token') ?? ''
});

export const actions: Actions = {
	// Deliberately a POST triggered by a real button, not verification on
	// the GET that loads this page: mail security scanners routinely
	// pre-visit links to check them for malware, which would otherwise
	// burn a one-time verify token before the person who received the
	// email ever clicks it themselves.
	default: async ({ request }) => {
		const f = await request.formData();
		const id = String(f.get('id') ?? '').trim();
		const token = String(f.get('token') ?? '').trim();

		// Same vagueness as the renew endpoint: a wrong token and an
		// already-used or expired one look identical from the outside.
		const invalid = () => fail(400, { error: 'This link is invalid or has expired.' });
		if (!id || !token) return invalid();

		const ok = await verifyAd(id, token);
		if (!ok) return invalid();

		const editToken = mintToken();
		const rows = await db.execute(sql`
			update ad set edit_token_hash = ${hashToken(editToken)}
			 where public_id = ${id}
			returning band_name, contact_email
		`);
		const row = (rows as unknown as { band_name: string; contact_email: string }[])[0];
		if (!row) return invalid();

		try {
			await sendTokenEmail(row.contact_email, row.band_name, id, editToken);
		} catch (err) {
			console.error('token email failed', err);
			return fail(500, {
				error: 'Verified, but the token email could not be sent. Contact the admin, the ad is live but you have no way to edit it.'
			});
		}

		return { verified: true, bandName: row.band_name };
	}
};
