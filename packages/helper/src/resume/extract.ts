import {
  err,
  helperError,
  ok,
  type HelperError,
  type ParseResumeInput,
  type Result,
} from '@employ-me/core/protocol';
import { docxText } from './docx';
import { pdfText } from './pdf';

/** Fewer characters than this is a scan, an image or an empty file, not a Resume. */
const MIN_TEXT_CHARS = 40;
/** About 15 pages. Keeps one Resume well inside a Provider call. */
const MAX_TEXT_CHARS = 60_000;

/**
 * The Resume's text, extracted here in the helper so the Provider gets text
 * rather than a file. Legacy .doc isn't supported: the user is asked for a
 * PDF or DOCX (core's resumeUnreadable fix).
 */
export async function extractResumeText(input: ParseResumeInput): Promise<Result<string, HelperError>> {
  const bytes = Buffer.from(input.dataBase64, 'base64');
  const raw = await textOf(input.mimeType, bytes);
  const text = normalize(raw ?? '');
  if (text.length < MIN_TEXT_CHARS) {
    return err(
      helperError('resumeUnreadable', `No readable text in this ${kindName(input.mimeType)} Resume`),
    );
  }
  return ok(text.slice(0, MAX_TEXT_CHARS));
}

function textOf(mimeType: ParseResumeInput['mimeType'], bytes: Buffer): Promise<string | null> {
  switch (mimeType) {
    case 'application/pdf':
      return pdfText(bytes);
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return Promise.resolve(docxText(bytes));
    case 'text/plain':
      return Promise.resolve(bytes.toString('utf8'));
    case 'application/msword':
      return Promise.resolve(null);
  }
}

function kindName(mimeType: ParseResumeInput['mimeType']): string {
  switch (mimeType) {
    case 'application/pdf':
      return 'PDF';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return 'DOCX';
    case 'text/plain':
      return 'text';
    case 'application/msword':
      return '.doc';
  }
}

function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
