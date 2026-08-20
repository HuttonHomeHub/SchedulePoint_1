# Graphite M2 — the shell grid, and the flag that had to go with it

**Date:** 2026-08-19 · **ADR:** [ADR-0099](../../adr/0099-graphite-the-workstation-in-rail-chrome.md)

## What M2 is for

`plan.md` §A2 records the decision this milestone implements: **§4a is solved by geometry, not by
measurement.** The product owner's requirement is that the command strip's width does not change
when the context drawer opens. The way to guarantee that is not a ResizeObserver and not a
measurement pass — it is to make the strip span the columns the drawer sits _inside_, so opening
one redistributes width between the stage and the drawer and changes the strip by **zero**.

That needs the band row and the body to be **siblings in one grid**, and they were not: `ChromeBand`
both _provided_ the slots and _wrapped_ everything beneath it. So the band is split in two —
`ChromeSlotHost` (the provider, no layout) and `ChromeBandRow` (the row, placed by the shell) —
and `ChromeBand` survives as their composition, which is what keeps the ~35 suites that mount it
untouched.

The shell is now one grid: `grid-cols-[auto_minmax(0,1fr)_auto]` ×
`grid-rows-[auto_minmax(0,1fr)_auto]`. Column 3 and row 3 are empty and `auto`, so they are zero
wide / zero tall until M4 and M7 fill them. Nothing else moved.

## The exit condition, and how it was actually checked

The plan says M2 ends in **pixel-identical screenshots**: if the grid changed anything, it is wrong,
and it is cheap to learn here rather than after four more milestones have been built on it.

A `sha256sum` comparison reported **every authenticated screen differing** and both signed-out ones
identical, which reads like a layout regression and is not one: `shoot.mjs` mints a fresh tenant per
run and paints its name into the organisation switcher. A gate that says "everything changed" for a
milestone whose whole condition is "nothing changed" is a gate that gets ignored.

So `scripts/shot-diff.mjs` was written to report **where** the pixels differ rather than whether
they do — a differing-pixel count and the bounding box containing them. Against the same build with
only the two component files reverted, at 1646 / 1920 / 1280:

| Screen                                                  | Differing px | Bounding box                                     |
| ------------------------------------------------------- | ------------ | ------------------------------------------------ |
| `sign-in`, `sign-up`                                    | **0**        | —                                                |
| `clients`, `calendars`, `resources`, `recently-deleted` | 220          | x850–875 **y23–32**                              |
| `plan-workspace`, `plan-workspace-readonly`             | 217          | x625–650 **y23–32**                              |
| `members`                                               | 645          | y23–208 (the tenant name again, in a member row) |
| `org-home`, `org-home-empty`                            | 2054         | y23–104 (the tenant name in the heading)         |

Every difference is inside the header's text baseline or a place the tenant name is printed. **No
edge moved, nothing shifted vertically, and the two screens with no app shell are byte-identical.**
The grid is a no-op, which is what it was supposed to be.

`shoot.mjs` also had a defect of its own, found by running it: the tenant identity was
`shoot-${stamp}` with no width in it, so the first width onboarded and every later one tried to sign
up an address that already existed and threw after 30 s — **after writing a full, correct-looking
set of pictures for 1646**. The harness could only ever complete one of its three widths, and said
so in a way that looked like a Playwright timeout. Fixed to `shoot-${stamp}-${width}`.

## `VITE_DESIGNED_CHROME` retired, and why that was not optional

`flag-retirement.json` classified this flag **Class B — keep**, with the reason "guard-only: the
flag GATES a capability rather than SELECTING between two implementations of one". That was true
until this milestone and stopped being true **in the same change**: the grid shell cannot render
`ChromeBand`'s flag-off composition (`<AppHeader/>`, then everything) without a second JSX root,
which is ADR-0088's Class A discriminator exactly. D3 says Class A retires on epic-touch.

Leaving it would have been worse than either option. The shell renders `ChromeBandRow`
unconditionally, so the flag no longer reached the shell at all — while `ChromePortal` still
branched on it. Flag-off was therefore a state **nobody had described and no suite covered**: a band
that renders with the toolbar in place beneath it rather than portalled into it.

Its two harness pins were **converted before the flag went**, which is the ADR-0084 batch-1 lesson
applied in advance rather than re-learnt:

- `playwright.designed-ui.config.ts` pinned it **false**. Its own docblock already admitted what
  that pin had shrunk to — "the flag still selects a SHELL, and this suite proves that shell is
  accessible" — i.e. proving the accessibility of a shell no published bundle can produce, which is
  ADR-0088's finding verbatim. The pin is dropped and **the suite is kept**: what it actually proves
  is the ADR-0097 claim that a reader still carrying `dark`, `system` or `corporate` in storage gets
  the same painted theme as everybody else, and that now runs against the shipped shell. Strictly
  more coverage, not less.
- `playwright.designed-chrome.config.ts` pinned it **true**, which was already a no-op against a
  default-on flag. Dropped.

`AppHeader` went with it as dead code — it existed only as the flag-off header — and the three
suites that rendered it now render `AppHeaderRow`, which is the header. `app-header.test.tsx` loses
its "both variants render the identical `HeaderContents`" case, because there is one variant.

Two pre-existing citations were repaired while there: `chrome-slot.test.tsx`'s docblock named a
`chrome-slot.flag-off.test.tsx` sibling **that has never existed in this repository**, and
`shell-context.ts` described the flag-off header as "today's".

## The stale-server trap, now a gate

Three false diagnoses in one session came from one cause. Every `playwright.*.config.ts` here sets
`reuseExistingServer: !process.env.CI`, and the entire point of those configs is the environment
they hand their servers. A dev server left running from a _different_ harness is silently adopted,
and the flag pins in the config never apply.

It cost: 7 base-journey failures attributed first to the Graphite palette, then to this grid
refactor, then very nearly filed as a product defect — each conclusion argued from evidence, none
of them the cause, which was an API server left over from a flag-on harness carrying
`PLAN_EDIT_LOCK_ENFORCED=true`. It is unusually well hidden because `nest start --watch` puts the
environment on the **child** process: the watcher's `/proc/<pid>/environ` is empty, so checking it
looks like clearing it. Later the same session a leftover **web** server reproduced the identical
seven failures from the opposite side.

ADR-0058's rule is that vigilance which has already failed gets replaced by a computed gate, so
`scripts/e2e-local.sh` now probes 3000 and 5173 and **refuses to run** while either answers, naming
the fix. Verified red. `E2E_ALLOW_EXISTING_SERVER=1` overrides it and is only ever right when you
started that server with the suite's exact environment.

## Gates run

`pnpm lint` · `pnpm typecheck` · `pnpm test` (4,819 web + 1,694 API) · `pnpm check:flags` ·
`pnpm check:doc-links` · `scripts/e2e-local.sh web web:designed-chrome web:designed-ui`
(17 + 4 + 9 passed).

The palette also completed here rather than in M1, and that is a milestone failure worth recording:
M1 left `--card`, `--card-foreground`, `--popover`, `--popover-foreground`, `--ground` and
`--ground-end` at their light values, so every dialog, menu and popover in the product painted
`#a1acb9` on `#ffffff` — **58 axe colour-contrast violations at 2.3:1**. `token-contrast.test.ts`
was green throughout, because those five are surface **base** tokens and the matrix pairs ink
against ground. It was found by the base journey, which M1 did not run. Change a screen, run the
base journey — the rule was already written down.
