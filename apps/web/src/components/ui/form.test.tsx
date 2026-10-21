import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';

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
      /^<div class="flex flex-col gap-1\.5"><label for="([^"]+)" class="flex min-h-6 items-center gap-2 py-1 text-sm font-medium"><input id="\1" class="accent-primary size-4" type="checkbox">Today<\/label><\/div>$/,
    );
  });

  it('renders the compact default shape unchanged when no new prop is passed', () => {
    const { container } = render(<CheckboxField label="Today" density="compact" />);
    expect(container.innerHTML).toMatch(
      /^<div class="flex flex-col gap-0\.5"><label for="([^"]+)" class="flex min-h-6 items-center gap-2 py-1 text-sm font-normal"><input id="\1" class="accent-primary size-4" type="checkbox">Today<\/label><\/div>$/,
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
