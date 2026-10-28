import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Stand-ins for the user's CLIs (test/stubs/*.mjs): tests never spend anyone's plan. */
export const STUB_CLAUDE = fileURLToPath(new URL('./stubs/claude.mjs', import.meta.url));
export const STUB_CODEX = fileURLToPath(new URL('./stubs/codex.mjs', import.meta.url));

export interface Scratch {
  readonly dir: string;
  /** Where a stub records what it was given (STUB_RECORD). */
  readonly recordFile: string;
  /** The environment for a stub run: the test's own (for PATH) plus the stub's knobs. */
  env(knobs: Readonly<Record<string, string>>): NodeJS.ProcessEnv;
  /** What the stub recorded: one JSON value per line. */
  records(): unknown[];
}

export function scratch(): Scratch {
  const dir = mkdtempSync(join(tmpdir(), 'employ-me-helper-test-'));
  const recordFile = join(dir, 'record.jsonl');
  return {
    dir,
    recordFile,
    env: (knobs) => ({ ...process.env, STUB_RECORD: recordFile, ...knobs }),
    records() {
      let text: string;
      try {
        text = readFileSync(recordFile, 'utf8');
      } catch {
        return [];
      }
      return text
        .split('\n')
        .filter((line) => line !== '')
        .map((line): unknown => JSON.parse(line));
    },
  };
}
