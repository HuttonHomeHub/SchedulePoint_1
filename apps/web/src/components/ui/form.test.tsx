import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CheckboxField, SelectField, TextField, TextareaField } from './form';

describe('field aria-describedby merging', () => {
  it('TextareaField merges a caller-supplied description with its own error id (does not clobber)', () => {
    render(
      <>
        <TextareaField label="Add a note" error="Enter a note." aria-describedby="count-hint" />
        <p id="count-hint">0 / 5000</p>
      </>,
    );
    const field = screen.getByLabelText('Add a note');
    const describedBy = field.getAttribute('aria-describedby') ?? '';
    const ids = describedBy.split(' ');
    // Both the validation error (announced first) and the caller's count hint are referenced.
    expect(ids).toContain('count-hint');
    expect(ids.some((id) => id.endsWith('-error'))).toBe(true);
    expect(ids.indexOf(ids.find((id) => id.endsWith('-error'))!)).toBeLessThan(
      ids.indexOf('count-hint'),
    );
  });

  it('TextField passes through a caller description when there is no error/hint', () => {
    render(<TextField label="Email" aria-describedby="extra" />);
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-describedby', 'extra');
  });

  it('falls back to only the error id when no caller description is given', () => {
    render(<TextareaField label="Body" error="Required." />);
    const field = screen.getByLabelText('Body');
    expect(field.getAttribute('aria-describedby')).toMatch(/-error$/);
  });
});

/**
 * Compact density (S1-T3) exists for inline/toolbar rows — a view-options strip, not a form.
 * The one thing it must never do is trade accessibility for tightness, so the hit target and the
 * label association are pinned here alongside the spacing change.
 */
describe('CheckboxField density', () => {
  it('keeps the label association and the ≥24px hit target when compact', () => {
    render(<CheckboxField label="Non-working days" density="compact" />);
    const box = screen.getByRole('checkbox', { name: 'Non-working days' });
    // The accessible name still comes from the wrapping <label>, not an aria-label.
    expect(box).toBeInTheDocument();
    const label = box.closest('label');
    expect(label).not.toBeNull();
    // WCAG 2.2 SC 2.5.8 — density is spacing, never the target.
    expect(label).toHaveClass('min-h-6', 'py-1');
  });

  it.each(['default', 'compact'] as const)(
    'grows the %s labelled row to the control height under a coarse pointer (ADR-0118 D2)',
    (density) => {
      render(<CheckboxField label="Weekends" density={density} />);
      expect(screen.getByRole('checkbox', { name: 'Weekends' }).closest('label')).toHaveClass(
        'min-h-6',
        'pointer-coarse:min-h-(--control-h)',
      );
    },
  );

  it('names the control from rich label content, notes included', () => {
    render(
      <CheckboxField
        label={
          <>
            <span>Superstructure</span> <span>Moves with its 3 activities</span>
          </>
        }
      />,
    );
    const box = screen.getByRole('checkbox', {
      name: 'Superstructure Moves with its 3 activities',
    });
    expect(box.closest('label')).toHaveTextContent('Superstructure Moves with its 3 activities');
    expect(box).not.toHaveAttribute('aria-label');
  });

  it('only lightens the label weight relative to the default', () => {
    const { rerender } = render(<CheckboxField label="Today" />);
    expect(screen.getByRole('checkbox').closest('label')).toHaveClass('font-medium');
    rerender(<CheckboxField label="Today" density="compact" />);
    expect(screen.getByRole('checkbox').closest('label')).toHaveClass('font-normal');
  });
});

describe('CheckboxField label modes', () => {
  it('renders the default shape unchanged when no new prop is passed', () => {
    const { container } = render(<CheckboxField label="Today" />);
    expect(container.innerHTML).toMatch(
      /^<div class="flex flex-col gap-1\.5"><label for="([^"]+)" class="flex min-h-6 items-center gap-2 py-1 text-sm pointer-coarse:min-h-\(--control-h\) font-medium"><input id="\1" class="accent-primary size-4" type="checkbox">Today<\/label><\/div>$/,
    );
  });

  it('renders the compact default shape unchanged when no new prop is passed', () => {
    const { container } = render(<CheckboxField label="Today" density="compact" />);
    expect(container.innerHTML).toMatch(
      /^<div class="flex flex-col gap-0\.5"><label for="([^"]+)" class="flex min-h-6 items-center gap-2 py-1 text-sm pointer-coarse:min-h-\(--control-h\) font-normal"><input id="\1" class="accent-primary size-4" type="checkbox">Today<\/label><\/div>$/,
    );
  });

  it('lets a caller set indeterminate through the forwarded ref', () => {
    const ref = createRef<HTMLInputElement>();
    render(<CheckboxField ref={ref} label="All" labelHidden />);
    ref.current!.indeterminate = true;
    expect(screen.getByRole('checkbox', { name: 'All' })).toHaveProperty('indeterminate', true);
  });

  it('names a hidden-label box from the label text and makes the label the hit target', () => {
    render(
      <CheckboxField label="Select Excavate" labelHidden targetData={{ 'data-row-select': '' }} />,
    );
    const box = screen.getByRole('checkbox', { name: 'Select Excavate' });
    expect(box).not.toHaveAttribute('aria-label');
    const label = box.closest('label');
    expect(label).toHaveClass('size-6', 'pointer-coarse:size-(--control-h)');
    expect(label).toHaveAttribute('data-row-select', '');
  });

  it('keeps a shut hidden-label box reachable, cancelled and explained, with no lock icon', () => {
    render(
      <CheckboxField
        label="Select Excavate"
        labelHidden
        gate={{ writable: false, reason: 'Take the pen to edit.' }}
      />,
    );
    const box = screen.getByRole('checkbox', { name: 'Select Excavate' });
    expect(box).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(box);
    // A cancelled click leaves the box unchecked; `change` never fires in a real browser.
    expect(box).not.toBeChecked();
    expect(box).toHaveAccessibleDescription('Take the pen to edit.');
    expect(box.closest('label')?.querySelector('svg')).toBeNull();
    expect(box).not.toBeDisabled();
    box.focus();
    expect(box).toHaveFocus();
    expect(box).toHaveClass('aria-disabled:accent-muted-foreground');
    expect(screen.getByText('Take the pen to edit.')).toHaveClass('sr-only');
  });
});

/**
 * The shared select composite (TECH_DEBT #42). It replaced 30-odd hand-assembled Label+Select
 * blocks whose wiring had drifted apart, so what is pinned here is precisely the wiring: the
 * label association, and that a hint and an error are BOTH described when both are showing —
 * several call sites render both, and dropping the hint mid-correction loses the explanation of
 * what the control does at the moment it is most wanted.
 */
describe('SelectField', () => {
  function options() {
    return (
      <>
        <option value="a">A</option>
        <option value="b">B</option>
      </>
    );
  }

  it('labels the select and links hint and error together', () => {
    render(
      <SelectField label="Constraint" hint="Pins the activity." error="Pick a date.">
        {options()}
      </SelectField>,
    );
    const field = screen.getByLabelText('Constraint');
    expect(field.tagName).toBe('SELECT');
    expect(field).toHaveAttribute('aria-invalid', 'true');

    const ids = (field.getAttribute('aria-describedby') ?? '').split(' ');
    expect(ids.some((id) => id.endsWith('-hint'))).toBe(true);
    expect(ids.some((id) => id.endsWith('-error'))).toBe(true);
    expect(screen.getByText('Pins the activity.')).toBeInTheDocument();
    expect(screen.getByText('Pick a date.')).toBeInTheDocument();
  });

  it('merges a caller-supplied description rather than clobbering it', () => {
    render(
      <>
        <SelectField label="Show archived" aria-describedby="archive-explainer">
          {options()}
        </SelectField>
        <p id="archive-explainer">Archived rows stay valid.</p>
      </>,
    );
    expect(screen.getByLabelText('Show archived')).toHaveAttribute(
      'aria-describedby',
      'archive-explainer',
    );
  });

  /**
   * A validation error revealed on submit is already announced by `FormErrorSummary`; an error
   * that appears on its own — a failed options query — is not, so it opts into a live region.
   * Defaulting to no role keeps the common case from announcing twice.
   */
  it('only announces the error when the caller asks it to', () => {
    const { rerender } = render(
      <SelectField label="Calendar" error="Required.">
        {options()}
      </SelectField>,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    rerender(
      <SelectField label="Calendar" error="Couldn’t load calendars." errorRole="alert">
        {options()}
      </SelectField>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load calendars.');
  });
});

/**
 * `TextField`'s default mode is every existing caller's (70 uses), so what makes it "unchanged" is
 * pinned: per-keystroke `onChange`, the caller's handlers, `register()`'s ref and no `window` listener.
 */
describe('TextField default mode', () => {
  it('fires onChange per keystroke and forwards onBlur and onKeyDown', () => {
    const onChange = vi.fn();
    const onBlur = vi.fn();
    const onKeyDown = vi.fn();
    render(<TextField label="Name" onChange={onChange} onBlur={onBlur} onKeyDown={onKeyDown} />);
    const input = screen.getByLabelText('Name');
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.change(input, { target: { value: 'ab' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onKeyDown).toHaveBeenCalledOnce();
    expect(onBlur).toHaveBeenCalledOnce();
  });

  it('binds a register()-style ref to the input and adds no window keydown listener', () => {
    const ref = createRef<HTMLInputElement>();
    const add = vi.spyOn(window, 'addEventListener');
    try {
      render(<TextField label="Name" ref={ref} />);
      expect(ref.current).toBe(screen.getByLabelText('Name'));
      expect(add.mock.calls.filter(([type]) => type === 'keydown')).toEqual([]);
    } finally {
      add.mockRestore();
    }
  });

  it('keeps a gated field read-only after the caller’s props', () => {
    render(<TextField label="Name" readOnly={false} gate={{ writable: false, reason: null }} />);
    expect(screen.getByLabelText('Name')).toHaveAttribute('readonly');
  });
});

describe('TextField commit mode', () => {
  it('wires the label and description as the default mode does, and leaks no mode prop', () => {
    render(
      <TextField
        label="Threshold"
        hint="Days or hours."
        commitOn="enter-or-blur"
        value="2h"
        onCommit={vi.fn()}
      />,
    );
    const input = screen.getByLabelText('Threshold');
    expect(input).toHaveValue('2h');
    expect(input).toHaveAccessibleDescription('Days or hours.');
    expect(input).not.toHaveAttribute('commiton');
  });

  it('commits on Enter and on blur with a draft, never per keystroke', () => {
    const onCommit = vi.fn();
    render(<TextField label="Threshold" commitOn="enter-or-blur" value="2h" onCommit={onCommit} />);
    const input = screen.getByLabelText('Threshold');
    fireEvent.change(input, { target: { value: '3d' } });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenLastCalledWith('3d', 'enter');
    fireEvent.change(input, { target: { value: '4d' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenLastCalledWith('4d', 'blur');
  });

  it('Escape discards a draft even when a container blurs the field first', () => {
    const onCommit = vi.fn();
    render(<TextField label="Threshold" commitOn="enter-or-blur" value="2h" onCommit={onCommit} />);
    const input = screen.getByLabelText('Threshold');
    const closeLikeADialog = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') input.blur();
    };
    document.addEventListener('keydown', closeLikeADialog, true);
    try {
      input.focus();
      fireEvent.change(input, { target: { value: '9d' } });
      fireEvent.keyDown(input, { key: 'Escape' });
    } finally {
      document.removeEventListener('keydown', closeLikeADialog, true);
    }
    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue('2h');
  });

  it('a gated commit field is read-only and does not commit on Enter', () => {
    const onCommit = vi.fn();
    render(
      <TextField
        label="Threshold"
        commitOn="enter-or-blur"
        value="2h"
        onCommit={onCommit}
        gate={{ writable: false, reason: null }}
      />,
    );
    const input = screen.getByLabelText('Threshold');
    expect(input).toHaveAttribute('readonly');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('still binds a forwarded ref to the input', () => {
    const ref = createRef<HTMLInputElement>();
    render(
      <TextField
        label="Threshold"
        commitOn="enter-or-blur"
        value="2h"
        onCommit={vi.fn()}
        ref={ref}
      />,
    );
    expect(ref.current).toBe(screen.getByLabelText('Threshold'));
  });

  it('is typed so commit mode needs value and onCommit and forbids onChange', () => {
    // Never called: the point is that this file compiles only if each directive is an error.
    const types = (): React.ReactElement[] => [
      // @ts-expect-error commit mode without onCommit
      <TextField key="a" label="x" commitOn="enter-or-blur" value="" />,
      // @ts-expect-error commit mode without value
      <TextField key="b" label="x" commitOn="enter-or-blur" onCommit={vi.fn()} />,
      // @ts-expect-error commit mode forbids a per-keystroke onChange
      <TextField
        key="c"
        label="x"
        commitOn="enter-or-blur"
        value=""
        onCommit={vi.fn()}
        onChange={vi.fn()}
      />,
      // @ts-expect-error commit mode forbids onBlur: the hook owns it
      <TextField
        key="d"
        label="x"
        commitOn="enter-or-blur"
        value=""
        onCommit={vi.fn()}
        onBlur={vi.fn()}
      />,
      // @ts-expect-error commit mode forbids onKeyDown: the hook owns it
      <TextField
        key="e"
        label="x"
        commitOn="enter-or-blur"
        value=""
        onCommit={vi.fn()}
        onKeyDown={vi.fn()}
      />,
      // @ts-expect-error commit mode forbids defaultValue: the draft is internal
      <TextField
        key="f"
        label="x"
        commitOn="enter-or-blur"
        value=""
        onCommit={vi.fn()}
        defaultValue=""
      />,
      // @ts-expect-error default mode has no onCommit
      <TextField key="g" label="x" onCommit={vi.fn()} />,
    ];
    expect(typeof types).toBe('function');
  });
});
