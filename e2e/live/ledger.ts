import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Real Provider calls spend the user's plan. The ledger counts every one the
// live harness makes, across runs, from the test host's own log (the
// helper's closed LogEntry shape), and refuses to start a test that could
// take a CLI past its budget.

export const LIVE_DIR = path.resolve(import.meta.dirname, '../../.live-runs');
const LEDGER_FILE = path.join(LIVE_DIR, 'ledger.json');

export type LiveProvider = 'claude' | 'codex';
type CallType = 'mapFields' | 'draftAnswer' | 'parseResume';

/** At most this many real calls per CLI, in total (the live test's brief). */
export const BUDGET = Number(process.env['LIVE_BUDGET'] ?? '15');

export interface Calls {
  readonly mapFields: number;
  readonly draftAnswer: number;
  readonly parseResume: number;
  /** Requests the helper answered with an error, by reason. */
  readonly failed: Readonly<Record<string, number>>;
}

interface Ledger {
  readonly spent: Readonly<Record<LiveProvider, number>>;
  readonly runs: readonly { at: string; test: string; provider: LiveProvider; calls: Calls }[];
}

const EMPTY: Ledger = { spent: { claude: 0, codex: 0 }, runs: [] };

export async function readLedger(): Promise<Ledger> {
  try {
    return JSON.parse(await readFile(LEDGER_FILE, 'utf8')) as Ledger;
  } catch {
    return EMPTY;
  }
}

export async function record(test: string, provider: LiveProvider, calls: Calls): Promise<Ledger> {
  const ledger = await readLedger();
  const total = calls.mapFields + calls.draftAnswer + calls.parseResume;
  const next: Ledger = {
    spent: { ...ledger.spent, [provider]: ledger.spent[provider] + total },
    runs: [...ledger.runs, { at: new Date().toISOString(), test, provider, calls }],
  };
  await mkdir(LIVE_DIR, { recursive: true });
  await writeFile(LEDGER_FILE, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

/** Why a test that may make `upTo` calls can't run, or null when it can. */
export async function overBudget(provider: LiveProvider, upTo: number): Promise<string | null> {
  const { spent } = await readLedger();
  return spent[provider] + upTo > BUDGET
    ? `${provider} has spent ${spent[provider]} of ${BUDGET} real calls; this test may need ${upTo}`
    : null;
}

/** Counts the Provider calls in a test host's log (JSON lines, no values in them). */
export async function callsIn(logFile: string): Promise<Calls> {
  let text: string;
  try {
    text = await readFile(logFile, 'utf8');
  } catch {
    return { mapFields: 0, draftAnswer: 0, parseResume: 0, failed: {} };
  }
  const entries = text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as { event?: string; type?: string; reason?: string });
  const count = (type: CallType) =>
    entries.filter((e) => e.event === 'request.received' && e.type === type).length;
  const failed: Record<string, number> = {};
  for (const entry of entries) {
    if (entry.event === 'request.failed' && entry.reason !== undefined) {
      failed[entry.reason] = (failed[entry.reason] ?? 0) + 1;
    }
  }
  return {
    mapFields: count('mapFields'),
    draftAnswer: count('draftAnswer'),
    parseResume: count('parseResume'),
    failed,
  };
}

export function totalOf(calls: Calls): number {
  return calls.mapFields + calls.draftAnswer + calls.parseResume;
}
