import { afterEach, describe, expect, it } from 'vitest';

import { focusAfterDelete, focusTargetsAfterDelete } from './focus-after-delete';

function gutter(keys: string[], corner = true): void {
  document.body.innerHTML = `
    <div data-testid="tsld-swimlane-gutter">
      ${corner ? '<div data-testid="tsld-swimlane-gutter-corner"><button>Swimlanes…</button></div>' : ''}
      <div data-testid="tsld-swimlane-gutter-labels" tabindex="-1">
        ${keys.map((k) => `<button data-swimlane="${k}">${k}</button>`).join('')}
      </div>
    </div>`;
}

function manage(ids: string[]): void {
  document.body.innerHTML = `
    <ul>${ids.map((i) => `<li><button data-row-action="${i}:rename">r</button></li>`).join('')}</ul>
    <input data-new-swimlane />`;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('from the gutter', () => {
  it('goes to the next label, else the previous', () => {
    gutter(['a', 'b', 'c', 'none']);
    // `b` is already gone from the DOM, as it is when the refetch has landed.
    document.querySelector('[data-swimlane="b"]')!.remove();
    expect(focusAfterDelete({ id: 'b', from: 'gutter', order: ['a', 'b', 'c'] })).toBe(true);
    expect(document.activeElement).toHaveAttribute('data-swimlane', 'c');
  });

  it('treats "No swimlane" as the one after the last', () => {
    gutter(['a', 'b', 'none']);
    document.querySelector('[data-swimlane="b"]')!.remove();
    focusAfterDelete({ id: 'b', from: 'gutter', order: ['a', 'b'] });
    expect(document.activeElement).toHaveAttribute('data-swimlane', 'none');
  });

  it('goes to the previous when the deleted one was last and nothing follows', () => {
    gutter(['a', 'b']);
    document.querySelector('[data-swimlane="b"]')!.remove();
    focusAfterDelete({ id: 'b', from: 'gutter', order: ['a', 'b'] });
    expect(document.activeElement).toHaveAttribute('data-swimlane', 'a');
  });

  it('falls back to the corner command, then the toolbar, when no label is left', () => {
    gutter([]);
    focusAfterDelete({ id: 'a', from: 'gutter', order: ['a'] });
    expect(document.activeElement).toHaveTextContent('Swimlanes…');
    gutter([], false);
    focusAfterDelete({ id: 'a', from: 'gutter', order: ['a'] });
    expect(document.activeElement).toHaveAttribute('data-testid', 'tsld-swimlane-gutter-labels');
  });

  it('orders its candidates: next, previous, corner, toolbar', () => {
    gutter(['a', 'c']);
    const targets = focusTargetsAfterDelete({ id: 'b', from: 'gutter', order: ['a', 'b', 'c'] });
    expect(targets.map((t) => t.getAttribute('data-swimlane') ?? t.tagName)).toEqual([
      'c',
      'a',
      'BUTTON',
      'DIV',
    ]);
  });
});

describe('when the last swimlane takes the gutter with it', () => {
  it('lands on the View trigger, else the diagram listbox, never <body>', () => {
    document.body.innerHTML =
      '<button data-toolbar-item="view">View</button><div role="listbox" aria-label="Activities in the diagram" tabindex="0"></div>';
    expect(focusAfterDelete({ id: 'a', from: 'gutter', order: ['a'] })).toBe(true);
    expect(document.activeElement).toHaveAttribute('data-toolbar-item', 'view');
    document.body.innerHTML =
      '<div role="listbox" aria-label="Activities in the diagram" tabindex="0"></div>';
    expect(focusAfterDelete({ id: 'a', from: 'gutter', order: ['a'] })).toBe(true);
    expect(document.activeElement).toHaveAttribute('role', 'listbox');
  });
});

describe('from Manage', () => {
  it('goes to the next row’s Rename, else the previous, else the New swimlane field', () => {
    manage(['a', 'c']);
    focusAfterDelete({ id: 'b', from: 'manage', order: ['a', 'b', 'c'] });
    expect(document.activeElement).toHaveAttribute('data-row-action', 'c:rename');
    manage(['a']);
    focusAfterDelete({ id: 'b', from: 'manage', order: ['a', 'b'] });
    expect(document.activeElement).toHaveAttribute('data-row-action', 'a:rename');
    manage([]);
    focusAfterDelete({ id: 'a', from: 'manage', order: ['a'] });
    expect(document.activeElement).toHaveAttribute('data-new-swimlane');
  });
});

describe('when nothing can take focus', () => {
  it('reports false', () => {
    document.body.innerHTML = '';
    expect(focusAfterDelete({ id: 'a', from: 'manage', order: ['a'] })).toBe(false);
  });
});
