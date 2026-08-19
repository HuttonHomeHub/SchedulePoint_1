import { ChromeSlot, ChromeSlotProvider, useChromeSlot } from './chrome-slot';

/**
 * Test-only stand-in for the production chrome band: the two slots a plan toolbar portals into,
 * and nothing else.
 *
 * Needed because `ChromePortal` renders **`null`** when the flag is on and no slot is mounted,
 * rather than falling back to rendering in place (ADR-0055 §3). That is deliberate — an in-place
 * fallback would paint the toolbar twice on the way in, and would hide a real mounting bug in
 * production instead of failing. The cost is that a screen mounted OUTSIDE the shell, as these
 * unit tests do, has nowhere for its toolbar to land, so the test supplies the host the shell
 * normally is.
 *
 * **Both slots, not just `rows`** (ADR-0097 Landing D1b): the plan's identity line portals into
 * `identity`, which lives inside the header row. A host offering only `rows` renders the identity
 * portal as `null`, which is not a missing decoration — it takes the edit-pencil and the mode
 * switches with it, so a test for those would fail on the harness rather than on the product.
 * That is exactly what happened when this file still provided one slot.
 *
 * Deliberately not `ChromeBand` itself: that would drag in `AppHeaderRow`, the session query and
 * the router, none of which these tests are about. What is reproduced is the portal targets, not
 * the band.
 */
export function TestChromeHost({ children }: { children: React.ReactNode }): React.ReactElement {
  const rows = useChromeSlot();
  const identity = useChromeSlot();
  return (
    <>
      <ChromeSlot slotRef={identity.slotRef} name="identity" />
      <ChromeSlot slotRef={rows.slotRef} />
      <ChromeSlotProvider nodes={{ rows: rows.node, identity: identity.node }}>
        {children}
      </ChromeSlotProvider>
    </>
  );
}
