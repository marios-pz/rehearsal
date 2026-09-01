import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// 0.0.0.0 so the dev server is reachable from another device on the LAN
// (a phone, for checking mobile layout) without passing --host by hand.
// Port 3000 to match production (docker-compose.yml, the Dockerfile's
// EXPOSE), so "the port" means the same thing in dev and prod.
export default defineConfig({
	plugins: [sveltekit()],
	server: { host: '0.0.0.0', port: 3000 },
	preview: { host: '0.0.0.0', port: 3000 }
});
