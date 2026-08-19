import { ChromeSlot, ChromeSlotProvider, useChromeSlot } from './chrome-slot';
import { HelpActionProvider } from './help-action';

import { AppHeaderRow } from '@/components/layout/app-header';
import { Surface } from '@/components/ui/surface';

/**
 * The **chrome band** (ADR-0055 §3): the header row and, when a plan is open, its two toolbar
 * rows, rendered as one full-bleed surface across the top of the app.
 *
 * The band is deliberately **not plan-aware**. It owns a slot; a plan workspace decides whether to
 * portal anything into it. That keeps ADR-0029's contract intact — the shell mounts once, knows
 * nothing about plans, and does not remount when one opens.
 *
 * **Graphite M2 splits the band's two jobs apart.** It used to be one component that both
 * *provided* the slots and *wrapped* the rest of the app, which is fine in a flex column and
 * impossible in a grid: the band and the body have to be siblings in the same grid, not nested.
 * So {@link ChromeSlotHost} is now the provider (structure-free, wraps everything) and
 * {@link ChromeBandRow} is the row itself (placed by the shell into grid row 1). {@link ChromeBand}
 * survives as the flag-off composition of the two, so the ~35 suites that mount it are untouched.
 */
export function ChromeBand({ children }: { children: React.ReactNode }): React.ReactElement {
  const rows = useChromeSlot();
  const identity = useChromeSlot();

  return (
    <HelpActionProvider>
      <ChromeSlotProvider nodes={{ rows: rows.node, identity: identity.node }}>
        <ChromeBandRow rowsSlotRef={rows.slotRef} identitySlotRef={identity.slotRef} />
        {children}
      </ChromeSlotProvider>
    </HelpActionProvider>
  );
}

/**
 * The band's **row**, with no opinion about what sits beneath it — so a grid shell can place it in
 * row 1 and put the body in row 2 as a sibling.
 *
 * `sticky` is gone and is not missed: it existed because the document scrolled, and the shell is
 * now exactly the viewport with `<main>` as the scroller. `z-20` stays — it clears the canvas
 * ruler's `z-10` and the rail resizer, so a scrolled workspace never rides over the band. A `Sheet`
 * is a native `<dialog>` in the top layer, above every z-index, and still covers the band correctly.
 */
export function ChromeBandRow({
  rowsSlotRef,
  identitySlotRef,
  className,
}: {
  rowsSlotRef: (node: HTMLDivElement | null) => void;
  identitySlotRef: (node: HTMLDivElement | null) => void;
  className?: string;
}): React.ReactElement {
  return (
    <Surface tone="chrome" className={`border-border z-20 border-b ${className ?? ''}`}>
      {/* A plan's identity line portals into the header ROW (ADR-0097 D1b), not into a row of
          its own — the merge ADR-0092 M5 withdrew for want of the width D1a freed by moving the
          organisation nav to the rail. The slot is empty on every screen that is not a plan and
          the band's height is content-driven, so nothing is reserved for it. */}
      <AppHeaderRow identitySlot={<ChromeSlot slotRef={identitySlotRef} name="identity" />} />
      <ChromeSlot slotRef={rowsSlotRef} />
    </Surface>
  );
}

/**
 * The slot **provider** with no layout of its own — the half a grid shell needs, since it must
 * wrap the whole grid while the band's row sits inside it.
 */
export function ChromeSlotHost({
  children,
}: {
  children: (slots: {
    rowsSlotRef: (node: HTMLDivElement | null) => void;
    identitySlotRef: (node: HTMLDivElement | null) => void;
  }) => React.ReactNode;
}): React.ReactElement {
  const rows = useChromeSlot();
  const identity = useChromeSlot();
  return (
    <HelpActionProvider>
      <ChromeSlotProvider nodes={{ rows: rows.node, identity: identity.node }}>
        {children({ rowsSlotRef: rows.slotRef, identitySlotRef: identity.slotRef })}
      </ChromeSlotProvider>
    </HelpActionProvider>
  );
}
