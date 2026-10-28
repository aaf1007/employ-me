import { extractText, getDocumentProxy } from 'unpdf';

/**
 * The text of a PDF, or null when it can't be read (damaged, encrypted).
 * A scanned PDF reads fine but yields almost no text; the caller checks that.
 */
export async function pdfText(pdf: Buffer): Promise<string | null> {
  let document: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    // verbosity 0: pdf.js prints warnings with console.log, and stdout is the
    // Native Messaging channel.
    document = await getDocumentProxy(new Uint8Array(pdf), { verbosity: 0 });
  } catch {
    return null;
  }
  try {
    const { text } = await extractText(document, { mergePages: true });
    return text;
  } catch {
    return null;
  } finally {
    await document.loadingTask.destroy();
  }
}
