import { beforeEach, describe, expect, it } from 'vitest';
import { render } from '../test-support/dom';
import { fireKey } from './events';

function keysSeen(): string[] {
  const seen: string[] = [];
  document.addEventListener('keydown', (event) => seen.push(event.key), true);
  return seen;
}

function byId(id: string): Element {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`fixture needs #${id}`);
  return el;
}

beforeEach(() => {
  render('');
});

// Enter in a form control submits the form, through the browser or the
// page's own keydown handler (design.md "What it is").
describe('fireKey never presses Enter', () => {
  it.each(['Enter', 'NumpadEnter', '\r', '\n'])('refuses %j on a control inside a form', (key) => {
    render('<form><input id="x"></form>');
    const seen = keysSeen();
    expect(() => {
      fireKey(byId('x'), 'keydown', key);
    }).toThrow(/never presses Enter/);
    expect(seen).toEqual([]);
  });

  it('refuses it inside a shadow root inside a form', () => {
    render('<form><div id="host"></div></form>');
    const shadow = byId('host').attachShadow({ mode: 'open' });
    shadow.innerHTML = '<input id="x">';
    const input = shadow.getElementById('x');
    if (input === null) throw new Error('no input');
    expect(() => {
      fireKey(input, 'keyup', 'Enter');
    }).toThrow(/never presses Enter/);
  });

  it('refuses it on forms that are not a <form> (Ashby)', () => {
    render('<div class="ashby-application-form-container"><input id="x"></div>');
    expect(() => {
      fireKey(byId('x'), 'keydown', 'Enter');
    }).toThrow(/never presses Enter/);
  });

  it('presses the keys act/ uses', () => {
    render('<form><input id="x" role="combobox"></form>');
    const seen = keysSeen();
    fireKey(byId('x'), 'keydown', 'ArrowDown');
    fireKey(byId('x'), 'keydown', 'Escape');
    fireKey(byId('x'), 'keydown', 'a');
    expect(seen).toEqual(['ArrowDown', 'Escape', 'a']);
  });
});
