import { readZipEntry, zipEntryNames } from './zip';

const MAX_PART_BYTES = 20 * 1024 * 1024;

/**
 * The text of a DOCX. Headers come first, because Resumes often keep the
 * name and contact details there; then the body (text boxes included), then
 * footers. Null when the file isn't a readable DOCX.
 */
export function docxText(docx: Buffer): string | null {
  const names = zipEntryNames(docx);
  if (names?.includes('word/document.xml') !== true) return null;
  const parts = [
    ...names.filter((name) => /^word\/header\d*\.xml$/.test(name)).sort(),
    'word/document.xml',
    ...names.filter((name) => /^word\/footer\d*\.xml$/.test(name)).sort(),
  ];
  const texts = parts.flatMap((name) => {
    const xml = readZipEntry(docx, name, MAX_PART_BYTES);
    return xml === null ? [] : [wordXmlText(xml.toString('utf8'))];
  });
  return texts.join('\n');
}

const TOKEN = /<(\/?)([\w:]+)[^>]*?(\/?)>|([^<]+)/g;

/** Text runs (w:t) with tabs, line breaks and paragraph ends; everything else is markup. */
export function wordXmlText(xml: string): string {
  let text = '';
  let inRun = false;
  for (const [, closing, tag, selfClosing, chars] of xml.matchAll(TOKEN)) {
    if (chars !== undefined) {
      if (inRun) text += decodeXml(chars);
    } else if (tag === 'w:t') {
      inRun = closing === '' && selfClosing === '';
    } else if (closing === '' && tag === 'w:tab') {
      text += '\t';
    } else if (closing === '' && (tag === 'w:br' || tag === 'w:cr')) {
      text += '\n';
    } else if (closing === '/' && tag === 'w:p') {
      text += '\n';
    }
  }
  return text;
}

function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, body: string) => {
    const lower = body.toLowerCase();
    if (lower.startsWith('#x')) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
    if (lower.startsWith('#')) return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    return named[lower] ?? entity;
  });
}
