import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { liveAds } from '$lib/server/queries';
import type { GeoFile } from '$lib/server/geo';

const GEO = import.meta.glob('$lib/data/geo/*.json', { eager: true, import: 'default' });
const geoFor = (cc: string) =>
	(Object.entries(GEO).find(([p]) => p.endsWith(`/${cc}.json`))?.[1] as GeoFile) ?? null;

/** Reached only via Continue on `/`, with the filters already chosen. A
 *  bookmark missing any of them has nothing to rank against, so it goes
 *  back to the form rather than showing an empty board. */
export const load: PageServerLoad = async ({ url }) => {
	const cc = (url.searchParams.get('c') ?? '').toUpperCase();
	const region = url.searchParams.get('r');
	const inst = (url.searchParams.get('i') ?? '').split(',').filter(Boolean);
	const gen = (url.searchParams.get('g') ?? '').split(',').filter(Boolean);
	// Optional, unlike instrument/region/genre: a ranking nudge, not
	// something a first-time visitor needs to decide before seeing results.
	const commit = (url.searchParams.get('m') ?? '').split(',').filter(Boolean);

	if (!/^[A-Z]{2}$/.test(cc) || !region || !inst.length || !gen.length) {
		redirect(302, '/');
	}

	const geo = geoFor(cc);
	if (!geo) redirect(302, '/');

	const ads = await liveAds(cc);
	return { cc, region, inst, gen, commit, ads, geo };
};
