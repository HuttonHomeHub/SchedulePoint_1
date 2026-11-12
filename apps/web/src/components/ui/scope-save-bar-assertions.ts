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

/**
 * Assert a refusal is shown **in the Save's own bar and describes it** (ADR-0217 D2), and that showing
 * it did not take focus. The three things a reader on Save relies on: the sentence is beside the
 * button, a screen reader finds it on the button, and the cursor stayed where the reader left it.
 * A refusal printed at the top of its scope satisfies the second (by an `aria-describedby` a caller
 * remembered to add) and fails the first, which is the defect this bar exists to end.
 */
export function expectRefusalBesideSave(alert: HTMLElement, save: HTMLElement): void {
  expect(alert).toHaveAttribute('role', 'alert');
  expect(alert.closest('form')).toBe(save.closest('form'));
  // The bar is the Save's own container: the refusal is among its descendants, not merely nearby.
  expect(save.parentElement?.parentElement).toContainElement(alert);
  expect(save.getAttribute('aria-describedby')?.split(' ')).toContain(alert.id);
  expect(alert).not.toHaveFocus();
}
