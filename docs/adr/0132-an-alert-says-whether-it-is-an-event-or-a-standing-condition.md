# ADR-0132: An alert says whether it is an event or a standing condition

- **Status:** **Accepted** — 2026-09-09
- **Date:** 2026-09-09
- **Deciders:** this pass (the discriminator, the no-default shape, the classification); the
  product owner's standing authorisation to decide defaults during the tech-debt drive
- **Extends:** ADR-0077 §9 (the alert treatment, and the tone→role derivation this keeps),
  ADR-0117 (a `purpose` option with no default, so the wrong wiring cannot be reached by omission),
  ADR-0086 (the staff console, which is where the defect lives)
- **Supersedes:** nothing.
- **Spec:** [`docs/specs/alert-purpose/`](../specs/alert-purpose/)

## Context

`Alert` derived its ARIA live-region role from its `tone` — error → `role="alert"` (assertive),
success and info → `role="status"` (polite) — and deliberately `Omit`ted `role` from its props so a
caller could not override it. The docblock argued for that in as many words: _"Making that a prop
would let two call sites answer the same question differently, which is how this repo's message
model drifted in the first place."_

**That argument is right, and it is the reason this ADR does not overturn it.** What it left out is
that `tone` and the live role answer _how urgent_, and nothing in the primitive answered a different
question: **is this an event at all?**

The staff console is where that showed. Six of its `Alert`s state **standing conditions of the
installation** — "This account is also an organisation member", "No mail transport is configured",
"Retention sweeping is disabled", "No violations recorded", the sweeper stuck, the sweeps failing.
Each renders only once its query settles, so the live region and its content are inserted into the
DOM **together** — the unreliable case for a live region, not the silent one — and either way it
announces a persistent fact as though something had just happened. `alert.tsx`'s own docblock says an
Alert is "a message about what just happened", which none of these is.

Three things found while establishing this changed the shape of the decision, and all three came
from reading rather than from the row that raised it:

1. **The count was wrong in the raising note.** It said "33 call sites, 19 info". There are **25
   production call sites**, 17 of them `info`; the 33 counted the eight `render()` calls inside
   `alert.test.tsx`.
2. **There are six offending sites, not four, and two of them are `role="alert"`** —
   `staff.tsx`'s "the last sweeps failed" and "the sweeper is overdue". An **assertive** region
   created by data arriving is the worse case and was not in the brief at all.
3. **Two of the six duplicate a sentence the screen already announces correctly.**
   `retention-copy.ts` emits "Retention: sweeping is disabled." and "Retention: the last N sweeps
   failed." into `Panel`'s properly-mounted polite region — the same two facts. For those, removing
   the live role costs nothing whatever, which is what makes "do nothing" unarguable.

Those same two Alerts are **simultaneously `aria-describedby` targets** of the retention table, so
they are read on insertion and again on table focus.

## Decision

### D1 — `purpose: 'event' | 'condition'`, required, with no default

`condition` renders **no `role` attribute at all**; `event` renders exactly today's tone-derived
role. `tone` keeps owning the icon and the colour in both cases, and `Omit<…, 'role'>` **stands**.

Required-with-no-default is ADR-0117's shape for ADR-0117's stated reason: the caller states which
case they are in, so the wrong announcement cannot be reached by omission. A default of `'event'`
would have touched two files instead of twelve and left the next author reaching this defect by not
knowing the question existed — which is how the present ten arose.

**The discriminator, stated in the primitive so a call site is not a judgement call:** _would this
sentence read the same to somebody who arrived five minutes later and did nothing?_ If yes, it is a
condition.

### D2 — Rejected: `live={false}`

The `role` prop in a thinner disguise, and worse than one: a boolean records the **mechanism** and
not the **reason**, so the next author cannot tell which case theirs is. It would also reopen exactly
the drift ADR-0077 §9 closed.

### D3 — Rejected: move these sites to `NoticeStrip`

`NoticeStrip` already answers this question the opposite way and says so — _"The **role is the
caller's** — deliberately not derived from `tone`"_. It is not the home, on three grounds: a
different treatment (full border, no icon, no accent bar — an unrequested visual regression on the
ADR-0077 §9 shape); it is a one-line truncating strip rendering into a single `<p>`, wrong for four
sentences containing `<strong>` and `<code>`; and decisively, it would leave **the primitive** unable
to express the distinction, so the eleventh site reproduces the defect.

**The two primitives now cross-reference each other**, which is the part worth keeping. Their
docblocks contradicted each other for months and had never been read side by side — the exact "two
call sites answer this differently" failure `Alert`'s docblock warns about, occurring **between
primitives**, where nothing was watching. Unifying them is not attempted: `NoticeStrip`'s callers
span **three** role outcomes and `purpose` expresses two.

### D4 — No WCAG success criterion is failed, and this ADR says so plainly

This register overstated an SC citation once (ADR-0082) and corrected it; the correction is worth
inheriting. **4.1.3 Status Messages is engaged and _satisfied_** by `Panel`'s polite region — it
requires status messages to be announced and does not prohibit marking up something that is not one,
so it points the other way from where a reviewer would reach. **2.2.4 Interruptions** fits the two
assertive sites and is **AAA**; this product targets AA. 1.3.1 and 4.1.2 do not apply.

What this actually is: an **ARIA robustness defect** — a live region should exist before its content
changes — plus duplication against `Panel`'s documented purpose. That is sufficient, and inventing a
criterion would weaken it.

## Consequences

**Twenty-five call sites now declare.** Two adapters (`ServerError`, `FormProblemCount`) fix
`purpose="event"` for their nineteen downstream callers, because a server failure and a submit-time
problem count are outcomes by construction and exposing the choice would offer a decision with one
correct answer. Ten sites become `condition`; the rest are events. `tsc` is the completeness gate: a
required prop makes a partial migration impossible, which is also why the primitive and the
classification land together — writing `purpose="event"` on ten sites known to be wrong would assert
something false in its own diff.

**`staff.tsx`'s stuck-sweeper alert is `tone="error"` with `purpose="condition"`**, and that
combination is intended rather than a slip: being stuck is serious, which is what the tone says, and
it was already true when the reader arrived, which is why it must not interrupt. The two props answer
different questions. The call site says so in a comment, because it is the one place a reviewer would
reach for a correction.

**Three gates land, and what they cannot do is stated in the files rather than only here.** G1 pins
both purposes across all three tones, asserting the absence as a **missing attribute** and never as a
`queryByRole` miss — those fail for different reasons, and only the first says "this element is here
and carries no role". G2 pins the surviving `Omit`, comment-stripped and verified red by deleting it,
because once a component takes a `purpose` prop that decides ARIA, a `role` prop stops looking
dangerous and the `Omit` reads like a leftover. G3 characterises the staff console with every caveat
true at once, behind a pinned positive so it cannot pass by rendering nothing. **jsdom has no
assistive technology**: all three assert rendered `role` attributes and nothing more.

**No census with an allow-list, deliberately.** The dangerous drift is a standing condition declared
`event`, and no gate can read intent. A green gate stops anyone looking, so the docblock's
discriminator question and the `DESIGN_SYSTEM.md` rule are the instruments, and this ADR says so
rather than implying more.

**Two existing suites had used the live role as a proxy for something else, and both are better for
losing it.** The spec predicted none on the staff side and was wrong: `staff.test.tsx`'s
stuck-sweeper case used `getAllByRole('alert')` to distinguish the escalated rendering from the
routine plain paragraph, and now asserts the treatment itself in both directions. `probe-sittings`'
two incompleteness cases located the notice by `role="status"`; they now resolve the readings table's
own `aria-describedby`, which is a **stronger** assertion than the one they replace — it proves the
notice is wired, not merely present somewhere on the page.

**The gate pass found a regression this change introduced, and it is the register's own favourite
shape landing on the fix for it.** `Alert`'s six staff conditions were argued as costing nothing
because `Panel`'s polite region already carries the fact — and that argument holds for exactly two of
them. The **stuck-sweeper** alert was not one: `statusSentence`'s parameter was
`Pick<Retention, 'enabled' | 'consecutiveFailures' | 'tables'>`, so it could not see `lastRunAt` or
`processStartedAt` and structurally could never say anything about a sweeper that had not run.
Removing its `role="alert"` therefore left that fact with **no announcement channel at all** — and
worse than silence: in the commonest stuck state (no run yet, no table past its threshold) the polite
region says _"every table is inside its period"_, so a screen-reader user hears the reassuring
sentence with the visible alert contradicting it two elements away.

That is verbatim the defect `statusSentence`'s **own docblock** records having shipped once and fixed
for `consecutiveFailures`, one signal along, reintroduced by a change made for a different reason.
Fixed here rather than filed: the function's parameter is widened to `ScheduleFacts &…` so it derives
the verdict from `scheduleSentence` and a caller **cannot** omit the facts — passing the verdict in
would have made the reassuring answer reachable by omission, which is this ADR's own principle. Two
regression tests, verified red against the pre-fix signature, and the second is what stops the first
being satisfied by a rule that calls every fresh deploy stuck.

**The unmitigated risk, named rather than designed away:** nothing stops a future author writing a
standing condition as `event`. And one load-bearing assumption is read from code rather than heard —
that `Panel`'s empty-then-filled `aria-live` paragraph is reliably announced. If that is false, the
repair channel for the two duplicated retention facts is also unreliable.

**One more duplication was found and is recorded rather than acted on**: the CSP panel's own polite
status already says _"0 distinct violations recorded"_, which is the fact behind the
no-violations alert. The ADR's accounting named two duplicated facts and there are three; the third
changes nothing about the decision, and saying two would have been wrong.

**Not closed here**, and recorded so the next reader does not take the row for finished:
`sign-in.tsx`'s signed-out alert stays `event` and its delivery is first-paint and therefore
AT-dependent regardless; the three `DataTable empty={…}` sites are classified `condition` while their
_treatment_ belongs to the empty-state question; and `NoticeStrip` unification is refused above rather
than deferred.

**No feature flag** (ADR-0088 D1 — a `VITE_` constant is inlined at build time and has never been an
operator rollback); the rollback is a commit boundary. **The CPM engine is not imported and no
migration runs**, so the ADR-0034 recalculation parity gate is untouched by construction.
