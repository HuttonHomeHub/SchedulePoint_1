import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **Who may paint `bg-card` / `bg-popover` by hand** (ADR-0097 §1.5c).
 *
 * The reset is MEANT to make `Card` and `Popover` restore the page family for their subtree, which
 * is what would keep ADR-0055's promise that "a Card means the same thing everywhere" true inside a
 * rebinding world. **It is not built** (`docs/TECH_DEBT.md` #279, measured 2026-09-10): there is no
 * `[data-surface='card']` or `[data-surface='popover']` rule in `globals.css`, `RESET_TONES` has
 * zero production callers, and what `<Surface tone="card">` actually renders is
 * `bg-background text-foreground` — which inside `chrome` resolves to the **chrome** fill and ink,
 * the opposite of restoring the page family. Read every sentence below about what a reset does as
 * describing the intended mechanism, not today's behaviour, and see the instruction note before
 * `ALLOWED` for what to do in the meantime.
 *
 * The plan framed the fix as "Card and Popover become resets" — and the component review
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
 * inside a `<Surface>`?
 *
 * **Until #279 lands, "yes" has no remedy available, and reaching for the one this file used to
 * name makes things worse.** `<Surface tone="card">` inside a scope paints that scope's fill and
 * ink, so swapping a raw `bg-card` for it turns a pair that is merely ungated into one that is
 * actively wrong — with this gate going green over the change. So: add the site to `ALLOWED` with
 * the containment reason that makes it safe today (it is portalled, it is top-layer, or nothing
 * renders it inside a `<Surface>`), and if none of those is true, say so in the entry and raise it
 * on #279 rather than reaching for the reset.
 */
const ALLOWED = new Set([
  // The primitives themselves — the definition, not a consumer.
  'components/ui/card.tsx',
  // Portalled or top-layer: outside every scope by construction (diagnosis.md §4.3).
  'components/ui/dialog.tsx',
  'components/ui/menu.tsx',
  'components/ui/toolbar/use-popover-panel.tsx',
  // The tooltip portals through the SAME `portalTarget()` as the two above (fix-slice M-C's one
  // overlay leaf), so it is outside every scope for exactly their reason.
  'components/ui/tooltip.tsx',
  // **These three were in the group above and do not belong there** (`docs/TECH_DEBT.md` #279,
  // 2026-09-10). None of them calls `createPortal`, uses `portalTarget()`, or reaches a portal
  // through `usePopoverPanel` or `useTooltip` — checked, all three, by grep. They render in place.
  //
  // `CreateActivityPopover` is the one that proves the point: it renders at `TsldPanel.tsx:2946`,
  // **inside** the `<Surface tone="canvas">` opened at `:2864`, painting `bg-card` (`:73`) with
  // `text-muted-foreground` (`:109`). That is a reset fill inside a scope — the exact thing this
  // gate exists to enumerate — and it is correct today only because the canvas scope happens to
  // measure 6.00:1 for that pair. Unasserted, because `--card` is in no matrix pair at all.
  //
  // They stay allowed because none of them is a live contrast failure, and a gate turned red over
  // a passing combination gets deleted rather than fixed (ADR-0058). What changes is the REASON:
  // "outside every scope by construction" is a structural claim that was not true of them, and a
  // wrong reason in an allow-list is how the next entry gets added for the same wrong reason.
  'components/ui/combobox.tsx',
  'features/tsld/components/TsldLegendPanel.tsx',
  'features/tsld/components/CreateActivityPopover.tsx',
  // Rendered inside a dialog, which is top-layer.
  'features/interchange/components/InterchangeReportTable.tsx',
  // A page in its own right, outside every scope.
  'features/share/components/GuestPlanView.tsx',
  // **The two that are NOT portalled**, and therefore the ones that matter. They are correct
  // today because nothing yet renders them inside a `<Surface>` — `tabs.tsx` is the activity
  // editor's vertical tabs and the resource strip sits beside the chrome band rather than in
  // it. ADR-0097 D17.2 moves that editor into a docked panel, which is exactly the move that could
  // put one of them inside a scope; when it does, they need the reset #279 describes — which does
  // not exist yet, so that move is blocked on #279 rather than on an edit here.
  // `plan-workspace-toolbar.tsx` left this list at the workspace visual polish pass (2026-08-28):
  // its three `bg-card` dock wrappers became `<Surface tone="panel">` — item 7's whole subject —
  // which is this gate's staleness assertion doing its job.
  'components/ui/tabs.tsx',
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
        // **Comments are stripped, and this list was re-derived after adding it** (it did not
        // change: no ALLOWED entry was on the list only because of prose). The raw-text version
        // counted a docblock EXPLAINING a fill choice as making one — so writing down *why* a
        // component must not use `bg-card` pushed this gate towards failing, which is a gate that
        // penalises its own documentation and eventually gets worked around. Found the day it
        // happened: #148's cursor-marker docblock records that treatment shipping as `bg-card` and
        // why it was changed, and that sentence turned this suite red.
        //
        // Fourth occurrence of a scan matching prose here. `token-architecture.test.ts:452-457`
        // records the other three and fixed itself the same way; this file is the one that had not
        // been told.
        const text = readFileSync(full, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '');
        if (/\bbg-(card|popover)\b/.test(text)) {
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
        'Decide which kind it is. If it is portalled or top-layer it is outside every scope ' +
        'already — add it to ALLOWED with that reason. If it CAN render inside a <Surface>, do ' +
        'NOT reach for <Surface tone="card">: the reset is not built (docs/TECH_DEBT.md #279), ' +
        "so it would paint the enclosing scope's fill and ink and make the pair actively wrong " +
        'rather than merely ungated. Add it with what makes it safe today, and raise it on #279.',
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
