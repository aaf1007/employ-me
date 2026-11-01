import { describe, expect, it } from 'vitest';
import type { BackgroundMessageType } from '../messaging/background';
import { AnswerOffer } from './answer-offer';
import type { BackgroundCall } from './deps';
import { INITIAL_STATE, Store, type PanelState } from './state';
import { deps, fakeBackground, fakeTab, field, PROFILE, settle } from './test-fakes';

// The offer belongs to the page it was made on (design.md "Keeping answers
// you gave on the form"): once you leave that page, nothing that page
// started may show or change anything.

const WHY = field('why', 'unknown', {
  kind: 'couldNotFill',
  fieldId: 'why',
  fieldType: 'unknown',
  reason: 'providerUnavailable',
  fix: 'Answer it yourself.',
});
const ANSWERS = [{ label: 'why', fieldType: 'unknown', value: 'My own words.' }] as const;

/** A background whose answers to `held` wait until `release` is called. */
function heldBackground(held: BackgroundMessageType, saveFails: boolean) {
  const bg = fakeBackground({
    'profile.get': () => ({ ok: true, value: PROFILE }),
    'savedAnswers.saveFormAnswers': () =>
      saveFails
        ? { ok: false, error: { reason: 'storageFailed', message: 'Disk full', fix: 'Free some space.' } }
        : { ok: true, value: [] },
  });
  const waiting: (() => void)[] = [];
  const gate = new Promise<void>((resolve) => {
    waiting.push(resolve);
  });
  const release = () => {
    for (const resolve of waiting) resolve();
  };
  const call: BackgroundCall = async (type, payload) => {
    if (type === held) await gate;
    return bg.call(type, payload);
  };
  return { call, calls: bg.calls, release };
}

function setup(held: BackgroundMessageType, saveFails = false) {
  const store = new Store<PanelState>({ ...INITIAL_STATE, view: viewWith() });
  const bg = heldBackground(held, saveFails);
  return { store, bg, offer: new AnswerOffer(store, deps(fakeTab().tab, bg.call)) };
}

function viewWith(): PanelState['view'] {
  return {
    ats: 'greenhouse',
    url: 'https://job-boards.greenhouse.io/acme/jobs/1',
    posting: null,
    aiPolicy: false,
    fields: [WHY],
    providerRequest: null,
    answers: [],
    resume: null,
  };
}

describe('AnswerOffer', () => {
  it('keeps the employer with the offer it was made for', async () => {
    const { store, bg, offer } = setup('helper.health');
    await offer.open(ANSWERS, 'acme');
    const open = store.get().offer;
    if (open.state !== 'open') expect.fail('no offer');
    offer.toggle(open.answers[0]?.key ?? '');
    await offer.save();
    expect(bg.calls.find((c) => c.type === 'savedAnswers.saveFormAnswers')?.payload).toMatchObject({
      employer: 'acme',
    });
  });

  it.each([true, false])(
    'a save that ends after you left the page changes nothing (save fails: %s)',
    async (saveFails) => {
      const { store, bg, offer } = setup('savedAnswers.saveFormAnswers', saveFails);
      await offer.open(ANSWERS, 'acme');
      const open = store.get().offer;
      if (open.state !== 'open') expect.fail('no offer');
      offer.toggle(open.answers[0]?.key ?? '');
      const saving = offer.save();
      await settle();
      offer.reset();
      bg.release();
      await saving;
      // Not the old offer back with its ticks (a retry would have no employer), nor "Kept".
      expect(store.get().offer).toEqual({ state: 'none' });
      expect(store.get().notice).toBeNull();
    },
  );

  it('an offer that would open after you left the page doesn’t', async () => {
    const { store, bg, offer } = setup('profile.get');
    const opening = offer.open(ANSWERS, 'acme');
    await settle();
    offer.reset();
    bg.release();
    await opening;
    expect(store.get().offer).toEqual({ state: 'none' });
  });
});
