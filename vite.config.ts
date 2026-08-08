import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [{
    name: 'scopuly-legal-notices',
    closeBundle() {
      const outputDir = resolve(rootDir, 'dist');
      mkdirSync(outputDir, { recursive: true });
      for (const [source, destination] of [
        ['LICENSE', 'LICENSE'],
        ['THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md'],
        ['src/ui/fonts/OFL.txt', 'OFL.txt']
      ]) {
        copyFileSync(resolve(rootDir, source), resolve(outputDir, destination));
      }
    }
  }],
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: false,
    sourcemap: process.env.SCOPULY_INCLUDE_SOURCEMAPS === 'true',
    rollupOptions: {
      input: {
        popup: resolve(rootDir, 'popup.html'),
        confirm: resolve(rootDir, 'confirm.html'),
        options: resolve(rootDir, 'options.html'),
        background: resolve(rootDir, 'src/background/service-worker.ts'),
        'content-script': resolve(rootDir, 'src/content/content-script.ts'),
        'injected-provider': resolve(rootDir, 'src/content/injected-provider.ts')
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]'
      }
    }
  }
});
