import { defineConfig } from 'tsdown';

// One self-contained file per entry: core and zod are bundled in, so
// `npx employ-me` installs nothing else and the host starts fast.
export default defineConfig({
  entry: { cli: 'src/cli.ts', host: 'src/host.ts' },
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  dts: false,
  clean: true,
});
