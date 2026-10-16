import { afterEach, describe, expect, it } from 'vitest';

import { focusOutsideInert, planSurfaceTarget, reachableTarget } from './focus-reachable';

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

describe('reachableTarget', () => {
  it('returns a reachable target without focusing it', () => {
    mount('<ul role="listbox" tabindex="0" id="lb"></ul>');
    expect(reachableTarget(document.getElementById('lb'))?.id).toBe('lb');
    expect(document.activeElement).toBe(document.body);
  });

  it('returns the dock fallback for a target inside an inert subtree', () => {
    mount(
      '<div inert><ul role="listbox" id="lb"></ul></div><section data-right-dock><button id="close">Close</button></section>',
    );
    expect(reachableTarget(document.getElementById('lb'))?.id).toBe('close');
  });
});

describe('planSurfaceTarget', () => {
  it("prefers the Gantt's active row", () => {
    mount(
      '<div role="treegrid"><div role="row" tabindex="-1" id="a"></div><div role="row" tabindex="0" id="b"></div></div><ul role="listbox" id="lb"></ul>',
    );
    expect(planSurfaceTarget()?.id).toBe('b');
  });

  it('falls back to the grid itself when no row is the tab stop', () => {
    mount('<div role="treegrid" id="g"><div role="row" tabindex="-1"></div></div>');
    expect(planSurfaceTarget()?.id).toBe('g');
  });

  it('uses the canvas listbox when there is no Gantt', () => {
    mount('<ul role="listbox" tabindex="0" id="lb"></ul>');
    expect(planSurfaceTarget()?.id).toBe('lb');
  });

  it('is null when neither surface is mounted and no fallback exists', () => {
    mount('<p>nothing</p>');
    expect(planSurfaceTarget()).toBeNull();
  });
});
