import { postingKeyId, type Posting, type Profile, type SubmittedAnswer } from '@employ-me/core';
import type { PublicPostingDetails } from '@employ-me/fill';
import type { Detected, SessionEvent } from '../messaging/content';
import { buildDebugReport } from './debug-report';
import type { PanelDeps } from './deps';
import { FillFlow } from './fill-flow';
import { submissionOf, withPublicDetails } from './posting';
import { INITIAL_STATE, Store, type PanelState } from './state';

/**
 * The side panel for one tab (design.md "Filling"): finds the Application
 * Form, runs the Fill when you click it and carries it through the form's
 * steps, and records the Application when the job site confirms you
 * submitted (or you say you did).
 */
export class PanelController {
  readonly store = new Store<PanelState>(INITIAL_STATE);
  private readonly flow: FillFlow;
  private profile: Profile | null = null;
  private details: Promise<PublicPostingDetails | null> = Promise.resolve(null);
  /** Answers from earlier pages of a form whose steps are separate pages. */
  private carried: readonly SubmittedAnswer[] = [];
  private closeSession: (() => void) | null = null;
  /** The form's document went away (a load, or the tab closed) while a Fill was open. */
  private documentGone = false;
  private continuing: Promise<void> | null = null;
  private stopWatching: (() => void) | null = null;
  private generation = 0;

  constructor(private readonly deps: PanelDeps) {
    this.flow = new FillFlow(this.store, deps, () => this.profile);
  }

  start(): void {
    if (this.stopWatching !== null) return;
    this.stopWatching = this.deps.tab.watch({
      onLoaded: () => void this.pageLoaded(),
      onClosed: () => {
        this.documentGone = true;
        this.leftWithoutConfirmation();
      },
    });
    void this.detect();
  }

  dispose(): void {
    this.stopWatching?.();
    this.stopWatching = null;
    this.endSession();
    this.generation++;
  }

  /** Looks for the Application Form; the panel says so when there isn't one. */
  async detect(): Promise<void> {
    const generation = ++this.generation;
    this.store.set({ phase: 'detecting', notice: null });
    const detected = await this.findForm();
    if (generation !== this.generation) return;
    if (detected === null || detected.fieldCount === 0) {
      this.store.set({ phase: 'noForm', detected });
      return;
    }
    this.store.set({ phase: 'ready', detected, posting: detected.posting });
    await Promise.all([this.loadProfile(), this.loadApplied(detected.posting)]);
    if (detected.posting !== null) this.details = this.fetchDetails(detected, detected.posting);
  }

  selectResume(resumeId: string): void {
    this.store.set({ resumeId });
  }

  /** Fill (and Fill again): a re-plan never writes over what you changed on the page. */
  async fill(): Promise<void> {
    const { detected, phase, fill } = this.store.get();
    if (detected === null || phase !== 'ready' || fill === 'filling' || fill === 'asking') return;
    if (this.documentGone) this.flow.reset();
    this.documentGone = false;
    this.store.set({ fill: 'filling', notice: null, submission: { state: 'none' } });
    const details = await this.details;
    const posting = detected.posting === null ? null : withPublicDetails(detected.posting, details);
    this.store.set({ posting });
    // One port for the whole Fill: closing it ends the content script's session, and with it the
    // report a re-plan needs to leave your edits alone.
    if (this.closeSession === null) this.openSession();
    const { resumeId } = this.store.get();
    const first = await this.deps.tab.fill({
      type: 'fill',
      ...(resumeId === null ? {} : { resumeId }),
      posting,
      ...(details === null ? {} : { postingDetails: details }),
    });
    await this.flow.run(first);
  }

  readonly drafts = {
    setText: (fieldId: string, text: string) => {
      this.flow.setText(fieldId, text);
    },
    draft: (fieldId: string) => this.flow.draft(fieldId),
    accept: (fieldId: string) => this.flow.accept(fieldId),
    useSuggestion: (fieldId: string) => this.flow.useSuggestion(fieldId),
    retryProvider: () => this.flow.retryProvider(),
  };

  /** "Did you apply?" Yes records the Application with what the form last showed; No forgets the Fill. */
  async answerDidYouApply(applied: boolean): Promise<void> {
    if (this.store.get().submission.state !== 'askDidYouApply') return;
    if (applied) await this.record('didYouApply');
    else {
      this.store.set({ submission: { state: 'declined' } });
      this.endSession();
    }
  }

  /** A debug report with every value stripped (design.md "Your data stays on your machine"). */
  debugReport(version: string): string {
    return buildDebugReport(this.store.get(), this.profile, version);
  }

  private async findForm(): Promise<Detected | null> {
    const attempts = this.deps.detectAttempts ?? 12;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const detected = await this.deps.tab.detect();
      // Forms render after the page loads: keep looking for a while.
      if (detected !== null && (detected.fieldCount > 0 || detected.confirmed)) return detected;
      await delay(this.deps.detectIntervalMs ?? 500);
    }
    return null;
  }

  private async loadProfile(): Promise<void> {
    const profile = await this.deps.call('profile.get', {});
    if (!profile.ok) {
      this.store.set({ notice: profile.error });
      return;
    }
    this.profile = profile.value;
    const resumes = profile.value.resumes;
    const chosen = this.store.get().resumeId;
    const resumeId = resumes.find((r) => r.id === chosen)?.id ?? resumes.find((r) => r.isDefault)?.id ?? null;
    this.store.set({ resumes, resumeId });
  }

  private async loadApplied(posting: Posting | null): Promise<void> {
    if (posting === null) return;
    const found = await this.deps.call('applications.findByPosting', { key: posting.key });
    if (found.ok) this.store.set({ applied: found.value });
  }

  private async fetchDetails(detected: Detected, posting: Posting): Promise<PublicPostingDetails | null> {
    if (posting.key.ats === 'generic') return null;
    // No public API answer is fine: the Fill uses the page, the Snapshot the page's description.
    const details = await this.deps.fetchPosting(posting.key, new URL(detected.url));
    return details.ok ? details.value : null;
  }

  private openSession(): void {
    this.closeSession?.();
    this.closeSession = this.deps.tab.openSession(
      (event) => {
        void this.onSessionEvent(event);
      },
      () => {
        this.closeSession = null;
        this.documentGone = true;
        this.carried = mergeAnswers(this.carried, this.store.get().answers);
      },
    );
  }

  private endSession(): void {
    this.closeSession?.();
    this.closeSession = null;
    void this.deps.tab.endSession();
  }

  private async onSessionEvent(event: SessionEvent): Promise<void> {
    switch (event.type) {
      case 'answers':
        this.store.set({ answers: event.answers });
        return;
      case 'submission':
        if (event.signal === 'confirmed') await this.record('confirmation');
        else this.leftWithoutConfirmation();
        return;
      case 'formChanged':
        await this.continueFill();
        return;
    }
  }

  /** The form's next step appeared (or follow-up questions): the same Fill carries on. */
  private async continueFill(): Promise<void> {
    if (this.continuing !== null || this.store.get().submission.state !== 'none') return;
    const { fill } = this.store.get();
    if (fill !== 'done') return;
    this.continuing = this.fill().finally(() => {
      this.continuing = null;
    });
    await this.continuing;
  }

  /** The tab loaded a page. If a Fill was open, that is its next step, the confirmation, or you leaving. */
  private async pageLoaded(): Promise<void> {
    const { submission, view } = this.store.get();
    const open = view !== null && submission.state === 'none';
    if (!open) {
      this.flow.reset();
      this.carried = [];
      this.store.set({ fill: 'idle', submission: { state: 'none' }, applied: [], answers: [] });
      await this.detect();
      return;
    }
    if (!this.documentGone) return;
    const detected = await this.findForm();
    if (detected?.confirmed === true) {
      await this.record('confirmation');
      return;
    }
    const before = this.store.get().posting;
    const now = detected?.posting ?? null;
    const samePosting = now !== null && before !== null && postingKeyId(now.key) === postingKeyId(before.key);
    if (detected !== null && detected.fieldCount > 0 && samePosting) {
      // A form whose steps are separate pages: fill this one too.
      this.store.set({ detected, fill: 'idle' });
      await this.fill();
      return;
    }
    this.leftWithoutConfirmation();
  }

  private leftWithoutConfirmation(): void {
    const { view, submission } = this.store.get();
    const filled = view?.fields.some((f) => f.outcome?.kind === 'filled') ?? false;
    if (filled && submission.state === 'none') this.store.set({ submission: { state: 'askDidYouApply' } });
  }

  private async record(source: 'confirmation' | 'didYouApply'): Promise<void> {
    const { posting, view, submission, answers } = this.store.get();
    if (posting === null || submission.state === 'recording' || submission.state === 'recorded') return;
    this.store.set({ submission: { state: 'recording' } });
    const details = await this.details;
    const { posting: recorded, snapshot } = submissionOf(
      withPublicDetails(posting, details),
      mergeAnswers(this.carried, answers),
      view?.resume ?? null,
      this.deps.now(),
    );
    const application = await this.deps.call('applications.recordSubmission', {
      source,
      posting: recorded,
      snapshot,
    });
    if (!application.ok) {
      this.store.set({ submission: { state: 'none' }, notice: application.error });
      return;
    }
    this.store.set({ submission: { state: 'recorded', application: application.value } });
    this.endSession();
    await this.loadApplied(posting);
  }
}

/** Earlier pages' answers, then this page's; a question answered on both keeps the later answer. */
function mergeAnswers(
  earlier: readonly SubmittedAnswer[],
  later: readonly SubmittedAnswer[],
): SubmittedAnswer[] {
  const key = (a: SubmittedAnswer) => `${a.fieldType}|${a.label}`;
  const replaced = new Set(later.map(key));
  return [...earlier.filter((a) => !replaced.has(key(a))), ...later];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
