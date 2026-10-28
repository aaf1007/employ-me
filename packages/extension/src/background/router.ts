import { err, ok, type HelperRequestType, type Result } from '@employ-me/core';
import type { HelperClient, HelperRequestBody } from '../helper';
import {
  BACKGROUND_SPECS,
  envelopeSchema,
  messageError,
  type Audience,
  type BackgroundError,
  type BackgroundMessageType,
  type BackgroundRequest,
  type BackgroundResponse,
  type MessageSpec,
} from '../messaging/background';
import { blobToBase64, dataError, type DataStore } from '../storage';
import type { SenderKind } from './sender';

export interface RouterDeps {
  /** Opens the database on first use. */
  readonly store: () => Promise<DataStore>;
  readonly helper: HelperClient;
}

export interface Router {
  /** Always resolves, with the value or a BackgroundError: never throws for an expected failure. */
  handle(raw: unknown, sender: SenderKind): Promise<Result<unknown, BackgroundError>>;
}

type Answer<T extends BackgroundMessageType> = Promise<Result<BackgroundResponse<T>, BackgroundError>>;
type Handlers = { readonly [T in BackgroundMessageType]: (payload: BackgroundRequest<T>) => Answer<T> };

const ALLOWED: Readonly<Record<Audience, readonly SenderKind[]>> = {
  extensionPages: ['extensionPage'],
  extensionPagesAndContentScripts: ['extensionPage', 'contentScript'],
};

export function createRouter(deps: RouterDeps): Router {
  const withStore = async <R>(
    run: (store: DataStore) => Promise<Result<R, BackgroundError>>,
  ): Promise<Result<R, BackgroundError>> => {
    let store: DataStore;
    try {
      store = await deps.store();
    } catch (error) {
      return dataError(
        'storageFailed',
        `Couldn't open the database: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
    return run(store);
  };

  /** Runs a Provider request with the Provider and model from Settings. */
  const callProvider = <T extends Exclude<HelperRequestType, 'health'>>(
    type: T,
    body: (call: { provider: 'claude' | 'codex'; model?: string }) => HelperRequestBody<T>,
  ) =>
    withStore(async (store) => {
      const settings = await store.getSettings();
      if (!settings.ok) return settings;
      const { provider, models } = settings.value;
      const model = models[provider];
      return deps.helper.request(type, body(model === undefined ? { provider } : { provider, model }));
    });

  const handlers: Handlers = {
    'profile.get': () => withStore((store) => store.getProfile()),
    'settings.get': () => withStore((store) => store.getSettings()),
    'resumes.getFile': ({ resumeId }) =>
      withStore(async (store) => {
        const found = await store.getResumeFile(resumeId);
        if (!found.ok) return found;
        return ok({ meta: found.value.meta, dataBase64: await blobToBase64(found.value.file) });
      }),
    'applications.findByPosting': ({ key }) => withStore((store) => store.findApplicationsByPosting(key)),
    'applications.recordSubmission': (submission) =>
      withStore((store) => store.createApplication(submission)),
    'savedAnswers.saveAcceptedDraft': (draft) => withStore((store) => store.saveAcceptedDraft(draft)),

    'helper.health': () => deps.helper.request('health', {}),
    'helper.parseResume': ({ resumeId }) =>
      withStore(async (store) => {
        const found = await store.getResumeFile(resumeId);
        if (!found.ok) return found;
        const { meta, file } = found.value;
        const dataBase64 = await blobToBase64(file);
        return callProvider('parseResume', (call) => ({
          ...call,
          input: { fileName: meta.fileName, mimeType: meta.mimeType, dataBase64 },
        }));
      }),
    'helper.mapFields': ({ input }) => callProvider('mapFields', (call) => ({ ...call, input })),
    'helper.draftAnswer': ({ input }) => callProvider('draftAnswer', (call) => ({ ...call, input })),
  };

  async function dispatch<T extends BackgroundMessageType>(
    type: T,
    payload: unknown,
    sender: SenderKind,
  ): Answer<T> {
    const spec: MessageSpec<T> = BACKGROUND_SPECS[type];
    if (!ALLOWED[spec.audience].includes(sender)) {
      return err(messageError('forbidden', `${type} may not be sent from a ${sender}`));
    }
    const parsed = spec.request.safeParse(payload);
    if (!parsed.success) {
      const paths = parsed.error.issues.map((issue) => issue.path.join('.') || '(payload)');
      return err(messageError('invalidMessage', `${type} has an invalid payload at ${paths.join(', ')}`));
    }
    const handler: (payload: BackgroundRequest<T>) => Answer<T> = handlers[type];
    return handler(parsed.data);
  }

  return {
    handle(raw, sender) {
      const envelope = envelopeSchema.safeParse(raw);
      if (!envelope.success) {
        return Promise.resolve(err(messageError('invalidMessage', 'Not a message the background knows')));
      }
      return dispatch(envelope.data.type, envelope.data.payload, sender);
    },
  };
}
