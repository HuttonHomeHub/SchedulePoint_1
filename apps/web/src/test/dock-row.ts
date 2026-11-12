import { expect } from 'vitest';

/**
 * What a dock strip that must be read whole looks like in the DOM (`docs/TECH_DEBT.md` #580): it
 * wraps instead of truncating, carries no hover-only `title` stop-gap, and says whether it asks the
 * outlet for its own row (`data-dock-row`). Shared so the strips' suites cannot drift apart.
 */
export function expectDockRow(
  strip: HTMLElement,
  sentence: HTMLElement,
  { ownRow = true }: { ownRow?: boolean } = {},
): void {
  if (ownRow) expect(strip).toHaveAttribute('data-dock-row');
  else expect(strip).not.toHaveAttribute('data-dock-row');
  expect(strip).toHaveClass('flex-wrap', 'min-w-0');
  expect(strip).not.toHaveAttribute('title');
  expect(sentence).not.toHaveClass('truncate');
}
