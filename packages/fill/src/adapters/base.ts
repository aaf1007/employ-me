import type { FieldType } from '@employ-me/core';
import { isInput } from '../dom';
import { extractFields, type ExtractHooks } from '../extract';
import type { ExtractedField } from '../types';
import type { AtsAdapter, ShownFile } from './types';

/** Defaults every adapter starts from; each ATS overrides what it knows better. */
export function adapter(
  overrides: Pick<AtsAdapter, 'ats' | 'findForm' | 'postingKey'> &
    Partial<Omit<AtsAdapter, 'ats' | 'findForm' | 'postingKey'>> & {
      readonly hooks?: ExtractHooks;
      readonly map?: Readonly<Record<string, FieldType>>;
    },
): AtsAdapter {
  const { hooks, map, ...rest } = overrides;
  return {
    extract: (form) => extractFields(form, hooks),
    classify: (field) => (map === undefined ? null : mapLookup(map, field)),
    parsesResume: false,
    waitForResumeParse: () => Promise.resolve(),
    repeatingSections: () => [],
    checkStrategy: 'click',
    typeaheadSuggestions: () => [],
    typeToSearch: false,
    comboboxChoices: () => [],
    shownFile: shownByInput,
    ...rest,
  };
}

/**
 * A form with no upload widget of its own: the input holds the file, and
 * `aria-invalid` says when the form refused it (helsing.ai: "An error
 * occurred while uploading", with the hidden field left empty).
 */
export function shownByInput({ element }: ExtractedField): ShownFile {
  if (!element.isConnected) return { kind: 'unknown' };
  if (element.getAttribute('aria-invalid') === 'true') return { kind: 'failed' };
  const name = isInput(element) ? element.files?.[0]?.name : undefined;
  return name === undefined ? { kind: 'unknown' } : { kind: 'named', text: name };
}

/** Looks a field up in an adapter map by its id, then its name. */
function mapLookup(map: Readonly<Record<string, FieldType>>, field: ExtractedField): FieldType | null {
  return map[field.fieldId] ?? (field.name === undefined ? undefined : map[field.name]) ?? null;
}
