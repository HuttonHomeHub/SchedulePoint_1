import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CheckboxField, TextField, TextareaField } from './form';

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
