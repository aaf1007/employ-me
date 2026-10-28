import type { FieldType, OrdinaryFieldType, Posting } from '@employ-me/core';
import type { DraftRequestRef, FillPlan, PlannedField } from './types';

/** Required free-text questions waiting for a Draft: drafted during the Fill, all at once (design.md "Drafts"). */
export function requiredDraftRequests(
  fields: readonly PlannedField[],
  aiPolicy: boolean,
  posting: Posting | null,
): DraftRequestRef[] {
  return fields
    .filter((f) => f.step.kind === 'awaitProvider' && f.step.need === 'draft')
    .map((f) => draftRequest(f, 'freeText.question', aiPolicy, posting));
}

/**
 * The Draft request behind a field's Draft button: any free-text question,
 * optional ones and cover letters included (design.md "Drafts"). Null for
 * fields a Draft can't answer (choices, files, Self-ID, Attestations).
 */
export function draftRequestFor(plan: FillPlan, fieldId: string): DraftRequestRef | null {
  const planned = plan.fields.find((f) => f.field.fieldId === fieldId);
  if (planned === undefined) return null;
  const fieldType = draftFieldType(planned);
  return fieldType === null ? null : draftRequest(planned, fieldType, plan.aiPolicy, plan.posting);
}

/** Fields that take a Draft, and the type the accepted Draft's Saved Answer records. */
export function draftFieldType(planned: PlannedField): OrdinaryFieldType | null {
  const { field, fieldType } = planned;
  if (field.widget !== 'text' && field.widget !== 'textarea') return null;
  return draftable(fieldType, field.widget);
}

function draftable(fieldType: FieldType, widget: 'text' | 'textarea'): OrdinaryFieldType | null {
  if (fieldType === 'freeText.question' || fieldType === 'freeText.coverLetter') return fieldType;
  // A long-answer box the rules didn't recognise: the AI may have said it needs a Draft.
  if (fieldType === 'unknown' && widget === 'textarea') return 'freeText.question';
  return null;
}

function draftRequest(
  { field }: PlannedField,
  fieldType: OrdinaryFieldType,
  aiPolicy: boolean,
  posting: Posting | null,
): DraftRequestRef {
  return {
    fieldId: field.fieldId,
    fieldType,
    question: {
      label: field.label === '' ? 'Question' : field.label.slice(0, 2000),
      required: field.required,
      ...(field.description === undefined ? {} : { description: field.description.slice(0, 4000) }),
      ...(field.maxLength === undefined ? {} : { maxLength: field.maxLength }),
      language: 'en',
    },
    mode: aiPolicy ? 'polish' : 'write',
    posting: {
      ...(posting?.title === undefined ? {} : { title: posting.title }),
      ...(posting?.company === undefined ? {} : { company: posting.company }),
      ...(posting?.description === undefined ? {} : { description: posting.description.slice(0, 100_000) }),
    },
    ...(posting === null ? {} : { employer: posting.key.employer }),
  };
}
