/**
 * A menu item's label as its accessible name reads it. A shaded item prints its reason inside the
 * button as `aria-hidden` text (ADR-0204), which `textContent` would include and the name does not,
 * so a test comparing item labels strips hidden descendants first.
 */
export function menuItemLabel(item: HTMLElement): string {
  const copy = item.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('[aria-hidden="true"]').forEach((node) => node.remove());
  return copy.textContent ?? '';
}
