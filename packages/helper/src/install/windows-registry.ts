import { execFile } from 'node:child_process';
import { err, ok, type Result } from '@employ-me/core/protocol';

// Windows finds Native Messaging hosts through the registry, not a folder:
// HKCU\Software\<vendor>\NativeMessagingHosts\<name> holds the manifest's
// path as its default value (research §3.3). reg.exe ships with Windows.

export interface RegFailure {
  readonly reason: 'regFailed';
  readonly exitCode: number | null;
}

export type RegRunner = (args: readonly string[]) => Promise<Result<string, RegFailure>>;

export const regAddArgs = (key: string, manifestPath: string): string[] => [
  'add',
  key,
  '/ve',
  '/t',
  'REG_SZ',
  '/d',
  manifestPath,
  '/f',
];
export const regDeleteArgs = (key: string): string[] => ['delete', key, '/f'];
export const regQueryArgs = (key: string): string[] => ['query', key, '/ve'];

/** The default value in `reg query <key> /ve` output, or null. */
export function parseRegDefault(output: string): string | null {
  const match = /REG_SZ\s+(.+?)\s*$/m.exec(output);
  return match?.[1] ?? null;
}

export const runReg: RegRunner = (args) =>
  new Promise((resolve) => {
    execFile('reg.exe', [...args], { windowsHide: true }, (error, stdout) => {
      if (error === null) resolve(ok(stdout));
      else
        resolve(err({ reason: 'regFailed', exitCode: typeof error.code === 'number' ? error.code : null }));
    });
  });
