import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const playgroundDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(playgroundDir, '../..');

export default defineConfig({
  root: playgroundDir,
  base: './',
  publicDir: resolve(repositoryRoot, 'public/brand'),
  build: {
    outDir: resolve(repositoryRoot, 'playground-dist'),
    emptyOutDir: true,
    sourcemap: false
  },
  server: {
    // The extension playground owns port 5177; the Scopuly app uses 5173.
    port: 5177,
    strictPort: true,
    fs: {
      allow: [repositoryRoot]
    }
  },
  preview: {
    port: 5177,
    strictPort: true
  }
});
