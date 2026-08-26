import {
  CHROME_SLOT_NAMES,
  ChromeSlot,
  ChromeSlotProvider,
  useChromeSlot,
  type ChromeSlotName,
} from './chrome-slot';

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
 * **Every slot, and the reason it is every one is a gap this host had already grown.** It offered
 * `rows` alone. M5 added `rail` and portalled the plan's four mode segments into it; M6 added
 * `drawer`; M7 added `status`; the one-row header adds `identity`. Each time, a portal with no
 * target in these tests renders nothing and the suite passes on a screen missing a piece — which is
 * how the mode cluster went two milestones with no coverage in the file whose own assertion says
 * "one command strip and the rail's mode cluster".
 *
 * A slot costs one `useChromeSlot()` here, so the standing rule is simply: **every name in
 * `ChromeSlotName` has a target in this host**.
 *
 * **That rule is now a test, and until 2026-08-26 this docblock said it already was one.** It read
 * "`chrome-slot.test.tsx` pins that, so adding a fifth name fails here rather than silently" — and
 * nothing in the repository referenced `ChromeSlotName` from a test at all. The claim was disproved
 * the first time it mattered: adding `identity` produced exactly the silent gap the paragraph
 * promises to prevent, and two suites then failed somewhere else entirely, on a screen missing a
 * piece. `TEST_CHROME_SLOTS` below is exported so the gate can compare it against the union, and the union
 * against what this component actually renders.
 *
 * Deliberately not `ChromeBand` itself: that would drag in `AppHeaderRow`, the session query and
 * the router, none of which these tests are about. What is reproduced is the portal targets, not
 * the band.
 */
/**
 * Every name this host mounts a target for — **the union's own list**, not a copy of it. A separate
 * hand-written array would only prove the names are valid, never that none is missing, and a
 * `readonly ChromeSlotName[]` annotation happily accepts a subset. So the roster is the single
 * `CHROME_SLOT_NAMES`, and the gate's remaining job is proving this component renders one target per
 * name — the half a type cannot check.
 */
export const TEST_CHROME_SLOTS: readonly ChromeSlotName[] = CHROME_SLOT_NAMES;

export function TestChromeHost({ children }: { children: React.ReactNode }): React.ReactElement {
  const rows = useChromeSlot();
  const identity = useChromeSlot();
  const drawer = useChromeSlot();
  const status = useChromeSlot();
  return (
    <>
      <ChromeSlot slotRef={rows.slotRef} />
      <ChromeSlot slotRef={identity.slotRef} name="identity" />
      <ChromeSlot slotRef={drawer.slotRef} name="drawer" />
      <ChromeSlot slotRef={status.slotRef} name="status" />
      <ChromeSlotProvider
        nodes={{
          rows: rows.node,
          identity: identity.node,
          drawer: drawer.node,
          status: status.node,
        }}
      >
        {children}
      </ChromeSlotProvider>
    </>
  );
}
