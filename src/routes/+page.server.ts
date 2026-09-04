import type { PageServerLoad } from './$types';
import { liveAds, adCountsByCountry } from '$lib/server/queries';
import countries from '$lib/data/countries.json';

export const load: PageServerLoad = async ({ url }) => {
	const cc = (url.searchParams.get('c') ?? 'GR').toUpperCase();
	const [counts, ads] = await Promise.all([adCountsByCountry(), liveAds(cc)]);
	return { cc, counts, ads, countries };
};
