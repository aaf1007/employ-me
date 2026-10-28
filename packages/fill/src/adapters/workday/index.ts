import { deepQueryAll, isHidden, readableText, textOfIds } from '../../dom';
import { postingKeyFromUrl } from '../../posting';
import { adapter } from '../base';
import type { RepeatingSection } from '../types';
import { describe, entryNumbers } from './fields';
import { classify } from './map';

// Workday (research §4): every employer has its own sign-in, then 5–7 steps
// (My Information, My Experience, Application Questions, Voluntary
// Disclosures, Self Identify, Review), each one page of `data-automation-id`
// markup. "Select One" dropdowns are buttons over a popup list; prompts are
// search boxes over a list, and some search only on Enter, which act/ never
// presses (those end as "Couldn't fill"); dates are MM/DD/YYYY spinbuttons. The
// page ids and widget ids here come from Workday's public apply-flow bundle;
// the forms behind sign-in were never recorded, so this adapter is
// unverified until a live pass.
//
// On the sign-in page only the email is filled: passwords are never stored
// and the terms box is an Attestation. Nothing here presses "Create Account",
// "Sign In", "Save and Continue" or "Submit" (act/'s guard refuses them all).

const STEP = '[data-automation-id^="applyFlow"][data-automation-id$="Page"]';
const NOT_A_FORM = new Set(['applyFlowPage', 'applyFlowLoadingPage', 'applyFlowUnknownPage']);
const ADD_BUTTON = '[data-automation-id="add-button"]';

function findForm(doc: Document): Element | null {
  const step = deepQueryAll(doc, STEP).find(
    (el) => !NOT_A_FORM.has(el.getAttribute('data-automation-id') ?? '') && !isHidden(el),
  );
  if (step !== undefined) return step;
  return deepQueryAll(doc, '[data-automation-id="signInContent"]').find((el) => !isHidden(el)) ?? null;
}

/** "Work Experience" and "Education" panel sets, each with its "Add" / "Add Another" button. */
function repeatingSections(form: Element): RepeatingSection[] {
  const sections: RepeatingSection[] = [];
  for (const button of deepQueryAll(form, ADD_BUTTON)) {
    const group = button.closest('[role="group"], [data-automation-id$="Section"]');
    const name = group === null ? '' : groupName(group);
    const section = /\bwork experience\b/i.test(name)
      ? 'work'
      : /\beducation\b/i.test(name)
        ? 'education'
        : null;
    if (section === null || group === null) continue;
    const kind = section === 'work' ? 'workExperience' : 'education';
    sections.push({ section, entries: entryNumbers(group, kind).length, addButton: button });
  }
  return sections;
}

function groupName(group: Element): string {
  const labelled = textOfIds(group, 'aria-labelledby');
  if (labelled !== '') return labelled;
  return readableText(group.querySelector('h2, h3, h4, legend'));
}

/** The pills a prompt shows for what was chosen (`selectedItem`), next to its search box. */
function comboboxChoices(combobox: Element): readonly string[] {
  const container =
    combobox.closest('[data-automation-id="multiselectInputContainer"]') ??
    combobox.closest('[data-automation-id^="formField-"]');
  if (container === null) return [];
  return [...container.querySelectorAll('[data-automation-id="selectedItem"]')]
    .map((item) => readableText(item))
    .filter((text) => text !== '');
}

export const workdayAdapter = adapter({
  ats: 'workday',
  findForm,
  postingKey: postingKeyFromUrl,
  classify,
  hooks: {
    describe,
    ignore: (el) =>
      // The text input that mirrors a "Select One" button's value, and the page's own navigation.
      (el.localName === 'input' &&
        el.previousElementSibling?.matches('button[aria-haspopup="listbox"]') === true) ||
      el.closest('[data-automation-id="pageFooter"], [data-automation-id="progressBar"]') !== null,
  },
  repeatingSections,
  typeToSearch: true,
  comboboxChoices,
});
