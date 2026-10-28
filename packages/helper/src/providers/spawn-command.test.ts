import { describe, expect, it } from 'vitest';
import { spawnCommand } from './spawn-command';

describe('spawnCommand', () => {
  it('runs executables directly', () => {
    expect(spawnCommand('darwin', '/usr/local/bin/codex', ['app-server'])).toEqual({
      file: '/usr/local/bin/codex',
      args: ['app-server'],
      windowsVerbatimArguments: false,
    });
    expect(spawnCommand('win32', 'C:\\bin\\claude.exe', ['-p']).file).toBe('C:\\bin\\claude.exe');
  });

  it('runs a Windows .cmd shim through cmd.exe with every metacharacter escaped', () => {
    const command = spawnCommand('win32', 'C:\\npm\\codex.cmd', ['-c', 'web_search="disabled"', 'a&b']);
    expect(command.file).toBe('cmd.exe');
    expect(command.windowsVerbatimArguments).toBe(true);
    expect(command.args.slice(0, 3)).toEqual(['/d', '/s', '/c']);
    const line = command.args[3] ?? '';
    // Quotes and & can't end the argument or start a new command.
    expect(line).not.toMatch(/[^^]&/);
    expect(line).toContain('^^^"web_search=\\^^^"disabled\\^^^"^^^"');
  });
});
