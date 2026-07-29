import { expect } from 'vitest';

/**
 * Assert a `ScopeSaveBar` Save is inert — and inert **the right way** (ADR-0060 §6).
 *
 * `toBeDisabled()` would pass on the native attribute, which is exactly what this surface must not
 * use: the button flips twice on every save (pending on, then dirty off) under the user's own
 * focus, and a natively-disabled button is blurred to `<body>` the instant it flips. So the
 * assertion is `aria-disabled`, and a test that reaches for `toBeDisabled` here is asserting the
 * regression.
 */
export function expectInert(button: HTMLElement): void {
  expect(button).toHaveAttribute('aria-disabled', 'true');
  // Still in the tab order — that is the whole point of not using the native attribute.
  expect(button).not.toBeDisabled();
}
