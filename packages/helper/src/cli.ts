#!/usr/bin/env node
import { homedir } from 'node:os';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from './cli/main';
import { asHelperPlatform } from './log/paths';

const io = {
  out: (line: string) => process.stdout.write(`${line}\n`),
  err: (line: string) => process.stderr.write(`${line}\n`),
};
const platform = asHelperPlatform(process.platform);
if (platform === null) {
  io.err(`employ-me supports macOS, Linux and Windows, not ${process.platform}.`);
  process.exit(1);
}

process.exitCode = await main(process.argv.slice(2), io, {
  platform,
  home: homedir(),
  env: process.env,
  nodePath: process.execPath,
  // cli.mjs sits in dist/ next to host.mjs.
  helperDist: dirname(fileURLToPath(import.meta.url)),
});
