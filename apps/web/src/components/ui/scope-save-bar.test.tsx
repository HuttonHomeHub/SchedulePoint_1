import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ScopeSaveBar } from '@/components/ui/scope-save-bar';
import { expectInert, expectRefusalBesideSave } from '@/components/ui/scope-save-bar-assertions';

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

describe('ScopeSaveBar — the refusal slot (ADR-0217)', () => {
  const nativeScroll = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
  afterEach(() => {
    if (nativeScroll) Object.defineProperty(Element.prototype, 'scrollIntoView', nativeScroll);
    else Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  });

  const REFUSED = { message: 'This activity changed elsewhere.' };

  it('shows the refusal in the bar and describes Save by it', () => {
    const { save } = renderBar({ dirty: true, error: REFUSED });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('This activity changed elsewhere.');
    expectRefusalBesideSave(alert, save);
    expect(save).toHaveAccessibleDescription('This activity changed elsewhere.');
  });

  it('replaces the dirty and saved sentences while it shows, and gives them back after', () => {
    const { rerender } = render(
      <ScopeSaveBar
        gate={{ writable: true, reason: null }}
        dirty
        pending={false}
        label="Save general"
        error={REFUSED}
      />,
    );
    expect(screen.queryByText('Unsaved changes in this section.')).not.toBeInTheDocument();
    rerender(
      <ScopeSaveBar
        gate={{ writable: true, reason: null }}
        dirty
        pending={false}
        label="Save general"
      />,
    );
    expect(screen.getByText('Unsaved changes in this section.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps a gate reason: it says why Save is inert and is still true', () => {
    const { save } = renderBar({
      gate: { writable: false, reason: 'Take the pen to edit.' },
      dirty: true,
      error: REFUSED,
    });
    expect(save).toHaveAccessibleDescription(/Take the pen to edit\./);
    expect(save).toHaveAccessibleDescription(/This activity changed elsewhere\./);
  });

  it('renders the action under the sentence, outside the alert and the description', () => {
    const { save } = renderBar({
      dirty: true,
      error: { ...REFUSED, action: <button type="button">Refresh this section</button> },
    });
    const refresh = screen.getByRole('button', { name: 'Refresh this section' });
    expect(screen.getByRole('alert')).not.toContainElement(refresh);
    expect(save).toHaveAccessibleDescription('This activity changed elsewhere.');
    // The action is a real control in the form's tab order, after the sentence.
    expect(save.closest('form')).toContainElement(refresh);
  });

  it('never moves focus: the reader stays on Save, or on the field they were typing in', () => {
    const bar = (error: { message: string } | null) => (
      <form>
        <input aria-label="Name" />
        <ScopeSaveBar
          gate={{ writable: true, reason: null }}
          dirty
          pending={false}
          label="Save general"
          error={error}
        />
      </form>
    );
    const { rerender } = render(bar(null));
    const save = screen.getByRole('button', { name: 'Save general' });
    save.focus();
    rerender(bar(REFUSED));
    expect(save).toHaveFocus();
    rerender(bar(null));
    const field = screen.getByLabelText('Name');
    field.focus();
    rerender(bar(REFUSED));
    expect(field).toHaveFocus();
  });

  it('scrolls the bar into view once per new refusal, not per render', () => {
    const scroll = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      value: scroll,
      configurable: true,
    });
    const bar = (error: { message: string } | null) => (
      <ScopeSaveBar
        gate={{ writable: true, reason: null }}
        dirty
        pending={false}
        label="Save general"
        error={error}
      />
    );
    const { rerender } = render(bar(null));
    expect(scroll).not.toHaveBeenCalled();
    rerender(bar({ message: 'No.' }));
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' });
    // A caller rebuilding an equal object on every render must not re-scroll.
    rerender(bar({ message: 'No.' }));
    expect(scroll).toHaveBeenCalledTimes(1);
    // The same words coming back after a clear are a new refusal and come back into view.
    rerender(bar(null));
    rerender(bar({ message: 'No.' }));
    expect(scroll).toHaveBeenCalledTimes(2);
  });

  it('survives a browser with no scrollIntoView (jsdom)', () => {
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    expect(() => renderBar({ dirty: true, error: REFUSED })).not.toThrow();
  });
});
