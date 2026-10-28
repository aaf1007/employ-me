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
    // `_` is a word character to \b, so these used to get through.
    ['submit by snake_case id', '<button data-target id="btn_submit" type="button">Go</button>'],
    ['next by snake_case class', '<div data-target role="button" class="nav_next">→</div>'],
    ['submit by upper snake_case', '<button data-target data-qa="SUBMIT_BTN" type="button">Go</button>'],
    ['submit by kebab-case', '<a data-target data-testid="apply-now" href="#">Go</a>'],
    ['acronym then word', '<button data-target type="button" data-testid="BTNSubmit">Go</button>'],
    ['digits then word', '<button data-target type="button" id="step2Next">Go</button>'],
    // Stems: any ending.
    ['Submitting', '<button data-target type="button">Submitting…</button>'],
    ['Continue to step 2', '<button data-target type="button">Continue to step 2</button>'],
    ['Sign in', '<button data-target type="button">Sign in</button>'],
    ['sign_up by id', '<button data-target type="button" id="sign_up">Go</button>'],
    ['Log in', '<a data-target href="#">Log In</a>'],
    ['Create an account', '<button data-target type="button">Create an account</button>'],
    ['Register', '<button data-target type="button">Registration</button>'],
    ['Review application', '<button data-target type="button">Review your application</button>'],
    ['Withdraw', '<button data-target type="button">Withdraw</button>'],
    // French
    ['Page suivante', '<button data-target type="button">Page suivante</button>'],
    ['Étape suivante', '<button data-target type="button">Étape suivante</button>'],
    ['Postulez', '<button data-target type="button">Postulez</button>'],
    ['Postuler maintenant', '<a data-target href="#">Postuler maintenant</a>'],
    ['Valider', '<button data-target type="button">Valider</button>'],
    ['Se connecter', '<button data-target type="button">Se connecter</button>'],
    ['Connexion', '<a data-target href="#">Connexion</a>'],
    ["S'identifier", '<button data-target type="button">S’identifier</button>'],
    ['Créer un compte', '<button data-target type="button">Créer un compte</button>'],
    ['CRÉER MON COMPTE', '<button data-target type="button">CRÉER MON COMPTE</button>'],
    ["S'inscrire", '<button data-target type="button">S\'inscrire</button>'],
    ['Soumettre', '<button data-target type="button">Soumettre</button>'],
    ['Soumission', '<button data-target type="button">Soumission de la candidature</button>'],
    ['Envoyer ma candidature', '<button data-target type="button">Envoyer ma candidature</button>'],
    ['Continuer', '<button data-target type="button">Continuer</button>'],
    ['Enregistrer', '<button data-target type="button">Enregistrer et continuer</button>'],
    ['Terminer', '<button data-target type="button">Terminer</button>'],
    ['Confirmer', '<button data-target type="button">Confirmer</button>'],
    ['Annuler', '<button data-target type="button">Annuler</button>'],
    ['Supprimer', '<button data-target type="button">Supprimer</button>'],
  ])('%s', async (_name, html) => {
    const el = render(html);
    for (const result of [
      await pressAddAnother(el),
      await chooseButtonOption(el, { fieldType: 'screening.referred' }),
    ]) {
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

  it.each([
    [
      'Ashby yes/no option',
      '<button data-target type="button" class="_container_pjyt6_1 _option_1svni_32 ashby-application-form-input-yesno-option" data-option="yes">Yes</button>',
    ],
    ['Oui', '<button data-target type="button">Oui</button>'],
    ['Non', '<button data-target type="button">Non</button>'],
    ['Decline to self-identify', '<button data-target type="button">Decline to self-identify</button>'],
    ['Application question', '<button data-target type="button" class="application-question">No</button>'],
  ])('accepts the answer button %s', (_name, html) => {
    expect(checkTarget(render(html), 'choiceButton', 'screening.referred')).toBeNull();
  });

  it('accepts comboboxes', () => {
    const el = render('<input data-target role="combobox" aria-expanded="false">');
    expect(checkTarget(el, 'openCombobox', 'address.country')).toBeNull();
  });
});

describe('act/ refuses sensitive field types', () => {
  it('never ticks an Attestation', async () => {
    const el = render('<input data-target type="checkbox">');
    expect(await setChecked(el, true, { fieldType: 'attestation.certify' })).toMatchObject({
      ok: false,
      error: { reason: 'sensitiveFieldType' },
    });
  });

  it('never types a password', async () => {
    const el = render('<input data-target type="text">');
    expect(await setText(el, 'x', { fieldType: 'never.password' })).toMatchObject({
      ok: false,
      error: { reason: 'sensitiveFieldType' },
    });
  });

  it('refuses password inputs outright', () => {
    const el = render('<input data-target type="password">');
    expect(checkTarget(el, 'text', 'contact.email')).toMatchObject({ reason: 'wrongElementKind' });
  });

  it('refuses options of the wrong kind', async () => {
    const el = render('<div data-target>Canada</div>');
    expect(await chooseOption(el, { fieldType: 'address.country' })).toMatchObject({
      ok: false,
      error: { reason: 'wrongElementKind' },
    });
  });
});
