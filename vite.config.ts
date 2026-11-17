import { defineConfig } from 'vite';

// Static build: relative base so dist/ opens from any folder or itch.io-style host.
export default defineConfig({
  base: './',
  build: { target: 'es2022', outDir: 'dist', sourcemap: false },
});
