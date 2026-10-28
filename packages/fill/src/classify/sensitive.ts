import type { FieldType } from '@employ-me/core';

// Deterministic detection of the fields that must never be guessed at or sent
// to a Provider: never-stored data, Attestations and Self-ID questions
// (design.md "Sensitive questions"; research §6 "Always handled by fixed
// rules"). Runs on normalized text: lower case, punctuation turned to spaces.
//
// A question about a fact or about what you're willing to do is not an
// Attestation (glossary), so "Will you consent to a background check?" is
// screened out before the consent patterns run.

export type SelfIdTopic =
  | 'gender'
  | 'hispanicLatino'
  | 'race'
  | 'visibleMinority'
  | 'indigenous'
  | 'veteran'
  | 'disability'
  | 'other';

export type Sensitive =
  | { readonly kind: 'fieldType'; readonly fieldType: FieldType }
  | { readonly kind: 'selfId'; readonly topic: SelfIdTopic };

const NEVER: ReadonlyArray<readonly [FieldType, RegExp]> = [
  [
    'never.governmentId',
    /\b(sin|ssn|social (security|insurance) (number|no)|national insurance number|passport number|tax (id|identification) number)\b/,
  ],
  ['never.dateOfBirth', /\b(date of birth|birth ?date|dob|birthday)\b/],
  ['never.reference', /\b(professional |personal )?references?\b(?! (number|id|code|no)\b)/],
];

/** Willingness and fact questions that read like consent. Checked first. */
const NOT_ATTESTATION = /\b(background (check|screening|investigation)|drug (test|screen)|reference check)\b/;

const ATTESTATIONS: ReadonlyArray<readonly [FieldType, RegExp]> = [
  [
    'attestation.signature',
    /\b(signature|e ?sign(ature)?|sign (here|below)|type your (full )?name to sign|disabilitysignature)\b/,
  ],
  [
    'attestation.aiPolicy',
    /\b(ai|artificial intelligence)\b.*\b(policy|policies|guidelines?|acknowledg\w*)\b|\bpolicy\b.*\b(ai|artificial intelligence)\b|\bai notetaker/,
  ],
  [
    'attestation.certify',
    /\b(i )?(hereby )?(certify|attest|declare)\b|\bto the best of my knowledge\b|\btrue (accurate )?and complete\b/,
  ],
  [
    'attestation.consent',
    /\b(consent\w*|gdpr|privacy (policy|notice|statement|regime)|data (protection|processing|privacy|retention)|retain (my|your) (data|information|application|details)|processing (of )?(my|your) (personal )?(data|information)|future (job )?opportunit\w*|similar (jobs|roles|positions)|job alerts?|newsletter|marketing (emails?|messages|communications|purposes)|stay up to date|keep me (informed|updated|in mind)|join (our )?talent (community|pool|network)|sms|whatsapp|text messages?|be recorded|interview recording|recording (consent|of (the |your )?interviews?))\b/,
  ],
  [
    'attestation.other',
    /\b(i (have read|understand|agree|acknowledge|accept)|acknowledg\w*|agree(ment)? to|arbitrat\w*|terms (and|of) (conditions|use|service)|by (checking|clicking|selecting|submitting|signing|ticking))\b/,
  ],
];

const SELF_ID_SECTION =
  /\b(voluntary|self ?identif\w*|equal (employment )?opportunit\w*|eeo|eeoc|demographic\w*|diversity|inclusion|employment equity|affirmative action|ofccp)\b/;

const SELF_ID_TOPICS: ReadonlyArray<readonly [SelfIdTopic, RegExp]> = [
  ['other', /\b(sexual orientation|lgbt\w*|2slgbt\w*|transgender|queer|pronouns?)\b/],
  ['veteran', /\b(veteran|military (service|status)|armed forces|protected veteran)\b/],
  ['disability', /\b(disabilit\w*|disabled|impairment|accommodation needs)\b/],
  ['indigenous', /\b(indigenous|aboriginal|first nations?|metis|métis|inuit)\b/],
  ['visibleMinority', /\b(visible minority|racialized|racialised|person of colou?r|bipoc)\b/],
  ['race', /\b(race|racial|ethnicity|ethnic (origin|group|background)|ethnic)\b/],
  ['hispanicLatino', /\b(hispanic|latin[oax]|latine)\b/],
  ['gender', /\b(gender|sex)\b/],
];

export interface SensitiveInput {
  /** Normalized label. */
  readonly label: string;
  /** Normalized section heading, if any. */
  readonly section: string;
  /** Normalized description, if any. */
  readonly description: string;
  /** Normalized option texts. */
  readonly options: readonly string[];
  readonly isPassword: boolean;
}

export function detectSensitive(input: SensitiveInput): Sensitive | null {
  if (input.isPassword) return { kind: 'fieldType', fieldType: 'never.password' };
  const { label } = input;
  for (const [fieldType, re] of NEVER) if (re.test(label)) return { kind: 'fieldType', fieldType };

  const topic = selfIdTopic(label);
  const inSelfIdSection = SELF_ID_SECTION.test(input.section) || SELF_ID_SECTION.test(label);

  if (!NOT_ATTESTATION.test(label)) {
    for (const [fieldType, re] of ATTESTATIONS) {
      // An Attestation's statement may sit in its only option ("I agree") or description.
      if (
        re.test(label) ||
        (input.options.length <= 2 && input.options.some((o) => attestationOption(o, re)))
      ) {
        // "Do you consent to self-identify your disability?" is still a Self-ID question.
        if (
          topic !== null &&
          fieldType === 'attestation.consent' &&
          !/\b(collect\w*|stor\w*|process\w*)\b/.test(label)
        ) {
          break;
        }
        return { kind: 'fieldType', fieldType };
      }
    }
  }
  if (topic !== null) return { kind: 'selfId', topic };
  if (inSelfIdSection && !/\b(managing|manage|direct reports|years|salary|start)\b/.test(label)) {
    return { kind: 'selfId', topic: 'other' };
  }
  return null;
}

function attestationOption(option: string, re: RegExp): boolean {
  return option.length > 20 && re.test(option);
}

export function selfIdTopic(label: string): SelfIdTopic | null {
  for (const [topic, re] of SELF_ID_TOPICS) if (re.test(label)) return topic;
  return null;
}

/** True for headings of Self-ID blocks, e.g. "Voluntary Self-Identification". */
export function isSelfIdSection(section: string): boolean {
  return SELF_ID_SECTION.test(section);
}
