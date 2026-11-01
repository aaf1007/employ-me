import type { SubmittedAnswer } from '@employ-me/core';
import type { FieldView } from '../messaging/content';
import type { PanelDeps } from './deps';
import { offeredAnswers } from './offered-answers';
import type { PanelState, Store } from './state';

/**
 * The offer to keep the answers you gave on the form, once an Application is
 * created (design.md "Keeping answers you gave on the form"). Opt-in per
 * answer: nothing starts ticked, and nothing is kept until you click Save.
 * Saving stays on the machine, through the background's Saved Answers.
 */
export class AnswerOffer {
  /** Bumped when you leave the page: what an earlier page started then shows and changes nothing. */
  private generation = 0;
  /** The Fill's fields on earlier pages of a form whose steps are separate pages. */
  private carried: readonly FieldView[] = [];
  /** Fields on this page you changed since the Fill wrote them (the content script's EditLog). */
  private edited: ReadonlySet<string> = new Set();

  constructor(
    private readonly store: Store<PanelState>,
    private readonly deps: PanelDeps,
  ) {}

  noteEdited(fieldIds: readonly string[]): void {
    this.edited = new Set(fieldIds);
  }

  /** This page's document went away: its fields, with your edits, stay in the offer. */
  carry(): void {
    this.carried = [...this.carried, ...this.withEdits()];
    this.edited = new Set();
  }

  /**
   * Offers what the Fill's fields, across its pages, and the form's last
   * answers hold. Nothing shows when there is nothing to keep.
   */
  async open(answers: readonly SubmittedAnswer[], employer: string | null): Promise<void> {
    const generation = this.generation;
    const fields = [...this.carried, ...this.withEdits()];
    // Your Saved Answers now, not when the form loaded: Drafts you accepted since are already kept.
    const profile = await this.deps.call('profile.get', {});
    if (!profile.ok || generation !== this.generation) return;
    const offered = offeredAnswers(fields, answers, profile.value.savedAnswers, employer);
    this.store.set({
      offer:
        offered.length === 0
          ? { state: 'none' }
          : { state: 'open', employer, answers: offered, ticked: [], saving: false },
    });
  }

  toggle(key: string): void {
    const offer = this.store.get().offer;
    if (offer.state !== 'open' || offer.saving) return;
    const ticked = offer.ticked.includes(key)
      ? offer.ticked.filter((k) => k !== key)
      : [...offer.ticked, key];
    this.store.set({ offer: { ...offer, ticked } });
  }

  async save(): Promise<void> {
    const offer = this.store.get().offer;
    if (offer.state !== 'open' || offer.saving) return;
    const chosen = offer.answers.filter((a) => offer.ticked.includes(a.key));
    if (chosen.length === 0) return;
    const generation = this.generation;
    this.store.set({ offer: { ...offer, saving: true }, notice: null });
    const saved = await this.deps.call('savedAnswers.saveFormAnswers', {
      answers: chosen.map(({ question, answer, fieldType }) => ({ question, answer, fieldType })),
      ...(offer.employer === null ? {} : { employer: offer.employer }),
    });
    if (generation !== this.generation) return;
    if (!saved.ok) {
      this.store.set({
        offer: { ...offer, saving: false },
        notice: { message: 'Your answers weren’t kept as Saved Answers.', fix: saved.error.fix },
      });
      return;
    }
    this.store.set({ offer: { state: 'saved', count: saved.value.length } });
  }

  /** Not now: nothing is kept. */
  close(): void {
    if (this.store.get().offer.state === 'open') this.store.set({ offer: { state: 'closed' } });
  }

  /** A new Fill, or another Posting. */
  reset(): void {
    this.generation++;
    this.carried = [];
    this.edited = new Set();
    this.store.set({ offer: { state: 'none' } });
  }

  /** This page's fields, each marked changed by you when you changed it since the Fill wrote it. */
  private withEdits(): FieldView[] {
    const fields = this.store.get().view?.fields ?? [];
    return fields.map((f) => (this.edited.has(f.fieldId) ? { ...f, userEdited: true } : f));
  }
}
