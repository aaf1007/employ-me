import { describe, expect, it } from 'vitest';
import { main } from './main';

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) }, out, err };
}

describe('employ-me CLI', () => {
  it('prints usage with no command', async () => {
    const { io, out } = capture();
    expect(await main([], io)).toBe(0);
    expect(out.join('\n')).toContain('setup');
  });

  it('rejects unknown commands with exit code 2', async () => {
    const { io, err } = capture();
    expect(await main(['frobnicate'], io)).toBe(2);
    expect(err.join('\n')).toContain('Unknown command: frobnicate');
  });
});
