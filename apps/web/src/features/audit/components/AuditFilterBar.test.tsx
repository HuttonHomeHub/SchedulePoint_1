import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AUDIT_OUTCOME_LABELS } from '../model/audit-copy';
import { EMPTY_AUDIT_FILTER, type AuditFilterState } from '../model/audit-filter';

import { AuditFilterBar } from './AuditFilterBar';

/**
 * The bar is **controlled**, so it renders here with no router — which is the point of the split
 * (`useUrlFilterState`'s own rule). These tests drive it the way a person does and assert on the
 * patch it emits, not on internal state.
 */
function setup(
  value: AuditFilterState = EMPTY_AUDIT_FILTER,
  surface: 'organization' | 'self' = 'organization',
) {
  const onChange = vi.fn();
  render(<AuditFilterBar surface={surface} value={value} onChange={onChange} />);
  return { onChange };
}

describe('AuditFilterBar (ADR-0073 C1)', () => {
  describe('which categories are offered', () => {
    it('withholds Sign-ins from the organisation surface', () => {
      setup();
      expect(screen.getByRole('button', { name: 'Access' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Sign-ins' })).not.toBeInTheDocument();
    });

    it('offers Sign-ins on /me', () => {
      setup(EMPTY_AUDIT_FILTER, 'self');
      expect(screen.getByRole('button', { name: 'Sign-ins' })).toBeInTheDocument();
    });

    it('offers no chip that could only ever return nothing', () => {
      // `plan-structure` and `settings` are declared for ADR-0073's coming actions but hold none
      // today. A chip that can only answer "no events" is the defect this bar exists to remove.
      setup();
      expect(screen.queryByRole('button', { name: 'Plan structure' })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Settings & calendars' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('the controls', () => {
    it('reports a category as pressed and emits the patch that adds it', () => {
      const { onChange } = setup();
      const chip = screen.getByRole('button', { name: 'Access' });
      expect(chip).toHaveAttribute('aria-pressed', 'false');

      fireEvent.click(chip);
      expect(onChange).toHaveBeenCalledWith({ categories: 'access' });
    });

    it('emits the patch that removes an already-chosen category', () => {
      const { onChange } = setup({ ...EMPTY_AUDIT_FILTER, categories: 'access,deletions' });
      expect(screen.getByRole('button', { name: 'Access' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );

      fireEvent.click(screen.getByRole('button', { name: 'Access' }));
      expect(onChange).toHaveBeenCalledWith({ categories: 'deletions' });
    });

    it('uses a radiogroup for the outcome — one of a set, not N booleans', () => {
      // Semantic, not visual: a radiogroup tells AT "one of N" and a pressed button says "this is
      // on". Getting it backwards misdescribes the control even when it looks right.
      setup();
      expect(screen.getByRole('radiogroup', { name: 'Outcome' })).toBeInTheDocument();
    });

    it('clears the outcome when the chosen one is picked again', () => {
      // Otherwise the only route back to "any outcome" is Clear filters, which also throws away
      // the categories and dates the reader still wants.
      const { onChange } = setup({ ...EMPTY_AUDIT_FILTER, outcome: 'DENIED' });
      // Named from the shared copy table rather than spelled out, because this test spelled it out
      // and then outlived the word: the review renamed "Refused" to "Denied" to match the row badge
      // and only the full suite noticed.
      fireEvent.click(screen.getByRole('radio', { name: AUDIT_OUTCOME_LABELS.DENIED }));
      expect(onChange).toHaveBeenCalledWith({ outcome: '' });
    });

    it('bounds each date input by the other so an inverted range cannot be composed', () => {
      setup({ ...EMPTY_AUDIT_FILTER, from: '2026-08-01', to: '2026-08-04' });
      expect(screen.getByLabelText('To')).toHaveAttribute('min', '2026-08-01');
      expect(screen.getByLabelText('From')).toHaveAttribute('max', '2026-08-04');
    });
  });

  describe('Clear filters', () => {
    it('is shaded, not natively disabled, when nothing is filtered', () => {
      // A control that flips as the filter changes would blur to `<body>` mid-interaction and drop
      // the reader's place — the ScopeSaveBar lesson (ADR-0060/ADR-0063), re-applied here.
      setup();
      const clear = screen.getByRole('button', { name: /clear filters/i });
      expect(clear).toHaveAttribute('aria-disabled', 'true');
      expect(clear).not.toHaveAttribute('disabled');
    });

    it('does nothing when there is nothing to clear', () => {
      const { onChange } = setup();
      fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));
      expect(onChange).not.toHaveBeenCalled();
    });

    it('clears every filter at once when one is set', () => {
      const { onChange } = setup({
        categories: 'access',
        outcome: 'DENIED',
        from: '2026-08-01',
        to: '2026-08-04',
      });
      fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));
      expect(onChange).toHaveBeenCalledWith({ categories: '', outcome: '', from: '', to: '' });
    });
  });

  it('leaves every control in the natural tab order', () => {
    // WCAG 2.1.1. Nothing here is a div-with-onClick and nothing is removed from the sequence with
    // `tabIndex={-1}` — the two ways a filter row usually becomes keyboard-unreachable.
    setup();
    const controls = [
      screen.getByRole('button', { name: 'Access' }),
      screen.getByRole('button', { name: 'Deletions' }),
      screen.getByLabelText('From'),
      screen.getByLabelText('To'),
      screen.getByRole('button', { name: /clear filters/i }),
    ];
    // Asserted non-empty, because the first version of this test queried BEFORE rendering: every
    // lookup returned null, the loop body never ran, and it passed while checking nothing.
    expect(controls).toHaveLength(5);
    for (const control of controls) {
      expect(control.getAttribute('tabindex')).not.toBe('-1');
    }
  });
});
