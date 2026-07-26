---
'@repo/web': minor
---

The designed chrome band and the canvas visual language are now on by default

`VITE_DESIGNED_CHROME` and `VITE_CANVAS_VISUAL_LANGUAGE` flip default-on (ADR-0055 S5-T4). The
shell becomes one full-bleed chrome band — header row and, on a plan, the toolbar rows as a single
surface — with the Project Explorer and the workspace below it, and the TSLD diagram sits on a
ground of its own with alternating month bands, so a planner can count months without reading a
label.

The flip surfaced one real defect that only exists once the toolbar actually moves: closing the
plan-notes dock looked its Comments button up **inside the workspace root**, which the portal had
just moved the toolbar out of, so focus was stranded instead of returning (WCAG 2.4.3). Fixed, and
the test that caught it now runs against the shipped default rather than the old one.

Both flags remain a byte-for-byte rollback — set either to `false`. The flag-off parity suites are
kept and pinned rather than weakened, and the flag-off Playwright suite now sets the flags
explicitly instead of relying on the default that just changed: it is the rollback side of the
contract, and its flag-on sibling covers what ships.
