import type { ExtractedField } from '../../types';

/** How far apart the two field counts are taken. */
export const STEP_POLL_MS = 250;
/** The longest a step may keep growing before the Fill goes ahead with what it shows. */
export const STEP_READY_CAP_MS = 3000;

/**
 * Workday renders a step's fields in batches as its sections load. The step
 * is ready once it shows fields and the count is the same on two polls
 * `STEP_POLL_MS` apart, as Jobright checks (research 2026-10-28 §3.4, §7.4).
 * Read-only.
 */
export async function waitForStepReady(
  form: Element,
  extract: (form: Element) => readonly ExtractedField[],
): Promise<void> {
  const deadline = Date.now() + STEP_READY_CAP_MS;
  let count = extract(form).length;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, STEP_POLL_MS));
    const now = extract(form).length;
    if (now > 0 && now === count) return;
    count = now;
  }
}
