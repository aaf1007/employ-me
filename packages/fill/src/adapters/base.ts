import type { FieldType } from '@employ-me/core';
import { extractFields, type ExtractHooks } from '../extract';
import type { ExtractedField } from '../types';
import type { AtsAdapter } from './types';

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
    ...rest,
  };
}

/** Looks a field up in an adapter map by its id, then its name. */
function mapLookup(map: Readonly<Record<string, FieldType>>, field: ExtractedField): FieldType | null {
  return map[field.fieldId] ?? (field.name === undefined ? undefined : map[field.name]) ?? null;
}
