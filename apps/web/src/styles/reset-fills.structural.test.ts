import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **Who may paint `bg-card` / `bg-popover` by hand** (ADR-0097 §1.5c).
 *
 * The reset makes `Card` and `Popover` restore the page family for their subtree, which is what
 * keeps ADR-0055's promise that "a Card means the same thing everywhere" true inside a rebinding
 * world. But the plan framed the fix as "Card and Popover become resets" — and the component review
 * found that those two fills are **hand-applied at twelve sites that do not go through either
 * primitive**, several of which are not portaled and so really can land inside a scope.
 *
 * A remedy that covers the two components and not the twelve call sites is the same "one correct
 * pattern applied to a control and not its neighbour" shape this epic has now recorded five times.
 *
 * So the sites are enumerated. **This is not a ban** — most of them are correct: a portalled menu
 * or a `<dialog>` in the browser's top layer leaves every scope by construction, so it paints the
 * page's `--card` and is right to. What the list prevents is a THIRTEENTH appearing without anyone
 * deciding which kind it is.
 *
 * Adding a site means answering one question in the docblock here: does this element ever render
 * inside a `<Surface>`? If it can, it needs `<Surface tone="card">` rather than a raw fill.
 */
const ALLOWED = new Set([
  // The primitives themselves — the definition, not a consumer.
  'components/ui/card.tsx',
  // Portalled or top-layer: outside every scope by construction (diagnosis.md §4.3).
  'components/ui/combobox.tsx',
  'components/ui/dialog.tsx',
  'components/ui/menu.tsx',
  'components/ui/toolbar/use-popover-panel.tsx',
  'features/tsld/components/TsldLegendPanel.tsx',
  'features/tsld/components/CreateActivityPopover.tsx',
  // Rendered inside a dialog, which is top-layer.
  'features/interchange/components/InterchangeReportTable.tsx',
  // A page in its own right, outside every scope.
  'features/share/components/GuestPlanView.tsx',
  // **The three that are NOT portalled**, and therefore the ones that matter. They are correct
  // today because nothing yet renders them inside a `<Surface>` — `tabs.tsx` is the activity
  // editor's vertical tabs and the two workspace panels sit beside the chrome band rather than in
  // it. ADR-0097 D17.2 moves that editor into a docked panel, which is exactly the move that could
  // put one of them inside a scope; when it does, these become `<Surface tone="card">`.
  'components/ui/tabs.tsx',
  'components/layout/workspace/plan-workspace-toolbar.tsx',
  'components/layout/workspace/resource-strip-panel.tsx',
]);

function sitesUsingRawResetFills(): string[] {
  const root = join(process.cwd(), 'src');
  const found = new Set<string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        if (/\bbg-(card|popover)\b/.test(readFileSync(full, 'utf8'))) {
          found.add(full.slice(root.length + 1));
        }
      }
    }
  };
  walk(root);
  return [...found].sort();
}

describe('raw reset fills', () => {
  it('appear only where somebody decided they should', () => {
    const unexpected = sitesUsingRawResetFills().filter((site) => !ALLOWED.has(site));
    expect(
      unexpected,
      `new hand-applied bg-card / bg-popover:\n${unexpected.join('\n')}\n\n` +
        'Decide which kind it is. If it can render inside a <Surface>, use <Surface tone="card"> ' +
        'so the page family is restored for its subtree; if it is portalled or top-layer it is ' +
        'outside every scope already — add it to ALLOWED with that reason.',
    ).toEqual([]);
  });

  it('has no stale entries, so the list stays a decision rather than a relic', () => {
    // The other direction, and the one an allow-list usually lacks: an entry for a file that no
    // longer paints these fills is a decision nobody is making any more, and it hides the next
    // one. A list that only ever grows stops being read.
    const actual = new Set(sitesUsingRawResetFills());
    const stale = [...ALLOWED].filter((site) => !actual.has(site));
    expect(stale, `no longer paints bg-card / bg-popover: ${stale.join(', ')}`).toEqual([]);
  });
});
