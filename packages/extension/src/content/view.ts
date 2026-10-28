import type { ResumeMeta, SubmittedAnswer } from '@employ-me/core';
import { draftRequestFor, type FillReport, type PlannedField } from '@employ-me/fill';
import type { FieldView, FillView } from '../messaging/content';

/** A Fill's report as plain JSON for the side panel: no DOM references. */
export function toFillView(
  report: FillReport,
  resume: ResumeMeta | null,
  answers: readonly SubmittedAnswer[],
): FillView {
  const { plan } = report;
  const outcomes = new Map(report.outcomes.map((o) => [o.fieldId, o]));
  const awaiting = new Map(report.awaitingProvider.map((a) => [a.fieldId, a.need]));
  const onPage = new Set(plan.fields.map((f) => f.field.fieldId));
  const current = new Map(plan.fields.map((f) => [f.field.fieldId, f]));

  const fields = report.planned.map((seen): FieldView => {
    const planned = current.get(seen.field.fieldId) ?? seen;
    const { field } = planned;
    const need = awaiting.get(field.fieldId);
    const draft = onPage.has(field.fieldId) ? draftRequestFor(plan, field.fieldId) : null;
    return {
      fieldId: field.fieldId,
      label: field.label,
      ...(field.section === undefined ? {} : { section: field.section }),
      required: field.required,
      control: field.control,
      optionCount: field.options.length,
      fieldType: planned.fieldType,
      classifiedBy: planned.classifiedBy,
      outcome: outcomes.get(field.fieldId) ?? null,
      ...(need === undefined ? {} : { awaiting: need }),
      onPage: onPage.has(field.fieldId),
      userEdited: report.userEdited.has(field.fieldId),
      ...reviewDetails(planned),
      ...(draft === null ? {} : { draft: { ...draft, question: { ...draft.question } } }),
    };
  });

  return {
    ats: plan.ats,
    url: plan.url,
    posting: plan.posting,
    aiPolicy: plan.aiPolicy,
    fields,
    providerRequest:
      plan.providerRequest === null
        ? null
        : {
            ats: plan.providerRequest.ats,
            fields: [...plan.providerRequest.fields],
            savedQuestions: [...plan.providerRequest.savedQuestions],
          },
    answers: [...answers],
    resume: resume === null ? null : { id: resume.id, label: resume.label, fileName: resume.fileName },
  };
}

function reviewDetails({ step }: PlannedField): Pick<FieldView, 'suggestion' | 'byCountry' | 'candidates'> {
  if (step.kind !== 'review') return {};
  return {
    ...(step.suggestion === undefined ? {} : { suggestion: step.suggestion }),
    ...(step.byCountry === undefined ? {} : { byCountry: step.byCountry.map((c) => ({ ...c })) }),
    ...(step.candidates === undefined ? {} : { candidates: [...step.candidates] }),
  };
}
