import type { Application, Posting, ResumeMeta, SubmittedAnswer } from '@employ-me/core';
import type { Detected, DraftRequest, FillView } from '../messaging/content';
import type { ApplicationSummary } from '../storage';

/** A reason and a fix, as every error that reaches you carries (CODING_STANDARDS.md "Errors"). */
export interface Notice {
  readonly message: string;
  readonly fix: string;
}

export type DraftStatus =
  /** Asking the Provider. */
  | 'drafting'
  /** Polish mode (the form has an AI-use policy): waiting for your own text. */
  | 'yourDraft'
  /** A Draft is waiting for you to accept, edit or reject it. */
  | 'ready'
  | 'failed'
  /** In the form, and kept as a Saved Answer. */
  | 'accepted';

export interface DraftState {
  readonly request: DraftRequest;
  readonly status: DraftStatus;
  /** The text you accept: the Draft, as you edited it. */
  readonly text: string;
  /** Claims that don't come from your information (design.md "Drafts"). */
  readonly flagged: readonly string[];
  /** Polished from your own text. */
  readonly polished: boolean;
  readonly error?: Notice;
}

export type ProviderState =
  | { readonly state: 'pending' }
  | { readonly state: 'answered' }
  | { readonly state: 'unavailable'; readonly notice: Notice };

export type SubmissionState =
  | { readonly state: 'none' }
  /** You left a filled form without the job site confirming: "Did you apply?" */
  | { readonly state: 'askDidYouApply' }
  | { readonly state: 'recording' }
  | { readonly state: 'recorded'; readonly application: Application }
  | { readonly state: 'declined' };

export interface PanelState {
  /** `unknownSite`: no content script on this page; Fill runs the generic fallback (design.md "Job sites"). */
  readonly phase: 'detecting' | 'noForm' | 'unknownSite' | 'ready';
  readonly detected: Detected | null;
  /** The tab's address on an unknown site, when Chrome lets employ-me know it. */
  readonly pageUrl: string | null;
  /** Sites of frames on the page that employ-me can't read until you allow them. */
  readonly unreachable: readonly string[];
  /** The Posting, with what its public job API adds. */
  readonly posting: Posting | null;
  /** Applications for this Posting: the already-applied warning. */
  readonly applied: readonly ApplicationSummary[];
  readonly resumes: readonly ResumeMeta[];
  /** The Resume for this Application. Starts at the default Resume. */
  readonly resumeId: string | null;
  readonly fill: 'idle' | 'filling' | 'asking' | 'done';
  readonly view: FillView | null;
  readonly provider: ProviderState;
  readonly drafts: Readonly<Record<string, DraftState>>;
  readonly submission: SubmissionState;
  /** What the form last showed, across its steps: the Snapshot's answers. */
  readonly answers: readonly SubmittedAnswer[];
  readonly notice: Notice | null;
}

export const INITIAL_STATE: PanelState = {
  phase: 'detecting',
  detected: null,
  pageUrl: null,
  unreachable: [],
  posting: null,
  applied: [],
  resumes: [],
  resumeId: null,
  fill: 'idle',
  view: null,
  provider: { state: 'pending' },
  drafts: {},
  submission: { state: 'none' },
  answers: [],
  notice: null,
};

/** A tiny observable for useSyncExternalStore. */
export class Store<S> {
  private readonly listeners = new Set<() => void>();
  constructor(private state: S) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly get = (): S => this.state;

  set(changes: Partial<S>): void {
    this.state = { ...this.state, ...changes };
    for (const listener of this.listeners) listener();
  }
}
