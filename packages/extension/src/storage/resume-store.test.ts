import { describe, expect, it } from 'vitest';
import { MAX_RESUME_BYTES, resumeMimeType } from './resume-store';
import { createTestStore, failure, textFile, value } from './test-store';

describe('Resumes', () => {
  it('keeps the file bytes and makes the first one the default', async () => {
    const { store } = await createTestStore();
    const meta = value(
      await store.addResume({ label: ' Backend ', fileName: 'sam.txt', file: textFile('Sam Lee') }),
    );
    expect(meta).toMatchObject({ label: 'Backend', mimeType: 'text/plain', sizeBytes: 7, isDefault: true });

    const { file } = value(await store.getResumeFile());
    expect(await file.text()).toBe('Sam Lee');
    expect(file.type).toBe('text/plain');
  });

  it('keeps exactly one default as Resumes are added, switched and deleted', async () => {
    const { store } = await createTestStore();
    const first = value(await store.addResume({ label: 'One', fileName: 'one.txt', file: textFile('1') }));
    const second = value(await store.addResume({ label: 'Two', fileName: 'two.txt', file: textFile('2') }));
    const third = value(
      await store.addResume({
        label: 'Three',
        fileName: 'three.txt',
        file: textFile('3'),
        makeDefault: true,
      }),
    );
    const defaults = async () =>
      value(await store.listResumes())
        .filter((r) => r.isDefault)
        .map((r) => r.label);

    expect(await defaults()).toEqual(['Three']);
    value(await store.setDefaultResume(first.id));
    expect(await defaults()).toEqual(['One']);

    // Deleting the default promotes the newest remaining Resume.
    value(await store.deleteResume(first.id));
    expect(await defaults()).toEqual(['Three']);
    value(await store.deleteResume(third.id));
    expect(await defaults()).toEqual(['Two']);
    expect(await value(await store.getResumeFile(second.id)).file.text()).toBe('2');
    expect(failure(await store.getResumeFile(first.id)).reason).toBe('notFound');
  });

  it('renames a Resume', async () => {
    const { store } = await createTestStore();
    const meta = value(await store.addResume({ label: 'One', fileName: 'one.txt', file: textFile('1') }));
    expect(value(await store.renameResume(meta.id, 'New grad')).label).toBe('New grad');
    expect(failure(await store.renameResume(meta.id, '  ')).reason).toBe('invalidInput');
  });

  it('refuses empty, oversized and unsupported files', async () => {
    const { store } = await createTestStore();
    expect(failure(await store.addResume({ label: 'A', fileName: 'a.txt', file: textFile('') })).reason).toBe(
      'invalidInput',
    );
    const big = new Blob([new Uint8Array(MAX_RESUME_BYTES + 1)], { type: 'application/pdf' });
    expect(failure(await store.addResume({ label: 'A', fileName: 'a.pdf', file: big })).reason).toBe(
      'tooLarge',
    );
    expect(
      failure(await store.addResume({ label: 'A', fileName: 'a.png', file: textFile('x', 'image/png') }))
        .reason,
    ).toBe('invalidInput');
    expect(value(await store.listResumes())).toEqual([]);
  });

  it('works out the file type from the extension when the browser reports none', () => {
    expect(resumeMimeType('Sam Lee.DOCX', '')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(resumeMimeType('resume.pdf', 'application/octet-stream')).toBe('application/pdf');
    expect(resumeMimeType('resume', '')).toBeNull();
  });

  it('says so when there is no Resume yet', async () => {
    const { store } = await createTestStore();
    expect(failure(await store.getResumeFile()).reason).toBe('notFound');
  });
});
