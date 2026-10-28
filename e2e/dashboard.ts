import { readFile } from 'node:fs/promises';
import type { Locator, Page } from '@playwright/test';

// Helpers for the dashboard specs. Data is obviously fake (CODING_STANDARDS.md "Privacy").

/**
 * Sends one message to the background from an extension page, the way the
 * side panel and the content script do (packages/extension/src/messaging/background.ts).
 */
export function sendToBackground(page: Page, type: string, payload: unknown): Promise<unknown> {
  return page.evaluate(
    async ([t, p]) => {
      const { chrome } = globalThis as unknown as {
        chrome: { runtime: { sendMessage(message: unknown): Promise<unknown> } };
      };
      return chrome.runtime.sendMessage({ to: 'employ-me/background', type: t, payload: p });
    },
    [type, payload] as const,
  );
}

export function greenhousePosting(jobId: string, company: string, title: string) {
  return {
    key: { ats: 'greenhouse', employer: company.toLowerCase(), jobId },
    url: `https://job-boards.greenhouse.io/${company.toLowerCase()}/jobs/${jobId}`,
    title,
    company,
    location: 'Toronto, ON',
    country: 'CA',
  };
}

/** Clicks a link or button that downloads a file, and returns the file's text and name. */
export async function download(page: Page, trigger: Locator): Promise<{ name: string; text: string }> {
  const [file] = await Promise.all([page.waitForEvent('download'), trigger.click()]);
  const path = await file.path();
  return { name: file.suggestedFilename(), text: await readFile(path, 'utf8') };
}

/** A file for an <input type="file">. */
export function fileOf(name: string, text: string, mimeType: string) {
  return { name, mimeType, buffer: Buffer.from(text) };
}
