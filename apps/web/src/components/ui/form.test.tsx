import { render, screen } from '@testing-library/react';
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

  it('only lightens the label weight relative to the default', () => {
    const { rerender } = render(<CheckboxField label="Today" />);
    expect(screen.getByRole('checkbox').closest('label')).toHaveClass('font-medium');
    rerender(<CheckboxField label="Today" density="compact" />);
    expect(screen.getByRole('checkbox').closest('label')).toHaveClass('font-normal');
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
