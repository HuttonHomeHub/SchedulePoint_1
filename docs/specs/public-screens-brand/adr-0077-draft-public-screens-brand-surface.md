# ADR-0077: The public screens' brand surface — a fourth scope, fixed dark in every theme, and what counts as a brand asset

> **THIS IS A PRE-APPROVAL DRAFT AND IT IS NOT FILED.**
>
> On approval it moves to `docs/adr/0077-public-screens-brand-surface.md` **in the same commit** as
> the `CLAUDE.md` banner count bump (76 → 77 ADRs) and the `CLAUDE.md` §16 entry. The two cannot be
> separated: `pnpm check:counts` re-derives the ADR count from `docs/adr/` and fails on the file's
> arrival otherwise (`scripts/check-counts.mjs`, the `ADRs` entries at lines 42 and 54).
>
> _(Written that way, and not in the usual `<file>.mjs:<line>` form, on purpose:
> `scripts/check-claims.mjs`'s completeness
> scan matches **any** `<name>.mjs:<line>` in `docs/` and demands a register entry, without
> distinguishing a dependency from this repository's own tooling — so citing our own scripts by line
> fails CI. That is a third limitation of the gate, alongside the two in "Consequences".)_
>
> **It is drafted here rather than filed as `Proposed` for exactly one reason** — filing it now would
> turn `main` red before anyone has approved it. That is a worse trade than the risk of forgetting to
> move it, and the risk of forgetting is why filing is task **M0-T0** of the implementation plan
> rather than a note. ADR-0071 lived at `docs/specs/assignment-lag/…` for its entire epic, was
> maintained through M6 and the flag flip, and **was never moved** — so a decision cited by number in
> `docs/DATABASE.md`, three other ADRs, two migrations and `packages/types` was absent from the
> register until the audit-log spec tripped over it. That is the failure this box exists to prevent.

- **Status:** Proposed _(draft — see the box above)_
- **Date:** 2026-08-06
- **Deciders:** Product owner; feature-analyst; prior ui-architect and ux-reviewer passes
- **Spec:** [`./feature-spec.md`](./feature-spec.md) · **Plan:** [`./implementation-plan.md`](./implementation-plan.md)

---

## Context

SchedulePoint's six pre-authentication routes — `sign-in`, `sign-up`, `forgot-password`,
`reset-password`, `verify-email`, `accept-invite` — all render through `AuthShell`
(`apps/web/src/components/layout/auth-shell.tsx`), which is a 384 px white card centred on an empty
page. They are the only part of the product a stranger sees, and they are the only significant
surface that never received a design pass: ADR-0055's surface scopes, ADR-0056's time axis,
ADR-0059's Gantt and ADR-0063's WBS band were all built for people who are already inside.

Three forces make this a decision rather than a styling ticket.

**1. The visitor cannot choose the theme, and something else chooses it for them.**
`apps/web/public/theme-boot.js:22-27` runs parser-blocking on **every** document, including public
ones. It reads `localStorage['schedulepoint-theme']` and, failing that, `prefers-color-scheme`. So a
signed-out visitor gets Dark because their OS is dark, or Corporate because a colleague signed in on
this machine last month. The theme picker is in `components/layout/account-chip.tsx`, inside
`_authed` — there is no control on any public screen. The one screen where the product must be
recognisable is currently rendered in one of three visual identities, selected by something the
visitor did not do and cannot undo.

**2. ADR-0055's mechanism exists and is load-bearing.** A surface scope is ONE semantic token
vocabulary rebound per surface by a `[data-surface]` rule, so no descendant learns where it is. The
families are deliberately absent from `@theme inline` (`bg-chrome` does not compile), each family is
complete at **17 tokens** or it is a trap, and the whole thing is held by computed gates: a contrast
matrix over themes × scopes × flag states, a structural seam test, and a lint rule rejecting colour
literals in `className`/`style`. Every defect that epic fixed had shipped past a human reviewer, a
component reviewer and an axe suite — **the class names were right**. Whatever we do to the public
screens has to go through that mechanism or deliberately around it, and going around it silently is
the failure mode ADR-0055 was written to record.

**3. There is no external origin available.** ADR-0074 §4 derived a Content-Security-Policy from what
the code actually loads: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'
blob:; font-src 'self'; connect-src 'self'; …` (`docker-compose.yml:81`, `apps/web/nginx.conf:75-93`).
No CDN, no hosted font, no external illustration — and, less obviously, **no `data:` in `img-src`**,
so the fashionable zero-request `data:image/svg+xml` favicon is blocked too. "Add a nice hero image"
is not available, and the reason it is not available is a security decision this project already made
and should not quietly reopen.

Alongside this, four defects are live on these screens (spec §2.5): six states with no control on
them, a heading that outlives the task it names, one native `disabled` on a primary action, and an
**unhandled 429**. The last is worth naming here because it explains why nobody saw it: Better Auth
caps `/sign-in*` and `/sign-up*` at 3 requests per 10 seconds and the two email routes at 3 per 60
(`better-auth@1.6.25`, `index.mjs:370-383`), and our configuration sets
`rateLimit: { enabled: options.isProduction }` (`apps/api/src/common/auth/better-auth.ts:270-274`).
**The limiter does not exist in development.** A defect that only exists in production, on the one
surface no member of the team routinely uses signed-out, is a good argument for the browser
measurement this epic adds.

---

## Decision

### 1. We will add a fourth surface scope, `brand`, and we will state the bar for a fifth

`SurfaceTone` (`components/ui/surface.tsx:22`) gains `'brand'`; `globals.css` gains a complete
`--brand-*` family and a `[data-surface='brand']` rebind rule; the five gates that ADR-0055 built
gain the new family (implementation plan M3-T2).

A scope is a heavyweight thing — a whole parallel token vocabulary that every future value change has
to be applied to three more times. **We will add one only when all five hold**, and this is the bar a
future proposal is measured against:

1. **The region must keep the semantic names and change what they resolve to.** If descendants would
   have to know where they are, it is not a scope — it is a component with props.
2. **The region's fill is chosen for a reason the page's fill structurally cannot serve.** For
   `chrome` that was "this is the app's frame". For `brand` it is **theme-invariance**: the page fill
   follows the theme by definition, so a theme-invariant region cannot be expressed as a page.
3. **The family can be complete — all 17 tokens — in every theme block, and every rebound pair clears
   its contrast bar by computation**, not by a designer's eye. If it cannot, the honest answer is
   that the surface is not ready.
4. **It has at least one real consumer on the day it lands.** No speculative scopes.
5. **It goes through `<Surface>`.** `surface-seams.structural.test.ts`'s `ALLOWED` list (`:28`) does
   not grow — only `globals.css` and `surface.tsx` may name the mechanism.

**One implementation note that is easy to get wrong and is therefore part of the decision.** The seam
test's protection is in its **regexes** (`:50`, `:56`, `:60` — `/--(chrome|panel)\b/` and
`/var\(--(chrome|panel)-/`), not in `ALLOWED`. Adding a family without extending those regexes leaves
it entirely unguarded: any component could write `var(--brand-primary)` and no test would notice. The
allowlist is what must **not** grow; the regexes are what **must**.

### 2. The brand panel is dark navy in **every** theme, and this is deliberate

The panel's fill and inks are identical under `:root`, `.dark` and `.corporate`. It does not follow
the theme; it does not lighten in Light; it does not take Corporate's amber.

**This is written down because, undocumented, it reads as a bug and gets "fixed".** A future
contributor opening `globals.css`, seeing `--brand: oklch(0.252 0.056 264)` repeated verbatim in
three theme blocks, will reasonably conclude that someone forgot to vary it — the file is full of
comments explaining why `--field` and `--canvas` must be _literal and per-theme_ precisely so they
_can_ differ. The repetition here means the opposite, and only this ADR can say so.

The reasoning, in the order it matters:

- **The visitor did not choose the theme** (Context 1). Making the brand follow a preference the
  reader never expressed, cannot see the reason for and cannot change is not personalisation; it is
  three products wearing one name.
- **A brand is a constant or it is not a brand.** The card beside it still follows the theme, which
  is the right split: the panel is who we are, the card is the reader's environment.
- **It is the one region whose contrast can be validated once.** A theme-following panel needs its
  motif, its tagline and its brand mark re-measured in three themes; a fixed one is measured once and
  is then true everywhere. The contrast matrix still runs it over all three theme blocks — and
  _should_, because the assertion "these values are identical in all three" is itself worth
  computing rather than trusting.

The visible cost is stated rather than hidden: **a Dark-theme user sees a dark panel beside a dark
card**, so the boundary between them rests on a border and a subtle fill difference rather than a
strong one. The adjacent-surface ratio is reported by `token-contrast.test.ts` (extended to `brand`
in M3-T2) so this is a number in the test output rather than an impression.

### 3. The panel is filled with a token-drawn motif, and the repository carries no brand asset it cannot draw

**What the repository will carry:**

- **An inline `<svg aria-hidden="true">` TSLD motif** — schematic bars on a lane grid with
  finish-to-start links and arrowheads, drawn entirely from compiled semantic utilities. Inline
  markup is **not a fetch**, so it is CSP-clean by construction; it follows the surface scope like
  any other element; it is covered by the colour-literal lint rule (once M0-T3 widens that rule to
  `src/routes/**`, which it does not currently reach — `packages/config/eslint/react.js:45`); and it
  is the product's own picture rather than stock imagery of a hard hat.
- **A served favicon** in `apps/web/public/`, alongside `theme-boot.js`. `img-src 'self'` permits it;
  it needs its own nginx `location` for cache headers, for the same reason `theme-boot.js` needed one
  (`nginx.conf:43-46`). Today `/favicon.ico` falls through the SPA rewrite (`nginx.conf:62-64`) and
  returns `index.html` as `text/html`, which browsers reject.
- **The existing `BrandMark`** (`components/layout/brand-mark.tsx`), which no public screen currently
  uses. Its tile is `bg-primary text-primary-foreground` — a token, deliberately — so inside the
  brand scope it resolves to `--brand-primary` with no change to the component.

**What it will not carry, and why:**

- **No raster photograph or illustration.** It cannot follow tokens, it cannot follow the surface
  scope, it is invisible to the contrast matrix, it is a real payload on the LCP path of the one
  route a stranger loads cold, and it needs an asset pipeline this repository does not have.
- **No `data:` URI icon.** Blocked by `img-src 'self' blob:`.
- **No external font, no CDN, no third-party origin of any kind.** Relaxing the CSP to improve a
  login screen would be the worst trade in the epic.
- **No self-hosted webfont in this epic.** Worth noting what this means today: `globals.css:180-183`
  names `'Inter'` first and there is **no `@font-face` anywhere in `apps/web`**, so the application
  currently renders in whatever the operating system happens to supply. `font-src 'self'` would
  permit self-hosting and it is probably the right move eventually — but it is a bundle-size and LCP
  decision with its own measurement, and attaching it to a login-screen redesign is how a 200 kB
  regression ships as a rider.
- **No `theme-color` meta tag** _(default; reversible)_. The app has four theme settings and
  `prefers-color-scheme` distinguishes two, so any single value is wrong in at least one theme and a
  media-split pair is wrong in the fourth. Omitting it is more honest than guessing.

### 4. The motif is drawn from the brand family's own semantic names, not from `--chart-*`

_(This is **CQ-1** in the spec; the paragraph below is the recommended resolution, and the ADR should
not be accepted until the PO confirms it.)_

The intent — "draw it in the product's data-visualisation colours" — is right. The literal
implementation is blocked three ways, each verified in the test source rather than assumed
(spec §3.4):

1. `--chart-*` is **not in `REBOUND_NAMES`** (`token-architecture.test.ts:55-73`), so inside the brand
   scope the chart tokens keep the _page theme's_ values. On a fixed navy panel that puts Corporate's
   `--chart-2: oklch(0.338 0.081 262)` (`globals.css:380`) on a navy of `oklch(0.252 0.056 264)`
   (`:409`) — roughly **1.4:1**. The motif would be invisible for every Corporate user, and _different_
   in each theme for everyone else, which is the exact property the fixed panel exists to remove.
2. Adding `--chart-*` to the brand rebind **fails a set-equality gate** (`:138-140`), and because
   `describe.each(FAMILIES)` shares one list, it would force `chrome` and `panel` to rebind chart
   tokens too.
3. Exposing `--brand-chart-*` through `@theme inline` **fails another** (`:84-93`), which asserts that
   no `--color-brand-…` utility exists — an assertion that switches on automatically the moment
   `'brand'` joins `FAMILIES`.

So the motif uses `--primary`, `--accent`, `--accent-foreground`, `--muted-foreground`, `--border` and
`--foreground`, which **are** rebound and therefore theme-invariant for free. A schematic of four to
six bars needs three distinguishable inks, not five. If five are genuinely required, the honest route
is to split `REBOUND_NAMES` into a required set plus per-family extras — a deliberate weakening of a
structural gate, which should be its own reviewed decision and not a side effect of a drawing.

### 5. No feature flag

Every user-visible surface in this repository since ADR-0030 has landed behind a `VITE_*` flag,
default-off, with parity suites pinning the prior surface. This one does not, and the reasoning is
ADR-0061's:

- **There is no behavioural difference to gate.** This is a structural rework of six screens plus four
  defect fixes. A flag would mean two copies of every one of 33 states in one file, and the flag-off
  copy would be the code nobody reads and everybody breaks.
- **Flag-off parity is structural here in a way it was not for ADR-0055 S5.** That milestone _re-valued
  existing tokens_, so a rollback needed a flag-keyed value layer to be byte-for-byte. This one **adds
  a family**; a family nothing references changes nothing, and the `brand` tokens are unreachable
  except through `<Surface tone="brand">`. There is no prior surface to pin, because the prior surface
  is what the tokens do not touch.
- **The existing suites are the parity contract.** They query by role and accessible name, which is
  exactly what the rework preserves — the ADR-0062 extraction's proof was that every pre-existing
  suite passed unchanged, and the same standard applies here (implementation plan M4-T3, step 2).

The mitigation that replaces the flag is a **commit boundary**: the token family (M3) and the visible
panel (M4) are separate commits, and M4 is one commit. Rollback is one `git revert`. This matters
because the product owner runs the Docker Compose stack with the ADR-0047 Watchtower profile
**enabled** — a merged release is pulled and recreated on that host, so anything shipped default-on is
in use (`CLAUDE.md` §17).

### 6. Consequential decisions recorded here so they are not re-litigated

- **No "Remember me" checkbox** (PO decision, and the code agrees). Better Auth's sign-in body defines
  `rememberMe` with **`.default(true)`** (`better-auth@1.6.25`, `dist/api/routes/sign-in.mjs`,
  line 234), and it is `rememberMe === false` that produces a non-persistent session (same file,
  line 326). We never send the field, so **every session is already "remembered"**. A checkbox would
  therefore only ever offer to make a session _less_ persistent — the opposite of what the control
  conventionally promises — and would put a session-management question in front of a reader at the
  worst moment. Sessions are unchanged. _(These two citations must be registered in
  `scripts/dependency-claims.json` in the same commit that files this ADR — plan task M0-T2.)_
- **`sign-in`'s `<h1>` is not stale and is not changed.** Its `EMAIL_NOT_VERIFIED` branch carries a
  "Try a different account" control that returns the form to idle (`SignInForm.tsx:50-52`), so the
  reader is still signing in. The prior review pass listed it with the two genuinely stale headings;
  it is recorded here as a correction, because "fix all three" would have changed a correct screen.
- **The route owns the header and the terminal branch.** Two mechanisms currently do this job; the
  route-level one already exists on two screens and becomes the only one (spec §4.6). `AuthShell`'s
  props do not change.
- **The 429 message names no number of seconds.** `@better-fetch/fetch@1.3.1` builds the error from
  the parsed body plus `status` and `statusText` and **does not carry response headers**
  (`dist/index.js`, lines 733-739), so `X-Retry-After` is not reachable without a client-level hook and
  a module-level side channel. A fabricated countdown is worse than none.
- **`/change-password` and `/change-email` share the 10-second rule** (`index.mjs:370-383`), so the
  authed `/account` screen inherits the 429 handling for free. Recorded so nobody re-implements it.

---

## Alternatives considered

- **A brand panel that follows the theme.** The natural first instinct, and rejected on Context 1: the
  visitor did not choose the theme and cannot change it, so "following" it means the brand is selected
  by the reader's OS or a previous user's preference. It also triples the contrast work and the design
  review, permanently.
- **Reuse the existing `chrome` scope instead of adding a fourth.** Attractive — a family already
  complete in three themes. Rejected because `chrome` is **theme-following by design**: Light chrome is
  `--chrome: oklch(1 0 0)`, i.e. white (`globals.css:115`). A "fixed navy panel on the chrome scope" is
  a contradiction, and forcing it would mean re-valuing chrome, which would repaint the authed app's
  header. Rejected without hesitation.
- **A photograph or a stock illustration.** Rejected on CSP (`img-src 'self' blob:`), on LCP for a cold
  first load, on the absence of any asset pipeline, and on the fact that it cannot follow a token —
  which means it is invisible to the one gate that catches contrast defects here.
- **Hard-coded navy utility classes on the panel.** Rejected: `packages/config/eslint/react.js:51-68`
  forbids colour literals in `className`/`style`, and a literal is invisible to the computed contrast
  suite. This is precisely the defect ADR-0055 exists to record. (It is also currently _possible_,
  because that rule does not reach `src/routes/**` — which is why widening it is task M0-T3 and lands
  before anything is drawn.)
- **A `VITE_PUBLIC_SCREENS` feature flag.** Rejected — §5.
- **Ship the redesign first and fix the four defects afterwards.** Rejected: B4 is live in production
  and B1 strands readers today. They also touch the same six files, so doing them apart means reviewing
  the same diff twice.
- **Fix the four defects and leave the screens as they are.** Rejected by the product owner, and the
  sequencing agrees for the same reason.
- **Enable the rate limiter in the test environment so a journey can exercise it.** Rejected: the
  frictionless local/test setting is deliberate (`better-auth.ts:264-274`) and turning it on would make
  every suite that signs in more than three times in ten seconds flaky by design. A Playwright
  `page.route` fulfilment tests our handling of a 429 without asking the server to produce one.

---

## Consequences

**Positive**

- The product is recognisable before sign-in, identically, on every machine.
- Six dead-end states, one stale heading, one native `disabled` and an unhandled 429 are gone — three
  of which are patterns this repository has now closed for the third or fourth time elsewhere.
- The public screens enter the design system's own gates for the first time: the colour-literal lint
  rule (widened to `src/routes/**`), the computed contrast matrix (a fourth scope), and a browser-
  measured layout suite.
- `docs/TECH_DEBT.md` **#97(b)** closes — the inline text-link `className` copied across five auth
  screens becomes one primitive.
- The bar for a fifth surface scope is written down before anyone needs it.

**Negative / cost**

- The token vocabulary grows by 17 × 3 = **51 declarations**, and every future surface-token change is
  now four families to keep in step. This is the standing cost of the mechanism and it is real.
- The contrast matrix grows by a third (3 themes × **4** scopes × 2 flag states).
- No flag means a defect in M4 reaches users on the next release, on a host with autodeploy enabled.
  The mitigation is a commit boundary and the M6 measurement, not a switch.
- A Dark-theme user gets a dark panel beside a dark card; the boundary is a border rather than a
  contrast step. Reported as a number by the adjacent-surface check rather than argued.

**Neutral / follow-ups**

- Self-hosting a webfont is now a clearly-scoped, separately-decidable improvement rather than an
  ambient wish.
- `scripts/check-claims.mjs` gains two limitations worth a `TECH_DEBT` row, found while writing this:
  its `installed()` helper cannot resolve a **scoped** package (pnpm stores `@better-fetch/fetch` as
  `@better-fetch+fetch@…`, and the lookup uses `startsWith(name + '@')`); its completeness scan is
  a text pattern over `<base>.mjs:<line>`, so a citation written any other way — including every
  citation into a `.js` dist file — is invisible to it; and that same pattern makes **no distinction
  between a dependency and this repository's own tooling**, so citing `scripts/*.mjs` by line number
  in a doc fails `pnpm check:claims` with a demand to register a file that is in the repository. All
  three were found while writing this ADR, by hitting them.
- The engine, the API, the database and the recalc parity gate are **untouched by construction**: no
  file under `apps/api` is modified, no migration runs, and `computeSchedule` is not imported by
  anything in the diff. In its honest form (ADR-0074's phrasing): there is nothing to hold parity
  _for_.

---

## References

- Spec: [`./feature-spec.md`](./feature-spec.md) · Plan: [`./implementation-plan.md`](./implementation-plan.md)
- [ADR-0055](../../adr/0055-designed-chrome-and-canvas-visual-language.md) — surface scopes, the
  17-token completeness rule, the computed gates
- [ADR-0074](../../adr/0074-account-recovery-verification-enforcement-and-csp.md) — the screens
  themselves, and the CSP this decision designs within
- [ADR-0061](../../adr/0061-dialog-layout-system.md) — the unflagged structural-refactor precedent
- [ADR-0062](../../adr/0062-activity-editor-convergence-logic-resources-notes-as-tabs.md) — extraction
  proved by pre-existing suites passing unchanged
- [ADR-0076](../../adr/0076-wrong-claims-are-a-defect-class.md) — why every claim above names what was
  read, and why the dependency citations are registered
- [ADR-0058](../../adr/0058-drift-control-and-the-reconciliation-pass.md) — verify the claim; do not
  trust the document
- [ADR-0071](../../adr/0071-per-assignment-lag.md) — the filing failure this draft's header box guards
  against
- `docs/TECH_DEBT.md` #97(b) (closed by this epic), #98 (the measurement precedent), #96 (the search
  parser limit this epic does **not** fix)
