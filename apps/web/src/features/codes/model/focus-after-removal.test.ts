import { afterEach, describe, expect, it } from 'vitest';

import { focusAfterRemoval, focusTargetsAfterRemoval, neighbourOf } from './focus-after-removal';

function mount(ids: string[], verb = 'delete'): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML =
    ids.map((id) => `<button data-row-action="${id}:${verb}">${id}</button>`).join('') +
    '<input data-new-code-value />';
  document.body.append(root);
  return root;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('focusTargetsAfterRemoval', () => {
  it('prefers the next row’s same action, then the previous row’s, then the Add value field', () => {
    const root = mount(['a', 'c']);
    const names = focusTargetsAfterRemoval(
      { id: 'b', order: ['a', 'b', 'c'], verb: 'delete' },
      root,
    ).map((el) => el.getAttribute('data-row-action') ?? 'add');
    expect(names).toEqual(['c:delete', 'a:delete', 'add']);
  });

  it('goes to the Add value field when the removed row was the only one', () => {
    const root = mount([]);
    const targets = focusTargetsAfterRemoval({ id: 'a', order: ['a'], verb: 'delete' }, root);
    expect(targets).toHaveLength(1);
    expect(targets[0]?.hasAttribute('data-new-code-value')).toBe(true);
  });
});

describe('focusAfterRemoval', () => {
  it('focuses the first target that takes focus', () => {
    const root = mount(['a', 'c']);
    expect(focusAfterRemoval({ id: 'b', order: ['a', 'b', 'c'], verb: 'delete' }, root)).toBe(true);
    expect(document.activeElement?.getAttribute('data-row-action')).toBe('c:delete');
  });

  it('reports when nothing could take it', () => {
    expect(
      focusAfterRemoval({ id: 'a', order: ['a'], verb: 'delete' }, document.createElement('div')),
    ).toBe(false);
  });
});

describe('neighbourOf', () => {
  it('is the next id, else the previous, else nothing', () => {
    expect(neighbourOf(['a', 'b', 'c'], 'b')).toBe('c');
    expect(neighbourOf(['a', 'b', 'c'], 'c')).toBe('b');
    expect(neighbourOf(['a'], 'a')).toBeUndefined();
  });
});
