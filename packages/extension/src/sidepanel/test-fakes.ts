import {
  emptyProfile,
  err,
  ok,
  profileSchema,
  toProviderField,
  type FieldDescriptor,
  type FieldOutcome,
  type FieldType,
  type MapFieldsInput,
  type Profile,
} from '@employ-me/core';
import { responseSchemaFor, type BackgroundMessageType } from '../messaging/background';
import type {
  Detected,
  DraftRequest,
  FieldView,
  FillView,
  ProviderFeedbackMessage,
  SessionEvent,
} from '../messaging/content';
import type { BackgroundCall, PanelDeps } from './deps';
import type { TabLink } from './tab-link';

// Test-only fakes for the side panel's controller: a tab whose content
// script answers from a script, and a background answering from a table.
// Obviously fake data (CODING_STANDARDS.md "Privacy").

export const PROFILE: Profile = profileSchema.parse({
  ...emptyProfile(),
  identity: { legalName: { first: 'Sam', last: 'Lee' } },
  contact: { email: 'sam.lee@example.com' },
  address: { line1: '100 Queen St W', city: 'Toronto', region: 'ON', postalCode: 'M5H 2N2', country: 'CA' },
  resumes: [
    {
      id: 'r1',
      label: 'General',
      fileName: 'sam-lee.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10,
      addedAt: '2026-10-28T00:00:00Z',
      isDefault: true,
    },
  ],
});

export const POSTING = {
  key: { ats: 'greenhouse', employer: 'acme', jobId: '1' },
  url: 'https://job-boards.greenhouse.io/acme/jobs/1',
  title: 'Engineer',
  company: 'Acme',
} as const;

export const DETECTED: Detected = {
  type: 'detected',
  ats: 'greenhouse',
  url: 'https://job-boards.greenhouse.io/acme/jobs/1?gh_src=x',
  topFrame: true,
  fieldCount: 3,
  posting: POSTING,
  confirmed: false,
};

export function field(
  fieldId: string,
  fieldType: FieldType,
  outcome: FieldOutcome | null,
  extra: Partial<FieldView> = {},
): FieldView {
  return {
    fieldId,
    label: fieldId,
    required: true,
    control: 'text',
    optionCount: 0,
    fieldType,
    classifiedBy: 'rules',
    outcome,
    onPage: true,
    userEdited: false,
    ...extra,
  };
}

export const WHY: DraftRequest = {
  fieldId: 'why',
  fieldType: 'freeText.question',
  question: { label: 'Why Acme?', required: true, language: 'en' },
  mode: 'write',
  posting: { title: 'Engineer', company: 'Acme' },
  employer: 'acme',
};

export function providerRequest(descriptors: readonly FieldDescriptor[]): MapFieldsInput {
  return {
    ats: 'greenhouse',
    fields: descriptors.map((d) => {
      const result = toProviderField(d, 'unknown');
      if (!result.ok) throw new Error('fixture should be provider-safe');
      return result.value;
    }),
    savedQuestions: [],
  };
}

/**
 * A content script for a form with a name (rules fill it), an unknown field
 * (the Provider maps it) and a required "Why Acme?" (a Draft). Each answer
 * follows the feedback the panel sends, as plan() would.
 */
export function fakeTab(options: { readonly aiPolicy?: boolean } = {}) {
  const sent: Array<{ type: string; provider?: ProviderFeedbackMessage }> = [];
  let onEvent: (event: SessionEvent) => void = () => undefined;
  let onGone: () => void = () => undefined;
  let watched: { onLoaded: () => void; onClosed: () => void } | null = null;
  let detected: Detected | null = DETECTED;
  const view = (feedback: ProviderFeedbackMessage): FillView => {
    const accepted = feedback.accepted?.find((a) => a.fieldId === 'why');
    const mapped = feedback.mappings?.some((m) => m.fieldId === 'u') ?? false;
    const unavailable = feedback.state === 'unavailable';
    const fix = feedback.unavailableFix ?? 'fix';
    const why: FieldOutcome | null =
      accepted !== undefined
        ? { kind: 'filled', fieldId: 'why', fieldType: 'freeText.question', source: 'savedAnswer' }
        : feedback.draftsReady?.includes('why') === true
          ? { kind: 'needsReview', fieldId: 'why', fieldType: 'freeText.question', reason: 'draftReady' }
          : unavailable
            ? {
                kind: 'couldNotFill',
                fieldId: 'why',
                fieldType: 'freeText.question',
                reason: 'providerUnavailable',
                fix,
              }
            : null;
    return {
      ats: 'greenhouse',
      url: DETECTED.url,
      posting: POSTING,
      aiPolicy: options.aiPolicy ?? false,
      fields: [
        field('name', 'name.full', {
          kind: 'filled',
          fieldId: 'name',
          fieldType: 'name.full',
          source: 'rules',
        }),
        field(
          'u',
          'contact.email',
          mapped
            ? { kind: 'needsReview', fieldId: 'u', fieldType: 'contact.email', reason: 'providerMatched' }
            : unavailable
              ? {
                  kind: 'couldNotFill',
                  fieldId: 'u',
                  fieldType: 'unknown',
                  reason: 'providerUnavailable',
                  fix,
                }
              : null,
          mapped || unavailable ? {} : { awaiting: 'mapping' },
        ),
        field('why', 'freeText.question', why, {
          control: 'textarea',
          ...(why === null ? { awaiting: 'draft' } : {}),
          draft: { ...WHY, mode: options.aiPolicy === true ? 'polish' : 'write' },
        }),
      ],
      providerRequest:
        mapped || unavailable
          ? null
          : providerRequest([
              { fieldId: 'u', label: 'Contact', control: 'text', options: [], required: false },
            ]),
      answers: [{ label: 'name', fieldType: 'name.full', value: 'Sam Lee' }],
      resume: { id: 'r1', label: 'General', fileName: 'sam-lee.pdf' },
    };
  };
  const tab: TabLink = {
    detect: () => Promise.resolve(detected),
    fill: (request) => {
      sent.push({ type: request.type });
      return Promise.resolve(ok(view({})));
    },
    feedback: (provider) => {
      sent.push({ type: 'feedback', provider });
      return Promise.resolve(ok(view(provider)));
    },
    endSession: () => {
      sent.push({ type: 'endSession' });
      return Promise.resolve();
    },
    openSession: (event, gone) => {
      onEvent = event;
      onGone = gone;
      return () => undefined;
    },
    watch: (handlers) => {
      watched = handlers;
      return () => {
        watched = null;
      };
    },
  };
  return {
    tab,
    sent,
    emit: (event: SessionEvent) => {
      onEvent(event);
    },
    /** The form's page goes away, and the tab loads `next`. */
    navigate: (next: Detected | null) => {
      onGone();
      detected = next;
      watched?.onLoaded();
    },
  };
}

type Script = { readonly [T in BackgroundMessageType]?: (payload: unknown) => unknown };

/** A background answering each message from `script` (raw JSON, parsed as the real client does). */
export function fakeBackground(script: Script) {
  const calls: Array<{ type: BackgroundMessageType; payload: unknown }> = [];
  const call: BackgroundCall = async (type, payload) => {
    calls.push({ type, payload });
    await Promise.resolve();
    const answer = script[type]?.(payload) ?? {
      ok: false,
      error: { reason: 'invalidMessage', message: type, fix: 'x' },
    };
    const parsed = responseSchemaFor(type).safeParse(JSON.parse(JSON.stringify(answer)));
    if (!parsed.success) throw new Error(`fake answer for ${type} doesn't match its schema`);
    return parsed.data.ok ? ok(parsed.data.value) : err(parsed.data.error);
  };
  return { call, calls };
}

export function deps(tab: TabLink, call: BackgroundCall): PanelDeps {
  return {
    tab,
    call,
    fetchPosting: () => Promise.resolve(ok({ description: 'From the public API.' })),
    now: () => new Date('2026-10-28T12:00:00Z'),
    detectAttempts: 2,
    detectIntervalMs: 1,
  };
}

/** Lets queued promise callbacks run. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}
