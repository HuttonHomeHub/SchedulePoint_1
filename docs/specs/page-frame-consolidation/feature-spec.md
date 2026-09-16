# The page frame is written once

- **Status:** Approved — built 2026-09-16; product owner approved the direction ("yes do the conversion and the gate").
- **Scope:** `apps/web/src/routes/` (13 sites, 9 files) + one structural gate. No API, no schema, no engine.

## 1. Why this exists

`PageContainer` (ADR-0097 Landing A) was written because the page frame
`mx-auto w-full max-w-6xl flex-1 p-6` had been hand-written **fourteen times** — its own docblock
says so. The archetype then shipped, and **nine route files went on hand-writing it anyway**,
thirteen sites between them. Only `members`, `overview` and `staff` adopted it.

The cost is not the repeated class string. It is that the measure, the padding and the `flex-1`
growth contract cannot be changed **once** — which is the entire reason the archetype exists. The
landing page's density work (`docs/specs/organisation-landing-portfolio/`) needed exactly that kind
of single change, and it could only make it on the one screen that used the archetype.

This was found by looking, not by a gate: the product owner, reviewing three screenshots of the
landing page, asked whether "the learnings and new approach should be used across the rest of the
pages … Clients, Calendars, Resources, Members, Audit Log, recently deleted … which all appear to
be drifting from a uniform standard." They were right, and the drift is measurable.

## 2. Decisions

**D1 — The conversion is mechanical, and that is checkable rather than asserted.** `width="default"`
**is** `max-w-6xl`, and the remaining classes (`mx-auto w-full flex-1 p-6`) are the same set. So the
rendered rule set is identical at all thirteen sites and no screen changes. Every site was a bare
`<div>` carrying that class string and nothing else — verified by reading all nine files before
converting, not assumed.

**D2 — `plan-detail` converts, because its frame is the error branch and not the canvas.** The
success path returns `<PlanWorkspace>` full-bleed and the pending path is a bespoke workspace-shaped
skeleton; only `isError` uses the page frame, and that branch is an ordinary centred page. Checked
because converting the canvas workspace would have been a real defect, and the file name is the only
thing that suggests the risk.

**D3 — The gate reads balanced string literals, not lines.** The frame is a set of classes whose
ORDER is arbitrary, so an exact-string or line-anchored scan is defeated by
`mx-auto flex-1 w-full p-6 max-w-6xl` — the same classes, reordered by hand or by a formatter, with
nothing failing. What identifies a frame is the co-occurrence of a centring (`mx-auto`), a growth
contract (`flex-1`) and a measure cap (`max-w-*`) in one class string. **Probed rather than
reasoned:** the reordered form above was written into `clients.tsx` and the gate named it.

**D4 — Two screens are declared exceptions, with reasons, rather than converted.** Writing the gate
found **two hand-written frames the nine-file count had missed**, because that count keyed on the
`max-w-6xl` string and the gate's signature is broader:

| Screen                  | Frame                                                      | Why it is not drift                                                     |
| ----------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| `routes/account.tsx`    | `mx-auto w-full max-w-2xl flex-1 p-6`                      | 672px — **narrower** than the archetype's `narrow` (`max-w-4xl`, 896px) |
| `routes/onboarding.tsx` | `mx-auto flex max-w-lg flex-1 flex-col justify-center p-6` | 512px, vertically centred — a card layout, not a page frame             |

Converting either **widens it** (by 224px and 384px respectively) and, for onboarding, drops the
vertical centring. That is a visual change, and folding a visual change into a mechanical conversion
is how a "safe" pass ships a surprise. Whether those measures should join the archetype is a design
question for the per-page pass, which is the next conversation. The exception list is the speed
bump: a third entry costs somebody a written reason.

**D5 — No feature flag** (ADR-0088 D1: a `VITE_` constant is inlined at build time and has never
been an operator rollback). The rollback is a commit boundary, and the change renders identically
either side of it.

## 3. What the gate cannot see

Stated here rather than discovered later:

1. A frame assembled from a variable rather than a literal.
2. A frame split across two elements — an `mx-auto max-w-6xl` parent wrapping a `flex-1` child.
3. A screen that adopts `PageContainer` and then picks the wrong `width`. The gate asserts the
   frame is not re-written; it has no opinion on the measure.

None is worth a rule that reads arbitrary expressions. The shape this is written for is the one
that occurred thirteen times, which is a copied class string.

## 4. Verification

- **Verified red** against the pre-conversion tree (ADR-0110 D5): the gate names all thirteen sites
  across all nine files. Verified red a second time against a reordered frame (D3).
- **Pinned positive case** (ADR-0093): the walk found >500 files, it contains `page-container.tsx`,
  the matcher still recognises a frame, and it does **not** fire on a centred box that caps nothing.
  Without these, every assertion passes vacuously against a walk that found nothing.
- **The gate matched itself on its first run** — its own pinned fixture is a _string literal_, which
  comment-stripping cannot reach. Five gates in this repository have shipped a scan that matched
  their own docblock; this is that failure one layer along, in a fixture rather than a comment, and
  it was caught by running the gate rather than by reading it. Its own file is now excluded, with
  the reason written beside the exclusion.

## 5. Out of scope

The per-page density pass — applying the landing page's row-tightening and fill-the-space box model
to these screens — is the **next** conversation and deliberately not here. So is the question of
whether `PageContainer`'s `max-width` should yield when the navigation rail is collapsed, which was
measured (collapsing the rail frees 243px and content gains 0) and left undecided.
