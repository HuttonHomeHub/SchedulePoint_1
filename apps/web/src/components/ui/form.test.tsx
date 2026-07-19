import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TextField, TextareaField } from './form';

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
