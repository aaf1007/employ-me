import { profileSchema, resumeMetaSchema, type FieldOutcome } from '@employ-me/core';
import { beforeEach, describe, expect, it } from 'vitest';
import usApply from '../../../../fixtures/workday/synthetic-us-apply.html?raw';
import { plan } from '../plan';
import { loadPage, render } from '../test-support/dom';
import { confirmUploads } from './upload';

// "Filled" for a Resume means the form shows it uploaded, under the name of
// the Resume you chose (research 2026-10-28 §7.1). Live test, 2026-10-28:
// Greenhouse still showed "uploading" while the side panel said Filled.
// jsdom has no DataTransfer, so these set up what each form shows after an
// attach; e2e runs the attach itself.

const profile = profileSchema.parse({
  schemaVersion: 1,
  identity: { legalName: { first: 'Sam', last: 'Lee' } },
  contact: { email: 'sam.lee@example.com' },
});
const meta = resumeMetaSchema.parse({
  id: 'r1',
  label: 'General',
  fileName: 'sam-lee-resume.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 320,
  addedAt: '2026-10-28T00:00:00Z',
  isDefault: true,
});
const resume = { meta, file: new File(['%PDF'], meta.fileName, { type: meta.mimeType }) };

const GREENHOUSE = new URL('https://job-boards.greenhouse.io/acme/jobs/4001');
const LEVER = new URL('https://jobs.lever.co/acme/0b2c9a3e-1111-4222-8333-444455556666/apply');
const GENERIC = new URL('https://careers.example.com/apply');
const WORKDAY = new URL(
  'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/US-Remote/Software-Engineer--OpenShell_JR2020825/apply/applyManually',
);

/**
 * Plans the page, lets `show` change it as the form would after an attach,
 * then checks its Resume field as if this execute attached it `agoMs` ago.
 */
async function check(url: URL, show = () => {}, agoMs = 60_000): Promise<FieldOutcome | undefined> {
  const planned = plan(document, profile, [], { url, resume });
  show();
  const file = planned.fields.find((p) => p.fieldType === 'file.resume');
  if (file === undefined) throw new Error('no Resume field');
  const filled: FieldOutcome = {
    kind: 'filled',
    fieldId: file.field.fieldId,
    fieldType: 'file.resume',
    source: 'rules',
  };
  const [outcome] = await confirmUploads([filled], {
    adapter: planned.context.adapter,
    resume: resume.file,
    planned: planned.fields,
    attachedAt: new Map([[file.field.fieldId, Date.now() - agoMs]]),
  });
  return outcome;
}

const greenhouseForm = () =>
  render(`<form id="application-form">
    <div role="group" aria-labelledby="upload-label-resume" class="file-upload">
      <div id="upload-label-resume" class="label upload-label">Resume/CV<span class="required">*</span></div>
      <div class="file-upload__wrapper"><div class="button-container"><input id="resume" type="file"></div></div>
    </div>
    <button type="submit">Submit application</button></form>`);

/** What Greenhouse's widget shows in place of its buttons once a file is attached. */
function greenhouseShows(html: string, labelError = false): void {
  const wrapper = document.querySelector('.file-upload__wrapper');
  if (wrapper === null) throw new Error('no widget');
  wrapper.innerHTML = html;
  if (labelError) document.querySelector('#upload-label-resume')?.classList.add('upload-label--error');
}

const PROGRESS =
  '<div role="progressbar" aria-valuenow="40" class="file-upload__progressbar"><span></span></div>';
const filename = (name: string) =>
  `<div class="file-upload__filename"><span>${name}</span><button aria-label="Remove file"></button></div>`;

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('confirmUploads on Greenhouse', () => {
  beforeEach(greenhouseForm);

  it('is Filled once the widget shows the Resume you chose', async () => {
    expect(
      await check(GREENHOUSE, () => {
        greenhouseShows(filename('sam-lee-resume.pdf'));
      }),
    ).toEqual({
      kind: 'filled',
      fieldId: 'resume',
      fieldType: 'file.resume',
      source: 'rules',
    });
  });

  it('goes to review while the widget is still uploading', async () => {
    expect(
      await check(GREENHOUSE, () => {
        greenhouseShows(PROGRESS);
      }),
    ).toMatchObject({
      kind: 'needsReview',
      reason: 'fileUploading',
    });
  });

  it('waits for an upload that finishes soon after the attach', async () => {
    const show = () => {
      greenhouseShows(PROGRESS);
      setTimeout(() => {
        greenhouseShows(filename('sam-lee-resume.pdf'));
      }, 300);
    };
    expect(await check(GREENHOUSE, show, 0)).toMatchObject({ kind: 'filled' });
  });

  it.each(['old-resume-2024.pdf', 'old-sam-lee-resume.pdf', 'sam-lee-resume.pdf.zip'])(
    'goes to review when the widget shows another file (%s)',
    async (name) => {
      expect(
        await check(GREENHOUSE, () => {
          greenhouseShows(filename(name));
        }),
      ).toMatchObject({
        kind: 'needsReview',
        reason: 'otherFileShown',
      });
    },
  );

  it('is Filled when the widget shows the name with its size', async () => {
    expect(
      await check(GREENHOUSE, () => {
        greenhouseShows(filename('sam-lee-resume.pdf (320 B)'));
      }),
    ).toMatchObject({ kind: 'filled' });
  });

  it("is Couldn't fill when the form refused the file", async () => {
    const refused = () => {
      greenhouseShows('<div class="button-container"><input id="resume" type="file"></div>', true);
    };
    expect(await check(GREENHOUSE, refused)).toMatchObject({
      kind: 'couldNotFill',
      reason: 'fileRejected',
      fix: 'The form did not take the file. Attach your Resume yourself.',
    });
  });

  it('checks again a Resume an earlier execute left uploading, without waiting', async () => {
    const planned = plan(document, profile, [], { url: GREENHOUSE, resume });
    greenhouseShows(filename('sam-lee-resume.pdf'));
    const uploading: FieldOutcome = {
      kind: 'needsReview',
      fieldId: 'resume',
      fieldType: 'file.resume',
      reason: 'fileUploading',
    };
    const [outcome] = await confirmUploads([uploading], {
      adapter: planned.context.adapter,
      resume: resume.file,
      planned: planned.fields,
      attachedAt: new Map(),
    });
    expect(outcome).toMatchObject({ kind: 'filled' });
  });

  // CodeRabbit on #4: a re-check started a new 5 s wait for the same stalled upload.
  it('checks a Resume still uploading from an earlier execute once, without a new wait', async () => {
    const planned = plan(document, profile, [], { url: GREENHOUSE, resume });
    greenhouseShows(PROGRESS);
    const uploading: FieldOutcome = {
      kind: 'needsReview',
      fieldId: 'resume',
      fieldType: 'file.resume',
      reason: 'fileUploading',
    };
    const started = Date.now();
    const [outcome] = await confirmUploads([uploading], {
      adapter: planned.context.adapter,
      resume: resume.file,
      planned: planned.fields,
      attachedAt: new Map(),
    });
    expect(outcome).toMatchObject({ kind: 'needsReview', reason: 'fileUploading' });
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});

describe('confirmUploads on Lever', () => {
  const leverForm = (status: string) =>
    render(`<form id="application-form"><ul><li>
      <label><div>Resume/CV</div><div class="application-field">
        <a href="#" class="visible-resume-upload has-file"><span class="filename">sam-lee-resume.pdf</span>
          <input id="resume-upload-input" name="resume" type="file"></a>
        ${status}
      </div></label>
      <span class="resume-upload-oversize" style="display: none;"><p>File exceeds the maximum upload size</p></span>
    </li></ul><button type="submit">Submit application</button></form>`);

  it('goes to review while Lever is still reading the Resume', async () => {
    leverForm('<span class="resume-upload-working" style="display: inline;">Analyzing resume...</span>');
    expect(await check(LEVER)).toMatchObject({ kind: 'needsReview', reason: 'fileUploading' });
  });

  it("is Filled when Lever couldn't read the Resume: the file is still attached", async () => {
    leverForm(`<span class="resume-upload-working" style="display: none;">Analyzing resume...</span>
      <span class="resume-upload-failure" style="display: inline;">Couldn't auto-read resume.</span>`);
    expect(await check(LEVER)).toMatchObject({ kind: 'filled' });
  });
});

describe('confirmUploads on other forms', () => {
  // helsing.ai, 2026-10-28: "An error occurred while uploading", the input marked invalid, the side panel said Filled.
  it("is Couldn't fill when the input is marked invalid after the attach", async () => {
    render(`<form><label><span>Resume*</span><input type="file" name="resume_file" aria-invalid="true"></label>
      <label>Email<input type="email" name="email"></label>
      <div>An error occurred while uploading.</div><button type="submit">Submit</button></form>`);
    expect(await check(GENERIC)).toMatchObject({ kind: 'couldNotFill', reason: 'fileRejected' });
  });

  // CodeRabbit on #4: "Filled" means the form shows the file uploaded; here it shows nothing.
  it('goes to review when the form shows nothing either way', async () => {
    render(`<form><label><span>Resume*</span><input type="file" name="resume_file"></label>
      <label>Email<input type="email" name="email"></label><button type="submit">Submit</button></form>`);
    expect(await check(GENERIC)).toMatchObject({ kind: 'needsReview', reason: 'fileUploadUnknown' });
  });

  it('reads Workday’s newest upload row', async () => {
    loadPage(usApply);
    for (const step of document.querySelectorAll('[data-fixture-step]'))
      step.toggleAttribute('hidden', step.getAttribute('data-automation-id') !== 'applyFlowMyExpPage');
    const uploads = document.querySelector('[data-fixture-uploads]');
    if (uploads === null) throw new Error('no upload list');
    uploads.innerHTML = `<div data-automation-id="file-upload-item">
      <div data-automation-id="file-upload-item-name">sam-lee-resume.pdf</div></div>`;
    expect(await check(WORKDAY)).toMatchObject({ kind: 'needsReview', reason: 'fileUploading' });
    uploads.innerHTML = `<div data-automation-id="file-upload-item">
      <div data-automation-id="file-upload-item-name">sam-lee-resume.pdf</div>
      <div data-automation-id="file-upload-successful">Successfully Uploaded!</div></div>`;
    expect(await check(WORKDAY)).toMatchObject({ kind: 'filled' });
  });
});
