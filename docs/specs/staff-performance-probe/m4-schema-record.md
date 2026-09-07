# M4-T1 — the schema design record

**Gating task.** `CLAUDE.md` §19.3 and §20: every schema change goes through the
`database-architect` agent, without exception, and deciding a change is too small to need it is the
judgement the agent exists to make. No migration was written before this record existed.

This file holds the agent's answers to the spec's six questions (§4.13), **any disagreement with
the shape §4.9 proposed**, and the findings that came from checking the spec's own claims rather
than inheriting them.

---

## Independently verified before the agent ran

Two of the spec's decision-bearing claims underpin the `Provenance` columns, and both were checked
by opening the files rather than trusting the citation (ADR-0076 §19.11).

**`__APP_VERSION__` — CONFIRMED, and the citation is accurate.** `apps/web/vite.config.ts:28`
carries `define: { __APP_VERSION__: JSON.stringify(appVersion) }`, fed by a `readFileSync` of the
package manifest at `:11-13`; the comment the spec cites is at `:8-13`. It surfaces as
`APP_VERSION` (`apps/web/src/config/env.ts:26`) and is declared at
`apps/web/src/vite-env.d.ts:7`. So the web half of `Provenance` is a compile-time constant that
cannot drift from the published package — no env var, no runtime fetch.

**`GET /api/v1/version` — CONFIRMED**, `apps/api/src/version/version.controller.ts:19-25`, public,
returning the API's own package version.

### And a correction to the spec's design, found on the way

§4.9 lists `api_version` beside `app_version` as though both were the client's to report. They are
not the same kind of fact. The web app already reads the API's version through a **cached TanStack
Query** (`apps/web/src/features/system/api/use-api-version.ts`, "read once"), so a client-supplied
`api_version` records **what the browser last believed** — which, after a deploy the tab has not
been reloaded through, is the previous release. The API knows its own version with certainty at the
moment of the write.

**So `api_version` is stamped server-side and is not accepted from the request body.** `app_version`
stays client-supplied, because only the bundle knows which bundle it is. That split is not a
tidiness preference: the whole point of these two columns is comparing readings across releases, and
a version field that can silently be one release stale defeats exactly that.

The spec's own note that **no commit SHA is available** stands (ADR-0088 D1: `docker-publish.yml`
passes no build args), so the granularity is a release and the row's docblock must say so.

---

## The agent's design

Run 2026-09-07. It **disagreed with §4.9 in four places**, and the disagreements are the finding.

### D-a — one row per LIMB, not per run

Seven of the proposed shape's fields (`scenario_id`, `preset`, `activity_count`, `edge_count`,
`scene_summary`, `counts`, `thresholds`) are **per-limb** facts: a 500-activity limb and a
2,000-activity limb in one press differ in every one of them. A per-run row pushes them into JSON,
and the series this feature exists to produce — _this limb, across releases_ — then lives inside
`jsonb`, where it cannot be ordered, filtered or indexed the day somebody asks.

Limbs are grouped by **`run_id`, a plain correlation UUID with no FK and no parent table** — the
ADR-0073 C3.3 `correlation_id` shape, and the `baseline_activities.source_activity_id` non-FK
precedent. A `perf_probe_runs` parent was considered and rejected: it gives the ADR-0087 sweep a
two-table **ordered** delete, which is the class `docs/TECH_DEBT.md` #253 records thirteen copies
of, and the ADR-0126 M4 finding where a fourth child table broke 557 API e2e tests on a RESTRICT
foreign key. The cost — machine and provenance columns repeating across a run's two to four limbs —
is nothing on a table minted by a person pressing a button.

### D-b — `pairs` becomes `samples`

`pairs` is a difference-shaped word on a table that now holds absolute limbs too. **A column named
for one of two shapes is how a reader concludes the other shape is not stored.**

### D-c — `api_version`, `recorded_at` and `run_id` are server-set

Independently reached, and it agrees with the correction recorded above from a different direction.
`recorded_at` is the retention predicate and the read's leading key, so a wrong browser clock is a
row that expires early or never. `run_id` minted server-side means a client cannot forge grouping —
two runs claiming one id would make one machine's numbers read as another's.

### D-d — the audit action costs **zero** migrations, not one

§4.13's sixth question assumed one. **Verified against the live schema and it is none.**

---

## Verified rather than accepted — three claims checked by opening the files

The agent is credible and its three sharpest claims were still checked, because that is the rule
(§19.11) and because two of them change what M4 builds.

**1. The staff Retention panel has a live silent-wrong-answer hazard — CONFIRMED.**
`apps/api/src/modules/staff/staff-health.service.ts:134-142` dispatches the oldest-row lookup with a
**binary ternary**, under a comment reading _"Two tables is not a scaling problem"_. A third policy
falls to the `else` and the panel reports **`mail_events`' oldest row as `perf_probe_results`' age**.
Both branches typecheck and nothing fails. That figure then feeds `isRetentionOverdue`, on the panel
whose whole design principle is that the answer is derived from the data rather than from the
sweep's own bookkeeping — so the one place built not to lie would. The `at` extraction two lines
below (`'lastSeenAt' in row ? … : row.occurredAt`) has the same shape and the same fault.

The remedy is a `switch` with no `default`, matching `RetentionSweepRunner.deleteBatch`, so the
compiler demands the third branch. `days: Record<RetentionTable, number>` **will** fail typecheck,
so the milestone notices _something_ — but it notices the wrong line, and fixing the `Record` alone
leaves the ternary wrong. That is worth stating plainly: a partial compile error is more dangerous
than none, because it satisfies the person fixing it.

**2. `staff.probe_recorded` costs no migration — CONFIRMED.**
`apps/api/prisma/migrations/20260809140100_staff_audit_actions/migration.sql` is a deliberate
`SELECT 1;` whose comment says so in as many words: `audit_events.action` is TEXT with a format
CHECK rather than an enum _"precisely so a new action vocabulary costs no migration at all"_.
`staff.probe_recorded` matches `ck_audit_events_action_format`, and `AuditActorType.STAFF` plus its
`ck_audit_events_actor_shape` branch already exist (ADR-0086 D5 paid that two-migration cost). So the
whole epic is **one** migration — this table — and the action is a `packages/types` edit.

Recorded as **zero rather than left implicit**, for the reason that no-op migration gives for its own
existence: a reader should not have to re-derive that a step needed nothing.

**3. `retention-boundary.structural.spec.ts:44` asserts the table set by equality — CONFIRMED**, with
the intent in its own test name: _"names exactly two tables — by equality, so a third forces a
decision"_. Editing it **is** the decision, and it belongs in the ADR rather than passing through the
diff as a fix.

---

## The one question the spec left open, answered

The agent's risk 1: **a per-limb refusal is undefined.** D4's guard table is run-level (a hidden tab,
an implausible display clock), but non-vacuity — "the painter did not draw enough for this to be
about the painter" — is **per scene, i.e. per limb**. A run whose 500-activity limb is fine and whose
2,000-activity limb drew nothing has no defined behaviour, and S3 read literally ("a run that cannot
be judged produces no verdict and no stored row") discards good data.

**It is already answered by the shape M3 shipped, and the answer is better than either option the
spec offered.** `runProbe` returns a per-limb `result` that is one of `difference`, `absolute` or
**`unjudgeable`**, so a limb that drew nothing is _reported as unjudgeable_ rather than refusing its
siblings. And because there is **no verdict column** (D5), the stored row needs nothing extra: the
judgement is derived on read from `counts` and `thresholds`, and the same derivation that would have
returned a verdict returns "cannot be judged" instead. So:

- **A run-level refusal stores nothing** — a hidden tab measured the throttle, and the numbers are
  meaningless rather than merely inconclusive.
- **A limb-level non-vacuity failure IS stored**, and reads back as unjudgeable, from its own stored
  counts. No `refusal_reason` column, and none deferred: there is nothing for one to say that the
  numbers do not already say.

---

## Adopted in full, plus the obligations the database cannot enforce

The design is adopted as given. Four service-layer obligations travel with it and are recorded here
because no constraint can hold them:

1. `run_id`, `recorded_at` and `api_version` are server-set; the DTO must not carry them.
2. The panel must show a **failed store** distinctly from a **refused run**. That is what makes every
   CHECK above safe — a swallowed 422 turns a visible refusal into the silent evidence-loss the
   `csp_reports` correction exists to prevent.
3. **The POST body is never logged.** `RetentionSweepService`'s own docblock makes the argument about
   `mail_events`: a log line is a second copy with different retention. A Pino line carrying this DTO
   puts a named staff member's GPU string and user-agent outside this table's 365-day bound.
4. The run's limbs and **one** audit row go in one transaction — one `staff.probe_recorded`, never
   one per limb (ADR-0073 C3.1: one row per user action, never per swept row).

Two more of the agent's risks are accepted as work:

- **`px_per_day` was missing from §4.9** while M2-T1 names its absence as a risk and names recording
  it as the mitigation. Added — otherwise the mitigation for a named risk is silently dropped.
- **`scenario_version` is decoration unless somebody owns bumping it.** The registry gains it with the
  rule written down: bump on any change to the scene or the protocol. A scene that changed without a
  bump makes two incomparable rows look comparable, which is the single failure this table exists to
  prevent.

And one is accepted as a limitation stated on the row: **`machine_label` is insert-time only in v1.**
An edit route needs `updated_at` and `version`, which is a migration and a decision; the ADR-0085
scrub path does not need them, because a scrub is an audited administrative act.
