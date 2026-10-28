import { describe, expect, it } from 'vitest';
import { helperLogFile } from './paths';

describe('helperLogFile', () => {
  it('uses ~/Library/Logs on macOS', () => {
    expect(helperLogFile('darwin', '/Users/sam', {})).toBe('/Users/sam/Library/Logs/employ-me/helper.log');
  });

  it('uses XDG_STATE_HOME on Linux, falling back to ~/.local/state', () => {
    expect(helperLogFile('linux', '/home/sam', { XDG_STATE_HOME: '/state' })).toBe(
      '/state/employ-me/helper.log',
    );
    expect(helperLogFile('linux', '/home/sam', {})).toBe('/home/sam/.local/state/employ-me/helper.log');
  });

  it('uses LOCALAPPDATA on Windows', () => {
    expect(helperLogFile('win32', 'C:\\Users\\sam', { LOCALAPPDATA: 'C:\\Users\\sam\\AppData\\Local' })).toBe(
      'C:\\Users\\sam\\AppData\\Local\\employ-me\\Logs\\helper.log',
    );
  });
});
