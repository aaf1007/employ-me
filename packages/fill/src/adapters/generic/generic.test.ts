import { describe, expect, it } from 'vitest';
import { render } from '../../test-support/dom';
import { genericAdapter } from './index';
import { postingPageText } from './page-text';

describe('the generic adapter on a company site', () => {
  it('keeps the job description for the Snapshot, without the site’s chrome or the form', () => {
    const doc = render(`
      <header><nav><a href="/">Acme</a> <a href="/careers">Careers</a></nav></header>
      <main>
        <h1>Platform Engineer</h1>
        <p>Build the tools our robots run on.</p>
        <p hidden>Draft notes nobody sees</p>
        <form>
          <label for="first">First name</label><input id="first">
          <label for="email">Email</label><input id="email">
          <textarea id="why">Tell us why</textarea>
          <button type="button">Apply</button>
        </form>
        <p>Toronto, ON</p>
      </main>
      <footer>© Acme</footer>`);
    const form = genericAdapter.findForm(doc);
    expect(form?.localName).toBe('form');
    expect(postingPageText(doc, form)).toBe(
      'Platform Engineer Build the tools our robots run on. Toronto, ON',
    );
  });

  it('reads the page whole when the fields have no form around them, still leaving the fields out', () => {
    const doc = render(`
      <h1>Data Analyst</h1><p>Make sense of the numbers.</p>
      <div><label for="a">Name</label><input id="a"></div>
      <div><label for="b">Email</label><input id="b"></div>`);
    const form = genericAdapter.findForm(doc);
    expect(form).toBe(doc.body);
    expect(postingPageText(doc, form)).toBe('Data Analyst Make sense of the numbers.');
  });
});
