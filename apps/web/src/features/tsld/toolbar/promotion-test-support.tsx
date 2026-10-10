import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Deck } from '@/components/ui/toolbar/Deck';

/**
 * What the two promotion suites share (toolbar-redesign M5): render the real `Deck` over the real
 * registry for a context, open each of the six source menus, and read what is on the bar and what
 * each menu offers. A test-support module, not a test, so neither suite owns the other's helpers.
 */

/** The source menus, by the registry id of the trigger that opens each and the name that opens it. */
export const MENUS: ReadonlyArray<{
  from: string;
  open: (ctx: TsldToolbarContext) => HTMLElement;
}> = [
  { from: 'filter', open: () => screen.getByRole('button', { name: 'Filter' }) },
  { from: 'view', open: () => screen.getByRole('button', { name: /^View/ }) },
  { from: 'analysis', open: () => screen.getByRole('button', { name: 'Analysis' }) },
  { from: 'export', open: () => screen.getByRole('button', { name: /^(Share & export|Export)$/ }) },
  {
    from: 'add-activity',
    open: () => screen.getByRole('button', { name: /^Activity type/ }),
  },
  { from: 'link-tool', open: () => screen.getByRole('button', { name: /^Link type/ }) },
];

function nameOf(el: Element): string {
  const labelled = el instanceof HTMLInputElement ? (el.labels?.[0]?.textContent ?? null) : null;
  return (el.getAttribute('aria-label') ?? labelled ?? el.textContent ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The rows of whatever panel is open: menu rows, and the checkboxes and radios of a popover. */
function openPanelRows(): string[] {
  const panel = screen.queryByRole('menu') ?? screen.queryByRole('dialog');
  if (!panel) return [];
  return [
    ...panel.querySelectorAll(
      '[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"],input[type="checkbox"],input[type="radio"]',
    ),
  ]
    .map(nameOf)
    .filter((name) => name !== '')
    .sort();
}

export interface Reading {
  /** `data-toolbar-item` ids on the deck, in document order. */
  bar: string[];
  /** Accessible names of the deck's focusable controls. */
  names: string[];
  /** Each source menu's rows. */
  menus: Record<string, string[]>;
}

export function readDeck(ctx: TsldToolbarContext): Reading {
  const { unmount } = render(
    <Deck items={buildTsldToolbarItems()} context={ctx} label="Plan commands" />,
  );
  const bar = [...document.querySelectorAll('[data-toolbar-item]')].map(
    (el) => el.getAttribute('data-toolbar-item') ?? '',
  );
  const names = [...document.querySelectorAll('[data-toolbar-focusable]')].map(nameOf);
  const menus: Record<string, string[]> = {};
  for (const { from, open } of MENUS) {
    const trigger = open(ctx);
    fireEvent.click(trigger);
    menus[from] = openPanelRows();
    fireEvent.click(trigger);
    // A popover leaves with a second press; a menu needs Escape. Either way the next one starts shut.
    fireEvent.keyDown(document, { key: 'Escape' });
  }
  unmount();
  cleanup();
  return { bar, names, menus };
}
