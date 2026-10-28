import {
  PROTOCOL_VERSION,
  helperError,
  helperRequestSchema,
  ok,
  type HelperErrorReason,
  type HelperRequest,
  type HelperResponse,
  type ProviderStatus,
  type ResumeExtract,
} from '@employ-me/core';
import type { HelperTransport, TransportHandlers } from './transport';

// TEST BUILDS ONLY. An in-memory stand-in for the helper and its fake
// Provider, used by `wxt build --mode e2e` (see background/transport.ts), so
// e2e tests don't depend on the helper package. Production builds don't
// contain this module. Like the real helper, it parses every request with
// the strict protocol schema, so e2e also checks what the extension sends.

export interface InMemoryHelperScript {
  /** False behaves like a machine where `npx employ-me setup` was never run. */
  readonly installed: boolean;
  /** Every Provider call fails with this reason. */
  readonly failWith: HelperErrorReason | null;
  readonly resumeExtract: ResumeExtract;
  readonly providers: readonly ProviderStatus[];
}

export interface InMemoryHelper extends HelperTransport {
  configure(changes: Partial<InMemoryHelperScript>): void;
  /** Every valid request received, oldest first, for tests to assert on. */
  readonly requests: readonly HelperRequest[];
}

/** Obviously fake data (CODING_STANDARDS.md "Privacy"). */
export const SAMPLE_RESUME_EXTRACT: ResumeExtract = {
  identity: { legalName: { first: 'Sam', last: 'Lee' } },
  contact: {
    email: 'sam.lee@example.com',
    phone: { countryCode: '+1', number: '555 010 0199', type: 'mobile' },
  },
  address: { city: 'Toronto', region: 'ON', country: 'CA' },
  links: { github: 'https://github.com/sam-lee-example', portfolio: 'https://sam-lee.example.com' },
  background: {
    workHistory: [
      {
        id: 'w1',
        employer: 'Example Corp',
        title: 'Software Engineer',
        location: 'Toronto, ON',
        startDate: '2023-05',
        current: true,
        description: 'Built the billing service.',
      },
    ],
    education: [
      {
        id: 'e1',
        school: 'University of Example',
        degree: 'B.Sc.',
        degreeLevel: 'bachelor',
        discipline: 'Computer Science',
        endDate: '2023-04',
      },
    ],
    skills: [
      { name: 'TypeScript', aliases: ['TS'] },
      { name: 'React', aliases: [] },
    ],
    languages: [
      { language: 'English', proficiency: 'native' },
      { language: 'French', proficiency: 'professionalWorking' },
    ],
  },
};

const DEFAULT_SCRIPT: InMemoryHelperScript = {
  installed: true,
  failWith: null,
  resumeExtract: SAMPLE_RESUME_EXTRACT,
  providers: [
    { id: 'claude', state: 'ready', version: 'fake' },
    { id: 'codex', state: 'ready', version: 'fake' },
  ],
};

export function createInMemoryHelper(): InMemoryHelper {
  let script = DEFAULT_SCRIPT;
  const requests: HelperRequest[] = [];

  const answer = (raw: unknown): HelperResponse => {
    const parsed = helperRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        v: PROTOCOL_VERSION,
        id: null,
        ok: false,
        error: helperError('invalidRequest', 'in-memory helper: request failed the protocol schema'),
      };
    }
    const request = parsed.data;
    requests.push(request);
    const okBase = { v: PROTOCOL_VERSION, id: request.id, ok: true } as const;
    if (request.type === 'health') {
      return {
        ...okBase,
        type: 'health',
        result: {
          helperVersion: '0.0.0-in-memory',
          protocolVersion: PROTOCOL_VERSION,
          fakeProvider: true,
          logFile: '(in-memory helper: no log file)',
          providers: [...script.providers],
        },
      };
    }
    if (script.failWith !== null) {
      return {
        v: PROTOCOL_VERSION,
        id: request.id,
        ok: false,
        error: helperError(script.failWith, `in-memory helper set to fail with ${script.failWith}`),
      };
    }
    switch (request.type) {
      case 'parseResume':
        return { ...okBase, type: 'parseResume', result: { extract: script.resumeExtract } };
      case 'mapFields':
        return {
          ...okBase,
          type: 'mapFields',
          result: {
            mappings: request.input.fields.map((field) => ({
              fieldId: field.fieldId,
              match: field.control === 'textarea' ? { kind: 'needsDraft' } : { kind: 'unknown' },
            })),
          },
        };
      case 'draftAnswer':
        return {
          ...okBase,
          type: 'draftAnswer',
          result: {
            draft: {
              text: `Fake draft for: ${request.input.question.label}`,
              language: request.input.question.language ?? 'en',
              claims: [],
            },
          },
        };
    }
  };

  return {
    requests,
    configure(changes) {
      script = { ...script, ...changes };
    },
    open(handlers: TransportHandlers) {
      // Answers arrive asynchronously, as they do over a real port.
      const later = (deliver: () => void) => {
        setTimeout(deliver, 0);
      };
      if (!script.installed) {
        later(() => {
          handlers.onDisconnect(
            helperError(
              'helperNotInstalled',
              'The employ-me helper isn\'t installed. Chrome said: "Specified native messaging host not found."',
            ),
          );
        });
      }
      let open = script.installed;
      return {
        send(message) {
          if (open) {
            later(() => {
              if (open) handlers.onMessage(answer(message));
            });
          }
          return ok(undefined);
        },
        close() {
          open = false;
        },
      };
    },
  };
}
