import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { pingAd } from '$lib/server/queries';

export const actions: Actions = {
	default: async ({ request }) => {
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
	}
};
