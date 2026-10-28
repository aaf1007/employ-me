import { err, ok, type Posting, type Profile, type ResumeMeta, type Result } from '@employ-me/core';
import {
  clearOutcomes,
  execute,
  plan,
  showOutcomes,
  type AtsAdapter,
  type FillReport,
  type ProfileView,
  type ProviderFeedback,
  type PublicPostingDetails,
  type ResumeFile,
} from '@employ-me/fill';
import { callBackground } from '../messaging/background-client';
import type { ContentError, FillView, ProviderFeedbackMessage, SessionEvent } from '../messaging/content';
import { base64ToBytes } from '../storage';
import { AnswerLog } from './answers';
import { watchPage } from './page-watch';
import { toFillView } from './view';

export interface FillInputs {
  readonly resumeId?: string | undefined;
  readonly posting: Posting | null;
  readonly postingDetails?: PublicPostingDetails | undefined;
}

interface Loaded {
  readonly profile: ProfileView;
  readonly savedAnswers: Profile['savedAnswers'];
  readonly resume: ResumeFile | null;
}

/**
 * One Fill of the Application Form in this frame, from the side panel's
 * first Fill until it ends the session or goes away. Runs fill's plan and
 * execute; every re-plan passes the last report, so it writes only what it
 * newly resolved and never what you changed on the page.
 */
export class FillSession {
  private report: FillReport | null = null;
  private loaded: Loaded | null = null;
  private inputs: FillInputs = { posting: null };
  private feedback: ProviderFeedback = {};
  private readonly answers = new AnswerLog();
  private stopWatching: (() => void) | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly doc: Document,
    private readonly emit: (event: SessionEvent) => void,
  ) {}

  /** Starts the Fill, or fills again with a fresh read of your Profile and Resume. */
  fill(inputs: FillInputs): Promise<Result<FillView, ContentError>> {
    return this.serially(async () => {
      const loaded = await load(inputs.resumeId);
      if (!loaded.ok) return loaded;
      this.loaded = loaded.value;
      this.inputs = inputs;
      return ok(await this.run());
    });
  }

  /** Plans again with what the side panel learnt from the Provider and from you. */
  replan(feedback: ProviderFeedbackMessage): Promise<Result<FillView, ContentError>> {
    return this.serially(async () => {
      if (this.loaded === null) return err(noSession());
      this.feedback = feedback;
      return ok(await this.run());
    });
  }

  /** Clears the outlines and stops watching. */
  end(): void {
    this.stopWatching?.();
    this.stopWatching = null;
    clearOutcomes();
  }

  private async run(): Promise<FillView> {
    const loaded = this.loaded;
    if (loaded === null) throw new Error('run() before the Profile was loaded');
    const planned = plan(this.doc, loaded.profile, loaded.savedAnswers, {
      resume: loaded.resume,
      posting: this.inputs.posting,
      ...(this.inputs.postingDetails === undefined ? {} : { postingDetails: this.inputs.postingDetails }),
      provider: this.feedback,
    });
    const report = await execute(planned, this.report ?? undefined);
    this.report = report;
    showOutcomes(report);
    this.watch();
    return toFillView(report, loaded.resume?.meta ?? null, this.answers.read(report.planned));
  }

  private watch(): void {
    if (this.stopWatching !== null || this.report === null) return;
    const adapter = this.report.plan.context.adapter;
    let busy = false;
    this.stopWatching = watchPage(this.doc, adapter, () => this.knownFieldIds(), {
      onEdit: () => {
        const report = this.report;
        if (report !== null) this.emit({ type: 'answers', answers: this.answers.read(report.planned) });
      },
      onSubmission: (signal) => {
        const report = this.report;
        if (report !== null) this.emit({ type: 'answers', answers: this.answers.read(report.planned) });
        this.emit({ type: 'submission', signal: signal.kind });
      },
      onNewFields: () => {
        // The Fill's own writes change the page too; say so once, after they settle.
        if (busy) return;
        busy = true;
        void this.queue.then(() => {
          busy = false;
          if (this.hasUnseenFields(adapter)) this.emit({ type: 'formChanged' });
        });
      },
    });
  }

  private knownFieldIds(): ReadonlySet<string> {
    return new Set(this.report?.planned.map((p) => p.field.fieldId));
  }

  private hasUnseenFields(adapter: AtsAdapter): boolean {
    const form = adapter.findForm(this.doc);
    const known = this.knownFieldIds();
    return form !== null && adapter.extract(form).some((f) => !known.has(f.fieldId));
  }

  /** One plan-and-execute at a time: a re-plan while a Fill is still writing would race it. */
  private serially<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task, task);
    // The caller gets any failure through `next`; the queue only waits for it to settle.
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}

async function load(resumeId: string | undefined): Promise<Result<Loaded, ContentError>> {
  const profile = await callBackground('profile.get', {});
  if (!profile.ok) {
    return err({
      reason: 'dataUnavailable',
      message: `Couldn't read your Profile: ${profile.error.reason}`,
      fix: profile.error.fix,
    });
  }
  const { schemaVersion: _version, savedAnswers, ...view } = profile.value;
  const file = await callBackground('resumes.getFile', resumeId === undefined ? {} : { resumeId });
  // No Resume is not an error: the Resume field says "Couldn't fill" with its fix.
  const resume = file.ok ? toResumeFile(file.value.meta, file.value.dataBase64) : null;
  return ok({ profile: view, savedAnswers, resume });
}

function toResumeFile(meta: ResumeMeta, dataBase64: string): ResumeFile {
  return { meta, file: new File([base64ToBytes(dataBase64)], meta.fileName, { type: meta.mimeType }) };
}

function noSession(): ContentError {
  return {
    reason: 'noSession',
    message: 'This page has no Fill to plan again',
    fix: 'Click Fill to start one.',
  };
}
