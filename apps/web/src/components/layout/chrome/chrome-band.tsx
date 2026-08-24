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

  return (
    <HelpActionProvider>
      <ChromeSlotProvider nodes={{ rows: rows.node }}>
        <ChromeBandRow rowsSlotRef={rows.slotRef} />
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
 *
 * **It is a CARD, not a bar** (workspace redesign, 2026-08-24), and that is the change rather than
 * a decoration. Four restyles re-valued colours and none of them fixed the complaint, because the
 * complaint was never about colour: `--chrome` has held the old Flask app's navy since ADR-0102 and
 * this component was the ONLY thing in the shell asking for it — as a flat `border-b` bar with the
 * page's white running edge-to-edge above and below it. Figure and ground had a 1px border between
 * them and nothing else.
 *
 * So: a radius, a real shadow, and a 3px `--primary` rule along the base. The amber rule is the old
 * app's own device (`border-bottom: 3px solid var(--secondary-color)` on both its header and its
 * toolbar) and it is doing work rather than ornament — it is the only thing that separates a navy
 * card from a navy card stacked beneath it.
 *
 * The margin that lets the gradient show around it belongs to the SHELL, not here: this component
 * has no opinion about what sits beneath it, and giving it one would make it unplaceable anywhere
 * else. The shell passes it in `className`.
 */
export function ChromeBandRow({
  rowsSlotRef,
  className,
}: {
  rowsSlotRef: (node: HTMLDivElement | null) => void;
  className?: string;
}): React.ReactElement {
  return (
    <Surface
      tone="chrome"
      className={`border-border border-b-primary z-20 rounded-lg border border-b-[3px] shadow-md ${className ?? ''}`}
    >
      {/* **Below `lg` only** (Graphite M3). At `lg`+ the Project Explorer rail is the leading
          column top to bottom and carries the brand, the switcher and the account itself, so the
          top bar is deleted and the band starts with the plan's own rows. Below `lg` the rail is
          an off-canvas `Sheet` with nothing pinned to open it, so the bar survives there to carry
          the trigger. */}
      <div className="lg:hidden">
        <AppHeaderRow />
      </div>
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
    railSlotRef: (node: HTMLDivElement | null) => void;
    drawerSlotRef: (node: HTMLDivElement | null) => void;
    statusSlotRef: (node: HTMLDivElement | null) => void;
  }) => React.ReactNode;
}): React.ReactElement {
  const rows = useChromeSlot();
  const rail = useChromeSlot();
  // The trailing drawer's body (Graphite M6-T2). Mounted only while the drawer shows the registered
  // `'context'` subject, so a route's portal renders `null` the rest of the time rather than
  // painting into a hidden node — `ChromePortal`'s existing "no slot, no children" contract.
  const drawer = useChromeSlot();
  const status = useChromeSlot();
  return (
    <HelpActionProvider>
      <ChromeSlotProvider
        nodes={{ rows: rows.node, rail: rail.node, drawer: drawer.node, status: status.node }}
      >
        {children({
          rowsSlotRef: rows.slotRef,
          railSlotRef: rail.slotRef,
          drawerSlotRef: drawer.slotRef,
          statusSlotRef: status.slotRef,
        })}
      </ChromeSlotProvider>
    </HelpActionProvider>
  );
}
