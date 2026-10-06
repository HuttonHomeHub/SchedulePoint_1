import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ScopeSaveBar } from '@/components/ui/scope-save-bar';
import { expectInert } from '@/components/ui/scope-save-bar-assertions';

function renderBar(props: Partial<React.ComponentProps<typeof ScopeSaveBar>> = {}) {
  const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
  render(
    <form onSubmit={onSubmit}>
      <input aria-label="Name" />
      <ScopeSaveBar
        gate={{ writable: true, reason: null }}
        dirty={false}
        pending={false}
        label="Save general"
        {...props}
      />
    </form>,
  );
  return {
    onSubmit,
    save: screen.getByRole('button', { name: props.pending ? 'Saving…' : 'Save general' }),
  };
}

describe('ScopeSaveBar', () => {
  it('refuses a click while clean, and stays pointer-reachable at rest', () => {
    const { onSubmit, save } = renderBar();
    expectInert(save);
    // At rest the button must take the pointer, so its reason can be hovered and a click cannot
    // fall through to whatever is behind it (`docs/TECH_DEBT.md` #460).
    expect(save).not.toHaveClass('aria-disabled:pointer-events-none');
    fireEvent.click(save);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('refuses a click for a reader without the write right', () => {
    const { onSubmit, save } = renderBar({
      gate: { writable: false, reason: 'You cannot edit this plan.' },
      dirty: true,
    });
    expectInert(save);
    fireEvent.click(save);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('is pointer-inert only while saving', () => {
    const { onSubmit, save } = renderBar({ dirty: true, pending: true });
    expect(save).toHaveAttribute('aria-busy', 'true');
    expect(save).toHaveClass('aria-busy:pointer-events-none');
    fireEvent.click(save);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits when it can', () => {
    const { onSubmit, save } = renderBar({ dirty: true });
    fireEvent.click(save);
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});
