import { err, ok, toDraftContext, type Draft, type DraftSource, type Result } from '@employ-me/core';
import type { DraftRequest } from '../messaging/content';
import type { BackgroundCall } from './deps';
import type { DraftState, Notice } from './state';

const BOUNDARY_FIX = 'This is a bug in employ-me: copy the debug report and open an issue.';

/**
 * Asks the Provider for a Draft. The context is built only by core's
 * toDraftContext, from whitelisted Profile facts (CLAUDE.md "Hard rules" 2).
 * With `userDraft`, it polishes your own text instead (an AI-use policy form).
 */
export async function requestDraft(
  call: BackgroundCall,
  source: DraftSource,
  request: DraftRequest,
  userDraft?: string,
): Promise<Result<Draft, Notice>> {
  const context = toDraftContext(source, {
    question: request.question,
    mode: userDraft === undefined ? 'write' : 'polish',
    ...(userDraft === undefined ? {} : { userDraft }),
    posting: request.posting,
    ...(request.employer === undefined ? {} : { employer: request.employer }),
  });
  if (!context.ok) {
    return err({
      message:
        context.error.reason === 'invalid'
          ? 'employ-me could not build this Draft request'
          : 'employ-me refused to send a sensitive field to the AI',
      fix: BOUNDARY_FIX,
    });
  }
  const answer = await call('helper.draftAnswer', { input: context.value });
  return answer.ok ? ok(answer.value.draft) : err({ message: answer.error.message, fix: answer.error.fix });
}

export function startedDraft(request: DraftRequest): DraftState {
  const polish = request.mode === 'polish';
  return {
    request,
    status: polish ? 'yourDraft' : 'drafting',
    text: '',
    flagged: [],
    polished: false,
  };
}

export function readyDraft(request: DraftRequest, draft: Draft, polished: boolean): DraftState {
  return {
    request,
    status: 'ready',
    text: draft.text,
    flagged: draft.claims.filter((c) => c.support === 'unsupported').map((c) => c.text),
    polished,
  };
}

export function failedDraft(previous: DraftState, error: Notice): DraftState {
  return { ...previous, status: previous.request.mode === 'polish' ? 'yourDraft' : 'failed', error };
}
