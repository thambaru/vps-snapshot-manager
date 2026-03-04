import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://thambaru.github.io',
  base: '/vps-snapshot-manager',
  output: 'static',
  integrations: [tailwind()],
});
