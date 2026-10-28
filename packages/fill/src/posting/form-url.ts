import { atsForFormHost } from '@employ-me/core';
import { canonicalPostingUrl, isUuid } from './key';
import { workdayPosting } from './workday';

/**
 * The Application Form's address, when `postingPage` is a Posting's
 * description page and its ATS keeps the form at another address (research
 * §4): Lever `/{co}/{id}` → `/{co}/{id}/apply`, Ashby `/{org}/{id}` →
 * `/{org}/{id}/application`, Workday `…/job/…/{slug}_{id}` →
 * `…/apply/applyManually`. Null for every other page, the form itself
 * included, and always for Greenhouse, whose form is on the description page.
 * The side panel navigates there; nothing on the page is clicked (design.md
 * "Starting a Fill").
 */
export function applicationFormUrl(postingPage: URL): URL | null {
  const page = canonicalPostingUrl(postingPage);
  const parts = page.pathname.split('/').filter((p) => p !== '');
  switch (atsForFormHost(page.hostname)) {
    case 'lever':
      return parts.length === 2 && isUuid(parts[1] ?? '') ? at(page, [...parts, 'apply']) : null;
    case 'ashby':
      return parts.length === 2 && isUuid(parts[1] ?? '') ? at(page, [...parts, 'application']) : null;
    case 'workday': {
      // Only `/job/` pages ending at the Posting's own segment; `/details/` pages and the apply flow aren't one.
      const posting = workdayPosting(page);
      const path = parts.join('/');
      return posting !== null && path.endsWith(`/job/${posting.jobPath}`)
        ? at(page, [...parts, 'apply', 'applyManually'])
        : null;
    }
    case 'greenhouse':
    case null:
      return null;
  }
}

function at(page: URL, parts: readonly string[]): URL {
  const form = new URL(page.href);
  form.pathname = `/${parts.join('/')}`;
  return form;
}
