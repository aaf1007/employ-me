// Native Messaging host entry. Chrome launches this through the launcher
// script that `employ-me setup` writes. stdout carries protocol frames ONLY.
import { Console } from 'node:console';
import { homedir } from 'node:os';
import { loadHostRuntime } from './host/runtime';
import { runHost } from './host/run';
import { asHelperPlatform } from './log/paths';

// Our code never uses console (lint enforces it), but a dependency might:
// pdf.js prints warnings with console.log. Point the global console at
// stderr so nothing but frames can reach stdout.
globalThis.console = new Console({ stdout: process.stderr, stderr: process.stderr });

const platform = asHelperPlatform(process.platform);
if (platform === null) {
  process.stderr.write(`employ-me: ${process.platform} is not supported\n`);
  process.exit(1);
}

const runtime = await loadHostRuntime(platform, homedir(), process.env, process.execPath, (error) => {
  process.stderr.write(
    `employ-me: can't write the log: ${error instanceof Error ? error.message : 'unknown error'}\n`,
  );
});
await runHost(process.stdin, process.stdout, runtime);
// Chrome closed the port. Exit even if a dependency left a handle open.
setTimeout(() => process.exit(0), 1000).unref();
