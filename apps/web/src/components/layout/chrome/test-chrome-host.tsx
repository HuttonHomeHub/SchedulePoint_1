import { ChromeSlot, ChromeSlotProvider, useChromeSlot } from './chrome-slot';

/**
 * Test-only stand-in for the production chrome band: the slot a plan toolbar portals into, and
 * nothing else.
 *
 * Needed because `ChromePortal` renders **`null`** when no slot is mounted, rather than falling
 * back to rendering in place (ADR-0055 §3). That is deliberate — an in-place fallback would paint
 * the toolbar twice on the way in, and would hide a real mounting bug in production instead of
 * failing. The cost is that a screen mounted OUTSIDE the shell, as these unit tests do, has
 * nowhere for its toolbar to land, so the test supplies the host the shell normally is.
 *
 * **One slot again.** ADR-0097 Landing D1b added a second, `identity`, because the plan's identity
 * line portalled into the app header row; a host offering only `rows` rendered that portal as
 * `null`, which took the edit pencil and the mode switches with it and failed tests on the harness
 * rather than on the product. Graphite M3 deleted the header and merged the identity line into the
 * mode row, which is rendered by the same component — so there is no shell boundary left to cross
 * and no second slot to reproduce.
 *
 * Deliberately not `ChromeBand` itself: that would drag in `AppHeaderRow`, the session query and
 * the router, none of which these tests are about. What is reproduced is the portal target, not
 * the band.
 */
export function TestChromeHost({ children }: { children: React.ReactNode }): React.ReactElement {
  const rows = useChromeSlot();
  return (
    <>
      <ChromeSlot slotRef={rows.slotRef} />
      <ChromeSlotProvider nodes={{ rows: rows.node }}>{children}</ChromeSlotProvider>
    </>
  );
}
