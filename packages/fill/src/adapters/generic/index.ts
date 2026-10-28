import { deepQueryAll } from '../../dom';
import { genericPostingKey } from '../../posting';
import { adapter } from '../base';

export { postingPageText } from './page-text';

// Fallback for any other site: extracts what it can and lists everything it
// couldn't fill (design.md "Job sites"). The form is the <form> with the
// most fields; pages without one are read whole.

const FIELDS =
  'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select, [role="combobox"]';

export const genericAdapter = adapter({
  ats: 'generic',
  findForm(doc) {
    const forms = deepQueryAll(doc, 'form')
      .map((form) => ({ form, count: form.querySelectorAll(FIELDS).length }))
      .sort((a, b) => b.count - a.count);
    const best = forms[0];
    if (best !== undefined && best.count >= 2) return best.form;
    return doc.body.querySelectorAll(FIELDS).length >= 2 ? doc.body : null;
  },
  postingKey: genericPostingKey,
});
