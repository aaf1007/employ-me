import { atsForFormHost, err, ok, type Result } from '@employ-me/core';
import type { FrameProbe } from '../content/probe';
import type { ContentError } from '../messaging/content';

// The generic fallback (design.md "Job sites"): on a company's own site the
// content script runs only after you click Fill there. The toolbar click that
// opened the side panel granted activeTab for the tab's page; frames from
// other sites need their own permission, which you give on a click of its own
// (BUILD_LOG "Generic fallback").

export interface ProbedFrame extends FrameProbe {
  readonly frameId: number;
}

/** The calls site access makes on one tab; tab-link.ts binds them to chrome.scripting and chrome.tabs. */
export interface TabScripting {
  /** content/probe.ts in every frame employ-me may read, or null when it may not read the tab's page. */
  probe(): Promise<readonly ProbedFrame[] | null>;
  /** True when the content script already answers in that frame. */
  answers(frameId: number): Promise<boolean>;
  /** Runs the content script in these frames. False when Chrome refused. */
  inject(frameIds: readonly number[]): Promise<boolean>;
}

export interface SiteReach {
  /** Every frame the content script runs in now. */
  readonly frameIds: readonly number[];
  /** https origins of frames on the page that employ-me can't read until you allow them. */
  readonly unreachable: readonly string[];
}

export const NO_ACCESS: ContentError = {
  reason: 'noAccess',
  message: 'employ-me can’t read this page yet.',
  fix: 'Click the employ-me icon in Chrome’s toolbar while this page is open, then click Fill.',
};

/** Runs the content script in every frame of the tab employ-me may read and that doesn't have it yet. */
export async function reachSite(tab: TabScripting): Promise<Result<SiteReach, ContentError>> {
  const frames = await tab.probe();
  if (frames === null) return err(NO_ACCESS);
  const pages = frames.filter((frame) => isWebPage(frame.url));
  const answering = await Promise.all(pages.map((frame) => tab.answers(frame.frameId)));
  // Known ATS hosts get the manifest's content script, even if it hasn't loaded yet: never a second copy.
  const missing = pages
    .filter(
      (frame, index) => answering[index] !== true && atsForFormHost(new URL(frame.url).hostname) === null,
    )
    .map((frame) => frame.frameId);
  if (missing.length > 0 && !(await tab.inject(missing))) return err(NO_ACCESS);
  return ok({ frameIds: pages.map((frame) => frame.frameId), unreachable: unreachableOrigins(frames) });
}

/** Origins the page's frames load that no probe answered from: employ-me has no permission there. */
export function unreachableOrigins(frames: readonly ProbedFrame[]): string[] {
  const reached = new Set(frames.flatMap((frame) => originOf(frame.url)));
  const seen = new Set(frames.flatMap((frame) => frame.frameOrigins));
  // The manifest's optional host permission is https only.
  return [...seen].filter((origin) => origin.startsWith('https://') && !reached.has(origin)).sort();
}

/** Match patterns for `permissions.request`: each site, and only it. */
export function originPatterns(origins: readonly string[]): string[] {
  return origins.map((origin) => `${origin}/*`);
}

function isWebPage(href: string): boolean {
  return /^https?:\/\//.test(href);
}

function originOf(href: string): string[] {
  return isWebPage(href) ? [new URL(href).origin] : [];
}
