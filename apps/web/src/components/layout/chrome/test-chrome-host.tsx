import { ChromeSlot, ChromeSlotProvider, useChromeSlot } from './chrome-slot';

/**
 * Test-only stand-in for the production chrome band: a slot for a plan toolbar to portal into,
 * and nothing else.
 *
 * Needed because `ChromePortal` renders **`null`** when the flag is on and no slot is mounted,
 * rather than falling back to rendering in place (ADR-0055 §3). That is deliberate — an in-place
 * fallback would paint the toolbar twice on the way in, and would hide a real mounting bug in
 * production instead of failing. The cost is that a screen mounted OUTSIDE the shell, as these
 * unit tests do, has nowhere for its toolbar to land, so the test supplies the host the shell
 * normally is.
 *
 * Deliberately not `ChromeBand` itself: that would drag in `AppHeaderRow`, the session query and
 * the router, none of which these tests are about. What is reproduced is the portal target, not
 * the band.
 */
export function TestChromeHost({ children }: { children: React.ReactNode }): React.ReactElement {
  const { slotRef, node } = useChromeSlot();
  return (
    <>
      <ChromeSlot slotRef={slotRef} />
      <ChromeSlotProvider node={node}>{children}</ChromeSlotProvider>
    </>
  );
}
