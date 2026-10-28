import type { DraftSource, MapFieldsInput, Result } from '@employ-me/core';
import type { ContentError, FieldView, FillView, ProviderFeedbackMessage } from '../messaging/content';
import type { PanelDeps } from './deps';
import { failedDraft, readyDraft, requestDraft, startedDraft } from './drafts';
import type { DraftState, PanelState, Store } from './state';

const ROUNDS = 3;

/**
 * The AI half of a Fill, run from the side panel (only extension pages may
 * reach the helper): sends the content script's `providerRequest` to
 * mapFields, drafts every required free-text question at once, and feeds
 * both back so the content script plans again. Then the Drafts you accept.
 * The AI never blocks a Fill: when it's unavailable the rules' Fill stands
 * and the fields that needed it say so, with the helper's fix.
 */
export class FillFlow {
  private feedback: ProviderFeedbackMessage = {};

  constructor(
    private readonly store: Store<PanelState>,
    private readonly deps: PanelDeps,
    private readonly draftSource: () => DraftSource | null,
  ) {}

  /** A new document (the next page of the form, or another Posting): its field ids start over. */
  reset(): void {
    this.feedback = {};
    this.store.set({ view: null, drafts: {}, provider: { state: 'pending' } });
  }

  /** Takes a Fill's first result and asks the Provider about whatever it couldn't do alone. */
  async run(first: Result<FillView, ContentError>): Promise<void> {
    if (!first.ok) {
      this.store.set({ fill: 'idle', notice: first.error });
      return;
    }
    let view = first.value;
    this.show(view);
    for (let round = 0; round < ROUNDS; round++) {
      const request = this.feedback.state === 'unavailable' ? null : view.providerRequest;
      const toDraft = view.fields.filter(
        (f) => f.awaiting === 'draft' && f.draft !== undefined && !(f.fieldId in this.store.get().drafts),
      );
      if (request === null && toDraft.length === 0) break;
      this.store.set({ fill: 'asking' });
      await Promise.all([request === null ? null : this.mapFields(request), this.draftAll(toDraft)]);
      this.feedback = { ...this.feedback, state: this.feedback.state ?? 'answered' };
      const next = await this.deps.tab.feedback(this.feedback);
      if (!next.ok) {
        this.store.set({ notice: next.error });
        break;
      }
      view = next.value;
      this.show(view);
    }
    this.store.set({ fill: 'done' });
  }

  /** Asks the Provider again after it was unavailable. */
  async retryProvider(): Promise<void> {
    const { state: _state, unavailableFix: _fix, ...rest } = this.feedback;
    this.feedback = rest;
    this.store.set({ provider: { state: 'pending' }, fill: 'asking' });
    await this.run(await this.deps.tab.feedback(this.feedback));
  }

  setText(fieldId: string, text: string): void {
    const draft = this.store.get().drafts[fieldId];
    if (draft !== undefined) this.putDraft(fieldId, { ...draft, text });
  }

  /**
   * The Draft button (optional questions and cover letters), Retry, and
   * Polish: in polish mode the Provider only tidies the text you wrote.
   */
  async draft(fieldId: string): Promise<void> {
    const field = this.store.get().view?.fields.find((f) => f.fieldId === fieldId);
    const request = field?.draft;
    if (request === undefined) return;
    const current = this.store.get().drafts[fieldId] ?? startedDraft(request);
    const polish = request.mode === 'polish';
    if (polish && current.text.trim() === '') {
      this.putDraft(fieldId, { ...current, status: 'yourDraft' });
      return;
    }
    this.putDraft(fieldId, { ...current, status: 'drafting' });
    const source = this.draftSource();
    if (source === null) return;
    const draft = await requestDraft(this.deps.call, source, request, polish ? current.text : undefined);
    this.putDraft(
      fieldId,
      draft.ok ? readyDraft(request, draft.value, polish) : failedDraft(current, draft.error),
    );
    const failed = new Set(this.feedback.draftsFailed);
    if (draft.ok) failed.delete(fieldId);
    else failed.add(fieldId);
    await this.replan({
      draftsReady: draft.ok
        ? [...new Set([...(this.feedback.draftsReady ?? []), fieldId])]
        : (this.feedback.draftsReady ?? []),
      draftsFailed: [...failed],
    });
  }

  /** Writes the Draft as you left it into the form, through act, and keeps it as a Saved Answer. */
  async accept(fieldId: string): Promise<void> {
    const draft = this.store.get().drafts[fieldId];
    if (draft === undefined || draft.text.trim() === '') return;
    const text = draft.text.trim();
    this.putDraft(fieldId, { ...draft, text, status: 'accepted' });
    await this.replan({
      accepted: [...(this.feedback.accepted ?? []).filter((a) => a.fieldId !== fieldId), { fieldId, text }],
      draftsReady: (this.feedback.draftsReady ?? []).filter((id) => id !== fieldId),
    });
    const { question, fieldType, employer } = draft.request;
    const saved = await this.deps.call('savedAnswers.saveAcceptedDraft', {
      question: question.label,
      answer: text,
      fieldType,
      ...(employer === undefined ? {} : { employer }),
    });
    if (!saved.ok) {
      this.store.set({
        notice: {
          message: 'Your answer is in the form, but it wasn’t kept as a Saved Answer.',
          fix: saved.error.fix,
        },
      });
    }
  }

  /** Uses a similar Saved Answer the AI found (design.md "Who fills what": it goes to review first). */
  async useSuggestion(fieldId: string): Promise<void> {
    const field = this.store.get().view?.fields.find((f) => f.fieldId === fieldId);
    if (field?.suggestion === undefined) return;
    await this.replan({
      accepted: [
        ...(this.feedback.accepted ?? []).filter((a) => a.fieldId !== fieldId),
        { fieldId, text: field.suggestion },
      ],
    });
  }

  private async replan(changes: ProviderFeedbackMessage): Promise<void> {
    this.feedback = { ...this.feedback, ...changes };
    const next = await this.deps.tab.feedback(this.feedback);
    if (next.ok) this.show(next.value);
    else this.store.set({ notice: next.error });
  }

  private async mapFields(input: MapFieldsInput): Promise<void> {
    const answer = await this.deps.call('helper.mapFields', { input });
    if (!answer.ok) {
      this.feedback = { ...this.feedback, state: 'unavailable', unavailableFix: answer.error.fix };
      this.store.set({
        provider: { state: 'unavailable', notice: { message: answer.error.message, fix: answer.error.fix } },
      });
      return;
    }
    const mapped = new Set(answer.value.mappings.map((m) => m.fieldId));
    this.feedback = {
      ...this.feedback,
      state: 'answered',
      mappings: [
        ...(this.feedback.mappings ?? []).filter((m) => !mapped.has(m.fieldId)),
        ...answer.value.mappings,
      ],
    };
    this.store.set({ provider: { state: 'answered' } });
  }

  /** Every required free-text question at once (design.md "Drafts"). Polish mode waits for your text. */
  private async draftAll(fields: readonly FieldView[]): Promise<void> {
    const source = this.draftSource();
    const ready: string[] = [];
    const failed: string[] = [];
    await Promise.all(
      fields.map(async ({ fieldId, draft: request }) => {
        if (request === undefined) return;
        const started = startedDraft(request);
        this.putDraft(fieldId, started);
        if (request.mode === 'polish') {
          ready.push(fieldId);
          return;
        }
        if (source === null) return;
        const draft = await requestDraft(this.deps.call, source, request);
        this.putDraft(
          fieldId,
          draft.ok ? readyDraft(request, draft.value, false) : failedDraft(started, draft.error),
        );
        if (draft.ok) ready.push(fieldId);
        else {
          failed.push(fieldId);
          if (this.feedback.state === undefined) this.unavailable(draft.error);
        }
      }),
    );
    // fill keeps a required question waiting until its Draft is ready or reported failed.
    this.feedback = {
      ...this.feedback,
      draftsReady: [...new Set([...(this.feedback.draftsReady ?? []), ...ready])],
      ...(failed.length === 0
        ? {}
        : { draftsFailed: [...new Set([...(this.feedback.draftsFailed ?? []), ...failed])] }),
    };
  }

  private unavailable(notice: { message: string; fix: string }): void {
    this.feedback = { ...this.feedback, state: 'unavailable', unavailableFix: notice.fix };
    this.store.set({ provider: { state: 'unavailable', notice } });
  }

  private putDraft(fieldId: string, draft: DraftState): void {
    this.store.set({ drafts: { ...this.store.get().drafts, [fieldId]: draft } });
  }

  private show(view: FillView): void {
    const { provider } = this.store.get();
    this.store.set({
      view,
      answers: view.answers,
      ...(provider.state === 'pending' && this.feedback.state === 'answered'
        ? { provider: { state: 'answered' } }
        : {}),
    });
  }
}
