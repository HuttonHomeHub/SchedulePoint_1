import { describe, expect, it } from 'vitest';

import { revealTakesFocus } from './reveal-focus';

describe('revealTakesFocus', () => {
  it('always takes focus for a request that does not keep it', () => {
    const button = document.createElement('button');
    expect(revealTakesFocus(false, button)).toBe(true);
  });

  it('leaves focus on the control the planner pressed', () => {
    const button = document.createElement('button');
    document.body.append(button);
    button.focus();
    expect(revealTakesFocus(true, document.activeElement)).toBe(false);
    button.remove();
  });

  it('hands focus to the diagram when it has already fallen to body or nowhere', () => {
    expect(revealTakesFocus(true, document.body)).toBe(true);
    expect(revealTakesFocus(true, null)).toBe(true);
  });
});
