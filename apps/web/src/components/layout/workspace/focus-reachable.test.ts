import { afterEach, describe, expect, it } from 'vitest';

import { focusOutsideInert } from './focus-reachable';

function mount(html: string): void {
  document.body.innerHTML = html;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('focusOutsideInert', () => {
  it('focuses a reachable target', () => {
    mount('<ul role="listbox" tabindex="0" id="lb"></ul><button id="x">x</button>');
    focusOutsideInert(document.getElementById('lb'));
    expect(document.activeElement?.id).toBe('lb');
  });

  it('skips a target inside an inert subtree and uses the open dock', () => {
    mount(`<div inert><ul role="listbox" tabindex="0" id="lb"></ul></div>
      <section data-right-dock="health"><button id="close">Close</button></section>
      <div data-activities-bar><button id="expand">Expand</button></div>`);
    focusOutsideInert(document.getElementById('lb'));
    // **Red** against a bare `focus()`: jsdom focuses the inert node (`lb`), where a browser would do
    // nothing and leave <body>; either way it is not the dock.
    expect(document.activeElement?.id).toBe('close');
  });

  it('falls back to the foot row when no dock is open', () => {
    mount(`<div inert><ul role="listbox" tabindex="0" id="lb"></ul></div>
      <div data-activities-bar><button id="expand">Expand</button></div>`);
    focusOutsideInert(document.getElementById('lb'));
    expect(document.activeElement?.id).toBe('expand');
  });

  it('falls back when there is no target at all', () => {
    mount('<div data-activities-bar><button id="expand">Expand</button></div>');
    focusOutsideInert(null);
    expect(document.activeElement?.id).toBe('expand');
  });
});
