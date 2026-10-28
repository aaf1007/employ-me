import { defineConfig } from 'tsdown';

// Self-contained output: core, zod and unpdf (PDF text, in its own chunk,
// loaded only for a PDF Resume) are bundled in, so `npx employ-me` installs
// nothing else and the host starts fast. `employ-me setup` copies all of
// dist/, chunks included. A new bundled dependency must be listed in
// onlyBundle (core is workspace source, so it isn't a "dependency" here).
export default defineConfig({
  entry: { cli: 'src/cli.ts', host: 'src/host.ts' },
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  dts: false,
  clean: true,
  deps: { onlyBundle: ['zod', 'unpdf'] },
});
