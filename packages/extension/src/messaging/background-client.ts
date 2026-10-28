import { err, ok, type Result } from '@employ-me/core';
import { browser } from 'wxt/browser';
import {
  BACKGROUND_ADDRESS,
  messageError,
  responseSchemaFor,
  type BackgroundError,
  type BackgroundMessageType,
  type BackgroundRequest,
  type BackgroundResponse,
} from './background';

/**
 * Sends one message to the background and parses its answer. Works from
 * extension pages and from the ATS content script. Never throws: a
 * background that can't be reached is `backgroundUnavailable`.
 */
export async function callBackground<T extends BackgroundMessageType>(
  type: T,
  payload: BackgroundRequest<T>,
): Promise<Result<BackgroundResponse<T>, BackgroundError>> {
  let raw: unknown;
  try {
    raw = await browser.runtime.sendMessage({ to: BACKGROUND_ADDRESS, type, payload });
  } catch (error) {
    return err(
      messageError(
        'backgroundUnavailable',
        `The background didn't answer ${type}: ${error instanceof Error ? error.message : 'unknown error'}`,
      ),
    );
  }
  const parsed = responseSchemaFor(type).safeParse(raw);
  if (!parsed.success) {
    return err(messageError('invalidMessage', `The background's answer to ${type} didn't match its schema`));
  }
  return parsed.data.ok ? ok(parsed.data.value) : err(parsed.data.error);
}
