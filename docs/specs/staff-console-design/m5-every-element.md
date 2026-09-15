# M5 — every element, dispositioned

**Status:** Approved
**Taken:** 2026-09-15, `web@0.128.0` + `api@0.64.0`, Chromium, 1646 × 1000, §4.7 unhealthy recipe.
**Artefact:** `apps/web/.screenshots/1646/staff-unhealthy.png` (git-ignored; this file is the record).

The sweep is enumerated from a **re-shoot in the real frame**, per the milestone's own re-slice note —
M0's pictures are one-column and every density judgement made against them would have been made
against a frame M2 threw away.

## 1. What the re-shoot found that no reading had

Three defects, all invisible to jsdom, all found by looking rather than by a test going red.

| #   | defect                                                                                                                                                                                                                                                                                                                                                      | how it was established                                                                                                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **`StatGrid`'s container query could never match.** `@container` and `@md:grid-cols-4` on the same element. `container-type: inline-size` establishes a query container for an element's **descendants**, never for itself, so the variant queried an ancestor container that does not exist and `grid-cols-2` won at every width, in both `columns` modes. | Chromium: the Mail card's `<dl>` reported `container-type: inline-size`, `width: 1438px`, `grid-template-columns: 711px 711px`. After the fix, `468.7 / 468.7 / 468.7` at 1,438 and four columns at 682. |
| 2   | **One message in two frames.** `DataTable` wraps a non-blank `empty` node in `EMPTY_FRAME`; an `Alert` brings its own border, tint, icon and padding. Three sites nested them, with the frame's `text-center` fighting the alert's left-aligned icon row.                                                                                                   | Photograph. Every unit assertion passes identically against one box and two.                                                                                                                             |
| 3   | **Four tables spread 371–660 px of content across 1,438 px.** With `table-layout: auto` the surplus goes to whichever column holds the widest content, which put an address at x=104 and its date at **x=1,209** on the same row.                                                                                                                           | A `max-content` clone of each rendered table, measured in Chromium.                                                                                                                                      |

Measured natural widths, against a rendered 1,438 in every case:

| table                |     natural |
| -------------------- | ----------: |
| Recent mail failures |         660 |
| Retention by table   |         448 |
| Unverified accounts  |     **371** |
| Staff actions        |         532 |
| Sweep of 6 readings  | 1,582–2,524 |
| One reading          |   834–1,531 |

The performance tables genuinely want the width and scroll; the other four do not.

## 2. The remedy for (3) was measured, and the first one was withdrawn

`w-full` on the **trailing** column does take the surplus — and squeezes every other column to
`min-content` doing it. Measured: "Policy violation reports" wrapped onto three lines, "Keeps for"
onto two, a recipient address broke mid-word across four, and the page grew **11,066 → 13,172 px**.
Withdrawn on its own measurement rather than kept because the arithmetic was right.

What shipped is a width on the **leading** columns, which is a preference rather than a claim on the
remainder, so a column still grows past it when its content needs to. `md:`-prefixed: the widths
only mean anything where the surplus exists, and below that breakpoint the tables are byte-for-byte
what they were. Page **10,992 px**, columns clustered, and — this is the point — **no table is
narrower than it was**, so FC-4 is untouched rather than reinterpreted.

**FC-4 nearly got softened, and the record of that is the useful part.** The obvious fixes — a
narrower measure inside the card, or moving a short-table panel into a `narrow` grid item — both
make a table narrower than 798 px, which FC-4 forbids in as many words. Its _failure_ clause
("the redesign widened the page and narrowed the content") arguably does not fire for a table whose
content occupies 371 px either way, and reading a committed condition's intent clause in order to
get past it is exactly the move that makes conditions decoration. The third option costs nothing and
needed no reinterpretation, which is the only reason it is the one here.

A fourth finding fell out of it: `cellClassName: 'break-all'` **replaces** `DataTable`'s default
`py-2 pr-4` rather than merging with it, so three columns had no cell padding and no gap to their
neighbour. Pre-existing, invisible while the columns were far apart, fixed with the widths.

## 3. M5-T1 — the bodies were cut, and the lead-ins were re-judged rather than removed

The plan declined removing all five `<strong>` lead-ins and said to **cut the bodies first, then
re-judge**. Done, and the answer changed in one direction only:

- **Dual-hat alert — weight OUT, and its third sentence with it.** Two sentences inside a tinted
  block with a leading icon and a tone colour; the bold was a fourth channel. The dropped sentence
  restated "nothing you do here is done as a member" in the other direction.
- **Retention-disabled — "Nothing is being deleted." OUT.** M3's `Status` summary now says exactly
  that, in those words, one of the two conditions it names. The remedy and the caveat stay.
- **Mail, retention-failing, policy caveat, and the `<strong>not</strong>` — KEPT**, each with its
  reason. The discriminator is length, not taste: a bold opening earns its place when the block is
  long enough that a scanning reader would otherwise have to READ it to tell which condition it is,
  and a reader scrolled to one of those cards is most of a page from the summary.

**FC-3's first limb: 173 → 168, measured.** Four of the five came from M1–M4 adopting the archetypes
rather than from cutting anything — three in `routes/staff.tsx` (9 → 6) and one in
`features/staff/ui/panel.tsx` (1 → 0), where a hand-rolled title and hand-rolled tiles moved into
`SectionCard` and `StatGrid`; both are primitives, so the weights are still placed, just no longer by
a screen. The fifth is M5's cut. `SCREEN_WEIGHT_CEILING` is ratcheted to **168** and sits exactly on
it (verified: 167 fails, naming 168).

## 4. M5-T2 — five clipboard sites, not four

| site                          | absent-API guard | success          | failure     | revert |
| ----------------------------- | ---------------- | ---------------- | ----------- | ------ |
| `ShareLinksDialog:63`         | yes              | label + announce | announce    | 2 s    |
| `diagnostics-panel:66`        | no               | state            | state       | —      |
| `probe-sittings:510`          | no               | live span        | **silent**  | —      |
| `performance-probe-panel:469` | no               | state            | **silent**  | —      |
| `InviteMemberDialog:62`       | `?.`             | **nothing**      | **nothing** | —      |

The plan named four; the fifth is the worst of them. Three answered a rejection by setting `copied`
back to `false`, which is byte-identical to never having pressed the button (WCAG 4.1.3) — and
`diagnostics-panel.tsx`'s own comment records the M4 accessibility review finding that defect and
fixing it, in that file, while three siblings kept it.

The guard matters more than it reads: in an insecure context `navigator.clipboard` is `undefined`, so
`navigator.clipboard.writeText(…)` throws **synchronously** and the other four's `.then(onError)`
could not run in the one configuration it was written for.

**`/staff` had no `AnnouncerProvider`**, so `useAnnounce()` there is a no-op — three of the hook's
call sites would have announced into nothing, silently. Mounting one is part of the change.

## 5. Dispositions — the rest

**Changed:**

- Staff activity groups consecutive panel reads by one actor. Opening the console writes one
  `staff.panel_read` per panel, so fifty entries were seven page loads and almost nothing else.
  Nothing is hidden: the count is printed and every panel named, and a run ends at any other action
  so the log keeps its chronology.
- Each performance sitting gets a **visible** `<h3>`. `DataTable`'s caption is `sr-only`, so the
  sitting's name reached a screen-reader user and nobody else — five blocks ran together as one
  stream. Deliberately **not** the `<section>`'s accessible name: that would make it a `region`
  landmark wrapping a table that is already a region with the same name (caught by the existing
  suite going ambiguous, which is an assertion noticing rather than breaking).
- The comparability caveat renders once there is a second sitting. Its id is threaded, because an
  `aria-describedby` pointing at an absent element reads as a _missing_ description rather than an
  absent one — and the loading/error/empty branch had been referencing it in every state it has.
- The two failure counts carry a tone. Colour is the second channel; each label says what it counts
  and the summary states the condition in words. `Last failure` is deliberately untoned.

**Kept, with reason:**

- All four caveats — the two retention notes, the `audit_events` note and the mail-transport note. A
  sighted admin loses nothing if the paragraph stays; a screen-reader user landing inside the region
  it is wired to gets it read every time (§8.14).

  > **Corrected 2026-09-15 (M6 accessibility review): this said "all four `aria-describedby` caveat
  > targets", and only two of them were targets.** The retention notes were wired and the policy
  > caveat was wired by this milestone; the mail-transport note and the `audit_events` note carried
  > no `id` and were referenced by nothing — unchanged from the pre-epic code, so not a regression,
  > but the sentence describes a shipped state that did not exist. An asserted-rather-than-checked
  > claim **about accessibility**, which is the one subject this register has overstated before and
  > corrected (ADR-0082). Both are wired at M6, and `staff.test.tsx` now asserts the resolution
  > rather than the placement: every id a region names must be on the page, and the two the review
  > found are asserted by the text they carry.

- `<strong>not</strong>` at `staff.tsx`: emphasis inside a sentence whose meaning inverts without it.
- Every `Badge`, `<code>` span, `Show older`, and the retention `<details>`: correct as they are. This
  epic must not change a correct control to look busy.

## 6. WCAG 2.5.8 — the §8.13 checklist, by hand

Nothing automated covers this page: the ADR-0118 sweep is scoped to the plan workspace, and
`axe-core@4.13.0` ships `target-size` with `enabled: false`, so the journey's `wcag22aa` tag does not
turn it on.

1. `StaffStatusSummary`'s per-condition links — **the whole row** is the target, with the check's
   name as its accessible name. No caret, no icon-only hit area.
2. Every `useClipboardCopy` call site is a shared `Button`; none is a bespoke smaller element.
3. The Mail/Retention merge added **no** interactive element — the subsections are headings.
4. No pagination was compacted. `Show older` is unchanged.
5. The only new interactive elements are the summary's links and `InviteMemberDialog`'s converted
   Copy button, both on existing `--control-h` tokens (`globals.css`: 32/44 and 36/44 px, both above
   the 24 px AA floor).
6. No new keyboard shortcut surfaced, so ADR-0111 / §19.13 is not triggered.

## 7. Three gates, each verified red first

- `container-query.structural.test.ts` — `@container` beside its own variant. Red against the shipped
  `stat-grid.tsx`, naming the file and the expression.
- `data-table.empty.structural.test.ts` — a framed node in an `empty` prop. Red against
  `probe-sittings.tsx` as it shipped.
- `use-clipboard-copy.structural.test.ts` — `writeText` outside the hook. Red against
  `InviteMemberDialog.tsx` as it shipped.

All three read **balanced expressions** rather than lines: a `cn(` split over four lines hides the
pair from a per-line regex, and a gate that quietly reads less than it claims is worse than none
(ADR-0131's own finding about its own gate). Each carries a pinned positive case, because "no file
does X" passes perfectly over a scan that found no files.
