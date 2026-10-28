import type { HelperPlatform } from '../log/paths';

export interface LauncherSpec {
  /** Absolute path to node: Chrome started from the Dock or Start menu has no shell PATH (ADR-0001). */
  readonly nodePath: string;
  readonly hostScript: string;
  readonly env: Readonly<Record<string, string>>;
}

/** The script Chrome runs. Every path in it is absolute. */
export function launcherScript(platform: HelperPlatform, spec: LauncherSpec): string {
  const names = Object.keys(spec.env).sort();
  if (platform === 'win32') {
    return [
      '@echo off',
      'rem Written by `employ-me setup`. Chrome runs this with no PATH, so every path is absolute.',
      ...names.map((name) => `set "${name}=${cmdEscape(spec.env[name] ?? '')}"`),
      `"${cmdEscape(spec.nodePath)}" "${cmdEscape(spec.hostScript)}" %*`,
      '',
    ].join('\r\n');
  }
  return [
    '#!/bin/sh',
    '# Written by `employ-me setup`. Chrome runs this with no PATH, so every path is absolute.',
    ...names.flatMap((name) => [`${name}=${shQuote(spec.env[name] ?? '')}`, `export ${name}`]),
    `exec ${shQuote(spec.nodePath)} ${shQuote(spec.hostScript)} "$@"`,
    '',
  ].join('\n');
}

export function shQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function cmdEscape(value: string): string {
  return value.replaceAll('%', '%%');
}
