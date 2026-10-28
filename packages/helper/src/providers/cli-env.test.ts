import { describe, expect, it } from 'vitest';
import { cliEnv } from './cli-env';

describe('cliEnv', () => {
  it("puts the CLI's folder and the helper's node first on the bare PATH Chrome gives the host", () => {
    const env = cliEnv(
      'darwin',
      { PATH: '/usr/bin:/bin', HOME: '/Users/sam' },
      '/Users/sam/.npm-global/bin/claude',
      '/opt/node/bin/node',
    );
    expect(env['PATH']).toBe('/Users/sam/.npm-global/bin:/opt/node/bin:/usr/bin:/bin');
    expect(env['HOME']).toBe('/Users/sam');
  });

  it('does not repeat folders, and copes with no PATH at all', () => {
    expect(cliEnv('linux', {}, '/usr/bin/codex', '/usr/bin/node')['PATH']).toBe('/usr/bin');
  });

  it('uses ; and keeps Windows Path casing', () => {
    const env = cliEnv('win32', { Path: 'C:\\Windows' }, 'C:\\npm\\codex.cmd', 'C:\\node\\node.exe');
    expect(env['Path']).toBe('C:\\npm;C:\\node;C:\\Windows');
  });

  it('fills in USER when missing, which claude needs to find its own Keychain login', () => {
    expect(cliEnv('darwin', {}, '/bin/claude', undefined, () => 'sam')['USER']).toBe('sam');
    expect(cliEnv('darwin', { USER: 'lee' }, '/bin/claude', undefined, () => 'sam')['USER']).toBe('lee');
  });
});
