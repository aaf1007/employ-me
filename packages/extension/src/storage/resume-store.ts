import { ok, RESUME_MIME_TYPES, resumeMetaSchema, type ResumeMeta } from '@employ-me/core';
import { guarded, isoNow, parseAllStored, type DataResult, type StoreContext } from './context';
import { dataError, issuesFrom } from './errors';
import { inTransaction, readValue, readValues, requestValue, STORES } from './idb';

export type ResumeMimeType = (typeof RESUME_MIME_TYPES)[number];

/** Comfortably under the helper's parseResume limit (20 MB of base64). */
export const MAX_RESUME_BYTES = 10 * 1024 * 1024;

const MIME_BY_EXTENSION: Readonly<Record<string, ResumeMimeType>> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  txt: 'text/plain',
};

/** The file's type, from what the browser reported or else its extension. Null when unsupported. */
export function resumeMimeType(fileName: string, reported: string): ResumeMimeType | null {
  const known = RESUME_MIME_TYPES.find((type) => type === reported);
  if (known !== undefined) return known;
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXTENSION[extension] ?? null;
}

export interface NewResume {
  readonly label: string;
  readonly fileName: string;
  readonly file: Blob;
  /** The first Resume is always the default. */
  readonly makeDefault?: boolean;
}

export interface ResumeFile {
  readonly meta: ResumeMeta;
  readonly file: Blob;
}

export function listResumes(ctx: StoreContext): Promise<DataResult<ResumeMeta[]>> {
  return guarded(() =>
    inTransaction(ctx.db, [STORES.resumes], 'readonly', async (t) => {
      const all = parseAllStored(
        resumeMetaSchema,
        await readValues(t.objectStore(STORES.resumes).getAll()),
        'Resume',
      );
      return all.ok ? ok(all.value.sort((a, b) => a.addedAt.localeCompare(b.addedAt))) : all;
    }),
  );
}

export function addResume(ctx: StoreContext, input: NewResume): Promise<DataResult<ResumeMeta>> {
  return guarded(async () => {
    const mimeType = resumeMimeType(input.fileName, input.file.type);
    if (mimeType === null) {
      return dataError('invalidInput', 'Unsupported Resume file type', [
        { path: 'file', message: 'Use a PDF, Word (.docx or .doc) or plain-text file' },
      ]);
    }
    if (input.file.size === 0) {
      return dataError('invalidInput', 'The Resume file is empty', [
        { path: 'file', message: 'The file is empty' },
      ]);
    }
    if (input.file.size > MAX_RESUME_BYTES) {
      return dataError('tooLarge', 'The Resume file is over 10 MB');
    }
    const candidate = resumeMetaSchema.safeParse({
      id: ctx.newId(),
      label: input.label.trim(),
      fileName: input.fileName,
      mimeType,
      sizeBytes: input.file.size,
      addedAt: isoNow(ctx),
      isDefault: false,
    });
    if (!candidate.success) {
      return dataError('invalidInput', 'The Resume is invalid', issuesFrom(candidate.error));
    }
    const result = await inTransaction(
      ctx.db,
      [STORES.resumes, STORES.resumeFiles],
      'readwrite',
      async (t) => {
        const metas = t.objectStore(STORES.resumes);
        const existing = parseAllStored(resumeMetaSchema, await readValues(metas.getAll()), 'Resume');
        if (!existing.ok) return existing;
        const isDefault = input.makeDefault === true || existing.value.length === 0;
        if (isDefault) await clearDefault(metas, existing.value);
        const added: ResumeMeta = { ...candidate.data, isDefault };
        await requestValue(metas.put(added));
        await requestValue(t.objectStore(STORES.resumeFiles).put(input.file, added.id));
        return ok(added);
      },
    );
    if (result.ok) ctx.notify(['resumes']);
    return result;
  });
}

/** One Resume's file. Without an id, the default Resume's. */
export function getResumeFile(ctx: StoreContext, id?: string): Promise<DataResult<ResumeFile>> {
  return guarded(() =>
    inTransaction(ctx.db, [STORES.resumes, STORES.resumeFiles], 'readonly', async (t) => {
      const metas = parseAllStored(
        resumeMetaSchema,
        await readValues(t.objectStore(STORES.resumes).getAll()),
        'Resume',
      );
      if (!metas.ok) return metas;
      const meta = metas.value.find((m) => (id === undefined ? m.isDefault : m.id === id));
      if (meta === undefined) {
        return dataError(
          'notFound',
          id === undefined ? 'You have no Resume yet' : 'That Resume no longer exists',
        );
      }
      const file: unknown = await readValue(t.objectStore(STORES.resumeFiles).get(meta.id));
      if (!(file instanceof Blob)) return dataError('corrupt', 'A Resume file is missing');
      return ok({ meta, file });
    }),
  );
}

export function renameResume(ctx: StoreContext, id: string, label: string): Promise<DataResult<ResumeMeta>> {
  return updateResume(ctx, id, (meta) => ({ ...meta, label: label.trim() }));
}

export function setDefaultResume(ctx: StoreContext, id: string): Promise<DataResult<ResumeMeta>> {
  return updateResume(ctx, id, (meta) => ({ ...meta, isDefault: true }));
}

function updateResume(
  ctx: StoreContext,
  id: string,
  change: (meta: ResumeMeta) => ResumeMeta,
): Promise<DataResult<ResumeMeta>> {
  return guarded(async () => {
    const result = await inTransaction(ctx.db, [STORES.resumes], 'readwrite', async (t) => {
      const metas = t.objectStore(STORES.resumes);
      const all = parseAllStored(resumeMetaSchema, await readValues(metas.getAll()), 'Resume');
      if (!all.ok) return all;
      const current = all.value.find((m) => m.id === id);
      if (current === undefined) return dataError('notFound', 'That Resume no longer exists');
      const next = resumeMetaSchema.safeParse(change(current));
      if (!next.success) return dataError('invalidInput', 'The Resume is invalid', issuesFrom(next.error));
      if (next.data.isDefault && !current.isDefault) await clearDefault(metas, all.value);
      await requestValue(metas.put(next.data));
      return ok(next.data);
    });
    if (result.ok) ctx.notify(['resumes']);
    return result;
  });
}

/** Deletes a Resume and its file. If it was the default, the newest remaining one becomes the default. */
export function deleteResume(ctx: StoreContext, id: string): Promise<DataResult<null>> {
  return guarded(async () => {
    const result = await inTransaction(
      ctx.db,
      [STORES.resumes, STORES.resumeFiles],
      'readwrite',
      async (t) => {
        const metas = t.objectStore(STORES.resumes);
        const all = parseAllStored(resumeMetaSchema, await readValues(metas.getAll()), 'Resume');
        if (!all.ok) return all;
        const target = all.value.find((m) => m.id === id);
        if (target === undefined) return dataError('notFound', 'That Resume no longer exists');
        await requestValue(metas.delete(id));
        await requestValue(t.objectStore(STORES.resumeFiles).delete(id));
        const newest = all.value
          .filter((m) => m.id !== id)
          .sort((a, b) => b.addedAt.localeCompare(a.addedAt))[0];
        if (target.isDefault && newest !== undefined) {
          await requestValue(metas.put({ ...newest, isDefault: true }));
        }
        return ok(null);
      },
    );
    if (result.ok) ctx.notify(['resumes']);
    return result;
  });
}

async function clearDefault(metas: IDBObjectStore, all: readonly ResumeMeta[]): Promise<void> {
  for (const meta of all.filter((m) => m.isDefault)) {
    await requestValue(metas.put({ ...meta, isDefault: false }));
  }
}
