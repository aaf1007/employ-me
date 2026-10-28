import { postingKeyId, type Posting, type Profile, type SubmittedAnswer } from '@employ-me/core';
import type { PublicPostingDetails } from '@employ-me/fill';
import type { Detected, SessionEvent } from '../messaging/content';
import { buildDebugReport } from './debug-report';
import type { PanelDeps } from './deps';
import { FillFlow } from './fill-flow';
import { companySitePosting, submissionOf, withPageText, withPublicDetails } from './posting';
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
  /** Your Profile and the already-applied check for the form found last. */
  private loading: Promise<unknown> = Promise.resolve();
  /** Answers from earlier pages of a form whose steps are separate pages. */
  private carried: readonly SubmittedAnswer[] = [];
  private closeSession: (() => void) | null = null;
  /** The form's document went away (a load, or the tab closed) while a Fill was open. */
  private documentGone = false;
  private continuing: Promise<void> | null = null;
  /** The form showed new fields while a Fill was still running: it carries on once that Fill is done. */
  private changedWhileFilling = false;
  private stopWatching: (() => void) | null = null;
  private generation = 0;
  /** You clicked Fill on a site employ-me has no content script for, and it now runs on this page. */
  private reached = false;

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
    const { detected, scripted } = await this.findForm();
    if (generation !== this.generation) return;
    if (detected === null && !scripted) {
      await this.showUnknownSite();
      return;
    }
    if (detected === null || detected.fieldCount === 0) {
      this.store.set({ phase: 'noForm', detected });
      return;
    }
    // Started before the Fill button shows: a Fill clicked at once waits for them instead of going without.
    if (detected.posting !== null) this.details = this.fetchDetails(detected, detected.posting);
    this.loading = Promise.all([this.loadProfile(), this.loadApplied(detected.posting)]);
    this.store.set({ phase: 'ready', detected, posting: detected.posting });
    await this.loading;
  }

  selectResume(resumeId: string): void {
    this.store.set({ resumeId });
  }

  /**
   * Fill on a site employ-me has no content script for (the generic
   * fallback): only now does the content script run in the page's frames.
   * When none of the frames it may read holds a form, the panel offers the
   * sites of the frames it can't read (allowFrames).
   */
  async fillThisSite(): Promise<void> {
    const { phase, fill } = this.store.get();
    if (phase !== 'unknownSite' || fill === 'filling') return;
    this.store.set({ fill: 'filling', notice: null });
    const reached = await this.reach();
    this.store.set({ fill: 'idle' });
    if (!reached) return;
    await this.detect();
    if (this.store.get().phase === 'ready') await this.fill();
  }

  /**
   * Lets employ-me read the frames from other sites, then fills there. Chrome
   * asks only during a click, so the click handler calls this first.
   */
  async allowFrames(): Promise<void> {
    const { unreachable, fill, phase } = this.store.get();
    if (phase !== 'noForm' || unreachable.length === 0 || fill === 'filling' || fill === 'asking') return;
    if (!(await this.deps.tab.allow(unreachable))) return;
    if (!(await this.reach())) return;
    await this.detect();
    if (this.store.get().phase === 'ready') await this.fill();
  }

  /** Fill (and Fill again): a re-plan never writes over what you changed on the page. */
  async fill(): Promise<void> {
    const { detected, phase, fill } = this.store.get();
    if (detected === null || phase !== 'ready' || fill === 'filling' || fill === 'asking') return;
    if (this.documentGone) this.flow.reset();
    this.documentGone = false;
    this.store.set({ fill: 'filling', notice: null, submission: { state: 'none' } });
    await this.loading;
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
    // The form changed while this Fill ran (you clicked Next before the AI answered): carry on now.
    if (this.changedWhileFilling) {
      this.changedWhileFilling = false;
      const { fill: now, submission } = this.store.get();
      if (now === 'done' && submission.state === 'none') await this.fill();
    }
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

  /**
   * The Application Form, polled while the page renders it. `scripted` is
   * false when no content script answers at all: a site employ-me doesn't
   * know, where it runs only once you click Fill.
   */
  private async findForm(): Promise<{ detected: Detected | null; scripted: boolean }> {
    const attempts = this.deps.detectAttempts ?? 12;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const detected = await this.deps.tab.detect();
      // Forms render after the page loads: keep looking for a while.
      if (detected !== null && (detected.fieldCount > 0 || detected.confirmed)) {
        return { detected, scripted: true };
      }
      // A known job site's content script answers as soon as it loads, before its form renders.
      if (attempt + 1 >= NO_SCRIPT_ATTEMPTS && !(await this.scripted()))
        return { detected: null, scripted: false };
      await delay(this.deps.detectIntervalMs ?? 500);
    }
    return { detected: null, scripted: await this.scripted() };
  }

  private async scripted(): Promise<boolean> {
    return this.reached || (await this.deps.tab.hasContentScript());
  }

  /** No content script on this page: the panel offers the generic fallback, and warns if you applied here. */
  private async showUnknownSite(): Promise<void> {
    const pageUrl = await this.deps.tab.url();
    const posting = pageUrl === null ? null : companySitePosting(pageUrl);
    this.store.set({ phase: 'unknownSite', detected: null, pageUrl, posting, applied: [] });
    await Promise.all([this.loadProfile(), this.loadApplied(posting)]);
  }

  /** Runs the content script in the page's frames; false (with the fix shown) when Chrome won't let it. */
  private async reach(): Promise<boolean> {
    const reach = await this.deps.tab.reach();
    if (!reach.ok) {
      this.reached = false;
      this.store.set({ notice: reach.error });
      return false;
    }
    this.reached = true;
    this.store.set({ unreachable: reach.value.unreachable });
    return true;
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
    if (this.store.get().submission.state !== 'none') return;
    const { fill } = this.store.get();
    if (fill === 'filling' || fill === 'asking') {
      this.changedWhileFilling = true;
      return;
    }
    if (this.continuing !== null || fill !== 'done') return;
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
      // A new page of a site employ-me doesn't know: it waits for your Fill click again.
      this.reached = false;
      this.store.set({
        fill: 'idle',
        submission: { state: 'none' },
        applied: [],
        answers: [],
        unreachable: [],
      });
      await this.detect();
      return;
    }
    if (!this.documentGone) return;
    // The Fill you started on a site employ-me doesn't know carries on to this page of it (design.md
    // "One Fill carries on through each later step"). Chrome lets it only on the same site.
    if (this.reached) this.reached = (await this.deps.tab.reach()).ok;
    const { detected } = await this.findForm();
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
      withPageText(withPublicDetails(posting, details), this.store.get().detected?.pageText),
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

/** Unanswered detects after which a page with no content script at all is an unknown site. */
const NO_SCRIPT_ATTEMPTS = 3;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
