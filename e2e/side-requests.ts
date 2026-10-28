import type { BrowserContext } from '@playwright/test';
import type { FixtureAts, FormFixture } from './forms';

// Requests a real form makes before Submit, as the candidate fills it in:
// uploading the attached Resume, Lever reading it, Ashby's read queries.
// The specs answer them locally (nothing leaves the machine) and treat every
// other non-GET request as a submission, which fails the spec.

// Ashby autosaves each answer as you type it (ApiSetFormValue): a draft, not a submission.
const ASHBY_SIDE =
  /^Api(JobPosting|OrganizationFromHostedJobsPageName|AutocompleteGeoLocation|SetFormValue|CreateFileUploadHandle|FileUpload\w*|ParseResume\w*)$/;
// Company sites fetch an upload token when a file is attached (helsing.ai: /api/application-document-token).
const GENERIC_UPLOAD = /(upload|document|attachment|presign)/i;

export function isSideRequest(ats: FixtureAts, request: { method: string; url: string }): boolean {
  const url = new URL(request.url);
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return true;
  if (/\.s3[.-][a-z0-9-]*\.?amazonaws\.com$/.test(url.hostname) || url.hostname.endsWith('.amazonaws.com'))
    return true;
  switch (ats) {
    case 'lever':
      return url.pathname === '/parseResume';
    case 'ashby':
      return url.pathname === '/api/non-user-graphql' && ASHBY_SIDE.test(url.searchParams.get('op') ?? '');
    case 'generic':
      return GENERIC_UPLOAD.test(url.pathname);
    case 'greenhouse':
      return false;
  }
}

/**
 * A write to the form's own site that isn't one of the side requests above.
 * Third-party beacons (analytics) are blocked by the harness and aren't
 * submissions.
 */
export function isSubmission(form: FormFixture, request: { method: string; url: string }): boolean {
  return form.hosts.includes(new URL(request.url).hostname) && !isSideRequest(form.ats, request);
}

/** What Lever's resume parser would say about some other person: a Fill must overwrite it. */
export const LEVER_PARSE = {
  name: 'Parsed Person',
  email: 'parsed.person@example.com',
  phone: '+1 555 000 0000',
  position: 'Parsed Company',
  location: { name: 'Parsed City' },
  links: [],
};

export async function stubSideRequests(context: BrowserContext, ats: FixtureAts): Promise<void> {
  // S3 presigned uploads (Greenhouse, Ashby): accept the file, as S3 would.
  await context.route(/amazonaws\.com/, (route) => {
    const cors = {
      'access-control-allow-origin': route.request().headers()['origin'] ?? '*',
      'access-control-allow-methods': 'POST, PUT, GET, OPTIONS',
      'access-control-allow-headers': '*',
      'access-control-expose-headers': 'ETag, Location',
    };
    const method = route.request().method();
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: cors });
    if (method !== 'POST' && method !== 'PUT') return route.fallback();
    const key = 'stash/applications/resumes/stub-sam-lee-resume.pdf';
    return route.fulfill({
      status: 201,
      headers: {
        ...cors,
        'content-type': 'application/xml',
        etag: '"stub"',
        location: `https://uploads.example.com/${key}`,
      },
      body: `<PostResponse><Location>https://uploads.example.com/${key}</Location><Bucket>stub</Bucket><Key>${key}</Key><ETag>"stub"</ETag></PostResponse>`,
    });
  });
  // Chromium reports no upload progress for a request Playwright answers, and
  // Greenhouse's widget leaves "uploading" only at 100%. A real upload reports
  // it; so does this, once the stub has answered.
  await context.addInitScript(() => {
    window.XMLHttpRequest = class extends XMLHttpRequest {
      override send(body?: Document | XMLHttpRequestBodyInit | null): void {
        if (body !== null && body !== undefined) {
          this.addEventListener('load', () => {
            this.upload.dispatchEvent(
              new ProgressEvent('progress', { lengthComputable: true, loaded: 1, total: 1 }),
            );
          });
        }
        super.send(body);
      }
    };
  });
  if (ats === 'lever') {
    await context.route('**/parseResume', async (route) => {
      // Slow on purpose: the engine must wait for the parse before filling.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(LEVER_PARSE),
      });
    });
  }
}
