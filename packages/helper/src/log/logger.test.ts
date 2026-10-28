import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import packageJson from '../../package.json' with { type: 'json' };
import { HELPER_VERSION } from '../version';
import { createFileLogger } from './logger';

describe('createFileLogger', () => {
  it('appends one JSON line per entry, with a timestamp, creating the folder', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'employ-me-log-')), 'deep', 'helper.log');
    const logger = createFileLogger(file, () => undefined);
    logger.log({ event: 'request.done', requestId: 'r1', type: 'mapFields', durationMs: 12 });
    logger.log({ event: 'host.stop' });
    const lines = readFileSync(file, 'utf8')
      .trim()
      .split('\n')
      .map((line): unknown => JSON.parse(line));
    expect(lines).toMatchObject([
      {
        event: 'request.done',
        requestId: 'r1',
        type: 'mapFields',
        durationMs: 12,
        ts: expect.any(String) as unknown,
      },
      { event: 'host.stop' },
    ]);
  });

  it('reports once, and stops, when the log cannot be written', () => {
    const blocker = join(mkdtempSync(join(tmpdir(), 'employ-me-log-')), 'file');
    writeFileSync(blocker, '');
    const failures: unknown[] = [];
    const logger = createFileLogger(join(blocker, 'helper.log'), (error) => failures.push(error));
    logger.log({ event: 'host.start' });
    logger.log({ event: 'host.stop' });
    expect(failures).toHaveLength(1);
  });
});

describe('HELPER_VERSION', () => {
  it('matches package.json', () => {
    expect(HELPER_VERSION).toBe(packageJson.version);
  });
});
