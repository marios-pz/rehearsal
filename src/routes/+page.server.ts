import type { PageServerLoad } from './$types';
import { liveAds, adCountsByCountry } from '$lib/server/queries';
import countries from '$lib/data/countries.json';

const GEO = import.meta.glob('$lib/data/geo/*.json', { eager: true, import: 'default' });
const geoFor = (cc: string) =>
	Object.entries(GEO).find(([p]) => p.endsWith(`/${cc}.json`))?.[1] ?? null;

export const load: PageServerLoad = async ({ url }) => {
	const cc = (url.searchParams.get('c') ?? 'GR').toUpperCase();
	const [counts, ads] = await Promise.all([adCountsByCountry(), liveAds(cc)]);
	return { cc, counts, ads, geo: geoFor(cc), countries };
};
