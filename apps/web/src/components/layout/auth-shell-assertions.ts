import { screen } from '@testing-library/react';
import { expect } from 'vitest';

/**
 * The landmark invariant every public screen holds, in one place (ADR-0077 M2-T3).
 *
 * The six pre-authentication routes have **33 landable states** between them (spec §2.2), and each
 * one has to be a whole page: one `main`, one `<h1>`, and the `<h1>` describing the state the
 * reader is actually in. That last part is the defect this exists to catch — `/reset-password` kept
 * "Choose a new password" as its heading over a body that had already said the password was
 * changed, because the heading lived in the route and the outcome lived in the form.
 *
 * A helper rather than the assertion written out per state, for the reason `scope-save-bar-
 * assertions.ts` is one: 33 hand-written copies drift, and the one that drifts is the one nobody
 * re-reads.
 */
export function expectSinglePublicLandmark(): void {
  expect(screen.getAllByRole('main')).toHaveLength(1);
  // `queryAllBy` rather than `getAllBy`: a **transient** state may legitimately have no heading yet
  // (the invitation card's spinner is on its way to one of nine screens that do). What must never
  // happen is two.
  expect(screen.queryAllByRole('heading', { level: 1 }).length).toBeLessThanOrEqual(1);
}

/** The heading a state must be showing — and that it is the only one. */
export function expectPublicHeading(text: string | RegExp): void {
  expectSinglePublicLandmark();
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(text);
}
