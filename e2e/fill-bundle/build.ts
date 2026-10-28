import path from 'node:path';
import { build } from 'vite';

const ROOT = path.resolve(import.meta.dirname, '../..');
export const FILL_BUNDLE = path.join(ROOT, 'e2e/.build/fill.js');

/** Bundles @employ-me/fill as one script Playwright can inject (e2e only, never shipped). */
export async function buildFillBundle(): Promise<void> {
  await build({
    configFile: false,
    logLevel: 'warn',
    root: ROOT,
    build: {
      lib: {
        entry: path.join(ROOT, 'e2e/fill-bundle/entry.ts'),
        name: 'employMeFillBundle',
        formats: ['iife'],
        fileName: () => 'fill.js',
      },
      outDir: path.dirname(FILL_BUNDLE),
      emptyOutDir: true,
      minify: false,
      target: 'es2023',
    },
  });
}
