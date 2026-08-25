import { ChromeSlot, ChromeSlotProvider, useChromeSlot } from './chrome-slot';

/**
 * Test-only stand-in for the production shell's portal targets — every slot a plan portals into,
 * and nothing else.
 *
 * Needed because `ChromePortal` renders **`null`** when no slot is mounted, rather than falling
 * back to rendering in place (ADR-0055 §3). That is deliberate — an in-place fallback would paint
 * the toolbar twice on the way in, and would hide a real mounting bug in production instead of
 * failing. The cost is that a screen mounted OUTSIDE the shell, as these unit tests do, has
 * nowhere for its chrome to land, so the test supplies the host the shell normally is.
 *
 * **All four slots, since Graphite M7 — and the reason it is all of them is a gap this host had
 * already grown.** It offered `rows` alone. M5 added `rail` and portalled the plan's four mode
 * segments into it; M6 added `drawer`; M7 adds `status`. Each time, a portal with no target in
 * these tests renders nothing and the suite passes on a screen missing a piece — which is how the
 * mode cluster went two milestones with no coverage in the file whose own assertion says
 * "one command strip and the rail's mode cluster".
 *
 * A slot costs one `useChromeSlot()` here, so the standing rule is simply: **every name in
 * `ChromeSlotName` has a target in this host**. `chrome-slot.test.tsx` pins that, so adding a
 * fifth name fails here rather than silently in whichever suite renders it.
 *
 * Deliberately not `ChromeBand` itself: that would drag in `AppHeaderRow`, the session query and
 * the router, none of which these tests are about. What is reproduced is the portal targets, not
 * the band.
 */
export function TestChromeHost({ children }: { children: React.ReactNode }): React.ReactElement {
  const rows = useChromeSlot();
  const drawer = useChromeSlot();
  const status = useChromeSlot();
  return (
    <>
      <ChromeSlot slotRef={rows.slotRef} />
      <ChromeSlot slotRef={drawer.slotRef} name="drawer" />
      <ChromeSlot slotRef={status.slotRef} name="status" />
      <ChromeSlotProvider nodes={{ rows: rows.node, drawer: drawer.node, status: status.node }}>
        {children}
      </ChromeSlotProvider>
    </>
  );
}
