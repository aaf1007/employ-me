import { beforeEach, describe, expect, it } from 'vitest';
import { chooseButtonOption, chooseOption, pressAddAnother, setChecked, setText } from './index';
import { checkTarget } from './guard';

function render(html: string): HTMLElement {
  document.body.innerHTML = `<form id="application">${html}</form>`;
  const target = document.querySelector<HTMLElement>('[data-target]');
  if (target === null) throw new Error('fixture needs a [data-target] element');
  return target;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('act/ refuses every way of moving the form on', () => {
  it.each([
    ['Greenhouse submit', '<button data-target type="submit">Submit application</button>'],
    ['Lever submit by id', '<button data-target id="btn-submit" type="button">Go</button>'],
    ['Ashby submit by class', '<button data-target class="ashby-application-form-submit-button">Go</button>'],
    [
      'Workday next',
      '<button data-target type="button" data-automation-id="pageFooterNextButton">Go</button>',
    ],
    ['Next', '<button data-target type="button">Next</button>'],
    ['Save and continue', '<button data-target type="button">Save and Continue</button>'],
    ['Apply link', '<a data-target href="/apply">Apply now</a>'],
    ['Send', '<div data-target role="button">Send</div>'],
    ['input submit', '<input data-target type="submit" value="Go">'],
    ['input image', '<input data-target type="image" alt="Go">'],
    ['implicit submit button', '<button data-target>+ Add another</button>'],
    ['span inside submit', '<button type="submit"><span data-target>Submit</span></button>'],
    ['French next', '<button data-target type="button">Suivant</button>'],
    ['aria-label', '<button data-target type="button" aria-label="Submit your application">→</button>'],
    ['Add and continue', '<button data-target type="button">Add and continue</button>'],
    ['Autofill with resume', '<button data-target type="button">Autofill with MyGreenhouse</button>'],
  ])('%s', (_name, html) => {
    const el = render(html);
    for (const result of [pressAddAnother(el), chooseButtonOption(el, { fieldType: 'screening.referred' })]) {
      expect(result).toMatchObject({ ok: false, error: { reason: 'forbiddenControl' } });
    }
  });
});

describe('act/ allows section and option controls', () => {
  it('accepts "Add another" buttons', () => {
    expect(
      checkTarget(render('<button data-target type="button">+ Add another</button>'), 'addAnother', null),
    ).toBeNull();
    expect(
      checkTarget(render('<button data-target type="button">Add education</button>'), 'addAnother', null),
    ).toBeNull();
  });

  it('rejects ordinary buttons as "Add another"', () => {
    const el = render('<button data-target type="button">Yes</button>');
    expect(checkTarget(el, 'addAnother', null)).toMatchObject({ reason: 'wrongElementKind' });
  });

  it('accepts options even when their text reads like a forbidden word', () => {
    const el = render('<div role="listbox"><div data-target role="option">Next week</div></div>');
    expect(checkTarget(el, 'chooseOption', 'pref.startDate')).toBeNull();
  });

  it('accepts Yes/No answer buttons', () => {
    const el = render('<button data-target type="button">Yes</button>');
    expect(checkTarget(el, 'choiceButton', 'workAuth.authorized')).toBeNull();
  });

  it('accepts comboboxes', () => {
    const el = render('<input data-target role="combobox" aria-expanded="false">');
    expect(checkTarget(el, 'openCombobox', 'address.country')).toBeNull();
  });
});

describe('act/ refuses sensitive field types', () => {
  it('never ticks an Attestation', () => {
    const el = render('<input data-target type="checkbox">');
    expect(setChecked(el, true, { fieldType: 'attestation.certify' })).toMatchObject({
      ok: false,
      error: { reason: 'sensitiveFieldType' },
    });
  });

  it('never types a password', () => {
    const el = render('<input data-target type="text">');
    expect(setText(el, 'x', { fieldType: 'never.password' })).toMatchObject({
      ok: false,
      error: { reason: 'sensitiveFieldType' },
    });
  });

  it('refuses password inputs outright', () => {
    const el = render('<input data-target type="password">');
    expect(checkTarget(el, 'text', 'contact.email')).toMatchObject({ reason: 'wrongElementKind' });
  });

  it('refuses options of the wrong kind', () => {
    const el = render('<div data-target>Canada</div>');
    expect(chooseOption(el, { fieldType: 'address.country' })).toMatchObject({
      ok: false,
      error: { reason: 'wrongElementKind' },
    });
  });
});
