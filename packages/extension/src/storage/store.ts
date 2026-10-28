import type { Application, PostingKey, Profile, ResumeMeta, SavedAnswer } from '@employ-me/core';
import * as applicationImport from './application-import';
import * as applications from './application-store';
import * as backup from './backup';
import { broadcastChanges } from './changes';
import type { DataResult, StoreDeps } from './context';
import { openDb } from './idb';
import * as profile from './profile-store';
import * as resumes from './resume-store';
import * as savedAnswers from './saved-answer-store';
import type {
  ApplicationSummary,
  ImportedApplication,
  NewApplication,
  ProfileFields,
  ProfileFieldsInput,
  Settings,
  SettingsInput,
} from './schemas';

/**
 * The typed data API over IndexedDB. Every write is validated with core's
 * schemas and every read is parsed back through them. Every method resolves
 * to a Result; IndexedDB failures come back as `storageFailed`.
 */
export interface DataStore {
  getProfile(): Promise<DataResult<Profile>>;
  getProfileFields(): Promise<DataResult<ProfileFields>>;
  saveProfileFields(fields: ProfileFieldsInput): Promise<DataResult<ProfileFields>>;

  listResumes(): Promise<DataResult<ResumeMeta[]>>;
  addResume(resume: resumes.NewResume): Promise<DataResult<ResumeMeta>>;
  getResumeFile(id?: string): Promise<DataResult<resumes.ResumeFile>>;
  renameResume(id: string, label: string): Promise<DataResult<ResumeMeta>>;
  setDefaultResume(id: string): Promise<DataResult<ResumeMeta>>;
  deleteResume(id: string): Promise<DataResult<null>>;

  listSavedAnswers(): Promise<DataResult<SavedAnswer[]>>;
  addSavedAnswer(answer: savedAnswers.NewSavedAnswer): Promise<DataResult<SavedAnswer>>;
  updateSavedAnswer(id: string, changes: savedAnswers.SavedAnswerChanges): Promise<DataResult<SavedAnswer>>;
  saveAcceptedDraft(draft: savedAnswers.AcceptedDraft): Promise<DataResult<SavedAnswer>>;
  deleteSavedAnswer(id: string): Promise<DataResult<null>>;

  listApplications(): Promise<DataResult<ApplicationSummary[]>>;
  getApplication(id: string): Promise<DataResult<Application>>;
  findApplicationsByPosting(key: PostingKey): Promise<DataResult<ApplicationSummary[]>>;
  createApplication(application: NewApplication): Promise<DataResult<Application>>;
  importApplications(
    rows: readonly ImportedApplication[],
  ): Promise<DataResult<applicationImport.ImportOutcome>>;
  updateApplication(
    id: string,
    changes: applications.ApplicationChanges,
  ): Promise<DataResult<ApplicationSummary>>;
  deleteApplication(id: string): Promise<DataResult<null>>;

  getSettings(): Promise<DataResult<Settings>>;
  saveSettings(settings: SettingsInput): Promise<DataResult<Settings>>;

  exportBackup(): Promise<DataResult<backup.Backup>>;
  importBackup(file: unknown): Promise<DataResult<backup.BackupCounts>>;

  close(): void;
}

export function createDataStore(db: IDBDatabase, deps: StoreDeps): DataStore {
  const ctx = { db, ...deps };
  return {
    getProfile: () => profile.getProfile(ctx),
    getProfileFields: () => profile.getProfileFields(ctx),
    saveProfileFields: (fields) => profile.saveProfileFields(ctx, fields),

    listResumes: () => resumes.listResumes(ctx),
    addResume: (resume) => resumes.addResume(ctx, resume),
    getResumeFile: (id) => resumes.getResumeFile(ctx, id),
    renameResume: (id, label) => resumes.renameResume(ctx, id, label),
    setDefaultResume: (id) => resumes.setDefaultResume(ctx, id),
    deleteResume: (id) => resumes.deleteResume(ctx, id),

    listSavedAnswers: () => savedAnswers.listSavedAnswers(ctx),
    addSavedAnswer: (answer) => savedAnswers.addSavedAnswer(ctx, answer),
    updateSavedAnswer: (id, changes) => savedAnswers.updateSavedAnswer(ctx, id, changes),
    saveAcceptedDraft: (draft) => savedAnswers.saveAcceptedDraft(ctx, draft),
    deleteSavedAnswer: (id) => savedAnswers.deleteSavedAnswer(ctx, id),

    listApplications: () => applications.listApplications(ctx),
    getApplication: (id) => applications.getApplication(ctx, id),
    findApplicationsByPosting: (key) => applications.findApplicationsByPosting(ctx, key),
    createApplication: (application) => applications.createApplication(ctx, application),
    importApplications: (rows) => applicationImport.importApplications(ctx, rows),
    updateApplication: (id, changes) => applications.updateApplication(ctx, id, changes),
    deleteApplication: (id) => applications.deleteApplication(ctx, id),

    getSettings: () => profile.getSettings(ctx),
    saveSettings: (settings) => profile.saveSettings(ctx, settings),

    exportBackup: () => backup.exportBackup(ctx),
    importBackup: (file) => backup.importBackup(ctx, file),

    close: () => {
      db.close();
    },
  };
}

/** Opens the extension's database, from any extension page or the background. */
export async function openDataStore(): Promise<DataStore> {
  const db = await openDb(indexedDB);
  return createDataStore(db, {
    now: () => new Date(),
    newId: () => crypto.randomUUID(),
    notify: broadcastChanges(),
  });
}
