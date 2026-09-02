import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { pingAd, renewViaNudge } from '$lib/server/queries';

export const load: PageServerLoad = async ({ url }) => ({
	nudgeId: url.searchParams.get('id') ?? '',
	nudge: url.searchParams.get('nudge') ?? ''
});

export const actions: Actions = {
	// Named, not default: SvelteKit doesn't allow mixing a default action
	// with named ones in the same file, and `nudge` below needs its own name.
	ping: async ({ request }) => {
		const f = await request.formData();
		const id = String(f.get('public_id') ?? '').trim();
		const token = String(f.get('token') ?? '').trim();
		if (!id || !token) return fail(400, { id, error: 'Both the ad code and the token are needed.' });

		const until = await pingAd(id, token);
		if (!until) {
			// Deliberately vague. Saying which half was wrong would let someone
			// walk the public_id space to find out which ads exist.
			return fail(404, {
				id,
				error: 'That code and token do not go together, or the ad has already been deleted. ' +
				       'A lost token cannot be reset.'
			});
		}
		return { renewed: true, until: until.toISOString().slice(0, 10) };
	},

	// The day-11 reminder email's one-click link: its own single-use
	// token, not the edit token (see the migration comment for why), so
	// this never touches pingAd/the token the person actually saved.
	nudge: async ({ request }) => {
		const f = await request.formData();
		const id = String(f.get('id') ?? '').trim();
		const nudge = String(f.get('nudge') ?? '').trim();
		if (!id || !nudge) return fail(400, { error: 'This link is missing its code or token.' });

		const until = await renewViaNudge(id, nudge);
		if (!until) return fail(400, { error: 'This link is invalid or has expired.' });
		return { renewed: true, until: until.toISOString().slice(0, 10) };
	}
};
