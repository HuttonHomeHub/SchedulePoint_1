import { ChromeSlot, ChromeSlotProvider, useChromeSlot } from './chrome-slot';
import { HelpActionProvider } from './help-action';

import { AppHeader, AppHeaderRow } from '@/components/layout/app-header';
import { Surface } from '@/components/ui/surface';
import { DESIGNED_CHROME_ENABLED } from '@/config/env';

/**
 * The **chrome band** (ADR-0055 §3): the header row and, when a plan is open, its two toolbar
 * rows, rendered as one full-bleed surface across the top of the app.
 *
 * The band is deliberately **not plan-aware**. It owns a slot; a plan workspace decides whether to
 * portal anything into it. That keeps ADR-0029's contract intact — the shell mounts once, knows
 * nothing about plans, and does not remount when one opens.
 *
 * Height is content-driven rather than fixed, so a screen with no plan is one row and a plan is
 * three. A fixed height would either waste a strip on every non-plan screen or clip the toolbar.
 */
export function ChromeBand({ children }: { children: React.ReactNode }): React.ReactElement {
  const { slotRef, node } = useChromeSlot();

  if (!DESIGNED_CHROME_ENABLED) {
    // Flag off: today's shell exactly — a header, then everything else. `ChromePortal` is an
    // identity wrapper in this state, so the toolbar renders in place inside the workspace.
    return (
      <HelpActionProvider>
        <AppHeader />
        {children}
      </HelpActionProvider>
    );
  }

  return (
    <HelpActionProvider>
      <ChromeSlotProvider node={node}>
        {/* `z-20` clears the canvas ruler's `z-10` (TsldCanvas) and the resizer, so a scrolled
          workspace never rides over the band. The `Sheet` drawer is a native `<dialog>` in the
          top layer, which is above every z-index — the drawer still covers the band, correctly. */}
        <Surface tone="chrome" className="border-border sticky top-0 z-20 border-b">
          <AppHeaderRow />
          <ChromeSlot slotRef={slotRef} />
        </Surface>
        {children}
      </ChromeSlotProvider>
    </HelpActionProvider>
  );
}
