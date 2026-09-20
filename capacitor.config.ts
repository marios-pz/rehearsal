import type { CapacitorConfig } from '@capacitor/cli';

// webDir is required by the Capacitor CLI's schema, but never actually
// loaded: server.url below points the WebView at a real server instead,
// same reasoning as the rest of this project's architecture — every page
// is server-rendered against a live Postgres database, so there's no
// meaningful static bundle of "the app" to ship inside the native shell.
// Swap server.url to the real deployed HTTPS origin for a production
// build; this one is the dev machine's own LAN address, for testing on a
// phone against `npm run dev` while both are on the same network.
//
// webDir deliberately points at capacitor-www/ (a placeholder, see the
// comment in that folder), not the real build/ output: adapter-node's
// precompress option (on by default, see svelte.config.js) writes a .gz
// sibling next to every static asset for production, and Android's asset
// merger treats foo.js + foo.js.gz as colliding "duplicate resources" —
// harmless in the browser, fatal to `cap sync`/gradle. Since these local
// assets are never actually served (server.url wins), the fix is to stop
// feeding the real build output into the native copy step, not to disable
// a real production performance feature to satisfy an unrelated toolchain.
const config: CapacitorConfig = {
	appId: 'com.rehearsals.app',
	appName: 'Rehearsals',
	webDir: 'capacitor-www',
	server: {
		url: 'http://192.168.1.45:3000',
		cleartext: true
	}
};

export default config;
