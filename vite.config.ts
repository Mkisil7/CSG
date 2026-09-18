import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the static build works on GitHub Pages / itch.io subpaths.
  base: './',
  // Precache the dynamic game chunk for first-visit offline support.
  build: { manifest: true },
});
