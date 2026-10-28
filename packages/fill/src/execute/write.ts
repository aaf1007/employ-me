import type { FieldType } from '@employ-me/core';
import * as act from '../act';
import { isInput } from '../dom';
import type { AtsAdapter } from '../adapters';
import { matchOption, type MatchResult, type OptionTarget } from '../match';
import type { Write } from '../plan';
import type { ExtractedField } from '../types';

// Runs one planned write through act/ and reports how it went. Every act/
// operation reads its value back; this only translates the result.

export type WriteResult =
  | { readonly kind: 'done' }
  | { readonly kind: 'ambiguous'; readonly candidates: readonly string[] }
  | { readonly kind: 'failed'; readonly error: act.ActError };

export interface WriteContext {
  readonly adapter: AtsAdapter;
  readonly resume: File | null;
}

export async function performWrite(
  field: ExtractedField,
  fieldType: FieldType,
  write: Write,
  ctx: WriteContext,
): Promise<WriteResult> {
  const intent: act.ActIntent = { fieldType, strategy: ctx.adapter.checkStrategy };
  switch (write.kind) {
    case 'text':
      return result(await act.setText(field.element, write.text, intent, write.check));
    case 'select': {
      const [only] = write.values;
      if (field.widget === 'selectMultiple')
        return result(await act.selectNativeOptions(field.element, write.values, intent));
      return only === undefined ? none() : result(await act.selectNativeOption(field.element, only, intent));
    }
    case 'choose':
      return choose(field, write.indices, intent);
    case 'checkbox':
      return result(await act.setChecked(field.element, write.checked, intent));
    case 'file': {
      if (ctx.resume === null) return none();
      const input = field.element;
      // Attached already (an earlier execute): don't upload again, Lever would re-parse.
      if (isInput(input) && input.files?.[0]?.name === ctx.resume.name) return { kind: 'done' };
      return result(await act.attachFile(input, ctx.resume, intent));
    }
    case 'combobox':
      return comboboxWrite(field, write.targets, intent);
    case 'typeahead': {
      const seen = new Seen();
      const res = await act.chooseTypeaheadOption(
        field.element,
        {
          search: write.target.search ?? write.target.text,
          pick: (labels) => seen.pick(labels, write.target),
          suggestions: (input) => ctx.adapter.typeaheadSuggestions(input),
        },
        intent,
      );
      return seen.result(res);
    }
  }
}

async function comboboxWrite(
  field: ExtractedField,
  targets: readonly OptionTarget[],
  intent: act.ActIntent,
): Promise<WriteResult> {
  for (const target of targets) {
    if (act.comboboxShows(field.element, target.text)) continue;
    const seen = new Seen();
    const res = await act.chooseComboboxOption(
      field.element,
      {
        pick: (labels) => seen.pick(labels, target),
        ...(target.search === undefined ? {} : { search: target.search }),
      },
      intent,
    );
    const written = seen.result(res);
    if (written.kind !== 'done') return written;
  }
  return { kind: 'done' };
}

async function choose(
  field: ExtractedField,
  indices: readonly number[],
  intent: act.ActIntent,
): Promise<WriteResult> {
  const wanted = new Set(indices);
  for (const [i, choice] of field.choices.entries()) {
    const select = wanted.has(i);
    if (field.widget === 'buttons') {
      if (!select) continue;
      const res = await act.chooseButtonOption(choice.element, intent);
      if (!res.ok) return { kind: 'failed', error: res.error };
      continue;
    }
    // Radios: only tick the chosen one (the browser clears the rest). Checkbox groups: set each box.
    if (field.widget === 'radios' && !select) continue;
    const res = await act.setChecked(choice.element, select, intent);
    if (!res.ok) return { kind: 'failed', error: res.error };
  }
  return { kind: 'done' };
}

/** Remembers what the live list offered, so a failed pick can say "ambiguous" instead of "none". */
class Seen {
  private match: MatchResult = { kind: 'none' };
  private labels: readonly string[] = [];

  pick(labels: readonly string[], target: OptionTarget): number | null {
    this.labels = labels;
    this.match = matchOption(labels, target);
    return this.match.kind === 'match' ? this.match.index : null;
  }

  result(res: act.ActResult): WriteResult {
    if (res.ok) return { kind: 'done' };
    if (res.error.reason === 'optionNotFound' && this.match.kind === 'ambiguous') {
      return { kind: 'ambiguous', candidates: this.match.indices.map((i) => this.labels[i] ?? '') };
    }
    return { kind: 'failed', error: res.error };
  }
}

function result(res: act.ActResult): WriteResult {
  return res.ok ? { kind: 'done' } : { kind: 'failed', error: res.error };
}

function none(): WriteResult {
  return { kind: 'failed', error: { reason: 'optionNotFound', detail: 'nothing to write' } };
}
