import { errorsUnder, validateForm, type FormErrors, type ProfileForm } from '../profile-form';

// Setup (design.md "Profile" → "Setup"): add a Resume, the Provider reads it
// once and pre-fills the Profile, you check every field, then a
// questionnaire covers the rest.

export const STEPS = [
  { id: 'resume', title: 'Your Resume' },
  { id: 'review', title: 'Check what was read' },
  { id: 'countries', title: 'Where you apply' },
  { id: 'preferences', title: 'Preferences and salary' },
  { id: 'screening', title: 'Screening answers' },
  { id: 'selfId', title: 'Self-ID Answers' },
  { id: 'done', title: 'Done' },
] as const;

export type StepId = (typeof STEPS)[number]['id'];
export type FormStepId = Exclude<StepId, 'resume' | 'done'>;

/** The schema paths each step's sections edit. */
const PREFIXES: Readonly<Record<FormStepId, readonly string[]>> = {
  review: ['identity', 'contact', 'address', 'links', 'background'],
  countries: ['countries', 'workAuthorization'],
  preferences: ['preferences'],
  screening: ['screening'],
  selfId: ['selfId'],
};

/**
 * Errors that keep you on this step. On top of the schema, the questionnaire
 * asks for at least one country and a Work Authorization for each.
 */
export function stepErrors(step: FormStepId, form: ProfileForm): FormErrors {
  const validation = validateForm(form);
  const errors: Record<string, string> = validation.ok
    ? {}
    : { ...errorsUnder(validation.errors, PREFIXES[step]) };
  if (step === 'countries') {
    if (form.countries.length === 0) errors['countries'] = 'Add at least one country you apply in.';
    for (const country of form.countries) {
      const auth = form.workAuthorization[country];
      if (auth === undefined || auth.authorizedNow === '') {
        errors[`workAuthorization.${country}.authorizedNow`] ??= 'Answer this for each country.';
      }
      if (auth === undefined || auth.sponsorship === '') {
        errors[`workAuthorization.${country}.sponsorship`] ??= 'Answer this for each country.';
      }
    }
  }
  return errors;
}

export function stepAfter(step: StepId): StepId {
  const index = STEPS.findIndex((s) => s.id === step);
  return STEPS[Math.min(index + 1, STEPS.length - 1)]?.id ?? 'done';
}

export function stepBefore(step: StepId): StepId {
  const index = STEPS.findIndex((s) => s.id === step);
  return STEPS[Math.max(index - 1, 0)]?.id ?? 'resume';
}
