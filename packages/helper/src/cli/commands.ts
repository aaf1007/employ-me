/** Output for CLI commands. Commands never touch console or process.stdout directly. */
export interface CliIo {
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
}

export type Command = (args: readonly string[], io: CliIo) => Promise<number>;

/**
 * `npx employ-me setup`: finds claude/codex and records their absolute paths,
 * writes the launcher and a host manifest for each installed Chromium
 * browser, and drops the extension folder on disk for "Load unpacked"
 * (design.md "Tech"). Never reads Claude credentials (ADR-0002).
 */
export const setup: Command = () => {
  throw new Error('not implemented');
};

/** `employ-me doctor`: prints the same health the side panel shows, plus the log path. */
export const doctor: Command = () => {
  throw new Error('not implemented');
};

/** `employ-me uninstall`: removes every host manifest and launcher setup wrote. */
export const uninstall: Command = () => {
  throw new Error('not implemented');
};
