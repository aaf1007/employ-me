import { parseResumeInputSchema, type ParseResumeInput } from '@employ-me/core/protocol';
import { describe, expect, it } from 'vitest';
import { docx, pdf } from '../../test/documents';
import { extractResumeText } from './extract';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function input(mimeType: ParseResumeInput['mimeType'], bytes: Buffer): ParseResumeInput {
  return parseResumeInputSchema.parse({ fileName: 'resume', mimeType, dataBase64: bytes.toString('base64') });
}

const BODY = [
  'Software Engineer, Acme Corp, 2021 to Present',
  'Built the payments service in TypeScript & Go.',
];

describe('Resume text extraction', () => {
  it('reads a DOCX, header first, with entities decoded', async () => {
    const result = await extractResumeText(input(DOCX, docx(['Sam Lee', 'sam@example.com'], BODY)));
    expect(result).toEqual({ ok: true, value: `Sam Lee\nsam@example.com\n\n${BODY.join('\n')}` });
  });

  it('reads a PDF', async () => {
    const result = await extractResumeText(input('application/pdf', pdf(['Sam Lee', ...BODY])));
    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toContain('Sam Lee');
    expect(result.ok && result.value).toContain('payments service');
  });

  it('reads plain text', async () => {
    const text = `Sam Lee\n\n\n\n${BODY.join('\n')}`;
    expect(await extractResumeText(input('text/plain', Buffer.from(text)))).toEqual({
      ok: true,
      value: `Sam Lee\n\n${BODY.join('\n')}`,
    });
  });

  it.each([
    ['a legacy .doc', input('application/msword', Buffer.from('\xd0\xcf\x11\xe0 binary'))],
    ['a scan with no text', input('application/pdf', pdf([]))],
    ['a damaged PDF', input('application/pdf', Buffer.from('%PDF-1.4 garbage'))],
    ['a file that is not a DOCX', input(DOCX, Buffer.from('PK nope'))],
  ])('asks for a PDF or DOCX with text for %s', async (_name, resume) => {
    const result = await extractResumeText(resume);
    expect(result).toMatchObject({ ok: false, error: { reason: 'resumeUnreadable' } });
    expect(!result.ok && result.error.fix).toMatch(/PDF or DOCX/);
  });
});
