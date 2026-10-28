import { normalizeLabel, type FieldType } from '@employ-me/core';
import type { TextCheck } from '../act';
import { yearMonthTarget, yesNoTarget, type Answer, type Canonical } from '../answer';
import { matchOption, textTarget, type OptionTarget } from '../match';
import type { ExtractedField } from '../types';
import type { Step, Write } from './types';

// Turns an answer into what to write on this particular widget: text into a
// box, an option index from the form's own list, ticks for checkboxes.

const YES_NO_QUESTION =
  /^(are|do|does|did|have|has|had|will|would|can|could|is|was|were|should|shall|may|might|if|any)\b/;

const NO_OPTION_FIX = "None of the form's options matches your Profile. Choose one yourself.";
const UNSUPPORTED_FIX = "employ-me can't fill this kind of control yet. Fill it in yourself.";

export function stepFor(answer: Answer, field: ExtractedField, fieldType: FieldType): Step {
  switch (answer.kind) {
    case 'skip':
      return { kind: 'skip', reason: answer.reason, fix: answer.fix };
    case 'provider':
      return { kind: 'awaitProvider', need: answer.need };
    case 'review':
      return {
        kind: 'review',
        reason: answer.reason,
        ...(answer.suggestion === undefined ? {} : { suggestion: answer.suggestion }),
        ...(answer.byCountry === undefined ? {} : { byCountry: answer.byCountry }),
      };
    case 'answer': {
      const write = writeFor(answer.value, field, fieldType);
      if (write.kind === 'step') return write.step;
      return {
        kind: 'write',
        write: write.write,
        source: answer.source,
        ...(answer.review === undefined ? {} : { review: answer.review }),
      };
    }
  }
}

type WriteOrStep =
  { readonly kind: 'write'; readonly write: Write } | { readonly kind: 'step'; readonly step: Step };

const write = (w: Write): WriteOrStep => ({ kind: 'write', write: w });
const skipped = (
  fix: string,
  reason: 'noMatchingOption' | 'controlNotSupported' = 'controlNotSupported',
): WriteOrStep => ({
  kind: 'step',
  step: { kind: 'skip', reason, fix },
});

function writeFor(value: Canonical, field: ExtractedField, fieldType: FieldType): WriteOrStep {
  if (value.kind === 'file')
    return field.widget === 'file' ? write({ kind: 'file' }) : skipped(UNSUPPORTED_FIX);
  switch (field.widget) {
    case 'file':
      return skipped(UNSUPPORTED_FIX);
    case 'text':
    case 'textarea':
      // "Yes" only answers a yes/no question, not "What is the address…?"
      if (value.kind === 'yesNo' && !YES_NO_QUESTION.test(normalizeLabel(field.label))) {
        return skipped('This asks for more than a yes or no. Answer it yourself.', 'noMatchingOption');
      }
      return write({ kind: 'text', text: asText(value, field), check: checkFor(fieldType, field) });
    case 'checkbox':
      return checkboxWrite(value, field);
    case 'typeahead':
      return write({ kind: 'typeahead', target: targetsOf(value)[0] ?? textTarget(asText(value, field)) });
    case 'combobox':
    case 'comboboxMultiple':
      return comboboxWrite(targetsOf(value), field);
    case 'select':
    case 'selectMultiple':
    case 'radios':
    case 'buttons':
    case 'checkboxes':
      return choiceWrite(targetsOf(value), field);
  }
}

/** Options known now (native lists, groups): pick the index at plan time. */
function choiceWrite(targets: readonly OptionTarget[], field: ExtractedField): WriteOrStep {
  const single = field.widget === 'select' || field.widget === 'radios' || field.widget === 'buttons';
  const labels = field.choices.map((c) => c.label);
  const indices: number[] = [];
  for (const target of single ? targets.slice(0, 1) : targets) {
    const match = matchOption(labels, target);
    if (match.kind === 'ambiguous') {
      return {
        kind: 'step',
        step: {
          kind: 'review',
          reason: 'ambiguousOption',
          candidates: match.indices.map((i) => labels[i] ?? ''),
        },
      };
    }
    if (match.kind === 'match' && !indices.includes(match.index)) indices.push(match.index);
  }
  if (indices.length === 0) return skipped(NO_OPTION_FIX, 'noMatchingOption');
  const chosen = indices.map((i) => labels[i] ?? '');
  if (field.widget === 'select' || field.widget === 'selectMultiple') {
    return write({
      kind: 'select',
      values: indices.map((i) => field.choices[i]?.value ?? ''),
      labels: chosen,
    });
  }
  return write({ kind: 'choose', indices, labels: chosen });
}

/** Comboboxes usually render their options only while open: match now if we know them, else live. */
function comboboxWrite(targets: readonly OptionTarget[], field: ExtractedField): WriteOrStep {
  if (targets.length === 0) return skipped(NO_OPTION_FIX, 'noMatchingOption');
  const chosen = field.widget === 'combobox' ? targets.slice(0, 1) : targets;
  if (field.options.length > 0 && chosen.every((t) => t.search === undefined)) {
    for (const target of chosen) {
      const match = matchOption(field.options, target);
      if (match.kind === 'none') return skipped(NO_OPTION_FIX, 'noMatchingOption');
      if (match.kind === 'ambiguous') {
        return {
          kind: 'step',
          step: {
            kind: 'review',
            reason: 'ambiguousOption',
            candidates: match.indices.map((i) => field.options[i] ?? ''),
          },
        };
      }
    }
  }
  return write({ kind: 'combobox', targets: chosen });
}

function checkboxWrite(value: Canonical, field: ExtractedField): WriteOrStep {
  if (value.kind === 'yesNo') return write({ kind: 'checkbox', checked: value.yes });
  const own = field.choices[0]?.label ?? field.label;
  const fits = targetsOf(value).some((t) => matchOption([own], t).kind === 'match');
  return fits ? write({ kind: 'checkbox', checked: true }) : skipped(NO_OPTION_FIX, 'noMatchingOption');
}

function targetsOf(value: Canonical): OptionTarget[] {
  switch (value.kind) {
    case 'yesNo':
      return [yesNoTarget(value.yes)];
    case 'option':
      return [value.target];
    case 'options':
      return [...value.targets];
    case 'text':
      return [textTarget(value.text)];
    case 'date':
      return [yearMonthTarget(value.iso.slice(0, 7))];
    case 'file':
      return [];
  }
}

function asText(value: Canonical, field: ExtractedField): string {
  switch (value.kind) {
    case 'text':
      return value.text;
    case 'yesNo':
      return value.yes ? 'Yes' : 'No';
    case 'option':
      return value.target.text;
    case 'options':
      return value.targets.map((t) => t.text).join(', ');
    case 'date':
      return formatDate(value.iso, field);
    case 'file':
      return '';
  }
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** ISO for date inputs, MM/DD/YYYY for date pickers, "January 4, 2027" in plain text boxes. */
function formatDate(iso: string, field: ExtractedField): string {
  const [year = '', month = '', day = ''] = iso.split('-');
  if (field.element.getAttribute('type') === 'date') return iso;
  const hint = `${field.element.getAttribute('placeholder') ?? ''} ${field.element.getAttribute('class') ?? ''}`;
  if (/\b(mm|dd)\b|date|pick/i.test(hint)) return `${month}/${day}/${year}`;
  return `${MONTHS[Number(month) - 1] ?? month} ${String(Number(day))}, ${year}`;
}

function checkFor(fieldType: FieldType, field: ExtractedField): TextCheck {
  if (fieldType.startsWith('phone.') || field.element.getAttribute('type') === 'tel') return 'digits';
  return 'exact';
}
