# Technical debt register

Known shortcuts, gaps, and deferred decisions, with the intent to address them.
Keep this honest and current — undocumented debt is the expensive kind.

> Format: each item has a short description, why it exists, the risk if left,
> and a remediation intent. Remove items when resolved (note it in
> [DECISIONS.md](DECISIONS.md) or `CHANGELOG.md` if significant).

**Delete resolved rows; do not annotate them "RESOLVED".** A row that says it is
done is a row a reader still has to read, and nine of them had accumulated here.
Worse, several rows were resolved in the _title_ while their remediation column
still described the work as outstanding — so the register disagreed with itself.
The commit message and `DECISIONS.md` are the history; this file is the backlog.
Where only part of an item is done, rewrite the row to be about **what is left**,
and rename it to match, rather than appending a "(a) RESOLVED" prefix.

**When you delete a row, add its number to [Closed numbers](#closed-numbers) at
the foot.** One line. That ledger is not ceremony: ADRs cite these numbers and are
never rewritten, so a deleted row leaves dangling references — and a freed number
looks available, which is how two different items both came to be numbered 83.

**Reconcile periodically.** A row is a claim about the code, and claims rot: the
2026-07-27 pass (below) found one row asserting the app had no domain code when
it had nineteen modules, one understating a duplication by 5×, and one whose
"still to do" had shipped a fortnight earlier. Verify against the codebase, not
against memory — most rows here name a file or a flag, so checking is cheap.
Doing this after each epic, while the context is fresh, is cheaper than a sweep.

| #   | Item                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Why it exists                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Risk                                                                                                                                                                                                                                                                                                                                                            | Remediation intent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Web e2e is Chromium-first, and now at scale** — _re-counted 2026-08-18: **33** suite directories_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Rewritten 2026-08-04: the old text described the foundation stage ("the web entry point has landed… a Playwright journey"), which stopped being the situation about twenty suites ago. There are now **24** Playwright suites — one base journey plus 23 flag-scoped ones, each with its own config — and `playwright.config.ts` still declares firefox/webkit projects. **This row said "essentially nothing routinely runs" them until 2026-08-17, and that was wrong: the BASE journey runs all three engines in CI on every push — the run that corrected this reported 51 cases, which is its 17 specs × 3 — and it caught a real firefox/webkit-only failure (ADR-0088 D3's harness conversion). What is true is that the 31 FLAG-SCOPED suites are Chromium-only, which is where the gap actually is. Worth knowing before relying on a local run: this dev container ships no firefox or webkit binary, so those two projects fail wholesale for an unrelated reason and a genuine cross-engine failure is invisible in the noise — locally the base suite is Chromium-only whatever the config says. The gap therefore grew with every epic rather than staying still, and it is widest exactly where the product is most browser-dependent: the Canvas-2D TSLD, the `<dialog>` top layer (which the ADR-0067 journey proved unit tests cannot see), and the print/PDF paths. | Firefox/WebKit regressions ship unseen. The brief names iPad-class Safari in the performance envelope, and no journey has ever run there.                                                                                                                                                                                                                       | Pick the two or three journeys whose failure would be worst on another engine (base, canvas authoring, calendar shifts) and run those projects in CI; do not try to run all 24 cross-browser. Sequence with #75, which needs real-hardware Safari measurement anyway.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 138 | **The `View ▾` panel's two radio groups are still hand-rolled** — _narrowed 2026-08-18: the five CHECKBOX groups migrated to `CheckboxField`; only the radios remain_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Zoom level and colour mode are `<label><input type="radio">` pairs inside a `role="radiogroup"`, because **there is no `RadioField` primitive** — `components/ui/` has `segmented-control.tsx` and no radio. That, not `CheckboxField`'s shape, is the actual blocker: this row previously said the checkboxes were blocked because `CheckboxField` forwards a ref for RHF `register()`, which was wrong — it spreads `...props` onto the input, so `checked`/`onChange` always worked. Checked by reading the component, not recalled.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Low. The WCAG 2.2 SC 2.5.8 gap that raised this row is closed for all seven controls by the shared `TOGGLE_ROW` constant, which the radios still use. The residue is that the radios re-implement label, hint and describedby wiring that the primitives own, so a fix to those does not reach them.                                                            | Add a `RadioField` (or a `RadioGroupField` taking options), matching `CheckboxField`'s gate/hint/describedby contract, then migrate both groups and delete `TOGGLE_ROW`. Worth doing when something else needs a radio — building a primitive for two call sites in one panel is the weaker case.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 141 | **The expiry's per-run activity budget is global, so one organisation's backlog can starve another's** — _raised 2026-08-18 by the security review of ADR-0096, non-blocking_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `hierarchy-expiry.service.ts`'s `ACTIVITY_BUDGET_PER_RUN` (20,000) is spent first-come across every organisation's expiring batches, in whatever order the three candidate scans enumerate. An organisation that deletes a 200,000-activity programme consumes the whole budget for several runs, during which nobody else's deletions expire.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Very low, and availability-shaped rather than confidentiality- or integrity-shaped: nothing is deleted wrongly, and the delayed expiries happen on a later tick. The countdown on screen is derived from `deleted_at` and the period, so a starved organisation's rows read "expired" while still present — which is the only user-visible symptom.             | A per-organisation budget, or round-robin across candidate roots, once there is more than one organisation on a host with a real deletion volume. Deliberately not built now: it is a fairness mechanism for a contention that cannot occur on a single-tenant installation, and the measurement that would size it does not exist yet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 140 | **The delete confirmation cannot say whether recovery is time-bounded, because no authenticated screen carries the retention configuration** — _found 2026-08-18 by the UX review of ADR-0096_                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | ADR-0096 M3 ended all five delete dialogs with "…from Recently deleted **for a limited time**", which is false on any host that has not armed `RETENTION_HIERARCHY_ENABLED` — the default, and the state every host has been in. The sentence is now unconditional and true (`features/recently-deleted/model/delete-copy.ts`), which costs the warning on an armed host. Gating it needs `retentionActive` somewhere these screens already fetch; today it exists only in `GET …/deleted`'s `meta`, and `/version` is `@Public()` so installation configuration must not go there.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Low. The limit is still stated where it can be stated honestly — the Recently deleted screen prints the rule with the server's period and counts each deletion down per row — so a planner who goes looking finds it. What is lost is the warning at the moment of deciding, on armed hosts only.                                                               | Carry `retentionActive`/`retentionDays` on an existing **authenticated** org-scoped response the shell already reads, then gate the sentence on it in the one place it now lives. Not worth a route of its own: a second request per screen buys one clause.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 139 | **Two child tables are never stamped by the hierarchy delete cascade** — _found 2026-08-18 by the Recently Deleted plan review; confirmed independently by the database-architect_                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `HierarchyLifecycleService` touches 13 models and **`resource_assignments` and `cross_plan_dependencies` are not among them** (zero matches in `apps/api/src/common/hierarchy/hierarchy-lifecycle.service.ts`). `schema.prisma:1177-1180` says the assignment sweep is "a later task" and it still is; the neighbouring `ActivityStep` comment said the same and **has** been built, which is how the drift was noticed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Active rows point at soft-deleted parents, so any code assuming "no active child under a deleted parent" is wrong about these two. The retention expiry works around it by deleting on **ownership scope** rather than `delete_batch_id`, which is proven and shipped — so this is latent, not live.                                                            | **Deliberately NOT fixed in the Recently Deleted epic**, and the reason is the interesting part: stamping them changes what `restoreBatch` brings back, and a cross-plan edge is a **shared** object between two plans — stamping it into one plan's batch means restoring that plan silently resurrects an edge into a plan that may have been deleted and restored separately. That is an ADR-0045 design question, not a sweep appended to a delete method, and it would otherwise land in the same release as the product's first aimable hard delete. Fix it on its own, with its own decision.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2   | **Swagger CLI plugin disabled**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | The `@nestjs/swagger` CLI plugin generated a `metadata.ts` that tripped `noUnusedLocals`. OpenAPI is currently produced via explicit `@Api*` decorators (which works), so the plugin is optional.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Without the plugin, DTO schemas must be annotated by hand.                                                                                                                                                                                                                                                                                                      | Optionally re-enable `plugins: ["@nestjs/swagger"]` in `nest-cli.json` to auto-enrich schemas; verify the build stays green.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 3   | **Observability wiring is partial**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Structured logging + correlation IDs are implemented; OpenTelemetry metrics/traces (ADR-0013) and a backend are not yet wired.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Limited metrics/traces until wired.                                                                                                                                                                                                                                                                                                                             | Add the OTel SDK + exporter and a collector per environment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 4   | **Async/cache/storage not wired**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | BullMQ (ADR-0009), Redis cache (ADR-0010), and object storage (ADR-0011) are designed but not yet added to the stack (no jobs/hot paths/files exist yet).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Patterns exist on paper only.                                                                                                                                                                                                                                                                                                                                   | Add Redis/MinIO to compose and the modules when the first job/cached read/file lands.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 5   | **Hosting: the current setup IS the decision (settled 2026-08-01)**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Recorded as "undecided" since the foundation stage, which read as work owed. It is not. The product owner runs the Docker Compose stack with the ADR-0047 Watchtower profile **enabled**, so a merged release is pulled and recreated on that host and every release is reviewed by a person. That is a deployment model, not the absence of one.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | None today. The cost of the deferral is bounded because the container/registry foundation is deliberately platform-neutral (ADR-0018 self-migrating image, ADR-0027 per-package tags, GHCR), so moving is a decision rather than a rewrite. Costing managed-host against Kubernetes now would mean costing them against a load profile that does not exist yet. | **Revisit when one of these becomes true**, and write the ADR then: a second operator needs to run their own instance; a tenant needs an availability guarantee a single host cannot make; or the release cadence outgrows one person reviewing each one. Until then this row is a record, not a task.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 7   | **Performance targets are still estimates — but the excuse expired**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | The `CLAUDE.md` §15 targets (LCP < 2.5 s, API p95 < 200 ms) were set before any workload existed, and the row said so. That premise is gone: the product is deployed and in daily use (#5), and several sub-systems have since been measured properly — the painter (ADR-0065), audit storage and index behaviour at 1M rows (ADR-0072/0073), the levelling pass (#84), the library search (ADR-0053 §4). What has **never** been measured is the thing the targets actually name: LCP and API p95 on the running deployment under real use. So this is no longer "too early to tell", it is "nobody has looked".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | The numbers are quoted in reviews and PRs as though they were a bar the system meets. They are a guess, and a guess that has now survived long enough to read as a measurement.                                                                                                                                                                                 | One session with the browser's own performance panel against the live instance, and one p95 read from the API logs (correlation IDs are already there — ADR-0013's wired half). Then either confirm §15's numbers or replace them, and say which. Blocked on nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 8   | **A Content-Security-Policy now ships, in report-only** — _2026-08-09: the flip procedure and its route-walk are now written down (`docs/DEPLOYMENT.md` "Turning the CSP from report-only to enforce"), including what `e2e-csp` does **not** cover. **Remaining: one host variable**, `CSP_HEADER_NAME`_ — _corrected 2026-08-08: this row's risk column called `style-src` "an inference, not a browser-verified fact", which its own remediation column and `apps/web/e2e-csp/` contradict — that suite serves the real policy over the production build in a real browser. **All that remains is the operator flip** of `CSP_HEADER_NAME` (programme M3-T1)_ | **Largely paid 2026-08-05 (ADR-0074 M1).** `apps/web/nginx.conf` is now an envsubst template serving a policy derived from what the code actually loads — everything `'self'` except `blob:` on `img-src`, which the print surface needs. The inline theme-boot script moved to `public/theme-boot.js` so `script-src` needs no relaxation at all. COOP, CORP and an **enumerated** Permissions-Policy ship alongside; HSTS is deliberately excluded (see #89).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | The remaining risk is the one the observation window exists to find: `style-src 'self'` is an inference from source, not a browser-verified fact.                                                                                                                                                                                                               | **The observation window ran on the deployed origin 2026-08-05 and found two things, both now fixed** (and this is the argument for having had a window rather than enforcing on day one). **(a) Zod 4 probes for eval.** `allowsEval()` runs `new Function('')` in a `try`/`catch` to decide whether to JIT-compile validators; the throw is swallowed, so validation always worked — but the browser still reports the attempt, so the console showed a `script-src` violation pointing at `auth-schemas.ts`. Zod's own source comments on this and ships a `jitless` flag; `config/zod-jitless.ts` now sets it, so the probe never runs. Adding `'unsafe-eval'` was rejected: it would re-open string-to-code execution across the origin to buy JIT speed on a few login forms. **(b) `upgrade-insecure-requests` is ignored under report-only** — informational, per spec, and it means that one directive is genuinely untested until the flip. Everything else on the walked routes was clean; **`style-src 'self'` held**, which was the inference this row flagged as unverified. **The vigilance is now a gate.** Both findings shared one cause: the policy was _derived_ by reading `apps/web/src` and _validated_ by a person watching a console, and neither method sees what a **dependency** does at runtime — Zod's probe is not in our source at all. `apps/web/e2e-csp/` (`pnpm --filter @repo/web test:e2e:csp`, its own CI step) serves the **real** policy, parsed out of `docker-compose.yml` rather than restated, over the **production build** — `pnpm build` + `vite preview`, not the dev server, whose inline react-refresh preamble would report a violation production can never have — and fails on any `securitypolicyviolation`. It was verified red first: removing the `zod-jitless` import reproduces `{"directive":"script-src","blockedURI":"eval"}`. It covers the signed-out surfaces and the authenticated shell, and **states what it does not cover** — canvas export, the printed programme, and `upgrade-insecure-requests`, which report-only ignores by specification. **What is left is the flip to enforce**, a separately-approved step (ADR-0074 M5-T2). The operator sets `CSP_HEADER_NAME=Content-Security-Policy`; no release is needed either way. Before flipping, walk every route with the console open — sign-in/up, accept-invite, the share guest view, the plan workspace, the Gantt, canvas PNG/PDF export, the printed programme, the library screens and the audit log — and both Copy buttons. If styles do need it, relax `style-src` ONLY. **And since the staff console shipped (2026-08-09), the walk is no longer the only evidence available.** The policy now carries `report-uri`/`report-to` pointing at `/api/v1/csp-report`, so violations from **every** visitor — not just the routes one person remembered to walk, and not just the browser they used — accumulate in `csp_reports` and are readable at `/staff`. That is strictly better than a console walk for the case this row's own history proves is the dangerous one: the Zod finding came from a **dependency**, was invisible to the source derivation, and would have been invisible to any route list drawn up from `apps/web/src`. Flip, then read the Security panel for a few days. One caveat, and it is why the walk is not simply deleted: delivery from a real browser to that sink is itself unverified end to end (#117), so an empty panel means "nothing arrived", not "nothing happened". |
| 9   | **Auth library relatively young**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Better Auth is now wired into the `AuthContextService` seam (email + password, cookie sessions; ADR-0003, A1). Ecosystem maturity remains a watch item.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Ecosystem maturity risk.                                                                                                                                                                                                                                                                                                                                        | Monitor releases/advisories; keep the boundary swappable behind the seam.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 10  | **ESLint pinned to v9**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | ESLint 10 is available, but `eslint-plugin-import`, `eslint-plugin-jsx-a11y`, and `eslint-plugin-react` still cap their peer range at ESLint 9. Dependabot's major bump is ignored (see `.github/dependabot.yml`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Missing ESLint 10 features/fixes until the plugins catch up.                                                                                                                                                                                                                                                                                                    | Remove the `eslint` major-ignore and bump the ESLint group once the plugins publish v10-compatible releases.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 11  | **Prisma pinned to v6**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Prisma 7 removes `url` from the datasource block and requires a driver adapter + `prisma.config.ts` — a deliberate migration, not a routine bump. The major is ignored in Dependabot.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Missing Prisma 7 improvements until migrated.                                                                                                                                                                                                                                                                                                                   | Do the Prisma 7 migration deliberately (driver adapter, `prisma.config.ts`, `PrismaService` wiring) — worth an ADR — then un-ignore.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 12  | **CodeQL is scanning, but one `if:` away from silently stopping**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Rewritten by the 2026-08-04 reconciliation pass, which found this row describing a risk the repository does not carry, framed for "apps generated from this template" — `HuttonHomeHub/SchedulePoint_1` is **public** and `is_template: false`, so the `if: github.event.repository.visibility == 'public'` guard in `.github/workflows/codeql.yml` is inert and CodeQL runs on every push (row #81 is one of its findings, which is the proof). What is left is the guard itself: making the repo private would **skip** the job rather than fail it, so code scanning would stop with a green tick and nothing to notice. Uploads need GitHub Advanced Security (paid) on private repos, which is why the guard exists.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Silent, not loud. The day the repo goes private, static analysis stops and CI stays green — the failure mode this register exists to catch. Today: none, the scan runs.                                                                                                                                                                                         | If the repo is ever made private, either buy Advanced Security and delete the guard, or replace the skip with a job that fails loudly so the loss is visible. Do not leave a silent skip.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

| 13 | **TypeScript pinned to v5** | TypeScript 7 (the native compiler) removed `baseUrl` and `moduleResolution: node10` from tsconfig, which the shared presets rely on for the `@/` and `@repo/*` path aliases. The major is ignored in Dependabot. | Missing TypeScript 7 speed/features until migrated. | Migrate the tsconfig presets (drop `baseUrl`, move to `paths`/`bundler` resolution), verify nest/vite resolution, then un-ignore. |

| 14 | **Audit log: the two remaining halves** | (a) and (a2) are **closed** by ADR-0072 — authentication events and membership/invitation/organisation changes are recorded before→after in an append-only table, with hierarchy deletes/restores added beyond the original scope and a route census gating every future endpoint on an audit decision. What remains: **(b)** Better Auth's rate-limit store is in-process memory — per-replica once scaled (sibling of #49); **(c)** the `accounts` OAuth token columns are unencrypted at rest (harmless today — only email+password is enabled). | (b) a scraper gets N× the intended budget on scale-out; (c) a database read would expose OAuth tokens the day a social provider is enabled. | (b) back both throttler stores with the ADR-0010 Redis, with #49, before the API runs more than one replica; (c) encrypt the columns before enabling any OAuth provider. |

| 15 | **OpenAPI accuracy gaps** | Repo-wide, from the B2 API review: (a) `201 Create` responses don't set a `Location` header (`docs/API.md` asks for one) — present in the reference template too; (b) the `@Api*Response` decorators declare the bare DTO, not the `{ data }`/`{ data, meta }` envelope the `TransformInterceptor` actually returns. | Generated OpenAPI is slightly inaccurate about response shape and `Location`. | Add a shared `@ApiDataResponse()`/`@ApiPaginatedResponse()` swagger helper and a `Location` header on creates; backport to the reference template so the two stay in step (ADR-0015). |

| 16 | **Email verification is built but not switched on** | The verification-email loop now exists (Theme B2: `emailVerification` in `better-auth.ts` → the `MailService` port → the SMTP adapter), so `AUTH_REQUIRE_EMAIL_VERIFICATION=true` is a switch an operator can turn on rather than one that would strand every new account. It is still `false` on the running deployment. Until it is on, invitation acceptance grants org membership on an email-**match** that only proves mailbox ownership when verification is enforced (ADR-0016 §5). | An adversary who registers an account for a matching address **and** holds the one-time invite token could accept; account-squatting can also block the real invitee's sign-up. Alpha-only, deliberately accepted. **Mail is confirmed working on the deployed host (product owner, 2026-08-05)**, so the first half of this row is paid. What is left is one **ordering** condition, and it is a hard one: the switch must not be turned on until a **web bundle carrying ADR-0074 M2 is live**. M2's three fixes are unflagged runtime branches — a `VITE_` constant cannot gate a server switch (the ADR-0060 M0 rule) — so enforcing verification against an older bundle re-arms exactly the three dead ends M2 closed. **That condition is DISCHARGED as of the 2026-08-17 reconciliation pass, and nothing said so.** ADR-0074 M2 shipped in `web-v0.75.0`; the host runs the ADR-0047 Watchtower profile and auto-pulls every release, and `web-v0.90.1` is the current tag — sixteen releases past it. So this row's remaining content is **not engineering work at all**: it is one operator action, setting `AUTH_REQUIRE_EMAIL_VERIFICATION=true` on the host. Worth stating plainly because a row whose blocker has quietly been met reads exactly like a row that is still blocked, and stays one priority below whatever is being built (the ADR-0085 unconditioned-`M` failure, one register along). That bundle also needs the M5 fixes, without which a verification link that _works_ still lands the reader on the pending screen. Then set `AUTH_REQUIRE_EMAIL_VERIFICATION=true` (docs/DEPLOYMENT.md "Turning verification on"), after counting existing unverified accounts and backfilling the ones already holding a membership (ADR-0074 M5-T6/T7 — enforcement's value is prospective, and the membership predicate structurally excludes a squatted address holding a _pending_ invitation). No code change is needed. Consider a stricter per-route throttle on `POST /invitations/preview` \| `/accept` at the same time. |

| 17 | **Members UI a11y polish (non-blocking)** — _corrected 2026-08-08: **(b) is done** — `components/ui/dialog.tsx:97` links its description via `aria-describedby`. (a) native `disabled` on `MembersTable.tsx:32`, (c) no initial-focus target, (d) no `useAnnounce`, (e) `h-9` = 36 px all stand. **(a) is now governed by the shaded-field ruling** (draft ADR), so take it with programme M6 rather than alone_ | From the C3 accessibility review, after the blocking contrast/focus/live-region fixes: (a) controls use the native `disabled` attribute while a mutation is pending, so keyboard focus drops to `<body>`; (b) the `Dialog` `description` isn't linked via `aria-describedby`; (c) modal initial focus lands on the ✕ close button rather than the first field; (d) no `aria-live` success confirmation for role change / removal / link-copy; (e) light `muted-foreground` (4.73:1) and the sm remove button (36px vs. preferred 44px touch target) are within-spec but tight. | Minor friction for keyboard/AT users; all currently meet AA. | Prefer `aria-disabled` + pointer-events guard over native `disabled` on pending controls; add `aria-describedby` to `Dialog`; set an explicit initial-focus target; add a shared polite toast for success; revisit the tight tokens/targets when the notifications component lands. |

| 18 | **CI image job has no layer cache** | The `image` job (`.github/workflows/ci.yml`, ADR-0020) builds both container images from scratch on every run: the Dockerfiles' `--mount=type=cache,id=pnpm` BuildKit cache is local to an ephemeral runner and isn't persisted across CI runs, and the job invokes `docker compose … --build` directly without a GHA-backed buildx cache. | Slower CI (full `pnpm install` + `prisma generate` + `tsc` + `vite build` each run); more Action minutes. | Wire `docker/setup-buildx-action` + `cache-from`/`cache-to: type=gha` (or `docker buildx bake`) so image layers persist across runs. |

| 20 | **Keyset cursor is resolved before the scope filter** — _re-measured 2026-08-08: **14 call sites across 13 repositories**, not the three named; and its remediation ("in the shared list-repository helper") is conditional on an extraction that does not exist, which is the actual work_ | From the C1 security review (pre-existing shared behaviour, also in `client.repository.ts`/`org-member.repository.ts`): the list repositories pass `cursor: { id }` to Prisma, which resolves that row by global `id` uniqueness before the org/client `WHERE` filter is applied. A cursor value copied from another org's row is therefore accepted as a valid pagination anchor. | None exploitable — the returned page is still filtered by `organizationId`/`clientId`, so no cross-scope rows leak; only the anchor position is honoured. Cosmetic/robustness. | Validate the cursor belongs to the resolved scope (or use an opaque signed cursor) in the shared list-repository helper when one is extracted; capture the standard in an ADR/`docs/API.md` pagination note. |

| 21 | **Systemic web-a11y & polish follow-ups (E1 reviews)** — _corrected 2026-08-08: **(b) is half done** — `hooks/use-document-title.ts` exists but only the six public routes call it, and no focus-to-heading manager exists anywhere; it pairs with **#102(6)**, and one manager in the router closes both. (a) required-indicator, (d) `EmptyState`, (e) `DateField` are all still absent — and (d)/(e) are **new primitives with no consumers to migrate**, so they are separate work from (a) despite sharing a file_ | Non-blocking items from the E1 component/UX/accessibility reviews that are pre-existing or systemic, so best fixed once at the primitive/shell level rather than per-feature: (a) no required-field indicator in the shared `Form`/`TextField` primitive (affects every form — sign-in/up/invite/create-org too); (b) no focus-to-heading / `document.title` update on client-side route navigation (router/`AuthedLayout` level); (c) `sm` ghost row-action buttons are 36px (below the 44px touch-target preference), shared with `MembersTable`; (d) no shared `EmptyState` primitive (icon + copy + action) — empty states are text-only; (e) from the E2 review: no shared `DateField` form primitive — a `TextField type="date"` is hand-composed where the CPM/GPM feature set needs it repeatedly (baseline/actual/constraint dates). **The `SelectField` half of this item is DONE** (2026-07-27, #42): the primitive exists and `InviteMemberDialog` + the plan status select are on it. | Minor friction for keyboard/AT and touch users; all current states still meet WCAG 2.2 AA. | Add a required-indicator to the `Form` primitive; add a route-change focus/title manager once in `AuthedLayout`; introduce `EmptyState`, `SelectField`, and `DateField` primitives (folding the calendar-date wire↔display contract into `DateField`) and bump the row-action target size when the design system is next revised. |

| 23 | **Header org-nav was never folded into the rail** — _the responsive-collapse half is addressed (ADR-0029, `VITE_NAV_TREE` default-on); the fold-in is not: `app-header.tsx` still renders Clients / Calendars / Resources / Members / Audit log / Recently deleted as its own row_ | From the E3 UX review: the org nav (`apps/web/src/components/layout/app-header.tsx`) is a single flex row that grew to four items (Overview / Clients / Members / Recently deleted). `docs/FRONTEND_ARCHITECTURE.md` documents the intended shell as "nav collapses to a drawer/sheet below `lg`", which isn't built. E3 mitigated the immediate overflow by making the nav shrink and scroll horizontally (`min-w-0 flex-1 overflow-x-auto`, links `whitespace-nowrap`) so it never pushes the page into horizontal overflow, but a horizontally-scrolling nav strip is a stopgap, not the intended mobile pattern. **The persistent app-shell (ADR-0029) is landing this:** M1 added the shell — a Project Explorer rail pinned on `lg`+ and an off-canvas drawer (with a header menu button) below `lg` — behind `VITE_NAV_TREE` (default off). The primary navigation moves into the rail/drawer once the flag flips on at M2. | On narrow viewports the primary nav becomes a scroll strip rather than a proper menu; discoverability of later items is weaker. Every new nav item makes the row tighter. | Complete the navigator (M2), flip `VITE_NAV_TREE` on, and fold the header org-nav items into the rail; move low-frequency maintenance items (e.g. "Recently deleted") into an org-settings/admin area once one exists. **Partially addressed 2026-08-19 (ADR-0098 M5): the Overview item is gone**, replaced by the wordmark as the conventional route home — one item lighter, and the row has since grown by three (Calendars, Resources, Audit log), so the row is a net two items worse than when this was raised. The fold-in itself is **ADR-0097 Landing D1**, which moves the whole organisation nav into the rail; this row does not need a second stopgap in the meantime. |

| 28 | **TSLD canvas ring/stroke colour treatment** | From the D5 link-legality UX + a11y reviews. **(a)** The **legal** drop-target ring during a link-draw is visually identical to the ordinary **selection** ring (`paint.ts` — both `palette.selection`, solid, 2px), so two rings with different meanings can appear in the same style at once (predates D5). **(b)** The **illegal** ring reuses `palette.critical` (`--color-destructive`), the same token as the CPM critical-path **bar fill** (`paint.ts`), so an illegal drop hovered over a critical-path activity draws red-on-red — weaker contrast exactly where the signal matters, and overloads one colour for two meanings. **(c)** `--color-destructive` is documented (`globals.css`) as tuned for button surfaces; its use as a **state-border/stroke** on the canvas (the critical-bar outline too) wants a contrast check vs `--color-destructive-text` in both themes. | Cosmetic/robustness; the illegal ring is still distinguishable by its dash (colour + pattern, WCAG 1.4.1 holds), so not an AA failure. | Give the legal drop-target ring a distinct treatment from selection; pick a canvas "danger stroke" token distinct from the critical-bar fill; verify destructive-token stroke contrast in both themes when the canvas palette is next revised. |

| 221 | **ADR-0031 toolbar fast-follows — three left** — _retitled 2026-08-17: this row was called "`VITE_CANVAS_TOOLBAR` ships dark during build" and described BOTH that flag and `VITE_CANVAS_WORKSPACE` as default-off and awaiting a flip. Both are **retired** (ADR-0088 D3, 2026-08-10 and 2026-08-17) and neither exists in `env.ts`. The whole rollout narrative, the flip-awaits-sign-off line and the "three layered flags" impact were expired premise; what is actually left is (c), (d) and (e) below._ | The ADR-0031 canvas-maximal toolbar layout is **the only plan workspace there is** — shipped, flipped, and its flag retired along with the alternative it selected. Three deferred fast-follows survive that history and are the entire content of this row: **(c)** the toolbar layout's **collapsed** state is session-local — `use-resizable-panel-prefs.ts:22,45` already persists `collapsed`, and `plan-workspace-toolbar.tsx` simply uses a local `useState(true)` instead, so this is one line rather than a hook rework; **(d)** on an **empty/uncalculated** plan the frame/lens/help commands are **hidden** (`isVisible: hasDiagram`) rather than shown-disabled-with-reason as the spec prefers — note this is now the minority answer in its own codebase, since ADR-0082 (menus) and ADR-0083 (fields) both settled on shade-with-a-reason, so reconcile spec↔code rather than leaving it as taste; **(e)** non-blocking a11y from the M5 audit — the toolbar does not `.focus()` the new roving stop when a `ResizeObserver` demote unmounts the focused button mid-session (falls back to `<body>`), `aria-orientation="horizontal"` is declared while Up/Down are also wired (a harmless superset), the segmented zoom presets are `aria-pressed` buttons rather than a `radiogroup`, and a manual NVDA/VoiceOver pass on the `CompactPenStatus` live region + Start/Stop/Take-over sequence is still owed. **(a) and (b) are closed** — the floating `SelectionActionsBar` stopped overlaying the scene entirely and joined the reserved chrome (workspace-chrome M3, 2026-08-13), and the three plan-chrome dialogs were deduped into `plan-chrome-dialogs.tsx` (2026-07-13). | (c) a planner's collapsed choice is forgotten on reload. (d) an empty plan gives no reason why commands are absent, which is the dead-end shape ADR-0082/0083 exist to prevent. (e) a keyboard user can lose focus to `<body>` on a resize. | Persist the collapsed state (one line); reconcile the empty-state hide-vs-shade against ADR-0082/0083 and update whichever of spec or code is wrong; clear the four a11y items, the NVDA/VoiceOver pass included. | Flip `VITE_CANVAS_TOOLBAR` default-on once signed off (**done**); mount the selection bar (**done**), dedup the dialogs (**done**); still to do: persist the collapsed state, reconcile the empty-state hide-vs-disable, and clear the non-blocking a11y recommendations as fast-follows once the layout has soaked. Rollout tracked in the flag comment (`env.ts`). |

| 32 | **`btree_gist` extension install needs `CREATE`-on-database at deploy (ADR-0036, M1)** | The M1 calendar-shift migration (`20260715120100_calendar_shift_model`) runs `CREATE EXTENSION IF NOT EXISTS "btree_gist"` — the **first** `CREATE EXTENSION` in the project — to back the GiST `EXCLUDE` non-overlap constraints on shifts/exception windows. Under ADR-0018 the self-migrating container runs `prisma migrate deploy` as the app DB role; a least-privilege managed Postgres role may lack `CREATE`-on-database. `btree_gist` is a **trusted** extension on PG13+, so a role with `CREATE` can install it, and the CI `image` smoke-boot exercises the whole migration via the entrypoint successfully — but this has not been run against a locked-down managed instance. | If the prod migration role lacks `CREATE`-on-database, `migrate deploy` aborts at container startup, blocking the entire release (not just calendars). | Before the first M1 deploy to a managed host, confirm the migration role has `CREATE`-on-database, or pre-install `btree_gist` out-of-band (superuser) so `IF NOT EXISTS` is a no-op. Record the chosen approach in `docs/DEPLOYMENT.md`. |

| 33 | **M1 minute-rework non-blocking review nits (ADR-0036)** | Non-blocking items from the M1 specialist reviews, deferred as cheap-later: (a) **security** — `durationDays` has `@Min(0)` but no `@Max`, and the new `× 1440` conversion lowers the `INTEGER` overflow threshold to ~1.49 M days; a huge value currently 500s (opaque `INTERNAL_ERROR`, no leak) instead of a clean 400 — add `@Max(3650)` to `create/update-activity.dto.ts` to match the `lagDays` pattern; (b) **api/db** — `MINUTES_PER_DAY = 1440` is redeclared locally in ~~6 files instead of importing the exported constant from `schedule/day-compat-calendar.ts` — centralise; (c) **api** — the read-side `Math.round(minutes / 1440)` silently rounds; harmless while every write is integer-day-constrained, but add a dev-only assert/log for `minutes % 1440 !== 0` once M3 makes non-day-aligned minutes reachable; (d) **backend-perf** — constraint `resolve()` is recomputed up to 3× per constrained activity across the forward/effective-Visual/backward passes — memoise the resolved constraint once per `computeSchedule`; (e) the `duration_minutes` DB `DEFAULT 480` (8 h) no longer equals "one working day" (the old `duration_days DEFAULT 1` = 1440) — defensive-fallback only (the service always sets it explicitly), note in the ADR. | All minor: (a) is a robustness/DoS-annoyance (clean 400 vs opaque 500); (b)/(c)/(e) are maintainability; (d) is a constant-factor CPU cost that multiplies exposure to the (now-fixed) calendar-walker cost. | Pick up (a)/(b) opportunistically; do (c)/(d) alongside the M3 lag-calendar wiring (when non-day-aligned minutes and per-edge calendars land); (e) is a one-line ADR note. |
| 35 | **M6-F7 float-&-critical settings review fast-follows (ADR-0035 §17/§18/§20)** — _corrected 2026-08-08: **(a) is done on the surface that ships** — `plan-chrome-dialogs.tsx:48-61,115` gives each settings group a visible `<h3>` and `gap-6`. Only the flag-off `routes/plan-detail.tsx:178-236` keeps the loose `mt-3` stack. (c)/(d) stand_ | Non-blocking items from the F7 specialist reviews (ux/component/accessibility), deferred as section-wide or cheap-later rather than blocking the flagged slice: (a) **section-wide settings grouping** — the plan "Schedule" section now stacks five settings (Calendar / Recalc mode / Expected-finish / and F7's three float-critical controls) loosely with `mt-3` and no visible sub-heading; F7 groups its three for AT via a `fieldset`/sr-only-`legend` (edit) + `aria-label`ed `dl` (read-only), but a visible heading + tighter grouping was deliberately NOT added to avoid a lone sub-heading the four siblings lack — a whole-section "group + head the settings" pass (and the `mt-3`→`mt-6` spacing nudge the ux review flagged) is owed; (b) **shared labeled-select primitive** — `SelectField` landed 2026-07-27 (#42), but the `PlanScheduleOptionSelect` helper (promoted out of `PlanScheduleSettings.tsx`) was deliberately NOT folded into it: it is richer (optimistic value, `aria-busy`, a hint that swaps to “Saving…”), so the right move is to rebuild that helper ON `SelectField` rather than flatten it — tracked in #42; (c) **saving-state not announced** — the "Saving…" hint swap isn't in a live region, so only the final success/error announces (shared with the recalc/expected-finish siblings via `useOptimisticSelect`) — a shared-hook enhancement if busy-state announcements are wanted; (d) **error-path test gap** — F7 now tests the error/rollback + busy paths, but the recalc-mode/expected-finish siblings still don't, and `use-optimistic-select.ts` has no direct unit test. | All minor; F7 itself meets WCAG 2.2 AA and its states are tested. (a)/(b) are maintainability/consistency; (c) is a shared-hook nicety; (d) is a coverage gap on the siblings, not F7. | Do the section-wide grouping/heading/spacing pass when the plan-settings area is next revised; extract `SelectField` (folding #21(e)/#34(b)) at the next `<Select>` consumer and migrate `OptionSelect` onto it; add busy-state announce to `useOptimisticSelect` if wanted; backfill the error/busy tests for the sibling pickers + a direct `use-optimistic-select` test. |
| 37 | **WBS nesting in the activities table (the canvas half is done)** | Rewritten by the 2026-08-04 reconciliation pass, which found this row still listing the **canvas summary bar** as open five days after it shipped. It did not ship in the shape this row predicted — ADR-0063 (`VITE_WBS_IMPROVEMENTS`, default-on 2026-07-30) put summaries in a **pinned top band** as a fourth canvas layer rather than as span-bars inside the scene, and deliberately lifted them **out** of the scene, so the "add a `RenderActivity` branch" remedy below was never the right one. That is worth noting on its own: a remediation column can go stale by being **answered differently**, not just by being done. The Gantt half closed earlier still (ADR-0059 M2, indented collapsible summary rows). **What is actually left:** (b) the **activities table** shows a WBS column that resolves each activity's parent to a name — it does not indent rows under their summary, so the shape of the breakdown is not visible on the one screen that lists every activity. The Project Explorer is out of scope by design: ADR-0029 stops at Client → Project → Plan and does not descend to activities. The **LOE span-bar** named alongside the summary bar in the original row is a separate, still-open item and does not belong here. | Low. The WBS is fully usable — authorable in the editor, visible on the canvas band, grouped in the Gantt, filterable in the table. A planner working from the table alone reads parentage one row at a time. | Add indented nesting to `ActivitiesTable` reusing `features/wbs/model/wbs-groups.ts` — the **same** derivation the Gantt row model and the canvas band already share (ADR-0063's rule: one derivation, never a second opinion). Component + a11y tests; a nested table needs `aria-level`/`aria-posinset` or a real `treegrid`, which is the part to get right. |
| 34 | **No all-`TWENTY_FOUR_HOUR` lag scale smoke (ADR-0036 §6)** | The existing 500-node recalc smokes (`schedule.e2e-spec.ts`) exercise only the default `PROJECT_DEFAULT` lag path, which is zero-overhead by construction. There is no structural smoke at scale with, say, 500 edges **all** carrying `TWENTY_FOUR_HOUR` — the one path whose per-edge cost actually changed (0 → a few binary-search calendar calls). The engine unit test already proves _termination_ of a single ±11-year elapsed lag (`compute.lag-calendar.spec.ts`, N16), so this is the many-edge axis, not the huge-lag axis. (The row's second half — four copy-pasted `<Label>`+`<Select>` blocks across the dependency dialogs — is done: they are `SelectField` as of 2026-07-27.) | A coverage gap, not a suspected defect: the code is sound by reasoning plus the termination test, and it only bites on the rare all-24H plan. | Add the smoke next to the existing calendar-load smoke when that e2e is next touched — it would turn "O(log) by inspection" into a measured fact. |
| 40 | **Contributor cost-progress wiring (EV2a security review)** | Was a two-part row; **(a) is done** (2026-07-18): `@Max(MONEY_MINOR_UNITS_MAX)` on the integer-money fields and `@Max(DECIMAL_18_4_MAX)` on the `Decimal(18,4)` fields, with boundary-reject specs. What remains is (b): a Contributor can record progress but the cost-side inputs that progress implies are not wired to that role's write path. | Low — the fields exist and are validated; the gap is which role may edit them, and Contributors currently cannot, which is the safe direction to be wrong in. | Decide whether cost progress is a Contributor capability or stays Planner-only, then wire (or document) it explicitly rather than leaving it an accident of which endpoint shipped first. |
| 42 | **`SelectField` migration residue (was: composite not extracted)** — the primitive **landed 2026-07-27**; what remains is the sites it deliberately did not absorb. | A survey while extracting found the idiom hand-assembled **33×** across 15 files, not the ~6 this row claimed. `SelectField` (`components/ui/form.tsx`) now owns the label/hint/error/`aria-describedby` wiring and **16 sites moved onto it** (all seven in `ActivityFormDialog`, the five dependency-dialog selects, the cross-plan type + lag calendar, plan status, invite role). Not migrated, each for a stated reason: **(a)** the four **flag-forked** pickers (activity calendar, assignment resource, plan calendar, resource calendar) render a `Combobox` or a `Select` under one label — `SelectField`'s `renderControl` escape hatch exists for them but the fork also carries its own busy/optimistic state, so moving them is a behaviour change, not a lift; **(b)** the **optimistic-select family** (`PlanScheduleOptionSelect` and the `PlanRecalcModePicker` / `PlanExpectedFinishToggle` / `PlanCalendarPicker` siblings) — already extracted locally, and richer (optimistic value, `aria-busy`, a hint that swaps to “Saving…”); the right move is to rebuild **that** helper on `SelectField`, not to flatten it; **(c)** `CalendarFormDialog`'s Scope select, which reuses one `scopeErrorId` on two mutually-exclusive paragraphs — a real defect to fix on its own, not inside a refactor; **(d)** the five library/table **filter** selects, whose `aria-describedby` points at explainer paragraphs rendered outside the block (supported via the merge, but they are a filter row, not a form field); **(e)** `MembersTable`'s in-cell role select (no visible label, by design) and `OrgSwitcher` (a raw `<select>` with hand-copied chrome that has drifted from the primitive — its own bug). | Low and now bounded: the 16 migrated sites share one implementation, so the next a11y fix lands once. The residue is (a)/(b) genuinely different components, (c)/(e) latent defects worth their own change, (d) a judgement call. | Rebuild `PlanScheduleOptionSelect` on `SelectField` (absorbs (b), and then (a) becomes a lift rather than a rewrite); fix the duplicate `scopeErrorId` (c) and `OrgSwitcher`'s drifted chrome (e) as small standalone changes. Supersedes the `SelectField` asks in #21(e) and #34(b), which are now met. |
| 43 | **Resource-histogram bucket size not URL-deep-linkable (M7 rung-5 ux review)** | The histogram's Day/Week/Month `granularity` is component-local `useState`, so it can't be shared/bookmarked and resets to the WEEK default each open — unlike the URL-state convention (TanStack Router) the app uses for other view selections. | Minor: a planner re-picks the bucket size each time; nothing is lost. | Lift `granularity` into the plan route's search params (like other URL-derived view state) so the histogram opens on, and can be linked at, a chosen bucket size. |
| 45 | **Inter-project M2 (programme scheduling) web fast-follows (ADR-0045, IPD-M2 reviews)** — _corrected 2026-08-08: **(c) is smaller than written**. The shared strip primitive it asks to extract already exists as `components/ui/notice-strip.tsx`; the work is migrating four hand-rolled boxes in `ProgrammeScheduleSection.tsx:143,161,169,181` onto it_ | Non-blocking items from the M2 specialist reviews (ux/component), deferred behind `VITE_PROGRAMME_SCHEDULING` (default-off): (a) **ux** — the cross-plan link surface lives only on the flag-off plan-detail route + the flag-on canvas workspaces, but the flag-on **toolbar-hosted** layout (ADR-0031) mounts `ProgrammeScheduleSection` inside the workspace body rather than integrating a programme-recalc affordance into the toolbar chrome band; a first-class toolbar item is owed once the surface is considered for default-on; (b) **ux** — the cross-plan-link **picker** (`AddCrossPlanLinkDialog`) loads only page 1 of candidate predecessor plans/activities with no pagination or type-ahead, so on a large org a valid predecessor beyond the first page can't be selected — add search/pagination before default-on; (c) **component** — the stale/423/422 notice blocks in `ProgrammeScheduleSection.tsx` repeat a bordered "banner" shape (`role="status"`/`role="alert"` + icon-less coloured box) that also recurs elsewhere — extract a shared `Banner` primitive; (d) **component** — the cross-plan dependency-type / lag labels are duplicated inline rather than hoisted to a shared `lib/` constant (overlaps the existing dependency-label duplication); (e) **ux (flag-off race)** — adding a cross-plan link from the successor's Logic panel invalidates the org schedule namespace (to surface the programme section), which can racily unmount the still-open Logic panel — a planner sometimes has to re-open it to see the new "Driven by" edge (the flag-on programme e2e re-opens the panel to stay deterministic). Keep the panel open across the create's invalidation (e.g. a scoped invalidation or a stable dialog subtree) before default-on. | All minor; the M2 surface is behind a default-off flag and meets WCAG 2.2 AA. (a)/(b) are usability gaps that only bite at scale/once default-on; (c)/(d) are maintainability; (e) is a transient panel-close annoyance (the write always succeeds — the programme section appears regardless). | Before flipping `VITE_PROGRAMME_SCHEDULING` on: add a toolbar-integrated programme-recalc affordance for the toolbar-hosted layout, search/pagination to the cross-plan picker, and keep the Logic panel open across a cross-plan add. Extract a shared `Banner` primitive and hoist the cross-plan label constants to `lib/` when the next consumer lands. |
| 46 | **Notes M2 API non-blocking review items (ADR-0046, notes reviews)** | Non-blocking items from the Notes M2 specialist reviews (api/security/backend-perf). All three passed with no blocking findings; deferred: (a) **api** — the flat `NotesController` has no `GET …/notes/:noteId` single-item read (unlike the `dependencies`/`cross-plan-dependencies` flat controllers), so a client that gets a 409 "stale — refresh" on `PATCH …/notes/:noteId` must re-page the whole thread to refetch the one note; add `GET :noteId` for parity + a cheap 409-retry target when convenient (the flagged web M3 refetches the thread on 409, so it isn't blocking). (b) **api/backend-perf (repo-wide)** — the shared `PaginationQueryDto.order` (`asc`/`desc`) is accepted + Swagger-documented but silently ignored on the note-list endpoints (both directions hard-coded newest-first); this is a pre-existing repo-wide pattern also present in `dependencies`, not a notes regression — honour `order` or drop it from the base DTO for endpoints that don't support it, repo-wide. (c) **backend-perf (scale watch-item)** — `listByPlan` leads with `plan_id` against the **full** (non-partial) `notes_plan_id_created_at_id_idx`, so `entity_type='PLAN'` + `deleted_at IS NULL` are applied as post-index-scan filters; for a plan with a very high ratio of ACTIVITY→PLAN notes the backward index scan may heap-fetch many non-matching rows before filling a page. This is the accepted M1 index trade-off (ADR-0046 / `docs/DATABASE.md`), not an M2 defect. (d) **security (hardening)** — `NoteRepository.findAuthorNames` does an org-unfiltered `user.findMany` by id set; safe today (ids only ever come from already-org-scoped notes) but enforce that invariant (a guard/typed wrapper) rather than only documenting it, before the helper gets a second caller. | All non-blocking; M2 passed api + security + backend-perf review. (a) is a small ergonomic gap masked by the web thread-refetch; (b) is a pre-existing repo-wide DTO nit; (c) is an accepted, documented index trade-off (watch under skewed load); (d) is defence-in-depth on a currently-safe path. | Add `GET :noteId` (or document the omission) when the notes API is next touched; fix the `order` param repo-wide (honour or drop) as its own change; `EXPLAIN ANALYZE` `listByPlan` once a realistically activity-note-skewed dataset exists and add a partial `(plan_id, created_at, id) WHERE entity_type='PLAN' AND deleted_at IS NULL` index if it degrades; tighten the `findAuthorNames` scoping invariant before a second caller. |
| 48 | **TSLD export & print fast-follows (Stage C1, `VITE_EXPORT_PRINT`)** | Deferred by decision / from the six C1 reviews (all passed; the four blocking findings were folded before flip). (a) **ux/a11y** — app-handled **`Ctrl/Cmd+P`** is not wired: the native shortcut still prints the raw app chrome + one-viewport canvas bitmap rather than routing to the whole-diagram image path (US-4). Deferred deliberately — intercepting the browser print shortcut is a known footgun; add an opt-in app handler if planners ask. (b) **perf/devops** — no **CI bundle-budget gate** exists yet (the budgets in `docs/FRONTEND_QUALITY.md` are advisory until the walking-skeleton roadmap item); jsPDF is the first heavy lazy dep, so a `size-limit`/visualizer check asserting the jsPDF chunk stays off the initial bundle and under the per-lazy-chunk budget is now worth wiring. (c) **devops** — the **web image SBOM** (Syft over the nginx runtime stage) enumerates OS packages but not bundled npm components (`jspdf` et al.), because the runtime stage carries only built `dist/` assets — a structural gap for the SPA image, not specific to jspdf; add a build-stage CycloneDX/`pnpm licenses` SBOM artifact if npm-level completeness is wanted. (d) **perf** — the whole-diagram export raster caps at 8192 px/side (~256 MiB RGBA worst case); fine on desktop but a lower ceiling or a device-memory caveat may be warranted for constrained mobile. (e) **component** — the export image legend (`EXPORT_LEGEND`) and CSV column set are hand-authored mirrors of the live `TsldLegend` / activities table rather than a shared source; low-risk drift on a legend key / an intentional CSV superset, but a shared-source pass is owed if either grows. | All minor; C1 shipped with security/devops/perf/a11y/ux/component reviews green and the four blockers folded. (a) is a deliberate UX call; (b)/(c) are pre-existing repo-wide gaps this stage surfaces; (d) is a bounded, documented product cap; (e) is maintainability. | Wire an opt-in `Ctrl/Cmd+P` handler if requested; add a CI bundle-budget check now that a heavy lazy dep landed; add a build-stage npm-level SBOM artifact for the web image; revisit the raster cap / add a mobile caveat; extract a shared legend-entries + CSV-column source when either next changes. |
| 49 | **Nest `ThrottlerGuard` storage is in-process memory (per-replica)** | From the Stage F F-M3 security review (ADR-0051 guest read surface). The app-wide `ThrottlerModule.forRootAsync` (`app.module.ts`) declares no `storage`, so rate-limit buckets live in each API process's memory. Under horizontal scaling the global default (100/60 s) and the tighter guest-surface limit (30/60 s, the first genuinely unauthenticated surface) are enforced **per replica**, so the effective ceiling multiplies by the replica count. Sibling gap to #14(b) (Better Auth's own in-memory rate-limit store), which already calls for a Redis backing before scaling out. Trust-proxy resolution of the real client IP (the other half of a correct per-IP limit) **was** fixed in F-M3 (`app-setup.ts` now sets Express `trust proxy` from `TRUSTED_PROXY_IPS`). | Single-replica today, so the limit holds; the gap only opens on scale-out, where a scraper/DoS gets N× the intended request budget against the unauthenticated guest surface. | Back Nest's `ThrottlerModule` with the shared Redis store (`@nest-lab/throttler-storage-redis` over the ADR-0010 Redis) at the same time as #14(b)'s Better Auth store, before the API runs more than one replica. |
| 51 | **TSLD visual-refresh fast-follows (ADR-0052 M4/M5, `VITE_CANVAS_DIRECT_MANIPULATION` reviews)** — _corrected 2026-08-08: **(a)'s premise is expired**. Eight `render/paint.*-budget.test.ts` counting-stub gates plus the `measure:draw` Chromium harness now exist; what is true is that they count **calls, not milliseconds**, and the millisecond question is **#75**. (b)/(c)/(d) stand_ | Non-blocking items deferred from the M4/M5 specialist reviews (perf/component/ux), all behind the default-off flag: (a) **perf** — there is still **no automated draw-budget/perf gate** for the TSLD canvas: ADR-0026's ≤ 4 ms p95 @ 2,000-activities budget is documented but unenforced in CI, and M5 briefly shipped a per-frame `computeEdgeFanOut` recompute (5–11 ms alone at 2,000 activities / 4,000 edges) that only review caught — a benchmark test (e.g. a vitest bench or a Playwright trace assertion over the synthetic 2,000-activity scene) would have failed it automatically. (b) **perf** — `classifyHit` iterates **all** activities per call (per pointer-move while the resize/lag zones are armed); cull the candidates to the visible set / a spatial bucket before default-on so hover cost is bounded by the viewport like the paint. (c) **ux** — the lag-run dash pattern (`[2,2]`) vs the non-driving link dash (`[4,3]`) may be too subtle a distinction at typical zoom; consider a visually distinct treatment (weight/colour-with-shape or a tick pattern) if planners misread lag runs as slack ties. (d) **component** — the M5 fan-out `elbowShift` derives from the **predecessor-side** offset only (`routeOrthogonal`'s last argument), so a bundle crowded ONLY on the successor side with identical anchor days gets no elbow separation — the lines still overlap on their vertical run. | All minor and flag-gated: (a) is a repo-wide testing gap the M5 near-miss made concrete; (b) only bites on very large plans with editing armed; (c)/(d) are legibility polish on rare topologies. | Add an automated canvas draw-budget check (bench or trace-based) before the flag flips default-on; cull `classifyHit` to visible candidates; revisit the lag-run treatment with planner feedback; fold the successor-side offset into `elbowShift` when the fan-out is next touched. |
| 53 | **Library `q` search is an unindexed (bounded) ILIKE — `pg_trgm` GIN deferred (ADR-0053 §4 / M4)** | The M4 search on `calendars`/`resources` uses Prisma `contains` + `mode: 'insensitive'`, i.e. `name ILIKE '%q%'` (OR'd with `code` on resources). A **leading-wildcard, case-insensitive** match is not a btree range, so no existing or addable btree index can serve it — not the `(organization_id, created_at, id)` composites, not `text_pattern_ops` (left-anchored only), not an expression index on `lower(name)` (prefix only). The chosen plan is deliberate: the leading equality on `organization_id` bounds the candidate set to **one tenant** in cursor order and the ILIKE is a recheck over it — a bounded filter, not a table-wide seq scan, at the ADR-0053 sizing of ≲1,000 calendars / ≲5,000 resources per tenant. For the same measure-first reason the archive filter added **no** index: `archived_at` is tri-state (`exclude`/`include`/`only`), so a partial `WHERE archived_at IS NULL` twin would serve only the default and would today be a byte-for-byte duplicate of the existing composite (no row is archived yet). | Low today and bounded by tenant size; it degrades linearly if a tenant's library grows well past the assumed ceiling (import-heavy tenants are the likely first case), or if archived rows come to dominate a library so the default list scans mostly-filtered entries. Both show up as list/search p95 creep, never as incorrect results. **Measured at the ADR-0053 ceiling during the M6 backend-performance review** (Postgres 16, every migration applied, one org seeded with 1,000 calendars / 5,000 resources): worst-case resource search (no match, full candidate scan) **3.8 ms**; a match at the tail of cursor order **3.2 ms**; the 1,000-calendar case **0.56 ms** — all two orders of magnitude inside the 200 ms p95 budget, confirming the deferral is correct at the stated scale. A committed seeded-benchmark test (so the claim is pinned in CI rather than living in a migration comment and this row) is still outstanding. Escalate only on further measurement (`docs/PERFORMANCE.md`): (a) a `pg_trgm` GIN index on `lower(name)` (`gin_trgm_ops`) — note it needs `CREATE EXTENSION pg_trgm`, a privileged one-off DDL step the app's DB role may not hold, which is part of why it is deferred; (b) a partial `(organization_id, created_at, id) WHERE deleted_at IS NULL AND archived_at IS NULL` composite if archived rows dominate; (c) a partial ORG-tier calendar composite if PROJECT rows dominate the org list (ADR-0053 "Follow-ups"). |
| 56 | **Pure gesture→overlay helpers live in `TsldCanvas.tsx` rather than a pure module** | Raised by the ADR-0054 M6 component review against `gestureSourceId` / `gestureGhostDetail`, but the finding is older and wider than this epic: `ghostRect`, `liveResize`, `lagChip` and their siblings — all pure `GestureState → overlay geometry` functions with no React, DOM or canvas dependency — already sit at the top of `apps/web/src/features/tsld/components/TsldCanvas.tsx` and are exported solely for unit tests. The ADR-0026 architecture puts pure render logic in `features/tsld/render/*`, so the whole cluster is on the wrong side of that seam. Moving only the two new ones was rejected as making the file _less_ consistent, not more. | Maintainability only — the functions are pure and fully unit-tested where they are. Cost is that a reviewer must read a 1,500-line component file to review pure geometry, and that the component file is the de-facto home for logic the architecture says lives elsewhere. | Move the whole cluster to a `render/gesture-overlay.ts` module in one pass (mechanical: re-export, update the two test files' imports), rather than migrating helpers piecemeal as each epic touches them. |
| 57 | **The recycle-bin list's page walk, now indexed — what is left is the walk itself** — _measured and half-closed 2026-08-18 (ADR-0096 D6)_ | The missing indexes are **shipped**: `(organization_id, deleted_at DESC, id) WHERE deleted_at IS NOT NULL` on all three tables (`20260818120000_recycle_bin_deleted_at_indexes`). One whole screen open on the largest seeded organisation (8,773 deleted rows, 88 pages) went **1,208 ms → 466 ms**. What remains is that `use-deleted-items.ts:24` still walks every page via `apiFetchAllPages`. | Low, and now **deliberate**. ADR-0096 groups the list by delete batch client-side, and a group shown partially would be **wrong** — "Client + 2 items" when a third sits on the next page is a false statement about what a Restore will bring back. So the exhaustion walk is the thing that makes grouping correct, not an oversight to remove. | **Standing rule, recorded so a future performance fix cannot quietly break restore-grouping: this route stays fetched-to-exhaustion for as long as the client groups by batch.** Windowing it requires either a server-side grouping or a per-group "may be incomplete" flag — a design change, not a tuning change. The measured next win is not paging at all: PostgreSQL 16 generates **no Merge Append** over this `UNION ALL` (verified by forcing `enable_sort = off`, which produced a Sort at disable-cost, so no ordered path exists), so pushing `ORDER BY … LIMIT` into each branch takes the same walk **466 → 239 ms**. That is a `recycle-bin.repository.ts` change and is not blocked on anything here. Separately: the parent join is unbounded by organisation, hashing whole `clients`/`projects` tables. |
| 83 | **ADR-0068 §6 promises a count the calendar editor does not show** | §6 states the editor "names how many activities' displayed durations will change" when hours-per-day is edited, following the ADR-0053 §2 per-class-count pattern. What shipped is the consequence without the count ("an activity showing 10 days today will show a different number"), because no endpoint returns that count — it needs a per-calendar usage read across activities and plans. The ADR is corrected to record this as deferred rather than left describing a feature that does not exist (ADR-0058's rule). | Low: the warning is accurate, just less specific than promised. | A `GET …/calendars/:id/usage` returning the affected-activity count, or an amendment dropping the requirement if the count proves not worth the read. |

## Principles for managing debt

- Prefer paying debt down opportunistically while touching nearby code.
- Never add **undocumented** debt: if you take a shortcut, add a row here.
- Security- and data-integrity-related debt is prioritised above convenience.

## Detailed items

The table above carries the older, one-line rows. Items that need more than a table cell get a
section here. Both are the same register — the split is how much explaining a row needs, not how
important it is.

Headings are `### <number>. <title>`, always — so a row is a **child** of this section. A row
written `## ` is a **sibling** of `## Detailed items`, which puts it outside the section that
contains it.

**Normalised 2026-09-01** (`docs/TECH_DEBT.md` #227): 31 rows had drifted to `##` and are now `###`.
Two things that paragraph got wrong are corrected with it. It said **three** rows had drifted, which
was already wrong by a factor of ten when ADR-0120 — whose entire subject was this file — was
written; the count had reached 70 of 100 by the time #227 measured it, and 31 of 60 by the time it
was fixed. And its explanation was **inverted**: it said `##` "made every detailed item a child of
Principles for managing debt … rather than a sibling of its peers", and the nesting works the other
way round. A reader checking the rule against the document was told two things, one false and one
backwards.

### 58. The tiered ruler and TODAY chip (ADR-0055 S4, deferred)

**Status:** unverified

> **Half done 2026-08-08 — in a different shape than specified.** The **TODAY chip shipped** as
> ADR-0056's canvas Today pill (`render/paint.ts:1339-1364`, `TODAY_CHIP_TOP`), not as the DOM chip
> this row describes. Only the **tiered ruler** remains (`TsldCanvas.tsx:1714-1722` is still three
> plain rows, year pinned left, no month tint). The row read as though neither half existed.
>
> **And the note above inverted on 2026-08-22, which is why it is corrected rather than replaced.**
> ADR-0106 (#148) deleted that canvas pill and shipped **the DOM chip this row originally asked
> for** — `Today` is now a DOM marker in the ruler band, on a row of its own, beside `Data date`.
> So the half this note called "a different shape than specified" has since become the specified
> shape, by a route nobody planned: an epic about a label covering a bar, not about this row. Both
> line citations are stale too — `TODAY_CHIP_TOP` no longer exists, and `TsldCanvas.tsx:1714-1722`
> is now the cursor-readout block. **What genuinely remains is the tiered ruler alone** (year
> centred / month names / day numbers, month tint), and it is worth noting that the band is no
> longer three rows but five: three tick rows plus two marker rows, whose y a redesign must respect
> (ADR-0106 D3 — the year label may never be occluded).

S4 landed the canvas month bands — the diagram on its own banded ground — but deliberately stopped
short of the tiered ruler redesign (year centred / month names / day numbers) and the TODAY chip.
Both are DOM work over the canvas, both were specified (`docs/specs/designed-ui/`, S4-F2), and both
were held back rather than rushed alongside a change to the painter's hot path in the same slice.

They are additive and behind the same `VITE_CANVAS_VISUAL_LANGUAGE` flag, so they can land as their
own slice without re-opening anything S4 shipped.

### 60. The Gantt's scroll behaviour is unmeasured on real hardware

**Status:** unverified

The Gantt's substrate decision (ADR-0059 §1) rests on one claim: the live node count is bounded by
the viewport, not by the plan. That claim **is** measured — the flag-on Playwright journey
(`apps/web/e2e-gantt/gantt-scale.spec.ts`) seeds two plans an order of magnitude apart through the
API and asserts they render the identical row window, in a real browser, with the real virtualizer.
It is a structural assertion and it means the same thing on every machine.

What is **not** measured is how a 2,000-row programme _feels_ to scroll on the hardware a planner
actually uses. That is the same gap as #59 and for the same reason: the only browser available to
CI is a headless Chromium on a shared cloud runner, with no GPU compositor and no comparable
thermal profile. Row virtualization makes the per-frame cost independent of plan size in principle,
which is why this did not block the M6 flip — but "in principle" is exactly the phrase #59 exists
to distrust.

**What would close it:** open a 2,000-activity plan in the Gantt under DevTools on the ADR-0026 §9
envelope (a mid-tier laptop, iPad-class Safari), record dropped frames while scrolling, and note
the numbers in ADR-0059. Deliberately **not** turned into a CI gate: a millisecond threshold
measured on a runner would be noise dressed as a guarantee.

### 62. `canReadCost` is derived from the role because the DTO cannot say

**Status:** unverified

The activity DTO returns `null` for a cost field that is **unset** and `null` for one the caller
**may not read** — the two are indistinguishable on the wire. So the tabbed activity editor
(ADR-0060 §6) decides whether to show its Cost tab from the caller's role, via
`deriveActivityEditorGating`'s `canReadCost` input, rather than from the payload.

That is sound **today** and only today: `cost:read` and `activity:update` are granted to exactly
the same roles (Planner and Org Admin, `org-permissions.ts`), so "can edit the activity" and "can
see its money" coincide, and the derivation cannot be wrong. It is a coincidence the code depends
on without being able to check.

The day those permission sets diverge — a role that may edit an activity but not see its cost, or
the reverse — the client will show or hide the Cost tab incorrectly, and no test will fail,
because every test asserts the current coincidence.

It now has a **second consumer**: the activity editor's Resources tab passes the same
`gating.cost.readable` into `ActivityResourcesPanel`, so an assignment's money fields follow the
Cost tab's answer rather than its own. That widens the blast radius of the coincidence without
changing its nature — one derivation, two surfaces.

**What would close it:** have the API say so rather than making the client guess — either a
`meta.permissions` block on the activity read, or a distinguishable "redacted" marker on the cost
fields (not `null`). Until then, treat the permission sets as coupled: changing one without the
other is a client bug in a different file.

> **The interim rule is now enforced, 2026-09-01** — `org-permissions.spec.ts` asserts that every
> role holds `cost:read` and `activity:update` together or holds neither. **The row is not closed
> by it**: the architectural gap is unchanged, and the DTO still cannot say. What changes is the
> failure mode. A divergence used to be silent — correct API, correct guards, a client in another
> workspace showing or hiding money for the wrong people, with every test green — and is now a red
> build in the diff that causes it.
>
> Its detection power was **established by running it, not argued**. Both permissions were already
> pinned above it to the same literal role set, so against a bare divergence it adds nothing: three
> assertions go red together. The case that separates them is the one that would really happen —
> narrow `cost:read` to Org Admin **and update the literal expectation to match**, which is what
> anybody does when a test fails on a change they meant to make. Tried: the whole pre-existing
> suite stayed green and **one** test failed, this one. It survives because it asserts a
> relationship rather than a role set, so bringing a literal into line cannot silence it — the
> assertion has to be deleted deliberately, which is the moment a reader meets #62.
>
> This is ADR-0058's move applied to a rule the row had already written down and left to memory.

### 64. `AssignmentRow` unmounts its editors when the pen goes, dropping focus to `<body>`

**Status:** open · **Verified:** 2026-09-01 · **Size:** M · **Owner:** web

> **Most of this row was discharged by ADR-0083 and nobody closed it** — found by the 2026-09-01
> verification sweep, and it is a **half-executed** close: that ADR's own step 8 says _"Delete #64
> and #66 from `docs/TECH_DEBT.md`, add both numbers to Closed numbers"_, and **#66 was closed on
> 2026-08-31 while #64 was not.**
>
> What the row used to claim, and what is true today:
>
> - _"The fields … are still natively `disabled` when the scope is un-writable."_ **False.**
>   `components/ui/form.tsx` implements ADR-0083 throughout: `TextField` takes `readOnly` (`:113`),
>   `TextareaField` likewise (`:395`), `CheckboxField` takes `aria-disabled` plus a `preventDefault`
>   click guard (`:324-331`). `SelectField` keeps native `disabled` (`:225`) as ADR-0083 D1's
>   **named exception with its cost stated** — a recorded decision, not debt.
> - _"What would close it: extend the `aria-disabled` treatment … to the form primitives."_
>   **Discharged, and by a more careful mechanism than this row proposed** — ADR-0083 D1 rejected
>   blanket `aria-disabled` and split the treatment by what the control can do besides hold a value.
> - _"`ActivityResourcesPanel`'s assign fields … sit inside exactly the window this entry
>   describes."_ **Fixed**: that form sits under `<FieldGateProvider gate={assignGate}>`
>   (`ActivityResourcesPanel.tsx:359`), whose own comment names this row.

**What survives is one thing, and it is the worst case the row ever named.**
`AssignmentRow.tsx:511` is still `{canWrite ? ( …eight editors… ) : ( <p>…summary…</p> )}`. On
`canWrite` going false it does not shade its editors, it **unmounts** them for a read-only summary
line — a **guaranteed** focus-to-`<body>` rather than a possible one (WCAG 2.4.3), in a tab of a
long-lived editor session where the pen can be taken by another user at any moment (ADR-0028).

Its neighbouring controls are already correct (`:450`, `:602`, `:662` all shade rather than
disable), which is moot while the whole subtree unmounts around them.

**Already specified**: ADR-0083 D5 cites this exact line and schedules it as **M3** (_"`AssignmentRow`
(#64's worst case)"_), which has not landed. So no new spec is owed — the work is to delete the
summary branch and move six hand-rolled controls onto the gated primitives, plus tests.

**Sequence it with #69**, whose remedy may move `AssignmentRow` to a different editing idiom
altogether; doing this first and that second would rewrite the same file twice.

### 69. Two idioms for editing a row in place

**Status:** unverified

`AssignmentRow` saves each field with its own inline button; `DependencyTable` opens a dialog per
row. Both are defensible on their own and they now sit two tabs apart in one editor, so the
inconsistency is visible in a way it was not when each lived in its own pop-out.

**What would close it:** pick one row-edit idiom and state it in `docs/DESIGN_SYSTEM.md` (the
list/manage archetype is the natural home), then move whichever surface loses. Raised by the
ADR-0062 component gate as a suggestion — deliberately not rushed inside the epic that noticed it.

### 70. The API e2e harness cannot reproduce a same-plan write race

**Status:** unverified

The WBS re-parent path takes the plan advisory lock so two mirror re-parents cannot both pass a
still-acyclic ancestor walk (ADR-0038 invariant (a), fixed in the WBS-improvements M0). The natural
regression test — two mirror `PATCH`es fired with `Promise.all`, the shape used by
`resource-hierarchy.e2e-spec.ts` and `dependencies.e2e-spec.ts` — **does not actually race** in this
harness: instrumenting the ancestor walk showed the second request beginning ~15 ms _after_ the
first transaction had already committed, on two separate keep-alive sockets, so it passes
identically with the lock removed. Concurrency itself is fine (two interactive Prisma transactions
were measured interleaving correctly) — the requests are serialised somewhere earlier in the
in-process Supertest path.

The consequence is that the three existing "serialises concurrent mirror X" e2e tests are weaker
than they read: they prove the rejection path, not the serialisation. The lock is gated instead by
unit tests that assert the acquisition and its ordering directly, and fail when it is removed.

**The second of the two remedies landed 2026-09-01, and it was the honest one.** The row offered
either driving the race below HTTP _or_ accepting the HTTP tests as invariant tests and renaming
them so they stop implying a guarantee they do not make. All three are now named for what they
prove — `rejects the mirror re-parent …` rather than `serialises concurrent …` — and each carries
the same scope note, in the file, saying that the harness serialises the two requests and that the
lock's own acquisition and ordering are gated by unit tests. A test whose name overstates it is
worse than a missing one, because it stops anybody writing the real one.

**What remains open is the first remedy**: driving the race below HTTP (two concurrent service
calls, or two hand-rolled transactions racing the read-then-write with a barrier between the read
and the write). Until then, **do not add another "serialises concurrent …" e2e test** — treat that
as a gate. Renaming does not make the harness able to race; it makes the estate stop claiming it
can.

### 72. The bulk-selection checkboxes are hand-rolled

**Status:** open · **Verified:** 2026-09-01

**The target-size half closed 2026-09-01 and the primitive half did not**, so the row is narrowed
rather than deleted.

~~Bulk-selection checkboxes are a 16px target~~ — **fixed.** Both boxes in `ActivitiesTable` (the
select-all and the per-row) now sit inside a `size-6` `<label>`, so the pointer target is 24 × 24
while the painted box stays 16 px: this widens what a pointer may hit, not what a reader sees. It
was a **WCAG 2.2 §2.5.8 (AA)** failure with no exception available, and it sat outside every
instrument that could have said so — the target-size sweep is scoped to the command surfaces, and
axe's `target-size` rule is tagged `wcag22aa` (which no scan here requests) _and_ ships
`enabled: false`. It is now pinned in `e2e-wbs/wbs.spec.ts`, which is the suite whose fixture has a
`WBS_SUMMARY` and therefore renders the selection column at all — **verified red first**, naming
every checkbox at 16 × 16. It was first written into `e2e-workspace-fit`, where its own pinned
positive fired ("no selection checkboxes found"): a sweep of a table that never renders the column
reads as coverage while testing nothing.

**What survives is the original component finding.** The boxes are still hand-assembled where
`CheckboxField` (`components/ui/form.tsx`) exists, and the selection column is the fifth occurrence
of that shape. It is not a regression — `TsldViewControls` and the toolbar registry already
hand-roll the same className for compact inline toggles.

**What would close it:** widen `CheckboxField` to support a visually-hidden label and trailing row
content — the two reasons a straight swap is not free today — then move all five call sites, and
make the table row itself the hit target. That is a **primitive's public contract** and therefore
needs a spec (ADR-0105), which is why the accessibility half was taken on its own. Raised by the
ADR-0063 M6 component and UX gates.

### 74. The plan advisory lock's contention headroom is unmeasured

**Status:** unverified

> **Narrowed 2026-08-09 (programme M5), and the largest input changed.** This row asked what happens
> when a writer waits on a plan lock held by a long transaction. The longest such transaction — a
> 2,000-activity bulk delete — went from ~10,000 statements to four (#109), so the thing being waited
> on is an order of magnitude shorter than when this was written.
>
> **Transaction timeouts now exist at all.** There was no explicit timeout anywhere in `apps/api`,
> so every transaction ran on Prisma's 5-second default, including the ones that take the plan lock
> and sweep thousands of rows: `prisma.service.ts` sets a **15 s global** ceiling and the bulk paths
> override to **60 s** (CQ-6 — a global sized for the worst case stops protecting the common one).
>
> **What is still unmeasured, and it is the row's actual subject:** the wall-clock hold time on a
> seeded 2,000-activity plan, and how a concurrent writer behaves against it. The numbers above are
> a statement count and a citation to ADR-0053 M6's measurement of the same shape — neither is a
> reading taken on this path. That measurement is the whole of what remains.

Five write paths now serialise on the same per-plan advisory key — activity create/update (parent
branch), the batch membership write, dissolve, and recalculate — and none of the `$transaction`
calls sets an explicit timeout, so they share Prisma's 5 s default. At the ~2,000-activity ceiling,
if recalculate's hold time approaches that default, a batch WBS write queued behind it would fail
with a P2028 timeout rather than waiting cleanly.

**What would close it:** seed a 2,000-activity plan, measure recalculate's hold duration on the key
and a concurrent `PATCH …/activities/parents`'s wait, then set explicit transaction timeouts against
the measured numbers. _(Partial input, 2026-08-28: the health M6-T0 run measured the whole
recalculate ROUTE at 694.3 ms p95 on a synthetic 2,000-activity chain plan —
`docs/specs/schedule-health-check/m6-measurement.md` — which bounds the lock hold well under the
5 s default on that shape. Indicative, not the concurrent-wait measurement this row asks for; the
row stays open.)_ Raised by the ADR-0063 M6 backend-performance gate as an open risk, not a
confirmed defect — the design (plan-scoped key, skipped on the uncontended path) is otherwise sound.
Related: the parent-chain walk inside that lock has **no depth cap**, unlike the resource tree's
documented ≤ 10 (ADR-0053 §3).

### 75. The draw budget, measured on real hardware — and the budget itself was misquoted

**Status:** unverified

> **Correction, 2026-08-03 — read this before the rest of the row.** This entry was opened as "is
> ≤ 4 ms p95 the right draw budget?", and ADR-0065, the runbook and every discussion since have
> repeated it. **All of that is wrong on two counts, checked against the ADR's own text.**
>
> 1. **There is no §16 in ADR-0026.** Its sections run to §9a; the prototype gate is **§9**, the
>    result is **§9a**. Every "ADR-0026 §9" citation in this repository points at a section that
>    does not exist. (ADR-0026 itself says "the §16 target hardware envelope", which is where the
>    number was picked up and propagated.)
> 2. **4 ms was never a budget.** It is the **measured p95 draw time of the throwaway 2026
>    prototype** (§9a's table), recorded as a **PASS against a stated frame budget of ≤ 16 ms**.
>    The actual pass/fail gate in §9 is expressed in **frames per second**: **≥ 45 fps @ 500 and
>    ≥ 30 fps @ 2,000** under sustained pan/zoom/drag, with interaction feedback < 100 ms.
>
> So this row spent months asking whether a result was the right target, and the earlier entries
> below — including the ones written today — argue at length that the budget should be re-expressed
> as frame pacing. **It already was.** §9 has been an fps gate the whole time; nobody read it.
> This is ADR-0058's rule ("verify the claim; do not trust the document") failing on the very row
> created to enforce it, which is why the correction is kept here rather than quietly rewritten.
>
> **Against the real gate, both 2026-08-03 readings PASS** — see the verdict at the foot.

ADR-0026 §9a's prototype measured 4.0 ms p95 at 2,000 activities, and #59 records that it had never
been re-measured on real hardware — the "final device-fps confirmation" §9a explicitly deferred to
M1. It now has been. First by `apps/web/scripts/measure-link-routing.mjs`,
which paints the real `paintScene` against a real 2D context in Chromium over 120 panning frames at
2,000 activities and ~1,500 long-range dependencies:

| zoom                                 | routing off (p50 / p95) | routing on (p50 / p95) |
| ------------------------------------ | ----------------------- | ---------------------- |
| whole plan (2px/day, nothing culled) | 13.3 / 16.7 ms          | 17.7 / 22.6 ms         |
| week (12px/day, cull working)        | 18.1 / 23.1 ms          | 21.6 / 26.9 ms         |

**The `routing off` column is today's shipped painter**, so the overrun is pre-existing and was not
caused by ADR-0065 — that change adds 3.4–5.9 ms p95 on top of it, and was enabled anyway with the
number in hand.

**The open question is the target, not the painter.** 4 ms was written in ADR-0026 when the canvas
drew bars, links and a grid. It now also draws month bands, a WBS band, float and drift tails,
non-working hatching, flanking dates, arrowheads, lag runs and handles — every one of them an
accepted decision with its own ADR. A budget set before two thirds of the picture existed, never
once measured against it, is more likely to be the wrong number than an indictment of nine
subsequent features. What matters to a planner is that panning and dragging feel smooth, which is a
question about **frame pacing under `requestAnimationFrame`**, not about one function's wall-clock.

Two caveats on the numbers above, stated rather than buried: the browser is a **headless container
Chromium with software rasterisation**, close to a worst case for canvas fill and explicitly _not_
the "mid-tier laptop and iPad-class Safari" envelope #59 names; and the fixture is adversarial by
construction (fifty fully-occupied lanes, every edge spanning seven of them) because a gentler one
would not exercise the code being budgeted.

**What would close it**, in order:

1. **Decide what to measure.** Dropped frames and input-to-paint latency during a pan/drag on a
   representative plan, rather than `paintScene`'s own duration on a synthetic worst case. The
   current script measures the latter because that is what could be measured without a seeded
   database; it is a starting point, not the benchmark.
2. **Decide what "representative" is.** 2,000 activities is ADR-0026's stated ceiling, but nobody
   has checked it against a real programme. The largest plan the product owner actually runs, and
   the largest an imported XER produces, are both facts we can get.
   **Partly answered — ADR-0066 M4.3.** The seed catalogue's scale generator now produces a plan of
   a declared, asserted shape (three-level WBS, 1.6 links per activity, milestones, LOE hammocks, a
   progressed front), and `measure-link-routing.mjs` takes it as a second scene. Both scenes were
   run back to back on **the same container** so only the picture differs.
   The figures were taken before a topology defect was found in the generator — its bands ran in
   series, so the plan was one long chain (ADR-0066 M4). That defect was in the plan's **logic**,
   not in the picture: `scale-scene.ts` lays the bars out itself and never reads the engine, and it
   had already been fixed to run phases concurrently. The numbers therefore still describe the shape
   the generator now produces.

   | scene                    | zoom                 | routing off (p50 / p95) | routing on (p50 / p95) |
   | ------------------------ | -------------------- | ----------------------- | ---------------------- |
   | grid (synthetic lattice) | whole plan (2px/day) | 9.4 / 11.6 ms           | 12.7 / 20.9 ms         |
   | grid                     | week (12px/day)      | 11.3 / 14.2 ms          | 13.4 / 17.7 ms         |
   | scale (realistic)        | whole plan (2px/day) | 14.6 / 18.7 ms          | 16.1 / 23.5 ms         |
   | scale                    | week (12px/day)      | 5.5 / 6.7 ms            | 5.5 / 6.7 ms           |

   Two things fall out, and they point opposite ways. At **whole-plan zoom the realistic plan is
   dearer** — 18.7 vs 11.6 ms baseline — which is what 2,160 bars (the WBS summaries are bars too),
   a dozen bar widths and 3,200 links cost against 2,000 uniform bars and 1,493. At the **working
   zoom it is less than half** — 6.7 vs 14.2 ms, with routing free to two decimal places — because
   real logic is dense inside a band and sparse across bands, so the cull actually works. The
   synthetic lattice, whose every edge spans seven lanes, defeats the cull by construction and had
   been standing in for a programme.
   So the honest summary is that **the scene dominates the number**, which is the reason this entry
   exists. It does not rescue the 4 ms budget: the realistic plan misses it 4.7× at whole-plan zoom.
   It does say the working zoom — where a planner spends their time — sits at 6.7 ms p95, inside one
   60 Hz frame.
   One trap worth recording, because it produced a much prettier and entirely false number first: a
   generated plan laid out nose-to-tail spans **28 years** at 2,000 activities, so the "whole plan"
   zoom culled roughly nine bars in ten and reported 4.6 ms p95. It looked like the budget being met.
   The layout now runs a phase's bands concurrently (`apps/web/scripts/scale-scene.ts`), which puts the plan
   at about two and a half years and fills the viewport — that is what makes the two scenes
   comparable at all.

3. **Run it on the envelope ADR-0026 names.** Take **500 activities as well as 2,000** — 2,000 is
   the stated ceiling, but two points tell you whether the cost scales with the plan or with the
   viewport, and only the second is a design property worth having. (This clause is the residue of
   the former #59, folded here: both rows waited on the same single run, so closing one would have
   left the other stale — the failure this register keeps having.)
   Two routes exist, and the runbook is
   [`docs/guides/measure-draw-performance.md`](guides/measure-draw-performance.md).
   **Route B** is `pnpm --filter @repo/web measure:draw` — a checkout, one install, one command,
   about a minute, timing the painter alone on a generated 2,000-activity programme. It runs
   **headed** on purpose: headless Chromium can rasterise Canvas 2D in software, so a headless
   figure measures a path no planner runs, and the script prints a loud warning when it is.
   **Route A, added 2026-08-03, needs no install at all** — the operator runs the app as a Docker
   Compose stack and asked for a way to measure it without putting a toolchain on a second machine,
   which was the last thing standing between this row and a number.
   `apps/web/scripts/measure-draw-in-browser.js` is pasted into DevTools on a real plan; it wraps
   `window.requestAnimationFrame`, reads the display's refresh interval from a 2-second idle phase
   and then measures 10 seconds of panning.
   Route A is the **better** answer to step 1 above, not merely the more convenient one: it reports
   frame pacing and dropped frames on the real machine, real plan and real GPU, where the harness
   reports one function's wall-clock on a synthetic scene. It is the _worse_ answer to "what does
   the painter cost", because a frame includes the ruler sync and the interaction layer — so it
   reports the whole frame **and** the heaviest single callback, and neither figure is implied by
   the other.
   **Scope narrowed 2026-08-01 (product-owner decision): laptop only, iPad deliberately not
   covered.** A planner authors on a laptop; the iPad is a review device, where the printed
   programme and the Gantt matter more than canvas draw. If the canvas ever becomes a primary iPad
   surface that gap reopens, and the runbook says so rather than leaving it implied.
   **First real-hardware readings, 2026-08-03.** Dell Precision 5690, Core Ultra 7 165H (22
   threads), 64 GB, **mains**, Edge 151, 60 Hz display, DPR 1, canvas ~1036×600 CSS px:

   | plan            | frame JS p95 | heaviest cb p95 | dropped frames | interval p95 |
   | --------------- | ------------ | --------------- | -------------- | ------------ |
   | 0 activities    | 0.5 ms       | 0.5 ms          | 0 / 600        | 16.8 ms      |
   | 144 activities  | 1.3 ms       | 1.3 ms          | 0 / 600        | 16.8 ms      |
   | **2,016, Fit**  | **8.9 ms**   | **8.9 ms**      | **54 / 527**   | **33.4 ms**  |
   | **2,016, Week** | **3.9 ms**   | **3.9 ms**      | **0 / 600**    | **16.8 ms**  |

   The 2,016 plan is the generated programme
   (`packages/interchange/scripts/generate-scale-xer.mjs`) imported through the product's own
   importer. GPU: `ANGLE (Intel, Intel(R) Arc(TM) Pro Graphics, D3D11)` — the **integrated**
   adapter, which is what the browser chose on a machine that also has a discrete one. That is what
   a planner gets, so it is the number that counts.

   **The 2,016 row is the finding, and it is not the one the budget was shaped to catch.** The
   painter costs **8.9 ms p95 — comfortably inside a 16.7 ms frame** — and **10.2% of frames are
   still dropped**, with the interval p95 at 33.4 ms and p99 at 50.0 ms. Those are 2× and 3× the
   refresh period almost exactly: whole missed vsyncs, not a smear.
   So a budget expressed as _paint duration_ would have scored this run as fine at anything above
   9 ms, and a planner panning this plan sees judder. That is step 1's suspicion — "frame pacing
   under rAF, not one function's wall-clock" — confirmed on real hardware rather than argued.
   Against ADR-0026 §9's ≤ 4 ms the painter is 2.2× over; but the 4 ms is the wrong **quantity**,
   not merely the wrong number, which is a stronger conclusion than this row expected to reach.

   **Where the missing time goes is not yet measured, and must not be guessed.** The script times
   rAF callbacks only, so everything between "JS finished" and "frame presented" — style, layout,
   canvas rasterisation, GPU upload, compositing, and any main-thread work outside rAF — is
   invisible to it. ~8 ms per frame is unaccounted for. `long tasks > 50 ms` was **0**, which rules
   out a blocking main-thread stall as the cause. The candidate that fits the shape is full-canvas
   raster/upload each frame on an integrated GPU, and ADR-0026's own first reserved escalation is
   **dirty-region repainting** — but that is a hypothesis with a mechanism, not a measurement. A
   DevTools Performance recording of the same pan would attribute it, and should be taken before
   any work is scheduled against it.

   Two caveats on this row. It is at **Fit** (whole-plan) zoom — the dearest case, and per the
   container harness the working zoom can be less than half the cost. **A Week-zoom run was called
   "still owed" here and this row's own table already carried it** (corrected 2026-09-01):
   `2,016, Week | 3.9 ms p95 | 0 / 600 frames dropped`, and it showed exactly what the sentence
   guessed — the surface a planner actually uses is smooth. What is genuinely unmeasured is the
   **500-activity** limb of §9's two-limb gate, which has no real-hardware reading at all. And
   **DPR 1**: at 150%
   scaling the backing store is 2.25× larger, so this is the cheap end of this machine.

   **The first row is why the script now refuses to run.** It was a real run on a real machine and
   it reported 0.5 ms — comfortably inside the 4 ms budget — for an **empty plan**. Nothing was
   drawn, and it read as a pass. That is the ADR-0066 scale-generator failure and the 28-year
   nose-to-tail failure for the third time, so the refusal is a hard stop rather than a warning,
   and a plan under 200 activities now warns that it cannot speak to a budget stated at 2,000.

   The second row is the operator's largest **real** plan, and it says the canvas is free at the
   size actually in use today: 1.3 ms of a 16.7 ms frame, not one frame dropped in six hundred.
   Read with the third row it also answers step 2 more usefully than either alone — **the cost is
   in the plan, not the machine.** 144 activities is free and 2,016 drops a tenth of its frames on
   the same laptop, in the same browser, at the same zoom, minutes apart. Since the stated
   direction is importing real client programmes (2026-08-03), the 2,016 row — not the 144 — is the
   one that describes where this product is going.

4. **Verdict against ADR-0026 §9's actual gate: PASS at both zooms, at the 2,000 ceiling, on real
   hardware.** The gate is **≥ 30 fps @ 2,000** under sustained pan.

   | zoom             | mean fps during pan | dropped | JS p95 | §9 gate (≥ 30 fps) |
   | ---------------- | ------------------- | ------- | ------ | ------------------ |
   | Week (53 px/day) | ~60                 | 0 / 600 | 3.9 ms | **PASS**           |
   | Fit (whole plan) | ~53                 | 10.2%   | 8.9 ms | **PASS**           |

   Two things are worth stating plainly. **The 2026 prototype's prediction held**: it measured
   4.0 ms p95 at 2,000 activities on a synthetic scene, and the shipped canvas — now carrying month
   bands, a WBS band, float tails, hatching, dates, arrowheads, lag runs and obstacle-aware routing,
   none of which existed then — measures **3.9 ms** at the working zoom on a real imported
   programme. That is a better outcome than nine accepted features had any right to expect, and it
   is the answer to "was Canvas 2D the right substrate": **yes, and no WebGL escalation is
   warranted**, which is what §9 reserved the escalation for.

   **What the real-hardware run adds that the headless one could not** is the Fit case: JS at 8.9 ms
   is half a frame, and 10% of frames still drop. §9a chose per-frame draw time precisely because
   headless fps "is rAF-throttled with no GPU compositor and only a floor" — so the metric was known
   at the time to be a proxy, and this is the proxy's limit showing up exactly where §9a said the
   real-hardware confirmation would be needed. It passes the gate; it is not perfectly smooth.

   **What to change, then, is much smaller than this row assumed.** Not a new budget — §9's fps gate
   is sound and is met. Instead: (a) fix the dead `§16` citations repo-wide so the gate people quote
   is the gate that exists; (b) record these numbers in ADR-0026 as the deferred device confirmation,
   closing §9a's open item; (c) leave the Fit-zoom 10% as a **known, passing-but-imperfect** case
   rather than scheduling work against an unattributed 8 ms — step 3's DevTools attribution comes
   first if it is ever picked up. Dirty-region repainting stays a reserved escalation, not a task.

Raised by ADR-0065 T21; the product owner accepted the routing cost and asked for the benchmark
itself to be examined. Related: #59 (the unmeasured envelope, which this supersedes in part).

### 76. Deferred follow-ups from the ADR-0064/0065 enablement review

**Status:** unverified

> **Re-verified 2026-08-08 — half of this is done.** The triple `activityRect` computation was fixed
> by the per-frame `RectCache` (`render/render-model.ts:446`, consumed at `paint.ts:793`), and
> `render/paint-frame.ts:47-54` now says in its own docblock that the remaining hoist "reduces to a
> one-line move". **Still open:** `crossedLanes` computed twice per edge
> (`render-model.ts:784,884`), and no flag-off Playwright config exists. Do **not** re-do the rect
> hoist — and per ADR-0078 §3, do not do the remaining one _inside_ a refactor.

Five specialist reviews ran over the combined authoring + routing diff. Every **blocking** finding
was fixed with a regression test (see `docs/DECISIONS.md`), as was one non-blocking one — the
`toolbarSplitCaretVariants` docblock, which still said a true split button "would need its own
composite-stop design. Until that lands…" while two had since landed on it. That was corrected in
the same pass rather than deferred, because ADR-0058 makes documentation drift a defect class here
and the fix was a comment. These are the rest, recorded rather than rushed:

- **Two hoists that would shrink the measured routing cost** (performance review). `activityRect` is
  computed three times per visible activity per frame with routing on — once in `cull()`, once in
  `laneIntervalIndex`, once in the `rects` map the bar layer builds later; and `crossedLanes` is
  computed twice per edge (`routeOrthogonal`, then `bundleCorridors`). Both are pure duplicated work
  with an obvious fix (build `rects` before the edge block; carry the crossed-lane list on the
  per-edge descriptor). They are inside an overhead already measured and accepted, so they belong
  with **#75** rather than blocking a release.
- ~~**A fourth hand-rolled "message + optional action" strip.**~~ **Done 2026-08-01** —
  `components/ui/notice-strip.tsx`. `EditConflictBanner`, both faces of `CanvasModeBand` and the
  canvas empty state now compose it. Three of the four had already drifted on radius, padding or
  alignment with no reason behind any difference. `tone` and `emphasis` are separate axes so a fifth
  caller cannot need a `neutralDashed`, and the **role stays the caller's** — a tone→role mapping
  would get the mode band wrong by construction, since it must have no live region at all.
- ~~**The split-button composite is duplicated**~~ **Done 2026-08-01** —
  `components/ui/toolbar/ToolbarSplitButton.tsx`. It now _guarantees_ the two facts each caller had
  been asked to remember: the pair is one roving stop, and `primaryRef` is the only ref a menu can
  restore focus to (the defect that shipped on both).
- ~~**`ArrowUp` does not open either type menu**~~ **Done 2026-08-01** — the shared primitive
  accepts either arrow, with a regression per control.
- ~~**The pen-loss-mid-pick case is untested at every layer**~~ **Done 2026-08-01** —
  `e2e-authoring-flow/authoring-flow.spec.ts`. It releases the pen with a pick open and asserts the
  outcome that matters: **no dependency**. Then it takes the pen back and links properly, so the
  refused attempt is shown to have left no wedged state. Writing it turned up a harness fact worth
  keeping: `mapBars` probes by clicking in `select` mode, so measuring while a tool is armed returns
  an empty map — the test disarms first.
- **Still open — no flag-off regression for the _pointer_ two-click link pick.** The echo plumbing
  (`onLinkPickStep`/`linkPickPredecessorId`/`dropLinkPickSignal`) is wired unconditionally on top of
  the pre-existing ADR-0032 M5 gesture, and nothing proves it is inert with the epic's flag off; the
  only tests touching pointer-driven dependency creation exercise the old edge-drag. Deliberately
  **not** faked in jsdom: a pointer pick needs a hit test against a canvas with real layout, which
  jsdom does not provide (`TsldCanvas.test.tsx` defers the same half for the same reason), so a unit
  test here would assert the client's optimism back at itself. It belongs in a flag-off Playwright
  run, which the repo has no configuration for today — that, not the assertion, is the work.

### 81. CodeQL `js/http-to-file-access` on the seeder's `--out` report

**Status:** unverified

CodeQL flags `writeFileSync(args.out, JSON.stringify(results))` in `apps/seed-cli/src/main.ts` as
"network data written to file" — the negative tier's report contains the API's own response codes
and messages, which are network-sourced, and they land on disk.

**Assessed as a false positive for this call site, and left open rather than silenced.** The rule
guards against a remote payload reaching a file that something later executes or parses unsafely.
Neither half holds here: the **path** is `args.out`, an operator's own CLI argument and not
network-derived, so there is no traversal; and the **content** goes through `JSON.stringify`, so a
hostile response body cannot break out of the JSON it is quoted into. Writing that report is the
entire purpose of the flag — the run exists to record what the API refused.

Deliberately **not** worked around. The available moves were to drop `--out`, to write the report
somewhere the operator did not choose, or to launder the values through a copy so the taint tracker
loses them; the first two make the tool worse and the third changes nothing real while making the
code lie about why it exists. A scanner finding that a reviewer has assessed and disagreed with
should be dismissed in the GitHub UI with that reasoning attached, which is a repo-admin action.

Kept as an entry so the next person to see the alert finds the analysis rather than repeating it.
The sibling alert from the same scan — `js/polynomial-redos` on `client.ts` — **was** real and was
fixed (`stripTrailingSlashes`, with a regression test measured against the old implementation
first). One of two is the ordinary ratio, and it is the reason the pair should be read rather than
batch-dismissed.

**The CodeQL check going green does not mean this alert closed.** PR #204's check reported "2 new
alerts including 1 high severity" and turned green once only the **high** one was fixed — the
`main.ts` line this entry is about was never touched. So the gate fails on high severity and this
medium alert is still open on the branch. Worth knowing before reading a green CodeQL as "no
findings": it means "no findings above the threshold".

**One part of it was real, and is now fixed.** Re-reading the flow for this entry found that the
_size_ of what a server can put in the report was unbounded: the raw-text fallback clamped to 200
characters, but the parsed-envelope branch passed `code`, `message` and `details` through verbatim,
and `--out` writes them to disk. A seeder pointed at a broken or hostile endpoint could therefore
spend the operator's disk one finding at a time. Now clamped (2,000 / 500 / 100 characters, with the
truncation stated rather than trailing off mid-word). This does **not** clear the alert — the taint
flow is unchanged — and it was not done to. It is the one genuine defect the rule's neighbourhood
contained, found by taking the finding seriously rather than by trying to satisfy it.

### 84. Levelling is quadratic in the number of activities contending on ONE resource

**Status:** unverified

**Found by** the backend-performance review of ADR-0071 M2, which measured `level.ts` before and
after the join-lag rework and reported the honest result: the new implementation is marginally
**faster** than the old at every size tested (500 → 16,000 activities), and both are quadratic in
one specific shape — many activities competing for a **single** resource. At 16,000 such activities
a levelling pass takes ~11.6 s.

**It is pre-existing and this diff did not change it.** It is recorded because ADR-0041 §F's
boundedness wording ("`O(k log k)`, never a per-minute scan") is easy to read as ruling this out,
_(citation corrected 2026-09-01: that phrasing is **not** in invariant (f), which reads only "the
feasibility search terminates within the ADR-0036 horizon/iteration cap; a never-freed resource
flags, never loops". It lives in `level.ts:437-438` and in ADR-0041's ADR-0071 amendment paragraph
at `:154`. The point below survives the correction.)_
and it does not: §F rules out cost that scales with the **span** being levelled — the defect where
a two-year plan costs a thousand times a two-day one regardless of how much work it holds. It says
nothing about cost that scales with the number of **contenders**, which is what this is. A reader
checking whether levelling is bounded would find §F, find it satisfied, and stop.

**What would fix it**, if a real plan ever hits it: the serial priority-list heuristic re-scans the
resource's committed intervals for each candidate placement. An interval tree, or carrying a
per-resource cursor forward through the priority order, would take it to `O(n log n)`. Neither is
worth doing on a measurement of a synthetic worst case — a real programme spreads demand across many
resources, and the shape that is slow is one crew doing 16,000 activities in sequence. **Measure a
real plan before building either** (ADR-0053 M4's rule: an index is added on a measurement, not an
instinct).

**Also measured, and accepted:** baseline capture went from ~384 ms to ~920 ms at 2,000 activities /
6,000 assignments, all of it inside the plan-locked transaction, because ADR-0071 M3 now freezes the
per-assignment cost decomposition alongside the activity rows (CQ-1 "extend the baseline — exact").
That is the cost of the answer being exact rather than approximated, it is a once-per-baseline
operation a planner initiates deliberately, and 920 ms is well inside what a captured snapshot is
expected to take.

---

### 86. A `RESOURCE_DEPENDENT` activity's day factor is read from the wrong calendar

**Status:** unverified · **Found:** 2026-08-03, by the component gate on the derived-duration fix. **Pre-existing** — the fix
inherited it rather than introducing it.

`effectiveHoursPerDay()` (`apps/web/src/lib/effective-hours-per-day.ts`) resolves the factor as the
**activity's own** `calendarId`, falling back to the plan's. That is correct for every activity type
but one. For a **`RESOURCE_DEPENDENT`** activity, ADR-0035 §23 / ADR-0039 §4 make the **driving
resource's** calendar authoritative — the service resolves and overrides the activity's own, which
`ActivityCalendarField.tsx` already documents on screen. The web factor never accounts for it.

**What it costs.** Any day-denominated figure the client _renders_ for such an activity is measured
against the wrong day length: the assignment join-lag field (shipped under ADR-0071) and now the
derived-duration preview.

_(Citation corrected 2026-09-01: this row said "ADR-0039 §23", and ADR-0039 has no §23 — §23 is
ADR-0035's, which ADR-0039's own heading cites as "reuses the ADR-0037 port seam (rung 2, §23)".
The code cites it correctly; only this row did not. The sweep also found the row overstating the
plumbing cost: `AssignmentRow` already receives `resource: ResourceSummary | undefined`, and
`ResourceSummary` carries `calendarId`, so only the calendars list is missing — and the panel above
it already holds both.)_ Both are display and neither writes a wrong value — the API stores
minutes, and the engine reschedules on the correct calendar regardless — so this is a misleading
read-out, not corrupt data. It bites only where a `RESOURCE_DEPENDENT` activity has a driving
resource on a calendar whose `hoursPerDay` differs from the activity's own.

**Why it is not fixed here.** `AssignmentRow` cannot resolve it without the driving `resource.calendarId`
plus the calendars list plumbed to a component that currently needs neither — real work, and out of
scope for a three-line formatter fix. Doing it badly (guessing, or resolving in two places) is how
the flat-1440 defect this entry sits beside came about.

**The fix when it is taken:** teach `effectiveHoursPerDay()` the `RESOURCE_DEPENDENT` branch — take
the driving assignment's resource calendar when the type is `RESOURCE_DEPENDENT` and a driver
exists, else today's answer — so every caller is corrected at once rather than per-surface. The
engine is not involved and the recalc parity gate is untouched.

> **Scoped 2026-09-01, and "every caller is corrected at once" does not survive contact.** The
> helper has **twelve** call sites and can only use what it is handed, so a branch alone corrects
> nobody — it would be dead code until a caller supplies the driver.
>
> **Where the driver is resolvable, and where it is not**, established by reading rather than
> estimating:
>
> - `ActivityResourcesPanel` **can** — it holds `assignments.data` (each with `isDriving` and
>   `resourceId`) and a `resourceById` map, and `ResourceSummary.calendarId` exists
>   (`packages/types/src/index.ts:1739`). But it does not compute the factor: it receives
>   `activityHoursPerDay` as a **prop** from its host and forwards it to `AssignmentRow`
>   (`:318-320`). Correcting it means the panel deriving its own — which needs the activity's
>   `type` and the `calendars` list plumbed in, two new props on a component that currently needs
>   neither.
> - `ActivitiesTable`'s **Duration column** cannot. It resolves per row (`:639`) and the table
>   never loads assignments, so the driving resource is not in scope at all; getting it would mean
>   a bulk fetch this surface does not do today.
> - The two activity editors are in between and need checking when the work is taken.
>
> **So it needs a spec, not a register row** (ADR-0105): the panel's props are a component contract.
> That is a bigger trigger than the row's own "three-line formatter fix" framing implies, and the
> framing is what has kept it looking cheaper than it is.

### 88. An email link scanner reaches the verification URL before the recipient

**Status:** unverified

> **Narrowed 2026-08-08.** The row says a fix should "cover the invitation accept path at the same
> time". That path is **already safe**: `AcceptInvitationCard.tsx:243-256` requires a real button
> press, so no scanner can accept an invitation by fetching a URL. Only the **verification** link is
> a bare acting GET (Better Auth's own route, `better-auth.ts:249-250`). Note the ordering that
> matters: this is armed by `AUTH_REQUIRE_EMAIL_VERIFICATION`, which programme M4 turns on.

**Found:** 2026-08-03, in the production log of the first real verification email (Theme B2), sent
to a corporate Microsoft 365 mailbox.

```
HEAD /api/auth/verify-email?token=eyJ… 404 "-" "-" "2a01:111:f400:7e8b::100, …"
GET  /api/auth/verify-email?token=eyJ… 302     (the recipient, seconds later)
```

Empty user-agent, empty referer, and an IPv6 address in Microsoft's range: Outlook Safe Links
prefetching the link out of the mailbox. It used `HEAD`, Better Auth does not answer `HEAD` on that
route, so it received a 404 and consumed nothing. **That was luck, not design.**

**What it costs.** Scanners at other tenants prefetch with `GET`. One that does would follow the
verification link on the recipient's behalf — marking the address verified before any human saw the
message, which quietly removes the only thing a verification email proves, and (for a single-use
token) can leave the real recipient a "link already used" dead end. This is a general hazard of
emailed action links rather than anything this codebase introduced, and it applies equally to the
**invitation accept URL**, which grants org membership.

**Why it is not fixed now.** It has not bitten: `AUTH_REQUIRE_EMAIL_VERIFICATION` is still off, and
the one real send was scanned harmlessly. Fixing it speculatively means designing an interstitial
before knowing which tenants matter.

**The fix when it is taken:** make the emailed URL land on a **web page with a confirm button**
that POSTs the token, rather than a bare GET that acts. A scanner will fetch the page and stop,
because it does not press buttons. That is one route and one small component, and it covers the
invitation accept path at the same time. Better Auth's own resend endpoint is the recovery path
until then.

**Extended 2026-08-05 (ADR-0074 M4-T4) — the password-reset link, which is a different shape and
worse in one respect.** `GET /api/auth/reset-password/:token` does **not** consume the token: it
checks it and **302-redirects with the raw token on the `Location` header** to
`/reset-password?token=…`. So a scanner following it neither verifies anything nor burns the link
— but every hop that logs response headers or request lines now holds a **live** reset token for
the remainder of its hour. That compounds B1 (the token was, until this ADR, also stored cleartext
at rest); with B1 merged the exposure is transport and logs rather than the database, but it is
still a credential in a URL.

**In this design's favour, and it is not a coincidence:** the emailed reset link lands on a _page_
and the actual change is a **POST from our form** — structurally the shape the fix above asks for.
The web half strips the token from the address bar on arrival (`replace: true`) so it does not
persist in history or ride along in a later referrer. What remains unaddressed is the **redirect
itself**, which is Better Auth's route and not ours to reshape without a fork.

Neither advisory report was wrong; they addressed different halves — one the scanner consuming a
token, the other the token travelling in a URL. The confirm-button interstitial for
verify/invite stays this row's own, separate remediation.

---

### 89. The reverse proxy forwards `X-Forwarded-Proto: http` on an HTTPS request

**Status:** unverified · **Found:** 2026-08-03, reading production request logs during the Theme B2 verification test.

Every request arriving through Cloudflare → Nginx Proxy Manager → web → api carries:

```
"x-forwarded-proto": "http",  "x-forwarded-scheme": "https",  "cf-visitor": "{\"scheme\":\"https\"}"
```

Two of the three say HTTPS and the standard one says HTTP — it reflects the proxy's plaintext hop to
the web container rather than the scheme the browser used. `docs/DEPLOYMENT.md` "Cloudflare & TLS"
asserts this header arrives as `https`; it does not. Corrected in that document alongside this row.

**What it costs today: nothing, and that is the trap.** Nothing currently derives behaviour from it
— absolute URLs come from `BETTER_AUTH_URL`, and the `Secure` cookie flag comes from `NODE_ENV`, not
the header. So the misconfiguration is invisible and will stay invisible until something reasonable
reads the standard header and builds an `http://` link or drops a cookie, at which point the cause
is three hops away from the symptom.

**The fix — and this row was wrong about where it lives (corrected 2026-08-04).** It said "an
operator change, not a code change". At least half of it is a **code** change, in our own image:

```nginx
# apps/web/nginx.conf, the /api/ location
proxy_set_header X-Forwarded-Proto $scheme;
```

That `server` block only ever `listen`s on plain `8080` — TLS is terminated upstream — so `$scheme`
there is **unconditionally `http`**, and this line **overwrites** whatever the proxy sent, on every
request. A perfectly-configured Nginx Proxy Manager host would have its correct `https` discarded
here before the API ever saw it. That is also why the other two headers survive intact: nginx passes
through what it is not told to override, and this is the only one we override.

So the fix is both halves, and the code half must land first or the operator half is untestable:

1. **Repo — PAID 2026-08-05 (ADR-0074 M1-T5).** `apps/web/nginx.conf` now carries a
   `map $http_x_forwarded_proto $sp_forwarded_proto` that preserves what arrived and falls back to
   `$scheme` only when nothing did (direct/dev access, where it is correct). The `/api/` location
   forwards `$sp_forwarded_proto`.
2. **Operator — STILL OPEN, and the pair is required.** Confirm Nginx Proxy Manager sends it at all
   — Advanced → `proxy_set_header X-Forwarded-Proto $scheme;` on the HTTPS host, with Force SSL on.
   **Until that lands the code half changes nothing**, because with no header arriving the map falls
   back to exactly the previous behaviour. That is the honest state: the repo can no longer destroy
   a correct value, and nobody is yet sending one. Instruction added to `docs/DEPLOYMENT.md`.

Still not urgent — nothing consumes the value (verified: no `req.protocol`/`req.secure` anywhere in
`apps/api/src`), and the four candidates are all deliberately decoupled: cookie `Secure` comes from
`NODE_ENV`, absolute URLs from `BETTER_AUTH_URL`, HTTPS redirection belongs at the edge, and
rate-limit keying uses `X-Forwarded-For`, which is **appended** (`$proxy_add_x_forwarded_for`) rather
than overwritten and is therefore correct today.

**A related claim, also corrected:** `common/http/client-ip.ts` said Express's `trust proxy` was
"deliberately NOT enabled on this app (checked, not assumed)". It is enabled in production —
`app-setup.ts` sets it from `TRUSTED_PROXY_IPS`, which env validation makes mandatory there. The
helper still earns its place (it answers `null` rather than a peer address, and does not vary by
environment), but the stated reason was false. Both corrections came from planning this row, which
is the ADR-0058 rule finding two of its own instances in the file that cites it.

---

### 93. The audit epic's non-blocking review findings (ADR-0073 C4.1)

**Five of six folded 2026-08-31** (register verification sweep), leaving only (a):

- **(b)** `AuditEventListProps` is a named interface, matching its `AuditFilterBarProps` neighbour.
- **(c)** `plural()` formats with `toLocaleString()` — a cascade count reaches four figures on a
  real programme, and the dates in this feature were already `Intl`-formatted, so a bare count was
  the one number that was not.
- **(d)** `DataTable`'s empty state now carries `describedById`. It returned before the described
  region, so prose qualifying what the rows mean reached a reader WITH rows and not a reader with
  none — the state where an unexplained absence is most likely to be misread.
- **(e)** the three bare `→` glyphs are the word "to". A screen reader announces nothing at all for
  the arrow, so a before/after pair read as one undifferentiated phrase. The two unit assertions
  that pinned the glyph were updated with the reason at the site.
- **(f)** `Settings & calendars` is `Settings, calendars & library` — ADR-0073 C3.2 added baseline
  capture and C3.3 the library-governance actions, so the label named two of the four kinds of
  thing the filter returns.

**(a) stays open as the watch-item it always was**: two `plan.findFirst`/`parent` name reads inside
locked transactions, deliberate ("a row whose only label is a uuid answers nobody's question"), and
harmless until either action is driven from a batch.

**Status:** unverified · **Found:** 2026-08-04, from six specialist reviews over the combined C1–C3.4 diff. The six blocking
findings were folded with regression tests; these are the remainder, recorded rather than rushed.

(a) **Two producers read one extra row inside a held lock** to label their audit event —
`baselines.service.ts` (`activate`, `remove`) looks up the plan's name inside the plan-advisory-lock
transaction, and `activities.service.ts` (`updateParents`) looks up the destination parent's name.
Each is one indexed primary-key lookup, sub-millisecond, and each producer is a single call rather
than a loop — so this is a shape to watch, not a cost to pay down now. It becomes real if any of
those actions is ever driven from a batch.

**(b)–(f) were folded on 2026-08-31**, and their original problem statements stood here until
2026-09-01 — five closed findings restated in full below a header saying they were closed, so a
reader who scrolled past that header met six open items. What each fix was is at the top of this
row; what each problem was is in `git log`. Leaving pre-fix text in place is how a fixed row goes on
reading as owed work, which is the drift class this register exists to catch.

---

### 96. The router JSON-parses every search param, so a foreign one can arrive as the wrong type

**Status:** unverified

> **Corrected 2026-08-08.** The body below says `/accept-invite` has "the same latent shape" and is
> not normalised. **It is** — `app/router.tsx:409-413`. The remaining work is the router-level
> `parseSearch` override, which is genuinely large: nine `validateSearch` blocks, the four
> `useUrlFilterState` consumers and the Gantt's `?view=`, with the journeys re-run because this whole
> defect class is invisible to unit tests that mock `useSearch`.

**Found:** 2026-08-05, by the ADR-0074 M5 flag-on verification journey — the only test in the
repository that follows a real emailed link through a real redirect.

TanStack Router's default `parseSearch` is `parseSearchWith(JSON.parse)`
(`@tanstack/router-core/searchParams.js`): it attempts to JSON-parse **every** value. `?verified=1`
therefore reaches `validateSearch` as the **number** `1`, and `/verify-email`'s
`typeof search.verified === 'string'` test dropped it — so a verification that had actually
succeeded rendered the "still waiting" screen. Every screen test mocks `useSearch` and hands the
component a literal, so none of them crosses the parser and the whole suite stayed green.

`readForeignParam` in `apps/web/src/app/router.tsx` now normalises the three ADR-0074 routes'
params, and `router-search.test.ts` composes the real parser with the real validator.

**What is left, and why it is a row rather than a fix.** That helper repairs only values whose
`String()` reproduces the source — `1`, `true`, a small integer. A token composed entirely of digits
is already `1.2345678901234567e+31` before any validator runs and **cannot** be recovered; the test
pins that limit rather than implying a defence that does not exist. Astronomically unlikely from
Better Auth's generator, and the failure would be a reset link that reports an invalid token with no
way for the reader to act on it.

The real remedy is a router-level `parseSearch` that leaves values as strings, with each route
coercing what it wants. That is a change to **every** route's search handling — the library screens'
typed URL params (ADR-0053 M6) and the Gantt's `?view=` among them — so it needs its own pass with
the flag-on journeys run, not a drive-by. Routes outside ADR-0074 are **not** normalised today, and
that is the other half of the row: `/accept-invite?token=` has the same latent shape.

### 97. The account-security epic's non-blocking review findings (ADR-0074 M5)

**Status:** unverified · **Found:** 2026-08-05, by the five specialist gates over the M0–M5 diff. Each was raised as
non-blocking by its reviewer and is recorded rather than rushed, per the ADR-0064/0073 precedent.

- **(a) `AUDIT_ACTION_CATEGORY` files the three new password actions under `sign-ins`**
  (api-reviewer). `auth.password_reset_requested`, `auth.password_reset_completed` and
  `auth.password_changed` are credential-lifecycle events, not sign-ins, so the audit log's
  **Sign-ins** chip returns them together with successful and failed authentications _(chip name
  corrected 2026-09-01: these map to the `sign-ins` category, not `access`, which holds
  `member.joined`/`member.removed`/`member.role_changed`. The finding is unaffected — the eight
  auth actions still arrive as one undifferentiated group)_. Not wrong
  enough to block — they are genuinely access-adjacent and a reader filtering for "Access" would
  expect to see them — but a reader asking "who changed a password this month?" cannot ask it. The
  fix is a fourth category, which touches ADR-0073 C1's chip vocabulary and its derived cap, so it
  belongs with the next audit slice rather than bolted on here.
- **(b) ~~The inline text-link `className` is repeated across five auth screens~~ — CLOSED
  2026-08-06 (ADR-0077 M2-T2).** `text-primary font-medium underline-offset-4 hover:underline`
  appeared in `sign-in`, `sign-up`, `verify-email`, `forgot-password` and `reset-password`, and the
  brand-surface epic was about to add a sixth. It is now `components/ui/text-link.tsx` —
  a `className` factory rather than a component, so the router's type-safe `to`/`search` inference
  survives, and it gained the visible focus ring the five copies never had.
- **(c) ~~`password-reset.parity.test.tsx` overstates itself, and one of its assertions is
  vacuous~~ — CLOSED 2026-08-31.** The docblock no longer calls the suite "the only gate" (it was,
  when written; `router-search.test.ts` and the flag-on journey both cross it now), and the
  `redirectTo` assertion — which lived in `forgot-password.test.tsx`, not in the parity suite, so
  the finding named the wrong file — stops restating the implementation. It captures the origin
  before rendering and asserts a parsed `URL`'s origin and pathname, which is the contract; reading
  `window.location.origin` inside the expectation meant the test and the source consulted the same
  global and the assertion described itself.

**Risk:** the remaining item is not user-visible — (a) makes one audit question unaskable.

**Remediation:** (a) with the next audit-coverage slice. (b) and (c) are closed.

### 234. Fifteen page and panel loading states are spinners where the shape is known

**Status:** open · **Found:** 2026-09-01 (empty-state consolidation §1.8) · **Size:** M · **Owner:** a loading-state pass

`docs/UX_STANDARDS.md:60` asks for a _"Skeleton matching final layout (first load) / inline busy
(actions)"_ — two answers, with the discriminator being whether the content has a **known shape**,
not whether something is pending. M7 fixed the one site where the shape was known to a shared
primitive (`DataTable`, fifteen consumers). These fifteen are the remainder, and they are a
different piece of work rather than the same one left undone.

`client-detail.tsx:20`, `project-detail.tsx:43`, `plan-detail.tsx:42`, `EarnedValuePanel.tsx:121`,
four in `staff.tsx`, and the panel spinners in `NoteThread`, `CalendarExceptionsEditor`,
`GuestPlanView`, `FloatPathsPanel`, `ScheduleSummaryStrip`, `ActivityMembersPanel` and
`ScheduleHealthPanel`.

**Why it is one row and not fifteen tickets.** Each is a page or panel whose shape is bespoke, so
each needs its own skeleton **designed** — and `plan-detail.tsx:39,45` already renders partial
`animate-pulse` bars beside its spinner, so a page-level pattern is half-invented already and wants
deciding rather than extending. That decision is the work; the fifteen conversions follow from it.

**What is NOT here, deliberately.** Of the 52 `Spinner`/`animate-spin` occurrences across 22 files,
ten are correct and stay: an **action** with an indeterminate duration and no final layout to match
(`ImportScheduleDialog`'s parse and import, the recalculating cue, a pending submit), and a **gate**
whose answer decides which layout renders at all (the Suspense chunk fallbacks, the staff identity
check, "Checking your access…"). A skeleton in either place promises a shape that is not coming, or
guesses one and is wrong half the time — including on a refusal branch, where the settled layout is
a sentence.

**Unverified:** the four `staff.tsx` spinners and the six panel spinners were classified from
surrounding context in a grep pass, not by opening each file whole. If any turns out to be a
`DataTable`-shaped list it belongs with M7's fix rather than here — checking that is the first task
of whatever picks this up.

### 233. A canvas lag drag reads and writes rounded days, so a sub-day lag cannot survive one

**Status:** open · **Found:** 2026-09-01, while specifying #65 · **Size:** S · **Owner:** web

`onTsldLag` (`use-plan-workspace-model.ts:1253-1265`) — the one handler the TSLD lag-anchor **drag**
and the Logic panel's `Shift+←/→` **nudge** share — takes `lagDays`, compares it against
`dependency.lagDays`, and sends `lagDays`. Both halves are in **rounded days**, and
`DependencySummary.lagDays` is documented at `packages/types/src/index.ts:665-670` as _"rounded from
the stored minutes. A sub-day lag reads back as 0 here"_.

So on an edge whose stored lag is not a whole number of days — a two-hour cure, a 90-minute lift —
two things go wrong and they are different:

- **The drag is silently refused.** Drag a 90-minute lag to zero: the gesture emits `0`,
  `dependency.lagDays` is already `0`, the defensive no-op at `:1257` returns `{ applied: false }`,
  and the anchor snaps back with nothing written and nothing said. That guard is correct in its own
  terms — it exists so a stale caller cannot burn a version bump and a recalculation on an identical
  write — and it is comparing two numbers that are not the same quantity. The ADR-0064 shape: a
  gesture that produces no change and no explanation.
- **The remainder is discarded on any drag that does write.** Nudge that lag by one day and the
  PATCH carries `lagDays: 1`, so the server stores a whole day and the 90 minutes is gone.

**This is ADR-0070 M4's defect one field along.** That milestone found "a canvas move resent the
**rounded** duration, flattening a sub-day activity to zero on every drag" and fixed it for
`durationDays`. `lagDays` is the same conversion on the same surface and was not swept — one correct
pattern applied to a control and not its neighbour, the shape this register has recorded six times.

**Why it is filed rather than fixed inside #65.** #65 is an **undo** seam: it adds an inverse and
changes no forward write. This is a **forward write**, and changing what a drag stores is a change to
a shipped gesture that wants its own before/after — including a decision the fix cannot dodge: when a
planner drags a 90-minute lag to "1 day", do they mean one day exactly, or one day plus the 90
minutes they never saw? The former is almost certainly right (they dragged to a day boundary), but it
is a product answer, not a refactor.

**What the remedy looks like.** `LagInput` is already `{ lagDays } | { lagMinutes }`
(`use-dependencies.ts:85`) and the API stores minutes verbatim, so nothing new is needed on the wire.
The comparison must move to `lagMinutes` — the only quantity both sides can express — and the write
must send whichever unit the gesture actually means, stated rather than inherited.

**Unverified:** the two failure modes above are read from the code and the type's own docblock, not
driven in a browser. Establishing them wants a plan whose edge carries a sub-day lag — the seed
catalogue can build one — and that proof belongs with the fix.

### 232. The WBS band's derived bucket has no accessible name or count

**Status:** open · **Verified:** 2026-09-01 · **Size:** M · **Owner:** web

**Found independently by the accessibility and UX reviews of #71**, neither of which was asked
about it. It is a claim-vs-built gap, which is the ADR-0058/ADR-0076 shape rather than an ordinary
omission: two places in the repository assert an accessible equivalent that does not exist.

- `TsldCanvas.tsx:2200` — _"its a11y equivalent is the band group in the parallel DOM listbox"_.
- ADR-0063 §7 makes the same claim, that the bucket "is announced as a group".

**Verified against the code rather than taken from the reviews.** The band canvas is
`aria-hidden="true"` (`TsldCanvas.tsx:2206`); `wbsBandGroups` reaches only a ref, the painter and
the hit-test, and nothing else; and the derived bucket has no activity id — it is not in the
database — so it structurally cannot be an option in the parallel listbox, which is built from
activities. There is no "band group" in the DOM at all.

For a real `WBS_SUMMARY` the claim is TRUE by accident of it being an ordinary activity that
already has a listbox row. So the comment is right about half its subject and wrong about the half
that has no other route — which is why nobody reading it noticed.

**Its Gantt sibling does this properly**, and the comment there says why: `GanttBucketRowView`
composes `` `${row.label}, ${count} activities` `` as the accessible NAME, with the note that the
count "is part of the accessible name, not a decoration beside it: 'Unassigned' alone does not say
whether the row is worth expanding" (`GanttPanel.tsx:1336-1338`). So a screen-reader user learns
there is ungrouped work in one view of a plan and not in the other.

**What would close it:** decide what the band owes an AT user, then build it — the honest options
are a visually-hidden list beside the band canvas, or extending the existing listbox with a
non-selectable group. Both are more than a fix: the bucket cannot be selected (ADR-0063 §7 refuses
the null id), so whatever is announced must not imply it can be. Correct the two false claims in
the same change, whichever way it goes.

**Deliberately not folded into #71**, which shipped the shape cue: that was a sighted-user
colour-perception defect and this is a different audience with a different remedy. Neither option
considered in #71 would have changed this one either way.

## Closed numbers

Rows are **deleted** when done (see the rule at the top) — but the number is never reused, and this
ledger is why. Two different items were both numbered **83** because a freed number looked available;
one was open and one was resolved, in the same file. The register disagreed with itself about what a
number meant, which is the failure mode this whole document exists to avoid.

It also keeps inbound references resolvable. ADRs are never rewritten (CLAUDE.md §6) and
`DECISIONS.md` entries are not edited once recorded, so both still cite rows by number long after the
row is gone — ADR-0047 cites #29, ADR-0066 cites #79 and #80. Without this table those read as
dangling.

One line each. The story lives where the link points, not here.

| #   | What it was                                                                            | Closed     | Where the record is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | -------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 95  | `apps/api`'s three Vite configs were ESM in a CommonJS package                         | 2026-09-01 | Renamed to `.mts` (the row's own smaller alternative — `"type": "module"` would have meant auditing NestJS's CommonJS assumptions one at a time). Warning reproduced first, then gone; all three configs load, ESLint still reaches them, and the API e2e suite passed 572/572 under the renamed ones. The sweep for the same class then found a **second** occurrence the row did not know about, in `apps/web/vitest.config.ts` — an extensionless `./vite.config` import, fixed the same way; every other workspace is clean.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 151 | The Gantt grid splitter had no browser-level coverage                                  | 2026-09-01 | `e2e-gantt/gantt.spec.ts` now drives the separator to its floor and one step above it and asserts the pinned columns end exactly where the chart begins — verified red by understating `ganttFixedWidth` by 80 px, which reproduced ADR-0095's incident verbatim (`Float` at 881–941 against a chart starting at 861). It then found **two live defects** on its first extension: the `vs baseline` column is not a `GanttColumn`, so the pinned block summed to `pane + 72` whenever a baseline was active; and `useResizablePanelPrefs` clamped a stored size only in its `useState` initialiser, so a floor that rose afterwards never reached it. Both fixed with cases verified red. `grid-width.structural.test.ts` was green against both and now records why it structurally cannot see the second.                                                                                                                                                                                                                                                           |
| 71  | The WBS band's derived bucket was distinguished by colour alone                        | 2026-09-01 | `docs/specs/wbs-bucket-bracket/`. The bucket is now an unfilled three-sided bracket, open at the foot — the language the Gantt already uses, for the reason it states: it is not a scheduled thing, it is the extent of things that are. **Decided by looking, not by reviewing.** The two specialist reviews disagreed; both remedies were mocked up on a real canvas with the product's own tokens, geometry and `truncateToWidth`, with a greyscale toggle applying the actual 1.4.1 test. The rejected remedy — a dashed outline over the fill — had been argued to "stay visually distinct at any bar width above a couple of px", and at 12px with colour withdrawn it reads as a slightly textured block: `--muted-foreground` and `--foreground` are both mid-greys once hue is gone. The label's ink moved with the fill in the same change, because it was `--background` — the canvas ground itself — so removing the fill alone would have painted the name invisible. `paint.wbs-band.test.ts` is the band's first paint-level test, verified red first. |
| 132 | `mail-alerting.e2e-spec.ts` saw its own writes late and the two cases swapped answers  | 2026-09-01 | Fixed in `e560ac2c`, whose own message names #132, and the row was left open — the already-fixed-and-unclosed shape, found by the verification sweep. `settleRows(expected)` polls the row count and throws with a diagnostic rather than sleeping 50 ms; both cases share it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 214 | An approved plan clause was never built, and its own risk table said it shipped        | 2026-09-01 | Both halves now built. The coarse half landed at ADR-0118 M2; the row said the Gantt half was "carried into M3" and **it did not land there either** — verified by grep, then built. Its first run found six sortable column headers at **16 px** against WCAG 2.2 §2.5.8's 24 px floor, live on a shipped surface nothing had ever swept.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 177 | A compound citation was invisible to `check:claims`                                    | 2026-09-01 | **Won't-fix**, on the row's own measurement: a repo-wide sweep found exactly two compound citations left, one excluded as this repository's own file and one that IS this row quoting the defect. Extending the regex is a shared-gate change (ADR-0105) that would then demand a register entry for an example. The seven real occurrences were already split into two citations each, so the hole is closed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 156 | The drawer-subject mechanism had no registrant                                         | 2026-09-01 | Deleted, on the product owner's call: ADR-0097 D2 is closed as not wanted. The row's own premise had gone stale — it said the drawer "is very much alive: it holds the Project Explorer", which ADR-0109 D2 had already moved to its own column, so the dead set was the whole mechanism plus `ContextDrawer`, `useContextDrawerPrefs`, the `drawer` chrome slot and the shell's Escape rung. See `docs/DECISIONS.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 63  | The Progress tab carried no unsaved marker for its three panels                        | 2026-08-31 | The confirmation half closed with ADR-0108 D2; this is the tab's own dot, which the lifted six-scope report already had the state for. Never a padlock — the pen does not gate Progress.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 67  | The Logic panel's post-remove focus target was the whole panel                         | 2026-08-31 | Narrowed to the two dependency tables. No host-override seam: the Logic dialog owns no Close button to land on, so it would have shipped with no registrant (#156's shape).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 68  | **Add note** landed on the Notes tab but not in its composer                           | 2026-08-31 | `focusNotes` on the intent, mirroring `focusSteps`, through to a `NoteComposer` `autoFocus`. Both entry points require `canWriteNotes`, so there is no reader-without-a-composer case.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 73  | `Column.srHeader` was dead once `headerCell` was set                                   | 2026-08-31 | Dropped at its one double-declaring call site; the `Column` docblock now says which wins and why a `headerCell` control needs no hidden text.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 169 | The Project Explorer's actions row duplicated its writer gate in two branches          | 2026-08-31 | One `NewClientButton`, rendered by both the `SheetHeader` and drawer branches. The empty-strip half had already been closed incidentally by ADR-0109 D2's fold control.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 66  | A shaded create form still accepted input it cannot submit                             | 2026-08-31 | Both create forms take a `FieldGateProvider`, so the fields shade read-only with the same reason node the Save points at. ADR-0083 had decided the pattern; these two forms had never used it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 224 | `plan:scale-500` was described as fully unassigned and its spec assigns 168 activities | 2026-08-31 | The playbook said "478 of 478 unassigned" about a fixture that is 35 % assigned — on the document whose job is to say what wrong looks like. Corrected to 310 of 478, the denominator established from the engine's write set rather than from a seeded run.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 65  | A link's lag or type edited from the dialog is not recorded for undo                   | 2026-09-01 | `dependencyEditCommand` + `onSaved`/`onEdited` at both hosts, and a journey reading the lag back from the API.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 92  | An undone delete left a deletion with no matching restore                              | 2026-08-31 | The inverse is now the id-stable `restore-batch` rather than a re-create, so `activity.restored` fires with the original id and the pair closes. It also stopped the re-create silently dropping every dependency the activity had. Cascade undo is #230.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 160 | `resolveLensPalette` was resolved twice per cycle                                      | 2026-08-31 | One memo, both maps derived from it — which also makes the `barFill`/`barInk` pairing come from one resolve, as it must.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 171 | `schedulepoint-active-org` was never cleared and carried no user id                    | 2026-08-31 | Keyed `<prefix>:<userId>` matching `recent-plans`, and swept beside `forgetAllForUser` at sign-out. On a shared machine the next person in was silently sent to the previous person's organisation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 108 | The plural drag: model, command and endpoint landed, the gesture did not               | 2026-08-28 | `useBatchPlacements`/`moveMany`/`bulkPlacementCommand` plus `livePeerGhostRects` drawn into the overlay.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 128 | The multi-select journey's post-delete focus assertion was flaky                       | 2026-08-24 | `focusListboxAfterModal` is a bounded self-verifying retry, not one rAF — a different remedy from the one this row prescribed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 179 | Changesets v3 stopped versioning private packages silently                             | 2026-08-23 | `privatePackages: { version: true, tag: false }`. The residual it called untestable has since been exercised by a real bot-cut release.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 185 | The command deck was 182 px tall and nobody measured it first                          | 2026-08-25 | Stacked geometry and its `!important` overrides deleted, every control inline. The row's height table was superseded three times (ADR-0110/0112/0115).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 189 | The command deck's search field made 18 of 27 commands unreachable by key              | 2026-08-25 | One shared `toolbar-keyboard.ts` consumed by `Deck` and `Toolbar`; `containerShouldStandDown` called first in both.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 192 | The fix for #189 broke the shipped `Go to date` field                                  | 2026-08-25 | `toolbar-keyboard.ts` discriminates on `HTMLInputElement.type`, not `tagName`, and both containers import it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 196 | Two primitive keyboard defects, one a data-loss path                                   | 2026-08-28 | Fixed in the primitives. Two latent residuals carried out to #229 rather than closed with it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 198 | `inkOf` measured a span, not ink                                                       | 2026-08-27 | `coveredWidth` merges leaf x-intervals; `spanOf` kept separately under a name that says what it is.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 199 | `shoot.mjs` could not photograph three of its own shots                                | 2026-08-28 | Located by `[data-toolbar-item]` rather than by copy, and a per-shot catch exits non-zero naming every missing picture.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 212 | An overlay's height ceiling was measured from its own output                           | 2026-08-28 | `overlayMaxHeight()` is viewport-constant with no `top` term; both consumers call it and a structural test pins that they do.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 186 | WCAG 2.5.8 lost its only automated cover when the fit gate was deleted                 | 2026-08-25 | `e2e-workspace-fit/command-surface.spec.ts`, its own CI step. ADR-0110 D5 later found that sweep blind to a split button's caret and fixed it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 188 | Eight of fourteen measurement harnesses could not run                                  | 2026-08-26 | Seven deleted, one repaired, estate green — and the row's own inventory was wrong in three ways, which the close records.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 190 | `Toolbar`'s vertical variant had no consumer, and a standard documented it             | 2026-08-26 | Deleted on the product owner's call — the prop, its three branches and the `DESIGN_SYSTEM.md` rule in ONE commit, so code and standard could not drift apart.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 207 | The deck's folded groups were unreachable by any journey                               | 2026-08-25 | ADR-0110 M4 — and the subject was then removed entirely on the product owner's steer, so the fold no longer exists.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 209 | The bulk-delete focus restoration was a race that failed once under load               | 2026-08-24 | Reproduced under load the same day and hardened; `focusListboxAfterModal` self-verifies.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 183 | `check:claims` could not see a camelCase basename in its colon form                    | 2026-08-31 | The class carries `A-Z`. It hid 15 citations resolving to **seven** unregistered claims into `useBlocker.js`/`Transitioner.js` — the behaviour ADR-0108 rests on. All seven read and registered.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 178 | `check:claims` resolved a package by the first store entry it found                    | 2026-08-31 | Resolved through the LINK, with `resolveVia` naming the dependent for a transitive package. It was live on `axe-core`: the register was pinned to 4.12.1 while the journeys run 4.13.0.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 217 | Two defects in the printed documents, found by photographing them                      | 2026-08-30 | Both, plus two more the fix's own photographs found. The harness had one print shot; the two documents a planner hands over had never been photographed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 153 | Three icon sizes in one family of canvas panels                                        | 2026-08-29 | ADR-0118 M3, and not the way this row or its epic's plan said: `icon-lg` was deleted and all three panels unify on `icon`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 145 | A hand-rolled `Combobox` took the platform picker away on touch                        | 2026-08-29 | ADR-0118 M3, closed by measurement rather than argument — including the open list's 32 px options, which nobody had asked about.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 210 | The panel-Surface-plus-border pairing was a literal in four places                     | 2026-08-28 | Fix-slice M-D — **seven** pairings, not four; the new structural gate's first run found three the row and the spec both missed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 205 | The fixture plan was unschedulable as seeded, and the horizon guard was an untyped 500 | 2026-08-28 | Both halves — `7aaf155c` and fix-slice M-E's fixture revision.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 203 | Two menu-positioning clamps, one measured and one guessing                             | 2026-08-28 | Fix-slice M-C. Both moved verbatim to `components/ui/overlay-position.ts`, with a structural gate against the next copy.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 182 | Three base-journey sign-up specs sat close to a 5 s timeout                            | 2026-08-28 | Correctness programme Phase 2 — the row's own first candidate: an explicit `{ timeout: 15_000 }` with the reason at each site.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 175 | The exported diagram had never carried the date marks                                  | 2026-08-28 | Fix-slice M-F. `EXPORT_MARKER_ROW`, drawn from the same `axisMarkers` model the screen's ruler uses.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 173 | The canvas painter drew every glyph in a typeface the product does not use             | 2026-08-28 | Correctness programme Phase 3 — and the row had itself gone stale: the face is IBM Plex Sans, not Space Grotesk.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 172 | No authenticated journey had ever run below `lg`                                       | 2026-08-28 | `apps/web/e2e-narrow-shell/`, its own CI step. Its first run found the sheet had no ground at all.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 170 | Three axe scans ran every rule, because `.options()` replaces `.withTags()`            | 2026-08-28 | Correctness programme Phase 4 — and the siblings were **two**, not three: the third died with the width ladder.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 167 | The exported diagram was the default picture, not the planner's                        | 2026-08-28 | Correctness programme Phase 3. `TsldCanvasHandle.getSceneLenses()` reads all five lens keys off the live scene ref.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 166 | A whole-plan export of a long programme lost weekends entirely                         | 2026-08-28 | Correctness programme Phase 3. `paintScene` gains a `minNonWorkingPx` seam; the export passes `0`, so a weekend is one crisp band.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 162 | The legend's slack chip did not match what the canvas paints                           | 2026-08-28 | Correctness programme Phase 1. The swatch names `--primary` + `--border`, confirmed at `palette.ts` rather than recalled.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 152 | `zoomToSelection` framed the time axis and discarded the lane axis                     | 2026-08-28 | Correctness programme Phase 1. `revealOffset` in `render/viewport.ts` — one implementation, shared with `zoomToActivity`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 150 | The drawer overloaded "Close", and the editor's Close left an empty panel open         | 2026-08-28 | Correctness programme Phase 1 — overtaken by ADR-0101, verified rather than assumed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 143 | The Project Explorer could not open a client or a project                              | 2026-08-28 | Correctness programme Phase 1. `activate` now navigates for every kind; the container toggle keeps its own surface.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 133 | A coarse pointer cost the merged strip two commands, one of them Next conflict         | 2026-08-28 | Overtaken — ADR-0109 D1 deleted the width ladder and the `⋯`, so nothing can leave the row. Re-measured at 1646.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 131 | An icon-only toolbar control named itself only on hover                                | 2026-08-28 | ADR-0117 (fix-slice M-B). `useTooltip` in `components/ui/tooltip.tsx`, WCAG 1.4.13 in full.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 130 | The zoom trigger's icon said "date range" while owning the viewport                    | 2026-08-28 | Overtaken — ADR-0109/0110 deleted the control this row describes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 176 | Better Auth 1.7 needed a schema migration, and a minor bump is how we found out        | 2026-08-23 | ADR-0107. Both workspaces run `^1.7.1`; `accounts.issuer` migrated in two releases.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 122 | Two Class A flags were deferred, and the payoff was not where the register said        | 2026-08-17 | `VITE_ACTIVITY_EDITOR_TABS` retired with ADR-0089; `VITE_CANVAS_WORKSPACE` in the flag-cleanup pass. `classACap` is now **0**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 112 | Copy/paste follow-ups from the W5 enablement gate                                      | 2026-08-08 | `ActivitiesTable.row-gate-identity.test.tsx` and `use-clipboard-keybindings.test.ts` pin both, each saying so in its own docblock.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 106 | `render-model.ts` could not be barrel + core model without a cycle                     | 2026-08-30 | ADR-0078 S8. `render/geometry.ts` exists; the barrel is 128 lines.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 109 | `bulkDelete` cascaded one activity at a time under the plan lock                       | 2026-08-30 | `cascadeSoftDeleteActivityLeaves`, shipped in `3cf27de4` (an ADR-0082/0083/0084/0085 commit).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 104 | The manual Recalculate confirmation stood down against a settle that never came        | 2026-08-30 | The row's own scenario was already guarded in the commit it was raised from; the real defect was the inverse. `settleIsComing`, two tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 114 | Two menus hid rather than shaded, for want of a reason to show                         | 2026-08-30 | Verified in code: `menu.tsx:316-325` shades with `aria-disabled` and keeps roving focus; `plan-actions-menu.tsx:70` passes `disabledReason`; `tree-actions.ts` states the no-trigger rule.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 127 | Toolbar touch targets were 40 × 36 against a 44 × 44 house rule                        | 2026-08-29 | ADR-0118 — the rule became per-pointer, and the coarse gate enforces it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 134 | A `render` item outranked every command on its row                                     | 2026-08-30 | ADR-0109 D1 deleted the ladder; the diagnosis was right and the remedy expired with it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 144 | `e2e-multi-select`'s focus assertion failed under sweep load                           | 2026-08-30 | `focusListboxAfterModal` self-verifies; `e2e-overview`'s `createPlan` waits for the pen. Filed under #184.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 146 | The `chrome` surface scope had no measured current-page state                          | 2026-08-30 | ADR-0109 D2 restored the header, so `e2e-designed-ui` D3 measures two scopes again.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 147 | The merged command strip stopped fitting below ~900 px                                 | 2026-08-30 | ADR-0109 D1 — the surface wraps; the ladder, the `⋯` and the floor are gone.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 148 | Canvas date pills were painted on top of the first two lanes                           | 2026-08-22 | ADR-0106.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 157 | Every colour gate was a floor and none a ceiling                                       | 2026-08-21 | ADR-0102 — ANSWERED, deliberately no gate: the window is two points wide and tuned to two samples.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 158 | The printed and exported diagram was painted on a near-black ground                    | 2026-08-21 | ADR-0102.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 159 | `--color-*` aliases were frozen at `:root`                                             | 2026-08-21 | ADR-0102 — the canvas painter had never once used the canvas surface scope.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 163 | The print palette was a surface family truncated to three members                      | 2026-08-22 | ADR-0103 — `[data-surface="print"]` is all 31 members.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 164 | The exported diagram silently dropped seven default-on view layers                     | 2026-08-22 | ADR-0103. One half remains open as **#166**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 168 | Below `lg`, Escape closed and announced a drawer the reader could not see              | 2026-08-22 | ADR-0104.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 201 | Two independent mode toggles read as one four-way group                                | 2026-08-30 | ADR-0119; released in `web-v0.115.3`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 213 | Two controls painted and not clickable at 390, and a 20 px breadcrumb                  | 2026-08-29 | ADR-0118 M3 — the first was off-screen; the second is a named exception.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 115 | The pen sentence named a button the reader could not see                               | 2026-08-09 | ADR-0083 M7 — one refusal sentence chosen from the live role and pen state.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 124 | The selection bar's `<Toolbar>` had no fit coverage                                    | 2026-08-27 | ADR-0114 M1 — and the row's own reasoning was wrong: the bar could overflow, by 408 px.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 219 | The register's rows went stale and nothing measured how much                           | 2026-08-30 | ADR-0120 — `check:debt-status`; every row now carries a machine-readable status.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 220 | The reconciliation trigger's input was unsorted prose, and a reader misread it         | 2026-08-30 | ADR-0120 — `check:reconcile-due`, advisory at T = 8 ADRs; the pass table is sorted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 98  | The guest share view scrolled sideways at 320 px (WCAG 1.4.10)                         | 2026-08-08 | ADR-0051 F-M4 era; closed by the guest-share responsive fix.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 29  | Released images not pulled — "shipped but not live"                                    | 2026-07-30 | ADR-0047; `docs/DEPLOYMENT.md`. Superseded by #5.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 59  | The device-authoritative draw measurement was never made                               | 2026-08-03 | Folded into **#75**, which waits on the same single run.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 77  | The demo Unit 300 file was a lossy rendering of the fixture                            | 2026-08-01 | ADR-0066; `docs/TEST_PLAYBOOK.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 78  | Public activity/dependency API was day-denominated                                     | 2026-08-02 | ADR-0070. `durationMinutes` / `lagMinutes` are on both DTOs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 79  | A window-only calendar was rejected by the API                                         | 2026-08-01 | ADR-0067. Pinned by `calendars.e2e-spec.ts` "window-only".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 80  | Intraday shift patterns had no write path                                              | 2026-08-01 | ADR-0067. `shifts` on the calendar create/update DTOs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 82  | Shift-editor epic — the non-blocking half of five gates                                | 2026-08-01 | ADR-0067 M4; all seven sub-items landed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 87  | Import rejected a file with two activities of the same name                            | 2026-08-03 | Fixed in `validate.ts` (`repairDuplicateCodesAndNames`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 90  | `idx_audit_events_actor_occurred` was never measured                                   | 2026-08-03 | Measured at 1M rows; ADR-0072 "Storage measured (2026-08-03)".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 91  | A failed sign-in was recorded and readable by nobody                                   | 2026-08-04 | ADR-0073 C2. Attributed at write time; `/me?include=attempts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 30  | Canvas-first workspace fast-follows (ADR-0030 M1–M5)                                   | 2026-08-08 | Verified done: `components/ui/segmented-control.tsx` + four `usePlanWorkspaceModel` hook suites.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 85  | Two `react-hooks/refs` suppressions in the toolbar-context memo                        | 2026-08-07 | ADR-0078 S11 split the commands out; zero suppressions remain.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 94  | A verification email that never sends is invisible to everyone                         | 2026-08-08 | Every remediation paid; ADR-0075 records the decision. Live gap is **#100**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 111 | The row menu hid pen-gated actions instead of shading them                             | 2026-08-08 | ADR-0082, merged `d8d8c34`. `itemsOf` keeps disabled items; `disabledReason`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 103 | ADR-0064's recalculation hold was not wired on the shipped host                        | 2026-08-08 | Debt-paydown M1-T1; pinned in `plan-workspace-toolbar.test.tsx`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 107 | ADR-0080 shipped without the specialist-agent review pass                              | 2026-08-08 | ADR-0080 §9 — the pass ran and folded five blocking defects.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 113 | Redo unavailable after undoing a band copy                                             | 2026-08-08 | `DELETE …/activities/:id` answers `200 { deleteBatchId }`; `docs/API.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 119 | The API e2e suite "fails intermittently"                                               | 2026-08-10 | Order-dependent, not flaky. The live residue is **#119a**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 125 | `View ▾` held one toggle that ejects you from it                                       | 2026-08-12 | ADR-0090 M5 — a standing note, `aria-describedby`-linked, with a neighbour test.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 83¹ | A typed duration overwritten by the calendar factor landing                            | 2026-08-02 | ADR-0070 M6. `useDurationSeed` reads the field, not a flag.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 135 | The Gantt drew a VISUAL plan's bars from the early-date columns                        | 2026-08-17 | ADR-0095. `barGeometry` takes a `source`; `date-source-consistency.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 136 | The Gantt's M5 remainder — T1, T4, T5, T6                                              | 2026-08-18 | ADR-0095 M5, released `web-v0.92.0`. `e2e-gantt-editing/view-state.spec.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 137 | The shortcuts sheet was inert while the Gantt was on screen                            | 2026-08-18 | ADR-0095. `PlanShortcutsHelp` mounts at the workspace, above both views.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 126 | The two segmented pairs had no icons, so they could not go icon-only                   | 2026-08-20 | ADR-0099 M5 chose all four and moved them to the rail, where they render icon-only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 129 | The 56 px app header row was the last recoverable band above the canvas                | 2026-08-20 | ADR-0099 M3 deleted it at `lg`+ (`chrome-band.tsx` — `lg:hidden`). `aboveCanvas` 249 → 135.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

¹ **The collision.** This 83 is _not_ the 83 in the table above, which is open (ADR-0068 §6's missing
usage count). Two pieces of work took the same number. The live row keeps it; this one is recorded
here by title so neither reference is ambiguous.

### 99. `/request-password-reset` leaks account existence through timing

**Status:** unverified · **Found:** 2026-08-05, by the ADR-0075 M4 backend-performance and security gates independently.

The endpoint is uniform in **everything the caller can read** — same status, same body, whether the
address exists or not (ADR-0074, and the property `sendPasswordReset` holds rather than borrows).
It is not uniform in **how long it takes**. Better Auth awaits the send
(`runInBackgroundOrAwait` → `else await promise`, `better-auth@1.7.1`,
`create-context.mjs:220`), so:

| address | work done               | response time          |
| ------- | ----------------------- | ---------------------- |
| known   | token minted, mail sent | a real SMTP round trip |
| unknown | nothing                 | immediate              |

A caller with a stopwatch can therefore distinguish the two, which is the thing the uniform body
exists to prevent. Note this is the **opposite** shape to `/send-verification-email`, where Better
Auth mints a throwaway token and holds a 500 ms floor precisely to equalise the two branches
(`email-verification.mjs:108-121`) — the machinery exists in the library, and this route does not
use it.

**ADR-0075 M4 narrowed it and did not close it.** `SEND_TIMEOUT_MS` bounds the known-address branch
at 10 s, so the observable gap went from "up to ten minutes" to "up to ten seconds". A smaller
worst case is not a smaller signal: a few hundred milliseconds is comfortably measurable over the
network, and the gap is _reliable_ rather than noisy because it tracks a real network operation.

**Options, in the order they should be considered:**

1. **Configure `advanced.backgroundTasks.handler`.** One key. It moves every Better Auth send off
   the request path, which closes this row **and** removes the request-path cost that made M4's
   bound necessary at all. Needs care: the handler owns the rejection, so `mail.send_failed` must
   still reach Pino, and the characterisation suite's four assertions must be re-run rather than
   assumed — they are the record of what today's behaviour is.
2. **A response floor**, mirroring what the library does for verification: hold every answer to a
   fixed minimum. Cheap and self-contained, but it is a floor over a variable, so it only works if
   the floor exceeds a slow send — which is exactly what a bad day removes.
3. **Accept and document.** Defensible, but check the mitigation before leaning on it. The route's
   limit is **3 per 60 s per IP** — its own rule, not the 3-per-10-s one that covers
   `/sign-in`/`/sign-up`/`/change-password` (`index.mjs:311-324`) — and it is
   `enabled: options.isProduction` (`better-auth.ts:271`), so it does not exist in development at
   all. It is also per-replica in-process memory (#14(b)), so the real ceiling is 3 × replicas.
   Three probes a minute still enumerates a targeted list; it does not enumerate a dictionary.

Option 1 is the recommendation, and it is a small enough change that the reason it is not done here
is scope rather than difficulty — it alters how every mail send in the application is dispatched,
which deserves its own change and its own re-run of the characterisation suite.

**Risk:** low-severity, low-frequency. It reveals whether an address has an account — the same fact
a sign-up attempt reveals under a _non_-enforcing configuration — and reveals nothing about the
account itself. It is recorded because the endpoint's whole design is the claim that it reveals
nothing, and a claim that is true of the body and false of the clock is the kind of half-truth this
register exists for.

---

### 100. The operator-facing mail signal still has no operator-facing channel

**Status:** open · **Raised:** 2026-08-09 · **Size:** S

> **Programme M3-T2/T3 shipped both halves that live in this repository.**
> `scripts/watch-mail-failures.sh` greps `mail.send_failed` from the API container and POSTs to a
> non-email channel (it refuses to run without `SP_ALERT_URL` rather than watching silently), and
> both compose files now set `json-file` rotation at 10 MB × 3 on every service — Docker's default
> has none.
>
> **What is left is a host action**, and it cannot be done from here: add the cron line
> (`docs/DEPLOYMENT.md` "Alerting on mail failures") and pick the channel. Until that runs, the
> signal still reaches nobody — so this row stays open on the operator half rather than being
> closed on the code.
>
> **Update, staff console M1 (2026-08-09): both halves now have an in-application replacement, and
> the operator half is STILL OPEN.** That combination is the point of this update, so it is stated
> before the improvements.
>
> `MAIL_ALERT_URL` makes the API post the mail-failure signal from inside the container — no Docker
> socket, no container name to get wrong, no log window to tune, coalesced so a broken relay
> produces one alert and one summary rather than one per send. `HEARTBEAT_URL` replaces the script's
> "cannot read logs" branch, which could never have worked in the case that matters: the cron runs
> on the host it is watching, so a host outage stops the watcher and emits nothing, and that silence
> looks exactly like health. An outward heartbeat inverts the signal so silence **is** the alarm.
>
> **Neither closes this row, and writing the code is not the closing act.** Nothing is watching the
> heartbeat: it ships built and dormant by choice (CQ-4, 2026-08-09 — the product owner chose to
> build it and wire a receiver later, over the spec's own fallback of not building it at all). Until
> a dead-man's-switch check exists and a `MAIL_ALERT_URL` is set on the host, the signal still
> reaches nobody — which is the exact failure this row records, and shipping a second mechanism
> nobody receives would be committing it twice rather than fixing it.
>
> **Closing conditions**, so this is a test rather than a judgement: (1) `MAIL_ALERT_URL` set on the
> deployed host and observed alerting on a **broken relay** — the observation is the evidence, not
> the unit suite; (2) an external dead-man's-switch created and `HEARTBEAT_URL` pointed at it.
> `scripts/watch-mail-failures.sh` stays in-tree as the fallback until (1) has been observed.
>
> **Condition (1) said "a genuinely broken relay" until 2026-08-09, and that wording could not
> fire.** A relay does not break to a schedule, so an operator waiting for a real failure retires
> the cron either never or on a day nobody is watching — which leaves this row open indefinitely
> while the code that closes it sits deployed and unproven. The condition is now an **induced**
> failure, and `docs/DEPLOYMENT.md` "Retiring the cron" gives the two-minute reversible procedure:
> confirm the heartbeat first (it proves outbound POSTs leave the container at all, the shared
> prerequisite), point `MAIL_SMTP_URL` at a dead port, trigger one password reset, watch the
> receiver, then confirm the row landed in the staff console's Mail panel — the durable half — and
> restore. Observing a real outage still counts; it is no longer the only way.

**Owner confirmed 2026-09-01:** put to the product owner as one of the rows needing their input,
the answer was _"I'll set them on the host"_ — so both closing conditions are theirs to satisfy and
nothing here is owed. The row stays **open** until (1) has been observed, deliberately: a row closed
on an intention is a row that says the signal reaches someone when it may not.

**Found:** 2026-08-06, immediately after releasing ADR-0075, by the product owner asking how to
action the release note's instruction to "update your mail alerting".

**There is no alerting to update.** ADR-0075's entire remedy is that a mail failure is surfaced to
the operator as a greppable log record (`event: "mail.send_failed"`), and its Consequences section
opens with **"An operator can write an alert that fires"**
(`docs/adr/0075-mail-delivery-is-best-effort.md:143`). That sentence is true and it is not the same
as an alert existing. Verified rather than assumed:

| Link in the chain         | State                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| The API emits the record  | ✅ `smtp-mail.service.ts`, structured, with correlation id and redaction                    |
| `DEPLOYMENT.md` names it  | ✅ "Alert on this" — but it gives a **term**, not a mechanism                               |
| Logs leave the host       | ❌ no shipping. `grep -rln "Loki\|Grafana\|Datadog\|Sentry\|promtail"` → docs only          |
| Anything evaluates a rule | ❌ `docs/OBSERVABILITY.md:80` — "Monitoring & alerting — **standard, not yet implemented**" |
| A human is notified       | ❌ nothing                                                                                  |

So the record lands in `docker logs` on the host and stops there. The one place any doc shows an
operator reading logs at all is `docs/DEVELOPMENT.md:44`, which is a **development** instruction.

**This is the ADR's own premise not holding.** ADR-0075 chose operator-facing over caller-facing
because delivery failure must not reach the caller (the enumeration argument, which is sound and
unaffected). The unexamined half was whether "operator-facing" reaches an operator. It does not —
it reaches a file. A signal nobody receives is the same amount of information as no signal, which
is what that ADR set out to fix.

**Two adjacent facts found while checking, both accurate as of 2026-08-06:**

- **Neither compose file sets a `logging:` block**, so Docker's default `json-file` driver applies
  with no `max-size` or `max-file`. On a long-lived host the API log grows unbounded, and the
  grep this row is about gets slower the longer it goes unnoticed. `max-size: 10m` /
  `max-file: 3` on `api` and `web` is the whole fix.
- **`WATCHTOWER_NOTIFICATION_URL` already exists** in `docker-compose.release.yml`, defaulted
  empty. A shoutrrr channel is therefore _half_ wired: setting it gives Watchtower deploy
  notifications, and the same URL would serve a log watcher. It cannot serve this row by itself —
  Watchtower reports on container updates, not on log contents.

**Remediation, cheapest first.** All three are host-side operational work, not application code,
which is why none of it is gated by CI:

1. **A cron log-watcher.** ~15 lines: `docker compose logs api --since` over the interval, grep
   `mail.send_failed` and `mail.transport_check_failed`, POST to a notification URL on a hit.
   Add the `logging:` rotation block in the same change.
2. **Real aggregation** — Promtail → Loki → Grafana, or a hosted service, with an alert rule on
   the same terms. This is what `OBSERVABILITY.md` §"Monitoring & alerting" describes as the
   eventual standard, and it would also close the metrics/tracing halves of ADR-0013.
3. **Accept and document** — say plainly in `DEPLOYMENT.md` that mail failures are discoverable
   only by looking, and that nobody is watching. Least work, and honest, which beats an "Alert on
   this" instruction that reads as though a mechanism exists.

**The notification channel must not be email.** The condition being reported is "mail is broken",
so an emailed alert cannot send in exactly the case it exists for — and the deployed host's only
configured transport is the SMTP relay. ntfy, a Discord/Slack webhook or Telegram all avoid the
circularity; shoutrrr (already present for Watchtower) speaks all three.

**Risk:** low-frequency, high-consequence. It needs a broken or misconfigured relay to bite. When
it does, every affected sign-up, invitation and password reset fails silently, the caller is told
nothing by design, and — this row's point — the operator is told nothing by accident. The window is
open-ended rather than bounded by a poll interval, because there is no poll.

---

### 101. `check:claims` completeness has structural blind spots

**Status:** open (narrowed) · **Owner:** repo · **Raised:** 2026-08-06 (ADR-0077 M0-T2) ·
**Narrowed:** 2026-08-08 (W5 M2-T4)

`pnpm check:claims` (ADR-0076) shipped matching one citation form, `<base>.mjs:<line>`, and passed
green on the day it was written **because it could not see half its input**. ADR-0077's M0-T2 widened
it — both `.js` and `.mjs`, the prose form ("`dist/api/routes/sign-in.mjs`, lines **264**"), and an
exclusion for files this repository owns — and the widening immediately surfaced **two dependency
citations that had been in the tree unregistered all along**: `nodemailer`'s `_formatError` and
`zod`'s `allowsEval` probe. Both were verified and registered. Two limitations remain, recorded here
rather than solved, because each trade is a real one:

1. **The own-file exclusion is by basename.** `ownJsBasenames()` runs `git ls-files` and excludes any
   citation whose basename this repo also has. If a dependency file and a repo file ever share a
   basename, an **unregistered** citation into that dependency is silently skipped. Today there is no
   collision (the set holds no `index.js`/`index.mjs`, and `@better-fetch/fetch`'s `index.js:733-739`
   is registered, which is checked before the exclusion). Matching on full paths instead was rejected
   because prose legitimately writes both `dist/api/routes/sign-in.mjs` and `sign-in.mjs` for the same
   claim, and neither is wrong.
2. **The scan walks four directories** — `docs`, `apps/api/src`, `apps/web/src`, `apps/api/test`. A
   citation in `packages/*`, `apps/seed-cli`, a root config or a `README` is not scanned, so it is
   neither demanded nor checked. Widening it is cheap; what is not free is that each new directory
   can surface unregistered citations that then need a human to read the cited code, which is the
   whole point and also the cost.

   **Mostly done, 2026-08-08.** W5's M2-T4 measurement needed to cite `@nestjs/throttler`'s key
   derivation from `scripts/measure-band-copy.mjs`, which the gate could not see — so the walk now
   covers `scripts`, `packages` and `apps/seed-cli` as well. The cost was **measured before the
   change rather than after**: a standalone scan of those three trees with the live patterns turned
   up **zero** unregistered citations, so this widening was free, not hopeful. What remains is
   root-level markdown, which is left out on purpose: it would demand `sign-up.mjs:163` (a real
   claim, cited in `CLAUDE.md` at a line range that differs from the register's) and one more that is
   `CLAUDE.md`'s own worked example of this notation. Both need a human, which is exactly the cost
   this item describes.

3. **A dotted dependency basename was truncated.** _(Found 2026-08-08, fixed the same day — a third
   hole, not one of the two above.)_ The basename class was `[a-z0-9-]+`, so
   a citation naming `@nestjs/throttler`'s `throttler.guard.js` was captured as **`guard.js`** — the
   basename truncated at its last dot rather than taken whole. A register entry keyed on the real
   basename therefore read as "uncited" while the citation itself read as "unregistered" — the gate
   reporting both halves of one claim as broken and neither as matching.
   It surfaced only because acting on item (2) brought the first dotted-basename citation into
   scope. The class now admits `.`; `/` is still excluded, so a leading path still falls away.
   `scripts/check-claims.mjs` is also excluded from its own scan, because its comments carry worked
   examples of the notation and a gate that reads its own documentation as input makes the format
   impossible to document.

**Why not now:** (1) is bounded and cannot produce a _false_ pass on a claim the register already
holds — it can only fail to _demand_ a new one.

**Risk:** low. The gate's core property (a registered claim's anchor is verified against the pinned
version, and a version bump fails CI) is unaffected.

---

### 102. The public screens' deferred review findings (ADR-0077 M6-T2)

> **(1) is CLOSED (2026-08-08, programme M1-T2).** `/sign-in`'s `?redirect=` is now same-origin by
> shape — one leading slash and not two, so `//evil.test` (protocol-relative, resolved by the browser
> to another origin) is dropped along with absolute URLs and relative paths. A malformed value falls
> back to `/` rather than being repaired. Six cases in `router-search.test.ts` compose the **real**
> parser with the **real** validator, four of them verified red first. The remaining sub-items stand.

**Status:** open · **Owner:** web · **Raised:** 2026-08-06 (ADR-0077 M6-T2)

Six non-blocking findings from the five specialist gates over the ADR-0077 diff, recorded rather than
rushed. Each is real; none blocks the epic.

1. **`/sign-in?redirect=` is not validated as a same-origin relative path.** `router.tsx`'s
   `readForeignParam` accepts any string and `sign-in.tsx` hands it to `router.history.push`. Today
   this cannot navigate off-origin, but **only because `pushState` throws a `SecurityError` for a
   cross-origin `href`** — a property of the History API, not of this code. Swapping to
   `window.location.href`, an `<a href>`, or a server-side redirect would turn it into a real open
   redirect with no diff to the reading file. Pre-existing, not introduced by this epic. Fix: a
   `/^\/(?!\/)/` check in `signInRoute`'s `validateSearch`.
2. **`/accept-invite` does not strip its `?token=` from the URL**, while `/reset-password` — the
   sibling this epic touched — captures its token into state and immediately `replace`s it away. An
   invitation token is a live capability grant, and it sits in the address bar and in browser history
   for the life of the tab. `Referrer-Policy: strict-origin-when-cross-origin` stops it leaking
   cross-origin. Pre-existing; the inconsistency is what makes it worth a row.
3. **No route-level code splitting.** `app/router.tsx` eagerly imports every screen except
   `ShareGuestScreen`, so a first-time visitor to `/sign-in` downloads 1.23 MB / **353 kB gzip** —
   the whole authed app, canvas, Gantt, audit log and all — against the ~200 kB initial-JS target in
   `CLAUDE.md` §15. **Measured** at HEAD against the epic's base commit; this epic added ~2.1 kB gzip
   in total, so it is not the cause. It is on the list because this epic's own framing (the coldest
   page in the product, LCP-sensitive) is what makes it newly relevant.
4. **`GET /me` now fires on the token-less `/accept-invite` branch**, which previously made no request
   at all: `InviteExitLinks` calls `useSession()` so it can offer a signed-in reader "Go to
   SchedulePoint" instead of a sign-in form they do not need. A deliberate trade, one small same-origin
   request, on one degenerate state — but it is the single place in the diff where a request-free
   public screen gained a request.
5. **No regression test pins "the brand panel contains nothing focusable."** It is true today by
   inspection of its three children, not by construction; the day somebody adds a "Learn more" link
   inside the `aria-hidden` panel it becomes a hidden-but-reachable focus stop (WCAG 4.1.2/2.4.3) and
   nothing fails.
6. **`useDocumentTitle`'s docblock claims a title change is "the first thing a screen reader
   announces on navigation."** That is unreliable for **client-side** route changes unless paired
   with a focus move, and none of the six public routes move focus on navigation — an app-wide SPA
   gap, not one this epic introduced. The hook is correct and worth having; the sentence overstates
   what it delivers, which is exactly the ADR-0076 / CLAUDE.md §19.10 failure applied to this epic's own artefact.

**Why not now:** (1) and (2) are hardening on pre-existing behaviour with no live exploit; (3) is an
architecture-sized change that wants its own measurement and its own decision; (4)–(6) are small and
independent. Doing them inside the enablement milestone would mean shipping six unreviewed changes
in the pass whose purpose is review.

**Risk:** low individually. (1) is the one that changes character if the navigation mechanism is ever
swapped, which is why it is written down rather than remembered.

---

**Next free number: 103.**

### 105. Two follow-ups from the canvas status & feedback gate pass

**Status:** open · **Owner:** web · **Raised:** 2026-08-07 (canvas status & feedback, M6)

Non-blocking findings from the three specialist gates over the epic diff. Both are real; neither
blocked the epic.

1. **`ToolbarItemRenderApi` does not expose the resolved `busy`.** M5 widened the registry with
   `isBusy?: (ctx) => boolean`, resolved once in `resolveItems` and read by `ToolbarButton` — but the
   `render` escape-hatch's api object still carries only `disabled`/`disabledReason`/`active`/
   `itemProps`. No `render` item declares `isBusy` today, so this is latent rather than broken. The
   trap is that `ToolbarItem.isBusy`'s docblock reads as a general contract and does not scope itself
   to plain-button items: the first Tier-2 popover trigger that wants a busy state will silently have
   no way to read it and will re-derive it from `ctx`, which is the two-derivations-of-one-fact
   pattern this same epic eliminated twice elsewhere.
2. **`EXPORT_LEGEND` is still a hand-authored mirror of the DOM legend** (`render-export-image.ts`,
   already TECH_DEBT #48(e)). This epic **extended** it — adding the Data date entry in the same PR
   as the DOM entry, which is the mitigation the plan called for — rather than fixing the pattern.
   Worth noting because the same epic proved it knows how to fix this class of bug: it gave WBS group
   labels one producer (`wbsGroupLabelById`, consumed by both the legend and the spoken clause) and
   listbox row text one producer (`composeListboxRowText`, consumed by both the row and the
   announcement). The export legend is the third instance of the same shape, left alone.

### 110. Milestone B (server-side duplicate endpoint) deferred, with the measurement attached

**Status:** deferred (on a measured trigger) · **Owner:** api · **Raised:** 2026-08-08 (W5 M2-T4)

`docs/specs/activity-copy-paste/` planned an optional **Milestone B** — `POST
…/plans/:planId/activities/duplicate`, making a band copy atomic: one transaction, one pen
assertion, one advisory lock, one audit row, and no partial-paste residual risk at all. It was
deliberately written as a **measured trigger rather than a judgement call**: taken if the M2-T4
measurement exceeded the stated p95 gate, or if the M5 journey observed a single partial paste.

**The first half did not fire.** Measured against a real API with the pen held
(`scripts/measure-band-copy.mjs`):

| Band                    | Requests | Wall clock | Create p50/p95/max | Link p50/p95/max | 429s | Partial paste |
| ----------------------- | -------- | ---------- | ------------------ | ---------------- | ---- | ------------- |
| 15 activities, 21 links | 37       | 969 ms     | 20 / 50 / 50 ms    | 24 / 46 / 56 ms  | 0    | no            |
| 40 activities, 58 links | 99       | 2 142 ms   | 19 / 22 / 23 ms    | 22 / 30 / 34 ms  | 0    | no            |
| 60 activities, 90 links | 151      | 2 898 ms   | 17 / 19 / 37 ms    | 20 / 23 / 27 ms  | 0    | no            |

The gate was p95 < 2 s for 15 activities + 21 links; the measurement is **969 ms**, and no size
produced a partial paste. Per-request cost is flat and wall clock linear, so the composite does not
degrade with band size in the range that matters.

**What the measurement did change is the caps, and that is what makes this deferral safe.** The
binding constraint is not latency but the API's own rate limiter, whose shape is not what the config
reads like: `ThrottlerGuard.generateKey` hashes the class and handler names into the counter key, so
the bound is 100 requests per 60 s **per route handler** per IP. A copy issues `N + 1` writes on the
activity-create handler and `M` on the dependency-create handler, and the web client has **no
back-off** — so the spec's provisional 200-activity cap would have 429'd on its 100th create and left
exactly the partial paste M-B exists to remove. The caps are now **50 activities and 90 internal
links** (two, because the counts hit different counters), measured rather than asserted. Those caps
are load-bearing for this deferral, not incidental to it: raising either without re-reading this
entry re-opens the partial-paste risk.

**Why not now:** it is a new endpoint, DTO, service method, census entry, OpenAPI change and
`@repo/types` change — real backend work with its own review surface — for a capability that is
proven, shipped and inside its budget without any of it. Taking it would need an ADR (endpoint shape,
the `activity.duplicated` audit action, and why a client composite was not enough).

**The second half of the trigger is still live.** A single partial paste observed by the M5 journey
takes M-B. So is a third route: if a planner ever needs to copy a band larger than 50 activities,
the client composite cannot be stretched to it — the rate limiter is the ceiling, and a server-side
endpoint is the answer rather than a bigger constant.

**Risk:** low while the caps hold. The residual is a copy interrupted mid-flight (a dropped
connection, a 423 from a pen taken away) leaving some clones written — bounded by the caps, visible
on the canvas, and undoable by the ADR-0048 command the composite already registers.

---

### 116. Consolidation-pass findings that were not folded

**Status:** open · **Owner:** web · **Raised:** 2026-08-08 (the A–D consolidation pass)

Five specialists reviewed the combined #108/#113/#111 diff. Ten findings were folded with regression
tests; these are the ones deliberately left, each with the reason, so they are not rediscovered as
though nobody had looked.

**1. The plural move is pointer-only.** `useCoalescedNudge` commits through the single-activity
`notedReposition` and has no plural awareness, so a planner with twelve bars selected still nudges
them one at a time by keyboard while a mouse drag moves all twelve. Not a WCAG 2.1.1 failure — the
function is available, just not in bulk — which is why no gate flagged it. It is the same defect #108
fixed for the pointer, one input modality along, and it is the reason the accessibility review scored
the next item's audience as small: the people who cannot hear the drag hint largely cannot perform
the gesture either. Fixing it means teaching the nudge hook the selection, which is a slice.

**2. The drag hint is never announced.** `BulkSelectionBar`'s "Dragging any of these moves all N
activities." is static text with no live region, and `announceSelectionCount` says only the count. A
screen-reader user is never told the consequence a sighted user reads beside the buttons. Deliberately
**not** fixed here, because announcing a pointer-only capability while (1) stands would be telling
that reader about something they cannot do. It should land **with** (1), not before it.

**3. A shaded row-menu item's reason is `sr-only`; the canvas bar's is visible.** ADR-0082's premise
is that one operation should not teach two mental models, and for a sighted mouse-only user it still
does: the canvas prints the sentence, the row menu holds it for assistive technology only. The
honest reason it was not fixed then is that there was **no Tooltip primitive** in `components/ui/`,
and a one-off `title` is what ADR-0082 just removed. _(Corrected 2026-08-28: this row's "adding one
is an ADR-level decision (CLAUDE.md §5)" over-read that section — §5's clause is about adding a
component LIBRARY; a hand-rolled primitive is the house pattern, and what actually made it
ADR-shaped was ADR-0105's public-contract trigger. The primitive now exists — ADR-0117 — so the
remaining question here is narrower and stands: should a shaded LABELLED control's reason become a
visible `purpose: 'description'` tooltip? That changes ADR-0082's rule product-wide and was
deliberately declined in the fix-slice epic (its CQ-2); it needs its own review, not a default.)_

**4. `HierarchyTree` is a third bare-boolean menu.** _(Closed 2026-08-09 as correct by design —
see #114's banner; the rule is now stated at `tree-actions.ts` rather than inferred.)_ `tree-actions.ts`'s `nodeActions` returns `[]`
for a non-writer, so the trigger disappears. ADR-0082 records it as unchanged-by-design, and the
component review's point stands: it belongs with `plan-actions-menu.tsx` in #114 as the same
"no reason to show" shape rather than filed apart from it. Treat #114 as covering all three.

**5. `DeleteActivityFn`'s `| void` branch is vestigial.** Since #113 every real caller resolves the
object, so `pasteActivitiesCommand`'s runtime `if (result && typeof result === 'object')` guard is
dead weight. Tightening the type is a small cleanup with no behavioural change.

**Risk:** (1) and (2) together are a real capability gap for keyboard-driven planners and should be
taken as one slice. (3)–(5) are consistency and tidiness.

### 117. CSP report delivery is unverified end to end

**Status:** unverified · **Verified:** 2026-09-01 (the row's own subject still needs a deployed host)

> **This row had NO `**Status:**` line at all until 2026-09-01, and `check:debt-status` reported
> "71 rows (71 with a status, 0 without)" over a document where that was false.** The cause is in
> the shared parser, not here: `scripts/lib/doc-register.mjs`'s `sections(md, level)` ends a
> section at the next heading **of the same level only**, so this `###` row's body ran 1,115 lines
> to the next `###` and picked up **#118's** status on the way. A9 — the control assertion written
> to answer "did we read less than we think?" — compares heading COUNTS (71 = 71) and is
> structurally unable to see a body-boundary defect. That is ADR-0120 D5's class, inside the gate
> written to close it. The parser fix is filed separately as **#231**; this line closes the hole
> the gate could not report.

**Found:** 2026-08-09, while writing the gate that was supposed to verify it (staff console M4).

`apps/web/e2e-csp` serves the **real** deployed policy over the **production build** and now proves
a violation of it fires with the report directives present. It does **not** prove the report is
delivered, and the reason is structural rather than a gap in effort.

**The Reporting API uploads out-of-band from the browser process, not through the renderer's network
stack, and it batches with a delay.** Playwright's `page.route` intercepts renderer requests, so it
cannot see the upload at all. Observed across two attempts: the violation fires every time and no
request is ever interceptable. That is a limitation of the harness, **not evidence that delivery
fails** — and the difference is why the suite does not assert it. A gate that is permanently red
gets deleted rather than fixed (ADR-0058).

**What is verified**, and by what:

| Claim                                                           | Established by                                     |
| --------------------------------------------------------------- | -------------------------------------------------- |
| The directives do not break the policy; a violation still fires | `e2e-csp`, real policy, production build           |
| The API accepts both wire formats                               | `csp-report-body.spec.ts`, 20 unit tests           |
| The API parses the two real content types                       | `csp-report.e2e-spec.ts`, real HTTP, real database |
| A first burst is not lost to a concurrency race                 | the same suite, verified red first                 |

**What is not**: that Chromium resolves a **relative** reporting URL against the document origin,
and which of the two formats it chooses. Both remain reasoned defaults. The API accepts either, and
`app-setup.ts` now registers a parser for both content types — so the residual risk is that reports
are never sent, not that they arrive and are dropped.

**A real hazard surfaced while trying, and it is worth more than the test would have been.** A
policy carrying `report-to` with **no** `Reporting-Endpoints` header reports **nothing at all**: a
modern engine honours `report-to` and ignores `report-uri` once both are present, so the deprecated
fallback does not save you. `nginx.conf` emits both, but if `CSP_REPORTING_ENDPOINTS` were ever
blank while the policy kept `report-to`, reporting would die with no error anywhere.

**How to close it:** deploy, visit a page, and read `GET /api/v1/staff/csp-reports`. It needs one
origin serving both the app and the API, which is the deployed stack and not a preview server —
the same shape as `docs/TECH_DEBT.md` #100's operator half, and closable the same way: by
observation on the host, not by a test.

### 118. Staff-console M6 review findings that were not folded

**Status:** unverified

Six specialists reviewed the combined M1–M5 diff. Eight blocking findings were folded with
regression tests verified red first (the denial audit row, the missing `nextCursor`, the undeclared
OpenAPI auth/404/429, the absent document title, four hand-rolled tables, the un-announced settled
panels, the never-built dual-hat banner, the unindexed activity read). These four survive as debt
rather than being rushed:

**1. `csp_reports` and `mail_events` have no retention sweep, and one of them is written by an
unauthenticated endpoint. (CLOSED 2026-08-10 — ADR-0087.)** ADR-0085 D3 settled the period at 12
months and nothing enforced it —
`apps/api/prisma/migrations/20260809160000_csp_reports/migration.sql` still says so in its own
comment ("the true retention today is forever"), and **that comment cannot be corrected**, because a
landed migration is checksummed; `docs/DATABASE.md` carries the current statement instead. The
security review's point sharpened the priority rather than adding a new fact: the CSP write path
needs **no credential**, and stripping only the query string from `blocked_uri`/`document_uri`
leaves the path, so unique rows are trivially mintable at 20 per request × 60 requests/minute per IP.
Separately, `mail_events.recipient` retained a real customer address indefinitely, which is the thing
ADR-0085 spent a decision keeping erasable.
**Closed by building the sweep**: an in-process hourly `setInterval`, batched at 1,000 rows on
`ctid`, capped at 50,000 a run, with `RETENTION_SWEEP_ENABLED=false` as the rollback. Two residuals
are **not** closed with it and are carried below as #118a and #118b — one because the sweep may never
touch `audit_events`, and one because the CSP period was always a claim about staleness rather than
about data age.

**2. A CSP row's `source_file`/`line_number`/`column_number` are last-writer-wins with no auth.**
Anyone who can reproduce a row's four key fields — all observable from the page that produced the
violation — can replace its recorded source location. Bounded at 1,024 characters, stored and
rendered as text, so the ceiling is misdirection of an investigation, not disclosure. Documented in
the `ON CONFLICT` clause rather than closed: first-writer-wins pins the row to the least informative
report, and keying on the location shatters one violation into a row per call site. **Accepted, not
open** — recorded here so the trade is findable, and so "a source location is a lead, not evidence"
is written down somewhere other than one SQL comment.

**3. `Alert tone="info"` gives a live-region role to two static first-paint caveats.** The
no-transport note and the no-violations note are permanent documentation of what an empty result
means, not something that just happened — so wrapping them in a polite live region risks an
unsolicited announcement on load, and now that each panel announces its own settled state (WCAG
4.1.3), risks overlapping with it. The fix belongs in the primitive, not this screen: `Alert` infers
its role from `tone` alone, and the distinction it is missing is "reporting a change" vs "stating a
standing fact". Not blocking — nothing is unreachable, and the copy is correct.

**4. `--card` / `--muted-foreground` is not in the contrast matrix — and adding it is not one line.**
The staff console puts `text-muted-foreground` directly on `Card` rather than through
`CardDescription`, and `token-contrast.test.ts` pins `--muted-foreground` only against
`--background`. `--card` appears in that suite once, inside `STACK_GROUNDS`, asserted at the 3:1
**graphical** floor — so the 4.5:1 **text** question has never been asked about it.

~~the worst case is dark theme at **6.91:1** … it is _less_ contrasty than the pair that is gated
(7.63:1), so the gate is currently reassuring about the wrong pair~~ — **both numbers and the
conclusion are wrong** (2026-09-01). There is no dark theme (ADR-0097). Recomputed from today's
tokens: the card pair is **6.00:1** and the gated pair (`--background`/`--muted-foreground`) is
**4.65:1**, so the ungated pair is the _safer_ of the two and the gate is not reassuring about the
wrong one. What survives is only "the pair is ungated".

**Adding it naively was tried, and it goes RED at 2.00:1 in the `chrome` and `brand` scopes.** The
suite applies every `TEXT_PAIRS` entry to all seven scopes, and `--card` is deliberately outside the
rebind closure (`token-architecture.test.ts:116`, `resets:`) while `--muted-foreground` is rebound —
so in a navy scope the pair is a light grey on an unbound white. **That is ADR-0097's own "latent
split pair", and making `--card` a "reset" does not close it at runtime**: `Card` renders
`bg-card text-card-foreground` and nothing restores `--muted-foreground` for its subtree. The reset
is a taxonomy exemption from the completeness check, not a runtime re-binding.

**It is latent, not live** — verified: no `<Card>`, `CardDescription` or `text-muted-foreground`
occurs inside any `chrome`- or `brand`-scoped subtree today. So the naive addition would be a gate
that fails on day one over a combination the product never produces, which ADR-0058 says gets
deleted rather than fixed.

**What it actually needs** is a way to say "assert this pair in the scopes where it can occur" — a
per-pair scope filter in `TEXT_PAIRS`. That is a change to a shared gate (ADR-0105), and it is the
same shape as **#231** and **#227**: three deferred edits to the same family of checks, all wanting
one question answered once.

**Not a finding, recorded because it was measured and the measurement inverted the recommendation:**
a partial index `(created_at, id) WHERE NOT email_verified` on `users`, serving the accounts panel.
The reviewer measured 43 ms → 0.05 ms and recommended it; the database-architect re-measured against
the **real** table (five rows, one heap page) at 0.036 ms and recommended deferring, because the
43 ms came from a synthetic million-row population that no longer exists. Deferred against a trigger
rather than a date — build it when unverified accounts on the deployed installation reach five
figures — and recorded in `20260809180000_audit_events_staff_index/migration.sql` so the question is
not reopened from scratch.

### 118a. `audit_events`' 12-month `auth.*` period is still unenforced, and the sweep may never enforce it

**Status:** unverified

The half of #118 item 1 that the retention sweep **cannot** close, split out rather than quietly
carried along with the half it did close — because "retention is enforced" is now true of two tables
and false of a third, and four documents were about to say the first thing without the second.

ADR-0085 D3 bounds the `auth.*` `subject_label` — the address a failed sign-in named, kept in the
caller's own casing — by **retention** rather than by per-subject deletion, on the ground that a rule
applied to all rows alike cannot be aimed at one person. Nothing enforces that period, and ADR-0087
D3 refuses to make the sweep do it: `audit_events` refuses `UPDATE` and `DELETE` in the database, by
`BEFORE UPDATE OR DELETE` and `BEFORE TRUNCATE` triggers declared `ENABLE ALWAYS` so the application
role cannot bypass them, and ADR-0085 D1 already refused to relax them once. Relaxing them converts a
**structural** guarantee into a **procedural** one: the answer to "could these rows have been
altered?" changes from "not by the application role" to "only by the retention path, which we believe
was used correctly."

So this is a genuine conflict between two accepted decisions and not an unbuilt feature.
`retention-boundary.structural.spec.ts` asserts the table set by **equality**, so adding
`audit_events` to the sweep fails a test rather than passing review — which is the intended cost.

**Not closable by writing code.** It needs the ADR-0085 D6 build trigger to fire (the first
organisation outside the product owner's own, or a real subject request), and then a decision about
which guarantee gives way. The candidate that keeps both is a **column-level scrub** — nulling
`subject_label` on rows past the period — but `audit_events` refuses `UPDATE` too, so it lands in the
same place. Recorded here so the next reader meets the conflict rather than the ticket.

### 118b. The CSP period bounds staleness, not data age — and the sweep does not change that

**Status:** unverified

Carried forward from #118 item 1 unchanged, because building the sweep neither fixed it nor made it
worse, and closing item 1 without saying so would have read as a fix.

`csp_reports` expires on `last_seen_at`, deliberately: `last_seen_at` moves on every repeat, so a
violation **still being reported** never ages out — which is the point, since the Security panel
exists to show what the policy is blocking now and expiring a live finding would remove it from the
one screen built to surface it. The consequence is that a `document_uri` — which may carry a plan or
organisation id in its path — is retained for as long as the violation keeps recurring, with a
`first_seen_at` arbitrarily older than 30 days. "URLs are kept for 30 days" is not a sentence this
table supports.

Switching the predicate to `first_seen_at` would look like a tightening and would silently delete
live findings; `retention-sweep.e2e-spec.ts` has a test named for exactly that
("KEEPS a violation that is old but still being reported"), so the change fails rather than passes.
The real remedy, if one is wanted, is to stop recording the path at all — which costs the
investigative value the column exists for. Open, unowned, and cheap to leave open: the throttle
bounds a sustained flood and the sweep bounds the residue after one stops.

### 123. One create-dialog earned-value case failed once in a full run and has not repeated

**Status:** unverified

`ActivityCreateDialog.earned-value.test.tsx` → "creates an activity carrying the %-complete type
and expense (major → minor)" failed exactly once, during a full `pnpm test` on 2026-08-11, and has
not reproduced: the same file passes in isolation five times over, the feature suite passes, and
the next full run was green. It is recorded rather than shrugged at because a test that fails once
has told you something, and the thing it might have told you here is timing-shaped.

**What was ruled out.** Not the flag mock added to `ActivityWorkFields.test.tsx` in the same
session — Vitest gives each file its own module registry, so a getter-backed flag cannot leak
across files. Not obviously the submit button either, though that is the change with the best
motive: M7 swapped its native `disabled` for `aria-disabled` + a `preventDefault` guard (ADR-0060
M6's rule), and a natively disabled button is the one thing that made a second click during an
in-flight save structurally impossible. The case clicks once, so this is a hypothesis and not a
diagnosis.

**What would settle it**: run the file under `--repeat` with the suite's own concurrency, or add a
counter assertion on `apiFetch` calls rather than on the last call's body, which would tell a
double-submit apart from a slow one. Left open rather than guessed at.

> **Both were done 2026-09-01. It still does not reproduce, and the second half shipped anyway.**
>
> **The reproduction attempt.** Vitest's CLI has no `--repeat` (it is a config option, and the row
> assumed a flag), so the file was looped **20 times while a full `apps/web` run held the
> machine** — the concurrency the row names as the condition. **Zero failures**, and the full run
> underneath was itself green (589 files, 5,373 tests, 515 s), which matters because a full
> `pnpm test` is the exact condition the one failure occurred in. With the five isolated runs
> recorded when this was filed, that is **26 attempts and no reproduction**.
>
> The row stays **open** rather than closing as stale: one failure is still one failure, and a
> cause nobody has found is not the same as a cause that is not there.
>
> **The counter landed regardless**, and that is the useful half — it costs one line and makes the
> NEXT occurrence diagnosable instead of another shrug. The two candidates now fail differently: a
> **slow** submit expires the `waitFor`, a **double** submit passes it and trips
> `toHaveBeenCalledTimes(1)`. Without it they are the same red line — and because the case reads
> `calls[0]`, a second call would otherwise go entirely unnoticed. Added to both submitting cases
> in the file, with the reasoning at the first.
>
> Worth stating plainly: this does not fix anything. It converts an unreproducible failure into one
> that would arrive with evidence attached.

### 121. The base Playwright journey proves editing in a world no shipped bundle can produce

**Status:** unverified

`apps/web/playwright.config.ts` pins `VITE_PLAN_EDIT_LOCK` and `VITE_TSLD_EDITING` **off** for the
whole base journey, so its six editing specs — `activities.spec.ts`, `baselines.spec.ts`,
`dependencies.spec.ts` (×2), `schedule.spec.ts` (×2) — run with `penManaged: false`: the client pen
inert, gating by role alone.

**No shipped bundle can be in that configuration.** Both flags are compiled on and unreachable by any
build path (ADR-0088 D1). So the product's main end-to-end editing coverage exercises a world that
does not exist, and the real editing flow — with the pen — is covered only by the narrower
`playwright.edit.config.ts`.

This is worse than covering a rollback path, and it is **not** fixed by retiring the flags. ADR-0088
D4 keeps both permanently (they are one line of production code each), which means "convert the specs
before the flag is deleted" would never fire. Hence this row: the conversion is owned here, with a
trigger of its own.

**What to do:** convert the six specs to acquire the pen, and drop the two pins from
`playwright.config.ts`. The gating _logic_ is already safe either way —
`plan-gating.test.ts` unit-tests `derivePlanGating({ penManaged: false, … })` as a pure function
taking a boolean as data rather than through the env module, so it survives whatever happens to the
flags. What needs re-hosting is the end-to-end proof against a real API, which no unit test replaces
(the ADR-0067 modal-in-top-layer and ADR-0079 native-listener-race defects are both of that class).

**Trigger:** the next epic that touches plan editing end to end, or the next time a base-journey
editing spec needs changing for any reason — whichever comes first. Not a date: ADR-0088 supersedes
dated flag work precisely because the date was the wrong instrument.

**Do not** substitute unit-level flag-off suites for it (ADR-0088 D5, D7).

### 120. The first retention drain leaves 10–20% dead tuples for several ticks, and nothing says so

**Status:** unverified

Measured, not suspected. The backend-performance review seeded `csp_reports` to 500,000 rows
(~207 MB), vacuumed, then drove a full `RUN_CAP`-bounded drain — 50 sequential 1,000-row batches,
exactly the runner's loop — and watched `pg_stat_user_tables`:

- `n_dead_tup` reached exactly **50,000 (10% of the table) and stayed there.** `autovacuum_count` did
  not increment, even past `autovacuum_naptime`. With Postgres defaults
  (`autovacuum_vacuum_scale_factor = 0.2`) the trigger for a table this size is ~100,050 dead tuples,
  and this schema sets no per-table `reloptions` override — so **one capped run does not cross the
  threshold**, and a 500k-row backlog takes about ten hourly ticks to clear with dead tuples sitting
  at 10–20% for much of that window (autovacuum firing roughly every second tick).
- Within one drain and before autovacuum runs, a batch that re-scans the head of an index it has just
  emptied costs **37.8 ms / 53,642 buffer hits** against a clean **7–13 ms / ~2,000**. Postgres's
  opportunistic `kill_prior_tuple` marking largely repairs this inside the same session — later
  batches fell back to 8–11 ms — so it does not run away.

**This is ordinary Postgres behaviour and not a defect in the design.** It is recorded because the
ADR and the docblocks assert the sweep is bounded and say nothing about the table staying clean, and
those are different claims. The place it will actually be met is the **first enablement against a
real backlog**, which on the deployed host is **about a week away** for `csp_reports` and a year for
`mail_events` — so there is time, and nothing to do today.

If it ever matters, the remedies in order of cost are: watch `n_dead_tup` rather than assume it
self-heals; set a per-table `autovacuum_vacuum_scale_factor` on the two swept tables; or raise
`RUN_CAP` so a drain crosses the default threshold in one run. Do none of them without measuring
first — the last one trades a bounded connection hold for a faster vacuum, which is the opposite of
what `RUN_CAP` exists for.

### 119a. The API e2e suite fails intermittently, and the failure has never been captured

**Status:** open · **Verified:** 2026-09-01

> **A FIFTH occurrence, 2026-09-01 — DIAGNOSED, FIXED AND PROVEN, and the table is `baselines`.**
> The fourth occurrence (below) recorded "one file, 45 tests" and could say no more, because the
> observer piped the run through `tail`. **It happened again the same day, to the same observer,
> piped the same way — and this time the diagnosis survived**, because the `tee` capture built for
> occurrence four held the whole log. That is ADR-0058's thesis demonstrated rather than asserted:
> the habit failed twice in one session, the mechanism worked the first time it was needed.
>
> Given the identical signature — `activities.e2e-spec.ts`, all 45 tests, `beforeAll` — occurrence
> four was almost certainly this same cause. Stated as a likelihood, not a fact: its log holds only
> the summary, which is the whole reason that entry exists.
>
> **The cause.** `baselines` holds `plan_id` and the snapshot tables hold `baseline_id` (ADR-0025),
> and **25 of 33 plan-sweeping specs deleted plans without deleting baselines first**. A single
> baseline surviving in the shared `app_test` — from an aborted earlier run or a Playwright journey,
> the 2026-08-28 mechanism — fails the next spec to sweep. The producer is **not named**: the log
> gives the constraint and not the writer, and every in-suite creator sweeps (directly, or via
> `clearDomainData`), so it came from outside the run.
>
> **Fixed in all 25, and verified in both directions rather than inferred from a green re-run** —
> which is the trap this row's own history is made of. A poison baseline was planted by hand
> against `app_test`; `activities.e2e-spec.ts` then FAILED all 45 tests on `baselines_plan_id_fkey`
> with the three sweep lines removed, and PASSED all 45 with them, on a freshly re-planted row.
> That reproduces the production failure exactly, which is what makes the diagnosis a fact.
>
> **The fourth table in a class this row has now watched happen five times.** `plan_shares`,
> `resource_assignments`, `activity_steps`, `baselines`. The permanent answer is still the derived
> sweep the paragraphs below describe — delete in reverse topological order of the FK graph, which
> Prisma knows — and it is still a spec-level change (ADR-0105) rather than a fourth hand-edit
> across 25 files. What is different now is that the cost is measurable: four tables, five
> occurrences, and on each the whole estate is edited by hand.

> **A FOURTH occurrence, 2026-09-01 — and I lost it by doing exactly what this row tells the next
> reader not to do.** A full `scripts/e2e-local.sh api` run failed **45 tests in one file** (44 files,
> 572 tests, 527 passing). The command was piped through `tail -12`, so the file name and the error
> were discarded before anyone read them; the log held only the summary. An immediate re-run passed
> **572/572**, which is this row's recorded signature — a run that sweeps itself clean before anyone
> looks — and proves nothing.
>
> The instruction to redirect the whole log to a file rather than pipe it through `tail` is in the
> paragraph directly below, left by the third occurrence for exactly this reason. It was written
> down, it was correct, and it did not survive contact with someone running the command from muscle
> memory. **That is the finding**: this row's remedy was a habit, and a habit is the instrument
> ADR-0058 says to replace with a mechanism.
>
> **Built the same day.** `scripts/e2e-local.sh` now `tee`s every run to a timestamped
> `.e2e-logs/` file and prints the path, so the capture no longer depends on how the caller used the
> pipe. `SP_E2E_LOG=` opts out. The `PIPESTATUS` guard is load-bearing and was **verified in both
> directions** rather than assumed: a forced failure (`DATABASE_URL` pointed at a dead port) exits
> **1** with the error in the log, and a real suite still runs, passes and is logged. Without that
> guard a piped run always exits 0 and the script would silently stop being able to fail — which is
> the same class as the defect it is being added for.
>
> **And proving it caught a second, unrelated one.** `pnpm run` exits **0** when no package has the
> script (measured: `pnpm --filter @repo/web test:e2e:does-not-exist; echo $?` prints `0`), so
> `scripts/e2e-local.sh web:wsb` printed "Done", exited clean and ran **nothing**. A `web:*` target
> now checks the script exists and fails with the list of real suites. That is this script's own
> header — _"a run that cannot be trusted is worse than no run"_ — failing on itself, and it was
> found only because the log capture was being tested against a failure rather than a pass.
>
> What can be said about the fourth occurrence: it was **one file, 45 tests**, consistent with a
> `beforeEach` failing for a whole spec — the same shape as all three recorded causes — and it is
> **not** attributable to that session's changes, which touched only a unit spec under `src/`.

**A THIRD table, 2026-08-31 — `activity_steps`.** A full `scripts/e2e-local.sh api` run failed
**282 tests across 10 files**, every one in `beforeEach` on `activity_steps_activity_id_fkey`. By
the time anyone looked at the database it was clean — a later suite in the same run had swept it,
which is this row's own recorded signature — so the diagnosis exists only because the **whole log
was redirected to a file rather than piped through `tail`**, which is the instruction the previous
occurrence left. `activity_steps` holds `activity_id` (ADR-0044 §33) and was swept by six specs of
thirty-four; all thirty-four now sweep it, and `clearDomainData` gained it too — along with
`resourceAssignment`, which that helper swept **after** `plan.deleteMany()`, i.e. after the
`activity.deleteMany()` it was meant to protect, so it could never have worked there.

**The fix is verified in both directions rather than inferred from a green re-run**, which is what
this row's own history warns against. A poison `activity_steps` row was planted by hand, and
`baselines.e2e-spec.ts` then FAILED all 20 tests on `activity_steps_activity_id_fkey` with the sweep
line removed, and PASSED all 20 with it, clearing the row on its way. A clean re-run alone would
have proved nothing — the previous run had already swept itself clean before anyone looked.

Three tables have now failed this way — `plan_shares`, `resource_assignments`, `activity_steps` —
each found the same way, each fixed one table at a time. **The pattern is the finding**: the sweep
lists are hand-maintained against a schema that keeps growing child tables, so the next one is a
matter of time. A derived sweep (delete in reverse topological order of the FK graph, which Prisma
knows) would end the class; it is not done here because the sweep is shared test infrastructure and
that is a spec-level change (ADR-0105).

**Captured and diagnosed 2026-08-28 (reconciliation pass), and the mechanism explains why every
prior occurrence destroyed its own evidence.** The full log (kept, per this row's instruction)
shows `activities.e2e-spec.ts` failing **all 45 tests in `beforeEach`** on
`resource_assignments_activity_id_fkey`: a leftover assignment row — left in the shared `app_test`
by an external writer (a Playwright journey, or an aborted earlier run) — and **twenty** specs
swept `activities` without sweeping `resource_assignments` first, the #119 defect one table along,
in the same files whose comments record the class. The fails-once-passes-on-re-run signature now
has a cause: `fileParallelism: false` runs the files in sequence, and a LATER suite in the failed
run (`calendar-scope` and its siblings do sweep assignments) deletes the poison — so the re-run is
clean and the evidence is gone, which is why three sessions of re-runs never caught it. All twenty
specs now sweep `resourceAssignment` + `resource` before `activity` (one shared comment naming
this occurrence). The concurrent-two-runs hazard below is untouched and stays filed; whether the
2026-08-10 `staff.e2e-spec.ts` occurrences were this mechanism is **not claimed** — their logs
were never kept, which is the point of this row.

**Occurrence 2026-08-28 (correctness programme), and the capture failed for a recordable reason.**
A full `scripts/e2e-local.sh api` run reported **74 failed across 2 files** (one identified:
`test/interchange.e2e-spec.ts:347`; the other unknown), and an immediate re-run of the SAME
working tree — the #205(b) changes present in both — passed 572/572. The detail was lost because
the observing command piped the run through `tail -15`, keeping only the summary: the observer
reproduced this row's own subject. The re-run was captured in full
(`vitest run --config vitest.e2e.config.ts`, 237 s) and is clean, so the next occurrence's
instruction is: never pipe the first run — redirect the WHOLE log to a file, then read it.

**Observed 2026-08-10, three times in one session, against `scripts/e2e-local.sh api`.** Each time
the whole `test/staff.e2e-spec.ts` file failed — all 13 tests including ones the change had not
touched, which is the shape of a `beforeAll` failure rather than 13 independent ones. Each time the
next run passed: **517 passed** on five subsequent runs, including one immediately after `touch`ing
an API source file to force a cold transform.

**Two hypotheses were tested and neither held.**

1. _Two suites sharing one database._ The second failure did coincide with a backgrounded full-gate
   invocation running its own `e2e-local.sh api`, and that is a real hazard — `vitest.e2e.config.ts`
   sets `fileParallelism: false` and every suite shares one process and one `process.env`, so two
   concurrent runs share a database with no isolation at all. But the third failure had no overlap.
2. _A cold transform blowing a hook timeout on the first run after an edit._ Explicitly reproduced
   with `touch` + a full run: passed.

**What is actually wrong is the diagnosis, not the suite.** The failure text was never captured:
each occurrence was met with a re-run, which passed, which destroyed the evidence. That is the
mistake to fix first — this entry exists so the next occurrence is treated as the only chance to see
it. Capture the full output to a file **before** re-running, and keep it.

**Do not file this as flake.** A whole-file failure with a persistent database and a shared process
has several credible mechanisms — leftover rows from a sibling suite that `beforeEach` does not
clear, a `STAFF_EMAILS` value leaking across files (the suite's own docblock warns about exactly
that), an `audit_events` row blocking an organisation delete under `ON DELETE RESTRICT` (which this
suite has already been bitten by once, and which read as flake for three runs then too). Any of
those would be a real defect in the suite's isolation, and calling it flake is how it stays.

**Not blocking the merge it was found during**: the suite passes cleanly and CI runs it
independently. But a gate that fails one run in three and is green on the retry is a gate people
learn to re-run rather than read, which is the failure mode `docs/RECONCILE.md` describes for
documentation and applies just as well here.

### 142. `<Link to="/orgs/$orgSlug/clients">` warns that the router matched a different template

**Status:** unverified · **Raised:** 2026-08-19 (ADR-0098 M2, seen in the base and overview journeys) · **Size:** S ·
**Risk if left:** low

Every navigation to the client list logs:

```
Generated path "/orgs/<slug>/clients/" for route "/_authed/orgs/$orgSlug/clients/$clientId"
matched route "/_authed/orgs/$orgSlug/clients" instead.
```

_(Citations corrected 2026-09-01, on top of a paragraph already labelled the wrong diagnosis:
`app-header.tsx` has **no clients link at all** — the organisation destination moved to
`components/layout/navigator/org-destinations.tsx:82` — and `plan-detail.tsx`'s link is at `:64`,
not `:58`. A reader following the old citation lands on a file without the symbol.)_

Five call sites use the identical `to` (`org-destinations.tsx:82`, `client-detail.tsx:38`,
`project-detail.tsx:61`, `plan-detail.tsx:58`, and now
`features/overview/components/OrganisationEmptyState.tsx`), so it is **pre-existing and general**,
not something this epic introduced — it surfaced here only because the overview journey is the first
to watch the console while landing on a fresh organisation.

**Navigation works**: the router lands on the list, which is why nobody has chased it. What it costs
is the console — a permanent warning on the commonest link in the product trains everybody to ignore
console output, which is exactly how the ADR-0074 CSP violation went unnoticed on the deployed origin
for a release.

**Half-diagnosed 2026-08-31, and the half that was written down above was wrong.** The trigger was
reproduced exactly — same message, character for character — by calling `router.buildLocation` on
the real route tree with the **`$clientId` template and an empty-string `clientId`**:

| `to`                               | `params`                      | result                                 |
| ---------------------------------- | ----------------------------- | -------------------------------------- |
| `/orgs/$orgSlug/clients`           | `{ orgSlug }`                 | `/orgs/acme/clients`, silent           |
| `/orgs/$orgSlug/clients/$clientId` | `{ orgSlug, clientId: 'c1' }` | `/orgs/acme/clients/c1`, silent        |
| `/orgs/$orgSlug/clients/$clientId` | `{ orgSlug }` (absent)        | `/orgs/acme/clients/undefined`, silent |
| `/orgs/$orgSlug/clients/$clientId` | `{ orgSlug, clientId: '' }`   | `/orgs/acme/clients/`, **warns**       |

So the five call sites this row named are **not** the cause: the list link is silent from every
`from` in the tree (all five were tried). Only an **empty-string** `clientId` reaches it, and an
absent one does not — the trailing slash in the logged path was the tell, and nobody had read it.

**What is still unknown is which render supplies the `''`.** A static sweep of `apps/web/src` finds
no call site passing one: the three `$clientId` links (`HierarchyTree`, `ClientsTable`, the
project-detail crumb) all pass a real id, and the `'clientId' in params ? … : ''` fallbacks are
reads, never link params. So the next step is a browser: run a journey with console capture and
print the stack at the warning. **Do not change the route tree on the strength of the paragraph this
one replaced** — it was written from the call sites rather than from the message.

**The browser step ran on 2026-09-01, and it did not reproduce.** A throwaway probe in
`e2e-overview` captured the message on **two independent channels** — `console.warn`/`error`/`log`
patched via `addInitScript` (so before any app code), and Playwright's own channel-agnostic
`page.on('console')` — across six routes: the overview, the clients list reached directly, the
clients list reached by clicking, a client detail, a project detail and a plan detail. **Zero hits
on every one.**

**The zero means something because the probe carried a control**, which is the part worth copying:
it emitted a `console.warn` carrying the message text and required BOTH channels to catch it. They
did (1 hit each), so a zero above is the absence of the warning and not the absence of capture —
the distinction this register keeps recording gates getting wrong. The guard was also confirmed
satisfiable rather than assumed: the call site is a plain `console.warn` inside `try {}` at
`@tanstack/router-core@1.171.22`'s `router.js:298`, conditioned on
`process.env.NODE_ENV !== 'production'`, and the sweep ran against the Vite dev server.

**What the probe does NOT cover, stated rather than implied:** the control exercises the capture,
not the router's own code path; and the row also reports the warning in the **base** journey, whose
specs carry no such listener, so those routes are untested. The row therefore stays open and
narrows to one question — **does it still happen anywhere?** The next step is the listener in the
base journey, not another read of the call sites. If that is also silent, this closes as
unreproduced rather than as fixed, because nothing here was changed to fix it.

### 149. The Graphite M10 gate pass's non-blocking findings

**Status:** unverified

**Raised 2026-08-20.** Five specialists over the ADR-0099 epic diff. Security and
frontend-performance passed outright, both having re-derived the epic's own numbers from the code
rather than trusting them (performance built both refs: **+1.9 kB gzip JS** for 163 files, and the
painter untouched, so TECH_DEBT #75's known overage is not attributable here). Component,
accessibility and UX each blocked, and every blocking finding was folded with a regression test
verified red first. What follows is what was deliberately **not** folded, with the reason.

- ~~**`MenuItem.itemId` bakes toolbar vocabulary into a general primitive.**~~ **CLOSED 2026-09-01,
  and the resolution was not the one this item weighed.** The item chose between keeping the prop,
  a name-agnostic passthrough and a rename. It never asked whether anything used it: **zero call
  sites**. So the prop was deleted rather than debated, and `menu.tsx:344` now records why, and the
  condition for bringing it back — a caller that actually wants a stable per-row locator. An item
  that argues three ways to shape an API for "one caller" is worth a `grep` before it is worth an
  argument; this one had none.
- ~~**Nested landmarks share a name.**~~ **STALE — the duplication no longer exists** (verified
  2026-09-01). There is **no `<aside>` anywhere in `apps/web/src`**, so nothing wraps
  `<nav aria-label="Project Explorer">`. It went with the Graphite drawer: ADR-0101 returned the
  editor to a modal and the drawer mechanism was deleted (#156), and ADR-0109 D2 docked the
  Explorer instead. `explorer-column.tsx:108-114` now carries the rule as a comment — the column
  owns the width, the fold and the splitter and deliberately renders neither a landmark nor a
  heading of its own, "which is how one panel comes to announce itself twice". Closed as fixed by
  a decision made elsewhere, not as never-having-been-true.
- **`localStorage` is written at drag frame rate.** `useResizablePanelPrefs` persists on every
  `setSize`, i.e. ~60×/s while a splitter is moving. Pre-existing (the Explorer rail and the activity
  panel have done this since ADR-0030); Graphite adds two more consumers of the same hook. Each write
  is a `JSON.stringify` of a two-field object and nothing has been profiled as hot, so a debounce
  would be an unmeasured optimisation — which is the thing this register keeps saying not to do.
- **`Toolbar`'s `ResizeObserver` re-observes on every commit.** Deliberate and documented in place
  (the item set changes without a dependency it could key on); `observe()` on an already-observed
  node is a no-op per spec. It now iterates the union of what were two rows' `render` items, which is
  a larger no-op, not a new cost.
- **The status bar says nothing when a computed plan has no critical activities.** Suggested as an
  inconsistency with `Finish`'s "Not calculated". Left alone, and the reason is that the state is
  very nearly unreachable: with the default TF ≤ 0 rule (ADR-0035) every computed network has a
  critical path, so "computed and clean" is not a state a planner meets. Adding copy for it would be
  reassuring about something that does not happen.

**Two instruments existed and neither was reached for, which is the same shape twice.**

The first is ADR-0081's rule — the journey lands with the first user-facing milestone. The UX
review's blocking finding, the drawer's entry point not existing, was reachable only by driving the
shell, and this epic's own gate table routed M6 to targeted suites. The rule is the standing answer
and it was not applied, because Graphite ships no flag and the rule is written in terms of one. Its
subject is a **user-facing milestone**, not a flag — now stated that way in `CLAUDE.md` §19 beside
its sibling about problem statements, rather than left as a note here.

The second is `scripts/frontend-only.json`, which exists to refuse a change under `apps/api/` while a
frontend-only epic is in flight. Graphite is exactly such an epic — its parity argument is that the
CPM engine is not imported — and the declaration sat `active: false` throughout, because ADR-0096
had correctly deactivated it and nobody re-read it at this epic's start. Nothing went wrong: the
epic genuinely changed no server code, so the gate would have had nothing to catch. What is worth
recording is that **the same file's own instructions say to arm it, and its own history is a case of
it being left in the wrong state for months** — so "arm it when the next frontend-only epic starts"
is a rule with no gate behind it, one layer up from the rule it enforces.

**And this paragraph nearly shipped pointing at the wrong file.** The sentence above ended
"`docs/RECONCILE.md` is the place that wording gets fixed" until the rule was actually written into
`CLAUDE.md` §19 instead — and the edit that was supposed to correct it here ran without an assertion,
did not match, and reported nothing. Found by re-reading rather than by anything failing, which is
the ADR-0058 rule doing its job on a document written about instruments not being reached for.

### 154. Minimap M4: the two "reasoned, not observed" AT verifications remain owed

**Status:** unverified

**Raised 2026-08-21** (minimap M4-T3). **Size:** S.

The accessibility input report marked two claims as reasoned from specification, and the
gate pass could observe only one of them in this environment:

1. **Real-AT behaviour of `role="group"` + coalesced announcements (NVDA / VoiceOver)** —
   NOT observed: no screen reader runs in the build container. What is owed is a listen —
   does the group's name announce on focus, do the coalesced "Viewing …" messages arrive
   once per burst, and does the drag-release announcement land? Record what was heard.
2. **Low-vision visual feedback of a coalesced arrow-pan** — observed in a browser
   (2026-08-21, screenshots): one ArrowRight moves the scene a full page (the ruler's
   decade changes visibly), the minimap rectangle relocates in the same frame, and the
   change is large-scale rather than subtle. The remaining owed half is a hands-on pass at
   real magnification, which a screenshot cannot stand in for.

**Attempted 2026-08-28 (correctness programme Phase 2) and structurally could not be discharged
here**: the build container runs no screen reader and no OS magnifier, so both observations
remain owed to a human pass on real hardware — NVDA or VoiceOver for the listen, an OS zoom for
the magnification half. Recorded rather than quietly re-deferred; flagged to the product owner
with the Phase 2 report so the row has an owner outside this environment.

### 155. The minimap M4 gate pass's non-blocking findings

**Status:** unverified

_Triage 2026-08-28 (correctness programme Phase 4): re-filed consciously. Items 1–3 are design
judgements for a minimap design pass, not defects; item 4's focus-chain last resort is real and
S-sized but sits on a shared close-chain contract (§19.13 territory — a review before release,
not a residue fold); item 5 is an instrument nit whose reason stands._

**Raised 2026-08-21** (minimap M4-T1; the blocking findings are folded with regression
tests and recorded in ADR-0100's Consequences). **Size:** S each.

1. **The rectangle's drag affordance is cursor-only** (ux): no static cue says the frame is
   draggable — `cursor-grab` is invisible before hover and absent on touch. Click-to-jump
   and the keyboard cover the function; the convention (IDE minimaps) covers most readers.
   If first-contact feedback says otherwise, corner ticks or a faint fill are the shape.
2. **Q2 (command-strip promotion) was decided against pre-Graphite arithmetic** (ux): the
   "no room" conclusion cites `PINNED_FLOOR_WIDTH` measurements taken before ADR-0099
   reshaped the strip. The default stands (product owner Q2); if it is ever revisited, the
   measurement comes first (`e2e-toolbar-fit` with one extra pinned item at
   1646/1440/1280/960).
3. **The empty state explains and does not act** (ux): "Nothing to show yet…" meets the
   copy bar but offers no route; reachable only when an open panel's plan loses its
   computed dates, and the canvas beneath carries its own actionable prompt. One "add an
   activity" line if it ever surfaces in use.
4. **`handleClose`'s chain has no last resort** (accessibility): if both the captured
   opener and `dismissFocusRef` are unusable, focus stays put. Unreachable today —
   `TsldPanel` always wires the listbox ref — noted in the handler's comment.
5. **The one-derivation gate matches the three original idioms only** (architecture S10):
   a fourth extent derivation in a different idiom would pass it. Recorded in ADR-0100
   decision 3 so the gate is not over-read.

### 161. Four screens the harness photographed for the first time, and one question for the product owner

**Status:** unverified

**Raised 2026-08-21** (ADR-0102's UX gate). **Size:** S each, none blocking, none introduced by the
light theme — they became visible because the shot list went 12 → 25 and started covering states
nothing had ever looked at.

**a. The empty-state pattern is inconsistent.** `org-home-empty` uses icon + heading + explanation +
action, which is the documented archetype. `resources`, `calendars` and `recently-deleted` render
text-only inside a dashed box with no icon and the create action at the header instead. Pre-existing;
pick one and apply it.

> **Counted from the code 2026-09-01, and it is not three screens — it is the app's dominant
> idiom.** `grep -rn 'rounded-lg border border-dashed' apps/web/src --include=*.tsx` (test files
> excluded) returns **34 occurrences across 29 files**, every one the same class string
> `border-border text-muted-foreground rounded-lg border border-dashed p-N text-center text-sm`.
> Against that, `EmptyState` — the archetype ADR-0098 built and `docs/UX_STANDARDS.md:61`
> documents — has **two** consumers, `OrganisationEmptyState` and `RecentlyChangedSection`, both
> inside the overview feature it was written for. So the primitive did not spread; the hand-rolled
> box did, and it is what a planner meets on tables, panels, dialogs, the guest share view and four
> route files.
>
> The row's "three screens" was never wrong about what it saw — the shot list had gone 12 → 25 and
> those were the three empty states a screenshot happened to capture. It is wrong as a **size**,
> and by an order of magnitude, which is the difference between a tidy-up and a consolidation pass
> with a gate. ADR-0110 D5's shape: a figure that came from an instrument's reach rather than from
> the code, and read afterwards as a count.
>
> Specified as its own pass rather than fixed here — 34 sites, four of which are dialogs and one
> the unauthenticated guest view, and a consolidation with no structural gate re-drifts (ADR-0058).
>
> **M1 and M2 landed 2026-09-01** (`docs/specs/empty-state-consolidation/`). M1 is the gate,
> written with an empty allow-list and **verified red in three directions** — against the real tree
> (34 findings, matching the grep), against a NEW site added to `list-row.tsx`, and against a stale
> allow-list entry. The middle one is the direction that matters and the easy one to skip: an
> allow-list matching the tree exactly satisfies the main assertion forever while protecting
> nothing. `red-run.md` records the state it was written to find, because that state disappears the
> moment the list is populated.
>
> **M2 is the substantive half — five of the 34 are not empty states at all.** Three are
> `query.isError` branches (plan, project, client) and two are permission refusals (the audit log,
> a plan's cost and earned value). The two refusals' copy was already correct and both already
> carried `role="status"`; what was wrong is that they wore this application's treatment for
> absence, so a Viewer met "there is nothing here" about an organisation whose log is full. The
> allow-list is 34 → 28 entries, which is the epic's progress metric.
>
> **What M2 established about its own tests is worth carrying**: the truncation defect its plan
> named as most likely to ship **cannot be caught at the unit tier**, because `truncate` is
> `text-overflow: ellipsis`, jsdom has no layout, and the text stays in the DOM whatever the box
> does. Removing `messageFit="grow"` left the suite green. The assertion checks the class instead
> and says so. **M3–M8 remain.**

**b. `clients-loading` is a bare spinner** where `docs/UX_STANDARDS.md` expects a skeleton. Also
pre-existing, and only visible now because the loading state had never been captured.

> **Counted 2026-09-01, and it is the same finding as (a) one state over.** `clients-loading` is
> not a screen that happens to use a spinner — it is `DataTable`, whose own docblock
> (`components/ui/data-table.tsx:35`) says it owns "loading / error-with-retry / empty / populated
> states so every resource list", and which renders `<Spinner label={loadingLabel} />` at `:85` for
> **15 non-test consumers**. So one change covers every resource list, and `clients` was the one a
> screenshot caught. `Skeleton` and `ListRowSkeleton` both already exist and have **two** consumers
> between them, both in `features/overview` — the primitive did not spread; the spinner did.
>
> **Not every spinner is wrong, and saying so is part of the finding.** ~19 files touch
> `Spinner`/`animate-spin`, and a spinner is right for a pending button, an inline action and a
> route-level suspense fallback; `docs/UX_STANDARDS.md` asks for a skeleton only where the content
> has a known shape. Sweeping all 19 would be the mirror of the mistake that filed this row.
>
> Folded into the (a) pass rather than kept separate: the loading and empty states of one shared
> table are one reader's experience of one screen, and splitting them means touching `DataTable`
> twice.
>
> **The code half landed 2026-09-01** (M7-T1). `DataTable` renders a column-matched skeleton
> instead of a centred spinner, so every resource list stops spanning a spinner and then reflowing
> into a table. The obligation was already written down and unbuilt: `skeleton.tsx` says each
> archetype owns its loading render because a generic rectangle reflows into whatever the content
> turns out to be, and names `DataTable` as knowing its own. `loadingLabel` survives — it is what
> `shoot.mjs` asserts on to photograph this state, so deleting it would have broken the instrument
> that found the defect. **Still owed: the fifteen page/panel spinner candidates the spec
> deliberately excluded get their own row rather than being absorbed** (M7-T2).

**c. The Project Explorer is a large flat navy block when the tree is short** — **RESOLVED in
`web-v0.97.0`, before anyone acted on this row.** It was raised as "worth putting to the product
owner"; they were asked, chose to make the Explorer light, and it shipped in the same release that
filed this. The Explorer sits in the context drawer at `tone="panel"`, and `--panel` is now
`oklch(0.968 0.003 250)`. **Left standing for a day, this row would have sent the product owner a
question they had already answered** — the drift class ADR-0058 exists for, in the register rather
than in a spec.

Its second half — "consider whether the **rail** should compress when sparse" — is now **moot, and
the way it went moot is the point**: this row named "the narrow icon rail (`tone="chrome"`)" as the
navy that remains, and ADR-0109 D2 **deleted that rail entirely** on 2026-08-24. A register row
describing a component that no longer exists reads as outstanding work; it was still doing so at the
2026-08-25 pass. Closed by deletion of its subject, not by anyone acting on it.

**d. The sign-in → organisation-home transition is black-to-white** — **RESOLVED in `web-v0.97.0`,
before anyone acted on this row.** Correctly identified as a product-owner question; they were asked
and chose to lighten the surround, which shipped in the same release. `--ground` /`--ground-end` are
now `oklch(0.975 0.005 263)` / `oklch(0.851 0.03 260)` — the old Flask app's own
`linear-gradient(135deg, #f5f7fa, #c3cfe2)`, solved for in OKLCH to within 0.0013 in sRGB rather
than matched by eye. The card, its navy panel, the photograph and the amber accents are untouched.
The accepted cost is recorded at the declaration: a floating card gets much of its drama from a dark
surround, so the login reads calmer.

### 165. Five screens photographed for the first time, and what they showed

**Status:** unverified

**Raised 2026-08-22** (W1 of the post-theme consolidation). **Size:** S each. **(c) is CLOSED 2026-09-01 too** — fixed in `e560ac2c`, whose message names `#165c`, and this
header was not updated: the already-fixed-and-unclosed shape at ITEM granularity, which is harder
to see than at row granularity because the row is legitimately still open. **(a) is CLOSED
2026-08-22; (b)–(e) remain open.** The product owner's decision was to shoot, report and choose;
they chose (a).

`apps/web/scripts/shoot.mjs` carried 26 shots and five routes had none: `/account`, `/me/activity`,
`/onboarding`, `/orgs/:slug/clients/:clientId`, `/staff`. The list was derived by matching shot names
against `src/routes/*.tsx` and then **checked** rather than trusted — `plan-detail` looked unshot and
is covered by the five `plan-workspace*` shots. ADR-0102 repainted all five and nobody had looked at
any of them.

Precedent for expecting something: widening the list 12 → 25 during ADR-0102 found two defects
**only a photograph could find** (the weekend hatch's dark-to-light step, the minimap frame's
polarity-agnostic gate — both with every gate green), plus the four rows in #161.

**a. The app shell renders on screens that have no organisation — and offers navigation that cannot
navigate. (CLOSED 2026-08-22.)** On `/account` and `/onboarding` the Project Explorer drawer is open, ~300 px wide, saying
_"Select an organisation to browse."_ On `/onboarding` that is beside a card asking the reader to
create their first organisation: there is nothing to select, by definition, on the first screen a new
member ever sees. `account.tsx`'s own docblock says _"No org in the path and no permission check,
because there is nothing to check"_ — the screen knows it is not org-scoped and the shell does not.
`/me/activity` is the third instance; ADR-0073 C2.5 already recorded that it "sits outside any
organisation" and that a journey clicked a nav link not rendered there. Same root cause, three
screens, and it is a shell decision rather than three screen bugs.

**Closed by deriving the fact once.** `ShellFrame` derives _the Explorer has a root to show_
(`orgSlug !== undefined`) and _a drawer is on screen_, and routes the drawer column, the Escape rung
and the below-`lg` `Sheet` through them, while the rail derives the same fact from the `orgSlug` it
already holds (the component gate's correction: a derived boolean passed beside its own source is
two guards that can stop agreeing, which is this row's defect one level down) — rather than a third copy of
a condition two of its neighbours already carried. **Omitted, not shaded**: ADR-0082's third omit
clause is this case verbatim, and picking an organisation in the switcher does not make the Explorer
available _here_ — it navigates elsewhere, and that switcher two rows up the same rail is already
the affordance, unshaded. A reason sentence would have been the very sentence this row reports as
useless, moved somewhere quieter.

**Three things the fix found that the row did not name.**

1. **The Escape rung would have destroyed the reader's persisted preference**, and this is the half
   worth carrying. The rung guarded on `drawer.collapsed` alone, so with the preference set to open
   and nothing available to show, an Escape on `/account` called `drawer.collapse()` — which
   `use-resizable-panel-prefs.ts` writes to `localStorage` through an effect — and announced
   "Project Explorer closed." when nothing was open. The panel would then be shut on the reader's
   next plan with nothing saying why. **Proven by a test verified red, not reasoned about**; a fix
   that suppressed the Explorer by collapsing the drawer rather than by not rendering it would have
   passed every other assertion and shipped this.
2. **`focusRailButton`'s fallback goes dead the moment the button is withheld.** A callback ref
   fires with `null` on unmount, so the map holds `'explorer' → null` and `button?.focus()` becomes
   a silent no-op — the WCAG 2.4.3 failure that function exists to prevent, arriving through the
   door this change opened. It is not reachable today (#156: the `'context'` subject has no
   production registrant), but the change is what creates the possibility, so a last rung that
   always exists (`#main`, already `tabIndex={-1}` for the skip link) lands with it.
3. **The area's own suites used the broken state as their default fixture**, which is most of why
   nobody saw it. `app-shell.test.tsx` mocked `useParams: () => ({})` — no organisation — and then
   asserted the Project Explorer navigation IS present, so five of its six cases described the
   org-less shell and every reviewer read them as describing the product.
   `drawer-entry-point.test.tsx` had the same default. Both now carry an organisation, and the
   org-less shell is a case of its own.

The **derived** half of the journey's absence check (`a[href*="/orgs/"]`) passed against the pre-fix
code, which is the row's own finding restated as evidence: the rule existed and was applied to one
cluster. `tool-rail.test.tsx`'s case for the other cluster is titled _"renders no destinations
outside an organisation — there are none to show"_, forty lines below the button that was exempt
from it.

Gated by `apps/web/e2e-shell/` (`pnpm --filter @repo/web test:e2e:shell`, its own CI step), which
signs up and stops on the real `/onboarding` — the one moment in an account's life with no
organisation at all, and a state no seeded fixture can reach. Re-shot at 1646 before and after.

**One thing this deliberately did NOT fix, and one it exposed.** Below `lg` the Escape rung still
closes and announces a drawer the reader cannot see, because that column is `hidden lg:flex` — a
guard disagreeing with a CSS class, pre-existing, filed as **#168** rather than absorbed into a
change whose journey does not drive that viewport. And this row's own wording ("above an EMPTY 40 px
actions row") reads as fully closed and is not: that row is moot on org-less routes now, and still
renders as an empty bordered strip on **every organisation route** for a Contributor or Viewer —
**#169**.

**b. `My activity`'s filter row wraps ragged.** _(Re-shoot before designing: closing (a) widened
`<main>` on this screen by ~298 px, so the W1 photograph this describes no longer shows the layout
that will be worked on. Found by the #165a spec check.)_ Five `Show` chips, then `Outcome` and `From` on the
same line, then `To` and `Clear filters` wrapping below — four group labels at three different
vertical positions. Adjacent groups are also styled differently for no stated reason: `Show` is
chips, `Outcome` is plain text.

**c. `All events shown` is a filled dark button that is not an action.** It is a status, rendered in
the same treatment as `Change password` and `New project`. ADR-0099's status bar exists because
_"`Recalculate` stops being a button pretending to be a status"_; this is that, one screen along.

**d. `client-detail`'s row actions are bare text links.** `Edit` and `Delete` sit at the right of each
row as unadorned text, with **`Delete` visually identical to `Edit`** — a destructive action carrying
no destructive treatment. `docs/UX_STANDARDS.md` "Row / node actions" specifies the APG `Menu`
primitive. Check this against ADR-0097 Landing F before acting: that milestone re-counted row-action
crowding **by subject-labelled actions** rather than by `size="sm"` occurrences and found exactly one
crowded table, so this may be a knowing exclusion rather than an oversight.

**e. `/staff` is still unphotographed, and the mechanism is recorded rather than left to be
rediscovered.** The console is five panels (ADR-0086) that nobody has ever looked at in any theme.
`shoot.mjs` boots no servers, and `/staff` is gated on the API's `STAFF_EMAILS`. The shot now exists
and **skips loudly**, naming what would make it run — a silent skip in a shot list is
indistinguishable from coverage, which is the failure W1 exists to correct. What it needs:
`playwright.staff.config.ts:75` boots an API with a **fixed** `STAFF_EMAILS`
(`Ops@SchedulePoint.test`), so the harness must also sign up as that address rather than its
generated per-run one. That is a second onboarding path, not a shot entry, which is why it is filed
rather than done inside a catalogue-only slice.

### 174. The axis-markers gate pass's non-blocking findings

**Status:** unverified

**Raised 2026-08-22.** Four specialists over the ADR-0106 epic diff. Frontend-performance passed
outright, having built both refs and measured **+0.79 kB gzip** for the whole epic, and having
re-derived the cache-miss analysis from the code rather than from the M0 numbers. Component,
accessibility and UX each blocked, **all three independently on the same defect** — the cursor
readout painted with `bg-card`/`text-card-foreground`, which are ADR-0097 **resets** and therefore
absent from the canvas rebind, so they resolved the page's white card at **1.13:1** against the
ruler ground while the fill's own docblock claimed it used the bar colour. That is
`docs/TECH_DEBT.md` **#162** repeated one file over, four days later, by the epic whose own ADR
quotes the "one correct pattern applied to a control and not its neighbour" shape. It is fixed with
the pair added to the contrast gate and the docblock corrected. What follows is what was
deliberately **not** folded, with the reason.

- **The withheld `Today` label is silent.** When the data date and today are too close for both
  words, `Today`'s is withheld and its dashed rule remains — measured to bite only within 0.5 days
  at the Day preset and 1.1 at Week, but within 13.5 at Quarter and **40.5 at Year**, which on a
  live programme is common. Nothing on screen says _why_ the word disappeared between one zoom step
  and the next, and the UX review is right that a first-time reader has no reason to know the dash
  convention without opening the legend. Not fixed, because every fix considered is worse than the
  silence: a third label state (`Data date · today +3d`) is permanent cost for every plan to name a
  distinction under four pixels wide; a tooltip on an `aria-hidden` band in a `pointer-events-none`
  element is unreachable; and an icon is a fourth channel on a mark that already has three. The
  honest framing is that at Quarter and Year the two marks ARE one position, and the register
  should say so rather than pretend a cue would help. **Revisit if a planner reports it**, which is
  the only evidence that would distinguish "acceptable" from "we got used to it".
- **The escalation trigger measured pixel collision, not information loss.** The M0-T2 test written
  before the measurement asked whether the two marks _overlap_; the question a reader has at the
  Quarter preset is whether they can still see how far behind the programme is. Those are not the
  same question, and the first does not answer the second. Recorded because this register's
  recurring shape is a measured trigger answering a narrower question than the one it was meant to
  settle — naming it is cheaper than re-deriving it.
- **M0-T7's cost is measured in isolation.** `label-widths.spec.ts` times a forced layout on a probe
  span that is the only thing written in that harness. In production `syncRuler()` runs immediately
  before `syncAxisMarkers()` in the same synchronous pass and can reposition dozens of tick spans on
  a panning frame, so a layout forced after it has more invalidated subtree to resolve. The
  compounded worst case — panning _while_ a create-drag mints a fresh label — is not measured, and
  the "0.25 % of a 16.7 ms frame" figure does not cover it. Both numbers are single-digit
  microseconds to low tenths of a millisecond and the painter itself is already 4–6× over its budget
  (#75), so this is very unlikely to matter; it is recorded because CLAUDE.md §19.11 says a claim
  that decides something carries the evidence for the case it decides, and this one carries the
  evidence for a cleaner case.
- **`AxisMarkerMark.width` and `left` are correlated by convention, not by type.** They are always
  set together by `place()`, and a discriminated union would make that structural in the spirit of
  the module's own preference for compiler-enforced invariants. Left alone: one call site, fully
  tested, and the union costs every reader a narrowing for a risk that is currently theoretical.
- **`axisMarkers()` builds `marks` even when called unmeasured**, which the painter never reads.
  Cheap (two objects), and splitting the function would give the epic two entry points to the one
  decision it exists to keep single. Not changed.

**A process finding belongs here too, and it is mine.** A read-only review agent left a scratch test
file in the working tree, and a `git add -A` in the middle of the gate pass swept it into the ADR
commit. It is removed, but the lesson is the general one: `git add -A` is not safe while anything
else is writing to the tree, and a review pass is exactly when something else is. Stage by path
during a gate pass.

### 180. A workflow's renamed INPUTS have no equivalent of the output guard

**Status:** standing · **Verified:** 2026-09-01

**`standing`, not `open`** (2026-09-01). This is a permanent property of GitHub Actions — an
unrecognised `with:` key is indistinguishable from an omitted one from inside a workflow — so there
is no state in which it becomes fixed. It was filed `unverified` in ADR-0120's wholesale
classification, which is the right default for a row nobody has read and the wrong answer for one
whose own last paragraph names the practice it wants. The practice is CLAUDE.md §19.11 applied to a
workflow: re-read the action's `action.yml` on every major bump.

**Raised 2026-08-23** while migrating `changesets/action` v1 → v2 (Dependabot #323), and it is a
finding about **what can be guarded**, not about that upgrade, which is done.

`.github/workflows/release.yml` carried a careful note predicting the v2 upgrade: `hasChangesets`
becomes `has-changesets`, reading the wrong name yields an empty string, and the release then stops
tagging and publishing while going green. It also carried a **fail-loud assertion** for exactly
that, written while the workflow was still on v1 so the eventual bump would break visibly.

**The note was right and incomplete, and the incomplete half is the dangerous one.** Read from the
action's own `action.yml` at the v2 tag, v2 renames **five** things:

| v1                         | v2                       |
| -------------------------- | ------------------------ |
| input `version`            | `version-script`         |
| input `commit`             | `commit-message`         |
| input `title`              | `pr-title`               |
| `GITHUB_TOKEN` **env var** | `github-token` **input** |
| output `hasChangesets`     | `has-changesets`         |

Migrating by the note alone — bumping the tag and renaming the output — would have left three
unrecognised `with:` keys. **GitHub Actions ignores unrecognised inputs without warning**, so the
step would have run the action's _default_ behaviour: a bare `changeset version` instead of
`pnpm version-packages`, and a PR titled "Version Packages" instead of the Conventional Commit title
this repository requires. No error, no annotation, nothing red.

**The asymmetry is the point.** An output read with the wrong name produces an empty string, which
is a _value_ the workflow can test — and does. An input passed with the wrong name produces
**nothing observable at all**: a misspelt input and an omitted input are indistinguishable from
inside the workflow, so there is no expression that could catch it. The existing assertion is not
weak; it is guarding the only half of this interface that admits a guard.

**What can be done instead, none of it free:**

- **Assert on the effect rather than the input.** The version step's own log line, or a check that
  the opened PR's title matches the expected string. Both are indirect and only fire on a release.
- **Pin the action by commit SHA rather than by tag.** That does not prevent a wrong input, but it
  removes the class of surprise where the action's contract changes underneath an unchanged
  workflow. Widely recommended for third-party actions and worth considering on its own merits.
- **Accept it and re-read `action.yml` on every major bump**, which is what was done here.

The last is what CLAUDE.md §19.11 already requires — _a claim that decides something carries its
evidence_ — applied to a workflow rather than to prose. Recorded so the next person bumping a
third-party action knows the note in the file is a starting point rather than a specification.

**Not a defect in the current workflow**, which is migrated correctly and verified: `action.yml`
read at the v2 tag, all five renames applied, the YAML parsed and the step's resolved `with:` keys
confirmed as the four v2 names with no leftover `env:` block. The hyphenated output read
(`steps.changesets.outputs.has-changesets`) uses dot notation, which was checked against
`actions/cache`'s own documented `steps.cache.outputs.cache-hit` rather than assumed — this
repository had no hyphenated output anywhere to copy from.

---

### 181. `check:claims` matches a citation by ref string, so a coinciding line in a different version passes

**Status:** unverified

_Found 2026-08-23, by the gate accepting a citation it should have refused._

**Still open, and the reason is now sharper than "it is a shared-gate change" (2026-08-31).** Its
siblings #178 and #183 were fixed in one pass; this one was left because both obvious remedies fail.
Putting the version in the `ref` requires every citation in prose to carry it, which is not how
anybody writes one. Parsing a version out of the surrounding prose is a text heuristic over a shape
nobody has agreed — the class of fix that produced #177, #183 and this row. What it probably wants is
the version recorded **per claim** rather than per package, so a `ref` resolves to a version rather
than to a filename: a schema change to `dependency-claims.json` and a migration of all 78 entries,
which is a slice of its own.

`scripts/check-claims.mjs` scans the tree for citation-shaped strings and requires each one to
appear as a `ref` in `scripts/dependency-claims.json`. The `ref` is `basename:lines` — it carries no
version. So a citation into **a different version of the same file, at a line that happens to
coincide with a registered one**, satisfies the gate and reads to every later reader as re-read
evidence.

**It happened.** `docs/specs/better-auth-1-7-account-issuer/migration-design.md` cited
`better-auth@1.7.1` `sign-up.mjs:254` for _"the credential issuer is `local:credential`"_. The
register holds `sign-up.mjs:254` — verified against **1.6.28**, where that line is
`if (ctx.context.options.emailVerification?.sendVerificationEmail)`, the verification-email call,
which has nothing to do with issuers. `pnpm check:claims` reported **52 claims OK**. The two sibling
citations in the same table — into `account.mjs` and one line further into `sign-up.mjs` — **were**
caught, and only because those line numbers happened not to collide with anything registered. The
gate's success and its failure on one table were decided by coincidence.

(Those two are named here without their line numbers on purpose: writing them out trips the gate
from inside the row that documents it, which is the second time this session a write-up about a
citation problem has been refused for containing one.)

**Why this is the sharp version of #178 rather than a duplicate.** #178 is about the _resolver_
reaching the wrong copy on disk. This is about the _register_: even with the right copy read, a ref
cannot express which version was read, so two claims about two versions are indistinguishable
identifiers. #178 makes you read the wrong file; #181 lets the right reading of a new file inherit
an old file's verification.

**Scope.** Only bites when a document cites a version other than the one installed — which is
exactly what an upgrade epic does, and exactly when the citations matter most. The current tree is
clean: the three 1.7.1 citations now name their symbol and carry no line, with the reason recorded
in the design file, and they get real anchors at M4 against the version that lands.

**Candidate fixes, none free.** Make `ref` version-qualified (`better-auth@1.6.28:sign-up.mjs:254`),
which is correct and rewrites every citation in the tree. Or have the scanner read the
`package@version` prefix a citation already often carries and refuse a mismatch against the entry's
`verifiedAgainst` — narrower, and does nothing for the many citations written as a bare basename.
The second is probably right; neither should be done inside an upgrade epic, because the gate would
then be changing underneath the citations it is checking.

---

### 184. Unsaved-work guard: the findings its gate pass did not block on

**Status:** unverified

_A second, em-dash-styled row briefly shared this number (the bulk-delete focus race); it is now **#209**._

_Triage 2026-08-28 (Phase 4): re-filed consciously. The CONFIRM-path focus gap is the register's
own words — "a systemic router gap… worth its own look at where focus should land after any route
change" — which is a design pass across every navigation, not a residue fold; the rest stand on
their filed reasons._

_Filed 2026-08-23 with ADR-0108. Six blocking findings were fixed in the milestone; these are the
rest, recorded rather than carried in someone's head._

**From the accessibility review**

- **The CONFIRM path hands focus to nothing.** Choosing "Discard and leave" completes the
  navigation, and nothing moves focus to the new view's landmark or heading — so a keyboard or AT
  user is left wherever the removed dialog left them. This is a **systemic router gap** the guard
  exposes rather than causes: it is the first feature that deliberately interposes itself in a
  navigation. Worth its own look at where focus should land after any route change.
- ~~**`describeUnsavedWork` has no upper-bound treatment.**~~ **CLOSED 2026-08-31.** Both branches
  now share one `joinWithAnd`, so the sentence reads the same way whether one surface or two hold
  work; past four names the count leads (`6 sections have unsaved changes: …`), which is ADR-0094's
  move for the same reason. The six-scope sentence — which no test had ever read, which is how it
  shipped unpunctuated — is now asserted, with three pinned beside it so the threshold has both
  sides.
- ~~**Silent auto-proceed.**~~ **CLOSED 2026-09-01, and the item understated it: the auto-proceed
  was not silent, it was _unreliable_.** `NavigationGuard` read the registry imperatively through
  `useUnsavedWorkRegistry`, whose value is a `useMemo(…, [])` — so nothing subscribed the guard to
  registry changes, and the effect's dependency array could not move while a confirmation stood. It
  could fire only if something unrelated happened to re-render the component. Verified: with the
  pre-fix effect restored, `proceed` is not called at all in the new case.
  The fix gives `useUnsavedWorkReports` its **first production caller** — the subscribing reader
  this register recorded on 2026-08-31 as having none, kept "for a future consumer"; this is that
  consumer. The two blocker callbacks deliberately keep reading imperatively, because making them
  depend on a changing value would re-register the blocker on every registry change, which the
  suite counts. The announcement rides on the working subscription and says why the page moved:
  the visual channel needs nothing (the page moved, which is its own explanation) and the audible
  one had nothing at all.

**From the component review**

- ~~**`useUnsavedWorkReports` has no production caller.**~~ **CLOSED 2026-08-31 — it says so.**
  Re-verified (only its own suite and the editor's registration suite import it) and the docblock now
  states it, with the reason both current readers do not need it: they are _called_ rather than
  rendered. Kept rather than deleted, because the `useSyncExternalStore` + version-counter shape is
  the non-obvious part a painting consumer would need — but that is a reason, not a caller, and the
  distinction is now on the page.
- ~~**The `onDirtyChange` effect is authored three times**~~ **CLOSED 2026-08-31.** One
  `useReportDirty` in the same file, and the reason it is a hook rather than a `useScopeForm` option
  is now written where the next reader will reach for that option: `WeightedStepsPanel` does not use
  `useScopeForm`, so an option there would cover two panels of three — the one-and-not-its-neighbour
  shape.
- ~~**Fourteen conditional array spreads** across the four report builders~~ **CLOSED 2026-09-01.**
  `buildReport(subject, candidates)` lives in the already-React-free `lib/unsaved-work/report.ts`
  and all four builders call it; each scope is now one object with a `when` field, so a reader
  compares conditions down a column instead of parsing a spread per line. The helper **rebuilds**
  each scope rather than spreading the candidate, so `when` cannot leak into what a consumer reads
  — pinned by a key-set assertion, which `toMatchObject` would have missed. Every call site was
  correct before and after; the idiom was the risk, and ADR-0074 records this exact shape going
  wrong elsewhere.

**From the security review, and it is about my own conduct**

- **Coverage was deleted and not replaced.** An earlier commit on this branch (`33b12b8f`) drove
  `page.goBack()` with a dirty scope and asserted the confirmation, "Keep editing" and "Leave". When
  Back turned out not to reach the blocker, that whole case was replaced with the narrower
  reload-only journey — and the in-app confirmation lost its only browser-level coverage in the
  process. The allow-list's _behaviour_ now has a real unit test (added at the gate pass, verified
  red), but **no journey opens the in-app `ConfirmDialog` at all**, so the "Keep editing" focus
  return is asserted nowhere a real `<dialog>` exists. That matters because the focus defect the
  accessibility review found was invisible to jsdom by construction.

  > **Assessed 2026-09-01, and the answer is that the journey cannot be written honestly today —
  > which is a bigger finding than the gap it was filed as.** Enumerated: there are **four**
  > registrants (`ActivityEditorDialog`, `ActivityCreateDialog`, `CalendarFormDialog`,
  > `CalendarExceptionsEditor`, the last rendered inside the third), and **every one of them lives
  > inside a modal `<dialog>`** — `dialog.tsx:70` calls `showModal()`. A modal dialog puts
  > everything behind it in the browser's top layer and makes it `inert`, so while any of them holds
  > unsaved work there is **no in-app link a planner or a test can reach**. ADR-0108 recorded
  > exactly this about the editor ("never reachable while it was open — for a test or a planner")
  > and the register did not carry the consequence forward: the guard's in-app half has no reachable
  > trigger at all. Its `beforeunload` half is reachable and IS covered.
  >
  > So this is ADR-0081's shape rather than a coverage gap — a capability with no entry point — and
  > writing a journey now would mean driving something the product cannot do. **What would close
  > it** is the first non-modal registrant (an inline form, or a drawer-hosted editor — see #156),
  > at which point the journey becomes both possible and owed. Filed here rather than as a new row
  > because it is the same finding one level down.

**Why Back is unresolved**, since it belongs beside the above: instrumented in a real browser,
`shouldBlockFn` is **never called** on `page.goBack()` while the guard is mounted and the URL does
not change — so something other than this guard reverts the pop. Recorded rather than claimed
(ADR-0108 D7).

---

### #208 — A journey that seeds through the API must tell the client itself

**Status:** open (audited 2026-08-31 — see below; kept as the standing rule, not as owed work)

_Renumbered from #183 on the 2026-08-28 reconciliation pass (the #207 note explains why)._

_Filed 2026-08-24 with ADR-0109 M5, from the estate sweep._

Several support layers write plans, activities and links straight to the REST API with
`page.evaluate` — much faster than driving the UI, and correct — and then relied on **a later
`Recalculate` press** to invalidate the open page's queries. Nobody wrote that reliance down; it was
a side effect of a mutation, and it worked for as long as that control was offered unconditionally.

ADR-0109 D3 made it conditional, and six `e2e-gantt-editing` specs opened a Gantt with no rows in
it. `e2e-gantt/support.ts` now reloads at the point of the out-of-band write, which is the idiom
`e2e-workspace-chrome/support.ts` already used with the same one-line reason.

**A second, sharper form of the same mistake was found in the product, not the tests.** The status
bar's own staleness rule first asked the **schedule summary** for the plan's activity count — and
that query is invalidated by a **recalculation**, not by an edit. So on a plan whose summary was
fetched while it was empty, adding two activities left the count at 0 for good: the bar published
"the schedule is current" on `data-schedule-state` while its own `Finish` fact, read from the same
stale summary, said `Not calculated`. Two halves of one row disagreeing. It reads the client's
activity rows now — the ones the reader is looking at — so no cache can go stale relative to the
screen. **The lesson generalises past the tests: ask the query that the edit invalidates.**

**The audit ran 2026-08-31, and its scope was smaller than this row assumed.** Seventeen support
files call `page.evaluate`; eleven already reload. Of the six that do not, **three do not seed
anything at all** — `e2e-public`, `e2e-designed-chrome` and `e2e-designed-ui` use `page.evaluate`
only to READ (a class name, a scroll height, a colour painted into a 1×1 canvas), so the rule has
nothing to say about them. The remaining three seed and are each correct for a different reason,
now written at the helper rather than left to be re-derived:

| helper                           | why no reload                                                                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `e2e-float-paths` `seedNetwork`  | the caller reloads on the next line (`float-paths.spec.ts:41`, checked)                                                                 |
| `e2e-health-check` `seedDefects` | the caller reloads on the next line (`health-check.spec.ts:30`, checked)                                                                |
| `e2e-overview` `addActivity`     | the caller never reads this page again — it opens the overview in a SECOND tab, because navigating this one away releases the pen lease |

So the estate is green **and now says why**, which is what the row asked for. What it does not buy
is a gate: the next helper is still written by copying one of these, and nothing checks that the
copy kept the reason. That is deliberate — the discriminator is "does this page get read again?",
which a script cannot answer.

Cost: one pass over nine files. There is no gate for this and a structural one looks unpromising —
"does this helper's caller later observe what it wrote" is not a property of a file.

---

### #187 — The deck's labels sit 3 px apart and three hypotheses are falsified

**Status:** unverified

_Filed 2026-08-25 with workspace-chrome-fit M1. **Not a regression** — the spread was 12 px before
this epic and is 3 px after. This row exists so the next person does not re-run the experiments that
have already been run._

At 1646 the deck reports label tops of **135 and 138** on every wrap row. Every control is `36 px`
tall, every control is inline, and the spread persists.

**Three hypotheses, each built and measured, each falsified:**

| hypothesis          | test                                                                                                        | result                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Control height      | forced every item to `h-10`                                                                                 | spread unchanged at 12 px (pre-M1)                                                                          |
| Type scale          | deleted `Deck.tsx`'s `[&>span:last-of-type]:text-micro` so every label uses the CVA's `text-sm`             | **+74 px** of item width, spread unchanged at 3 px — twice, once before and once after heights were uniform |
| One outlier control | the search field was `h-8` + `pointer-coarse:h-9`, the only deck control outside `min-h-9`; raised to `h-9` | heights became uniform `[36]`, spread unchanged at 3 px                                                     |

The search-field fix was **kept** — it was a real breach of M1's one-geometry contract and it closed a
genuine inconsistency. It simply was not the cause of the spread. The type-scale change was
**reverted** both times: a change that costs 74 px on a surface already wrapping to four lines at
1280, and buys nothing measurable, is not worth keeping because it reads as more consistent in source.

**What is left to try**, in rough order of likelihood: the icons. Deck items carry `size-3`/`size-4`
icons and some carry none; in an `items-center` flex line the tallest child sets the line box, so two
items with different icon heights centre their text differently even at identical control height. The
probe would be to null every icon and re-measure — which is cheap and was not done only because 3 px
is close to the threshold of what the eye tracks, and the complaint that opened this epic was about
12 px.

**The measurement instrument to use** is `apps/web/measure-toolbar/m0-repaired.spec.ts`, whose
`perRow.labelTops` is what produced every number above. Note its blind spot, found the hard way: it
selects labels by `<span>`, so a leaf `<input>` control is invisible to it — that is exactly why the
search field survived two commits as "unidentified", and it is why the height column above had to be
read from `distinctControlHeights` rather than from the label tops.

---

### #191 — The local pre-push gate costs 8 minutes and 96% of it is two steps

**Status:** unverified

_Filed 2026-08-25 by the reconciliation pass, at the product owner's request to check whether we
over-test locally._

**The hypothesis was that the ten `check:*` gates are overdone locally. Measured, they are not — they
cost 10.4 s between them, 2.2% of the gate.** Individually, all under 2 s: `doc-links` 895 ms,
`playbook` 1,828, `build-contract` 880, `surface-contract` 872, `flags` 845, `counts` 854, `claims`
1,417, `adr-coverage` 932, `nginx` 991, `frontend-only` 893.

The cost is elsewhere. For a **one-line change to one `apps/web` source file** — the ordinary case,
timed on this machine with turbo warm for every other package:

| Step             | Cost        | Share | Turbo        |
| ---------------- | ----------- | ----- | ------------ |
| `pnpm test`      | **345.6 s** | 73%   | 13/14 cached |
| `pnpm lint`      | **112.7 s** | 24%   | 14/15 cached |
| `pnpm typecheck` | 6.5 s       | 1.4%  | 14/15 cached |
| ten `check:*`    | 10.4 s      | 2.2%  | (uncached)   |
| **total**        | **~475 s**  |       |              |

A full cold run is **10 m 29 s**. All of the 345.6 s is `@repo/web:test` — **552 unit test files, all
of them, on every run**.

**Both expensive steps are expensive by configuration, not by necessity**, and neither observation
requires weakening anything:

- `eslint` runs with **no `--cache`** (`apps/web/package.json:12` is a bare `eslint .`).
- `vitest` runs the **whole** suite (`"test": "vitest run"`); it has `--changed` and `related`.

**The comparison that decides it:** CI's `quality` job — which runs _the same_ lint, typecheck, test
and all ten checks, plus `build` — took **11 m 22 s** on PR #387 (19:37:38 → 19:49:00). So the local
gate spends ~8 minutes to pre-empt an 11-minute job. It is not buying latency; it is buying a **round
trip** — catching the failure before the push rather than after. Today it did exactly that twice, and
both were mechanical (a missing `order` prop, a stale count).

**Not changed here.** `scripts/prepush.sh` is a shared gate, so altering what "prepush green" means
fires an ADR-0105 trigger and needs a spec, not a reconciliation-pass edit. Two candidates for that
spec, in order of confidence:

1. ~~**`eslint --cache`**~~ — **DONE 2026-08-25, and measured rather than assumed.** All nine lint
   scripts take `--cache --cache-strategy content`. For `@repo/web`: **114,951 ms cold → 8,032 ms**
   with one file changed. A **14×** win, **107 s off the gate**, and **zero coverage change** — the
   same files are linted by the same rules; a cached result is only reused when the file's content
   hash is unchanged (`content`, not `metadata`, so a touched-but-identical file is not re-linted and
   a restored-from-git file is). **CI is unaffected in either direction**: a fresh runner has no
   `.eslintcache`, so CI always does the full lint it did before. `.eslintcache` was already in
   `.gitignore`, and turbo's `lint` task declares `outputs: []` with default inputs — gitignored
   files are outside its input hash, so the cache file cannot invalidate the turbo cache it sits
   beside. That was checked before the change, not after.

   **What it does not fix, stated so the next reader does not re-measure it:** the gate for a
   one-line web change goes ~475 s → **~368 s**, and `pnpm test` is now **94%** of what remains.

2. **Scope the local unit run to what changed** — **put to the product owner on 2026-08-25 with the
   numbers above; they chose option 1 alone.** Recorded as the remaining lever rather than as a
   recommendation, and the reason they gave it a miss is the reason it is written the way it is
   below: it is the only one of the two that trades away signal.

   `vitest --changed` or `related`, with CI keeping
   the full 552-file suite. This _is_ a real weakening of the local signal and must be argued rather
   than assumed: it trades "everything still passes" for "what you touched still passes", and the
   thing that makes it defensible is that **CI is the gate that blocks the merge and it does not
   change**. If that argument is not accepted, option 1 alone still removes a quarter of the cost.

Do **not** answer this by dropping `check:*` scripts. They are 2.2% of the cost and they are the part
of the gate that catches what a reviewer cannot see.

---

### #193 — Four more toolbar docblocks and five exports describe deleted machinery

**Status:** unverified

_Filed 2026-08-25 by RECONCILE step 7 (component review), which swept further than the pass had._

The 2026-08-25 pass corrected two docblocks citing `ToolbarOverflow` and `toolbar-ladder.ts`. It
stopped at the two it had found. A `grep` for the deleted machinery finds more:

- `toolbar-registry.ts:544-552` — `priorityOf`'s own docblock, **immediately above** one of the two
  the pass fixed, still describes "the demotion queue below" and `computeLadder` withdrawing labels.
  `priorityOf` itself has **zero callers**.
- `toolbar-registry.ts:98-101` — `resolveLayoutMode` says `Toolbar` "holds the previous mode… for
  the same reason it holds the previous overflow set". `Toolbar` has no mode state and there is no
  overflow set.
- `toolbar-registry.ts:40-44` — `ToolbarTier` still describes tier-2 demoting before tier-1.
- `toolbar-band.tsx:1-33` — cites `computeLadder` as the live consumer.

**~~Five~~ FOUR exports have no production caller**: `priorityOf`, `partitionByTier`,
`resolveLayoutMode`, `TOOLBAR_LAYOUT_HYSTERESIS_PX`. (This sentence named `TOOLBAR_LAYOUT_BANDS`
too, and was wrong twice over — see the correction below. It is left struck rather than rewritten,
because a reader who acted on the original is the risk this row now exists to describe.) Both `Deck` and `Toolbar` now hard-code
`layout: 'comfortable'` as a literal, so `resolveLayoutMode`'s other three bands are unreachable and
`triggersAreCompact`/`searchFieldWidth` always take their roomy branch. They are exercised only by
their own tests — the ADR-0081 shape: tests validating code nothing calls.

### Two more, and how the first grep missed them (2026-08-30 verification sweep)

**The four docblocks above are now all corrected** — each carries a paragraph naming what it used
to say and citing this number.

> **The list of five was wrong about one of them, and acting on it would have broken production**
> (corrected 2026-08-31, verified by reading rather than by anything failing). **`TOOLBAR_LAYOUT_BANDS`
> is not an export and is not dead.** It is a module-private `const` (`toolbar-registry.ts:72`), and
> `bandIsAtLeast` (`:161-165`) reads it — a function called in live code at
> `features/tsld/toolbar/tsld-toolbar-items.tsx:2570`, inside an `isVisible` predicate that runs on
> every render. Deleting it deletes a working feature. That its _value_ is constant today (`env.layout`
> is hard-coded `'comfortable'`) is a different claim from "no production caller", and this row
> conflated the two.
>
> Calling it an export also weakened the row's own closing argument, which rests on removal being a
> public-contract change: removing a module-private const is not one.
>
> The corrected list is **four**: `priorityOf` (no reference of any kind, including tests),
> `partitionByTier` and `resolveLayoutMode` (test-only), and `TOOLBAR_LAYOUT_HYSTERESIS_PX` (read
> only inside `resolveLayoutMode`). The row's summary "they are exercised only by their own tests"
> is false for `priorityOf`, which has no test either — the sweep paragraph below gets that right,
> so the row contradicted itself.
>
> **Worth keeping for the method.** This was found by spot-checking a subagent's report against the
> code before acting on it — the same rule the register applies to its own rows, one document out.

**Two citations of the same class were not on the list, because the list was a list of names.**

- `toolbar-registry.ts:455` and `toolbar-registry.test.ts:308` both explain a guard in terms of
  what **`companionsOf`** does. There is no `companionsOf` — it went with the ladder. Two comments
  justify live code by the behaviour of a function that does not exist.
- `app-header.tsx:197` cites **`isWidthConstrained` (`Toolbar.tsx:81-84`)** for why a
  width-unconstrained row is charged no chrome. `Toolbar.tsx` exists; that symbol does not, at those
  lines or anywhere.

**The transferable part is why the 2026-08-25 grep could not have found them.** It searched for the
machinery it knew had been deleted — `ToolbarOverflow`, `toolbar-ladder.ts`, `computeLadder` — and
both of these cite something _else_. A grep for known-deleted names finds citations of names you
remember deleting; it is structurally blind to a citation of a name nobody remembers existed. The
instrument that does work is the opposite direction — resolve every backticked identifier in a
comment against the tree — which is `#177`/`#183`'s shape one layer in, applied to this repository's
own symbols rather than a dependency's. Recorded rather than built: it is a shared gate, so it needs
a spec (ADR-0105).

**Not deleted here deliberately.** ADR-0110 M5's own decision was to KEEP the ladder machinery
because the reduced strip does not fit at 1280 or 1440, so `resolveLayoutMode` may yet be needed;
and removing exports is a public-contract change (ADR-0105). The docblocks, though, are simply wrong
and should be corrected whether or not the code goes. Decide the two questions separately.

---

### #194 — "The epic's own gate pass removes it" has now failed twice as an instruction

**Status:** unverified

_Filed 2026-08-26 by the reconciliation pass, after the declaration it describes blocked this pass's
own commit._

`scripts/frontend-only.json` arms an opt-in gate: while an epic declares itself frontend-only, any
change under `apps/api/` or `packages/` fails CI. It is a good gate and it has now gone stale
**three times out of three**:

| Epic                 | Released                    | Still armed until | What it then blocked                                  |
| -------------------- | --------------------------- | ----------------- | ----------------------------------------------------- |
| `gantt-editing`      | 2026-08-18 (`web-v0.92.0`)  | 2026-08-18        | ADR-0096, which legitimately changes `apps/api/`      |
| `workspace-redesign` | 2026-08-24 (`web-v0.103.0`) | 2026-08-26        | a lint-script change across nine `package.json` files |

Both times it did what its own docblock says a stale declaration does — **it did not go quiet, it
went wrong about a different change**, citing a parity argument that was not that change's.

**The remedy in place is a sentence**, in the gate's own docblock: _"the epic's own gate pass removes
it"_. That sentence has been read by at least two closing passes and acted on by neither, including
the reconciliation pass of 2026-08-25, whose whole subject was documents that outlive their truth.
ADR-0058's rule applies to the gate's own lifecycle as much as to prose: **if you find yourself
writing "remember to remove X", write a mechanism for X instead.**

**Candidate mechanisms, none built** — this is a shared gate, so changing it fires an ADR-0105
trigger and wants a spec rather than a quiet edit:

1. **Date the declaration** (`declaredOn`), and fail once it is older than a horizon, demanding an
   explicit renewal. This is `check:flags`' shape (ADR-0084), already accepted here, and the horizon
   is the natural place to say "an epic lasts about this long".
2. **Tie it to the ADR**: fail when the named epic's ADR is `Accepted` and its flag/release has
   shipped. Stronger, but it needs the declaration to name an ADR and the gate to parse ADR status,
   which is more machinery than the problem deserves.
3. **Fail on an empty guarded diff**: if the branch touches none of the guarded paths for N days,
   the epic is probably over. Cheap, but it would fire on a quiet week rather than on a finished
   epic — the wrong signal.

Option 1 is the one worth costing. Deliberately not built here: this row exists so the third
instance is not also fixed by writing a fourth sentence.

---

### #195 — `pnpm prepush` cannot see uncommitted work in its diff-based checks

**Status:** unverified

_Filed 2026-08-26 by the reconciliation pass, from a false pass it produced._

`check:frontend-only` diffs `origin/main...HEAD` (`check-frontend-only.mjs:93`) — **committed HEAD,
not the working tree.** So running `pnpm prepush` on an uncommitted tree asks the question of the
_previous_ commit, and answers about work that is not the work in hand.

That happened during this pass and is how the failure reached CI: the gate reported green locally
over a dirty tree, and failed on the same content once pushed. Confirmed both directions —
re-running it after committing reproduces CI's failure exactly, and `git status --porcelain` shows
the guarded paths absent from what the diff can see.

**This is not the gate being wrong**; `origin/main...HEAD` is the right question for "what does this
branch change". It is a mismatch between that and how `pnpm prepush` is documented and used:
`docs/TESTING.md` presents it as the thing to run _before you push_, and the natural moment to run
it is while the change is still uncommitted — exactly when this class of check is blind.

`check:frontend-only` is the only current `check:*` that diffs, so the blast radius is one script
today. The cheap fix is for the script to notice a dirty working tree and either include it or say
loudly that it cannot see it; the silent green is the defect, not the scope of the diff. Grouped
with `#194` because both are about this gate, and both should be settled in one spec.

---

### #197 — Three rules with two or three implementations each, agreeing by discipline

**Status:** unverified

_Filed 2026-08-26 by the ADR-0111 sweep's component half. None divergent enough to block; one
already asymmetric. **Item 1 closed 2026-08-28** (fix-slice M-A); item 3's `usePopoverPanel` copy
is closed by the same epic's M-C._

1. **CLOSED (2026-08-28, `docs/specs/fix-slice-2026-08/` M-A).** The guard now lives once in
   `components/ui/native-dialog-close.ts` (`useNativeDialogClose`), adopted by both primitives, and
   `Sheet` gained the `confirmBeforeClose` clause it never received — latent by design, no consumer
   sets it (verified by grep), documented on the prop with this row's reasoning. A structural gate
   (`native-dialog-close.structural.test.ts`, comment-stripped, pinned positive) fails the next
   private copy; verified red against the pre-extraction tree, where it named both files. The two
   pre-existing nesting tests passed unedited through the extraction, which is the ADR-0078
   condition for calling a move a move. _Original finding:_ `dialog.tsx` and `sheet.tsx` each
   carried a private `closeIfSelf`, and the copies had already diverged by exactly the
   `confirmBeforeClose` clause.
2. **`MenuItem` and `ToolbarButton` each hand-roll the reason-first `aria-describedby` composition**
   — reason before standing description, because "why you cannot use it outranks what it would tell
   you", plus the guard against a dangling `aria-describedby`. `form.tsx` has a third textually
   identical `mergeDescribedBy`. Currently in agreement, by matching comments rather than by
   construction.
3. **Three copies of the capture-phase Escape + outside-pointerdown contract** — `Menu`,
   `Combobox`, and `usePopoverPanel`. The irony is on the record: `usePopoverPanel` was extracted
   **specifically** to stop this drift and cites ADR-0062's extraction argument, but only
   `ToolbarPopover` was migrated onto it. `#196a` is what that costs: the `preventDefault` fix had
   to be made in two files, and a third implementation sat one directory away. _2026-08-28
   (fix-slice M-C): the `usePopoverPanel` copy's cost is paid — its Escape handler gained the
   missing `preventDefault` and its positioning moved onto the shared `overlay-position` leaf. The
   listener contract itself still exists three times — **four** since M-B, whose Tooltip spells the
   Escape rung a fourth time with deliberately different semantics (no outside-press close, no
   focus restore — 1.4.13's "focus unmoved"), which is exactly why a naive `useEscapeToClose` leaf
   was not smuggled in mid-epic. Extracting the rung, accommodating that variance, stays this
   item's remaining half._

All three are ADR-0105 public-contract changes, so each wants a spec note rather than a quiet edit.
Take them in the order above.

---

### #200 — Two named-slot registries, one of them the better pattern, neither shared

**Status:** unverified

**Filed 2026-08-26** (the one-row header, from the component review). **Not a defect — both are
correct and tested.** A duplication that will charge the next named slot a tax it need not pay.

`apps/web/src/components/layout/workspace/plan-slot-host.tsx` and
`apps/web/src/components/layout/chrome/chrome-slot.tsx` now carry the same argument in almost the
same words — _"a name rather than a second parallel API"_ — and implement it two different ways:

- **`plan-slot-host.tsx` is self-registering.** An outlet calls `usePlanSlotRef(name)` and publishes
  its own node into a shared context from wherever it renders. No caller lifts or threads anything.
- **`chrome-slot.tsx` is parent-assembled.** Whoever creates the provider calls `useChromeSlot()`
  once per name, collects the `.node`s into an object, and hands each matching `.slotRef` **down as a
  prop** to wherever `<ChromeSlot name="…">` renders.

The self-registering one is better: it is the one carrying the "clear by identity" protection its own
docblock calls load-bearing, and it needs no threading. It was written one commit before
`chrome-slot.tsx` gained its `identity` name — and that addition extended the older pattern instead
of adopting it. **That is the direct cause of `identitySlotRef` being threaded through
`ChromeSlotHost` → `app-shell.tsx` → `ChromeBandRow` → `AppHeaderRow` → `HeaderContents`, and of the
eleven test call sites the merge had to touch.**

**What stops a literal merge, and it is real.** `ChromeSlotProvider` is mounted once for the whole
authenticated shell's lifetime; `PlanSlotProvider` is mounted and torn down per plan workspace. Its
registrations must **not** survive a plan→plan navigation and the shell's must survive every route
change, so one shared _provider instance_ would either leak plan-scoped registrations across plans or
reset shell-scoped ones that should not reset.

**What does not stop sharing the implementation.** `ChromeSlot` could call the same self-registering
hook shape against `ChromeSlotContext`, which would delete `rowsSlotRef` / `identitySlotRef` /
`drawerSlotRef` / `statusSlotRef` as props, `ChromeSlotHost`'s render-prop signature, and those
eleven call sites.

**Trigger:** the next named chrome slot. Adding a fifth this way pays the threading tax again, with
the better pattern sitting one directory over.

### 202. Six non-blocking findings from the foot-row gate pass

**Status:** unverified

_Triage 2026-08-28 (Phase 4): (e) closed as STALE — its coverage exists (see the item). The other
five re-filed consciously: (a) is a distance cost whose order matches the visual arrangement, (b)
and (d) are refactors of working code, (c) is an instrument-widening task with its own scope, (f)'s
pairing is gated._

**Raised:** 2026-08-27 (ADR-0114 M7) · **Size:** S each · **Owner:** unassigned

Four specialist reviews over the foot-row diff; eight blocking findings folded in the milestone (see
ADR-0114's gate-pass section). These six are recorded rather than rushed.

**(a) The collapse control moved behind the whole table in tab order.** It was in the panel's header
and is now the last child of `PlanActivitiesFootRow` (M4), which is right visually — the control sits
at the foot, so DOM order now matches where it is — and means a keyboard planner in the expanded
panel traverses the heading, **New activity** and every rendered table row to reach **Collapse
activities panel**. `focusCollapseOnMount` only covers the expand-by-user path. Not a 2.4.3 failure
(order matches the visual arrangement); it is a distance cost. Raised by the architecture gate.

> **Assessed 2026-08-31 and confirmed present** (`activity-bottom-panel.tsx` renders the header,
> then the scrolling table region, then `PlanActivitiesFootRow`, whose `{toggle}` is its last
> child; `focusCollapseOnMount` fires only when its prop is passed). **It needs a spec, and that is
> the finding**: this row names no remedy, and all three candidates are different products — a skip
> link is a NEW user-facing entry point, a keyboard shortcut is a new binding on a surface that
> already has an Escape ladder, and moving the control back to the header **reverses a decision
> recorded in the file itself** ("the collapse control rides here rather than in the header … a
> planner should not have to look in two places for it") and re-opens ADR-0114's juggle argument.
>
> **No regression test is writable either**, which is the discriminator rather than an excuse: the
> DOM order is _correct_ and matches the visual arrangement. A test asserting "the toggle precedes
> the table" would pin the behaviour ADR-0114 M4 deliberately removed; a test asserting a skip link
> exists would be encoding the chosen remedy, which is the decision, not a regression.

**(b) The dock's precedence is three independent guards, one of them a conjunct.** `TsldPanel` spells
it `conflict ?`, `conflict ? null :` and `!conflict` inside a five-term `&&`, and the invariant holds
partly because `CanvasModeBand` returns `null` for a null statement two hundred lines away. A fourth
strip has to remember it in a third spelling. One derived
`const dockStrip: 'conflict' | 'mode' | 'empty' | null` would put the decision in one place and let
the test assert a value rather than the DOM. Deferred because the behaviour is correct and pinned,
and the refactor is a `TsldPanel` change with no user-visible half.

> **CLOSED 2026-09-01, and the rule went further out than the item asked.** `resolveDockStrip` is a
> pure exported function in `features/tsld/model/dock-strip.ts` with the precedence and its reasons
> in one docblock; `TsldPanel` is its only call site. Putting it outside the component is what makes
> the item's own second half — "let the test assert a value rather than the DOM" — actually
> possible: a local `const` is unreachable from a test, so the DOM would still have been the only
> oracle.
>
> **Six cases, and the two precedence rungs were each verified red** against an inverted order
> ('mode' above 'conflict') and against 'empty' above 'mode' — one failure each, naming the rung.
> The suite also pins the three conditions the empty notice carries beyond the precedence, without
> which the function could return `'empty'` unconditionally and every precedence case would still
> pass. Behaviour is unchanged: 1,674 `features/tsld` tests green, the six new ones included.
>
> **The fourth spelling the item did not count** was `CanvasModeBand` returning `null` for a null
> statement, two hundred lines away in another file — which is why `'mode'` is gated on the
> STATEMENT here rather than on the mode string, and why the band's own "nothing armed renders
> nothing" contract can stay where it is.

**(c) The object-action sweep runs collapsed-only and TSLD-only.** M1-T1 specified widening the fit
gate "in both panel states, on TSLD and Gantt"; the shipped case covers the collapsed TSLD state.
That is where the measured defect was, and the expanded state is the one M4 created, so the gap is
real. This is the ADR-0090 M5 drift class — a plan describing work correctly and the work not
happening — recorded here so it is a decision rather than an omission.

> **Half closed 2026-08-31: the panel states, not the views.** The four assertions moved into a
> `sweepObjectBar(state)` helper and now run in the **expanded** state as well as the collapsed one,
> at every width. It **passed** — so no product defect was surfaced, which is worth saying because
> ADR-0115 M1 records that expanding the panel makes this row wrap, and the honest expectation was
> that this might go red.
>
> **The expanded case carries its own pinned positive**, and that is the part worth copying: it ran
> in 2.3 s against its collapsed sibling's 2.1 s, which is exactly what a click that silently did
> nothing would also look like — a sweep of an unchanged workspace reads as coverage while testing
> the state that was already covered. It now asserts the panel's table is visible before sweeping,
> the table being the thing that is not rendered at all while collapsed. Both labels were read from
> `activity-bottom-panel.tsx:155,317` rather than guessed.
>
> **The Gantt half is still owed.** The bar exists there (`plan-workspace-toolbar.tsx:1151` renders
> the same `SelectionActionsBar` for the Gantt selection), but selecting a row is a different route
> — the canvas's parallel listbox does not exist in that view — so it is its own piece of work
> rather than a third `await` on the end of this one.

**(d) `LockView.badgeName` and `messageVisible` are optional fields on a flat interface.** Both are
governed by rules about the tone ("only on `locked`", "only on `lost` and the incoming-request
branch") that are held by unit cases rather than by the compiler. A discriminated union split by tone
would make them type-level facts. The cases exist and are verified red; the invariant is simply not
structural.

> **CLOSED 2026-09-01.** `LockView` is now a union on `tone`: `badgeName` exists only on `locked`,
> `messageVisible` only on `editing` (optional, marking the incoming-request branch) and on `lost`
> (**required** — it is the one state where the badge is structurally incapable of carrying the
> fact). Five `@ts-expect-error` cases assert it, **verified red** by flattening `LockView` back
> first: all five then compiled and `tsc` reported five unused directives (TS2578), so each guards a
> distinct shape rather than several riding on one.
>
> **The other members declare each field as `?: undefined` rather than omitting it**, which is the
> decision worth recording: it keeps `view.badgeName` readable at the one consumer without narrowing
> first, while still rejecting a producer that sets it on the wrong tone. Omitting the key would
> have made every read a type error and pushed the union's cost onto the call sites — the opposite
> of what it is for. `resolveLockView` needed no change, which is what the runtime cases already
> said; what is new is that the wrong shape can no longer be written.

**(e) The foot row's own branching has no unit coverage.** `activity-bottom-panel.tsx` is covered
transitively through two callers and end to end by `dock.spec.ts`. The positional invariant genuinely
needs a real layout, so e2e is the right tier for that — but `hostsPlanSlots` toggling both outlets,
and `toggle` rendering when present and absent, are cheap to pin at the unit level and are not pinned
anywhere. This is the seam that produced the milestone's largest blocking finding.
**Re-verified 2026-08-28 (correctness programme Phase 4): STALE — the coverage exists.**
`activity-bottom-panel.test.tsx` pins exactly the two branches this item names ("gates BOTH plan
slots on `hostsPlanSlots`, never just one"; "renders the toggle when given one, and nothing in its
place when not"), 4/4 green. Added after this row was filed; the row was not updated. Item closed.

**(f) ~~`bg-foreground/5` now paints on the canvas-dock surface scope for the first time.~~
WITHDRAWN 2026-08-31 — the premise lapsed within twelve hours of the row being filed.** There is no
"canvas-dock surface scope": the foot row that hosts the object bar is
`<Surface tone="chrome">` (`activity-bottom-panel.tsx:217`), which is the same scope `Deck` already
sits in, so the pairing paints exactly where it always did. The row was filed on 2026-08-27 from
ADR-0114 M7, when the foot row genuinely had no scope at all; ADR-0115 gave it `chrome` that
evening, and nothing went back to re-read this item.

The residual observation is still true and is **already filed as #204(b)**: an alpha-composited
utility like `bg-foreground/5` is invisible to `token-contrast.test.ts` whatever scope it sits in.
Not re-filed here, because the same finding in two places is how a register starts disagreeing with
itself.

**Not worth a test either, and that is the decisive half.** The row concedes 1.4.11 does not apply
to the card; a contrast assertion asserts a **floor**, and a floor on a 5 % decorative wash would
fail by design. The pair that matters — control ink over the composited card — is already covered by
the chrome scope's existing text pairs.

### 204. Four things the foot-row-and-deck epic found and did not fix

**Status:** unverified

_Triage 2026-08-28 (Phase 4): re-filed consciously. (a) is #131's tooltip-primitive question,
narrowed there the same day (six universal glyphs; ADR-0105 spec item); (b) is a gated pairing;
(c) is an unverified "may" that needs a browser probe before it is a defect; (d) is a record, not
work._

**Raised:** 2026-08-27 (foot-row-and-deck M7) · **Size:** S each · **Owner:** unassigned

Five specialist reviews over the epic's diff. Accessibility passed with nothing blocking; ux and
component blocked on findings that were folded in the milestone. These four are recorded rather
than rushed.

**(a) An icon-only object action names itself only on hover, and the object bar is a new surface for
that gap.** _CLOSED 2026-08-28 (fix-slice M-B, ADR-0117), with the premise corrected: it had
already lapsed before the fix landed — ADR-0115/M4 restored `zoom-to-selection`'s label
(`selection-actions.tsx` records the round trip), so no icon-only control exists on the object bar
today. The class is still closed durably rather than by accident: `ToolbarButton`'s icon-only
branch now speaks through the Tooltip primitive (hover + focus + long-press), so any future
`showLabel: 'never'` item on ANY toolbar inherits the treatment by construction — the "real fix"
this row asked for._ `zoom-to-selection` is `showLabel: 'never'` (foot-row-and-deck M1), so a sighted
touch-only reader gets no visible name: `aria-label` carries it for assistive technology and `title`
carries it for a pointer, and a tap fires neither. **This is not a WCAG failure** — the accessible
name is unconditional and independent of `title`, which the accessibility review checked rather than
assumed — and it is the gap `#131` already documents on the command deck. What is new is the
surface: `#131`'s scope names the deck and not the docked object bar. Either widen `#131` or give
`ToolbarButton` an icon-only treatment that survives a touch device; the second is the real fix and
is a shared-primitive change, so it wants its own spec (ADR-0105).

**(b) `hover:bg-accent/60` now composites against the chrome scope on the object bar, and the
contrast matrix structurally cannot see it.** `token-contrast.test.ts` computes ratios between
declared token pairs; an alpha-composited utility (`toolbar-styles.ts`, `Badge`'s
`bg-warning/15`) is not a pair and is invisible to it — the file's own docblock records that lesson
from `hover:bg-destructive/90` shipping unchecked. Both classes already rendered on `chrome` via
`Deck` and the header pen badge before this epic, so nothing here introduced the gap; M2 increases
how often the object bar's hover state paints on that ground. Wants a real-browser check of the
composited value, not a matrix entry.

**(c) A scheduling-mode flip while focus sits on `Clear visual start` may drop focus to `<body>`.**
M1 makes that control `isVisible: false` outside Visual mode, so a mode change unmounts it.
`Toolbar`'s roving-tabindex repair reassigns which item is `tabIndex=0`; it does not move
`document.activeElement`. Whether the case is reachable depends on whether a mode change can happen
without also clearing the selection (which would take the whole bar with it and make the question
moot), and **that could not be settled from the code** — it needs a browser. Raised by the
accessibility review and explicitly marked unverified there. If reachable it is WCAG 2.4.3, a class
this repository has fixed four times (ADR-0060 M6, ADR-0080, ADR-0099 M10, ADR-0096).

> **Re-read 2026-09-01. The mechanism described above no longer exists; the hazard may, by a
> different route, and the row is narrowed rather than closed.**
>
> **What is stale.** The item is written about a _toolbar item_ going `isVisible: false`, with
> `Toolbar`'s roving-tabindex repair as the thing that fails to move `document.activeElement`.
> ADR-0115 moved `clear-visual-placement` **off the command surface onto the selection bar**
> (`plan-workspace-toolbar.tsx:826-828` says so in as many words), where it is **omitted** outside
> Visual mode on ADR-0082's discriminator rather than hidden by a toolbar visibility flag. So the
> named mechanism cannot be what happens.
>
> **What is not settled**, and the reachability question is now sharper rather than answered.
> Flipping the mode from the mode control **moves focus to that control**, so focus cannot be on
> `Clear visual start` at the moment of the flip — and there is **no keyboard shortcut for
> scheduling mode** (searched; none). That closes the route the item imagined.
>
> The route it did not consider is the one this product is built for: `schedulingMode` is a
> **plan-level** setting, so **another user can change it** and a refetch can unmount the control
> under a reader whose focus is on it. That is ADR-0028's world, not a contrived case — and it
> still needs a browser plus a two-session fixture to settle, which is why it stays open.
>
> Worth stating because it changes who would find it: the remaining path is not something a single
> planner can do to themselves, so no solo journey will ever reproduce it.

**(d) Two of three lens toggles offered to the product owner for promotion did not exist.** The
`AskUserQuestion` options named `Critical path`, `Float paths` and `Baseline overlay`. Only the
third is a promotable `LensToggle`: `float-paths` is **already** a deck item
(`tsld-toolbar-items.tsx`, `group: 'find'`, tier 3) and `Critical path` is not a lens at all — it is
a column header in the activities table and a settings-section heading. The options were written
from the M0 enumeration and from memory rather than from `LENS_TOGGLES`, which is ADR-0076 Class 3
one step upstream of a document: a decision-bearing claim asserted without checking, inside a
question put to somebody else. No code defect; recorded because the rule §19.11 states is about
claims in documents and this was a claim in a **choice**, and nothing currently covers that.

### 206. Health-check review suggestions consciously not folded at the M5 gate pass

**Status:** unverified

_Triage 2026-08-28 (Phase 4): re-filed consciously. The print-header convention spans two print
documents and wants one decision, not a fold; the Badge swap changes a shipped panel's look (a ux
call, not a correctness fix); the two AT listens are environment-blocked exactly as #154 records
(no screen reader in this container — owed to a human pass); the rest stand on their filed
reasons._

**Raised:** 2026-08-28 (schedule-health-check M5-T1) · **Size:** S ×5 · **Owner:** web

The M5 gate pass blocked on findings that were all folded (token pairing, NoticeStrip reuse,
provenance on screen, the Viewer role sentence, `aria-describedby`, the announcement's four
counts, the G4 regex holes, the 429 citation). Five suggestions were judged real and deferred
rather than quietly dropped:

- **The footer's "Next conflict" mention is prose, not a control.** The spec said the report
  "links to the conflict review"; the shipped footer names it. Wiring a button means handing the
  panel the conflict-navigation command, which lives on the toolbar context — a seam the panel
  deliberately does not hold today.
- **Rich per-metric `detail` is computed and never rendered** — the missing-logic
  predecessor/successor split, the relationship-type breakdown, metric 9's forecast/actual split,
  CPLI's target source and date, BEI's due/completed counts. The expanded row is the obvious
  home; M6 (which touches metric 12's row) is the natural vehicle.
- **The printed document names the plan but not the organisation or project** — a submission-pack
  page with two plans named "Phase 1" from different projects is ambiguous. The Gantt programme
  shares the gap; fix both from one header convention.
- **Two real-AT listens owed** (the M5 accessibility review's S2/S9): the disclosure's
  concatenated "name Verdict" accname, and the offender press speaking its own announcement a
  beat before the canvas listbox's `aria-activedescendant` speech — both fine on paper, neither
  yet heard in VoiceOver/NVDA. The #154 shape.
- **`VerdictBadge` hand-rolls a coloured span where `Badge` exists** — the spec named the
  `EarnedValuePanel` precedent; the hand-rolled path is also where the `text-destructive` token
  slip happened, which is the argument for the primitive.
  > **Assessed 2026-09-01, and the item's own framing is what needs correcting.** "Where `Badge`
  > exists" reads as a swap, and it is not one: `Badge`'s variants are `default`/`secondary`/
  > `outline`/`destructive`, which has **no member for a PASS and no member for a caution** — so
  > closing this means adding at least two variants to a primitive every badge in the product is
  > downstream of, and then deciding what a passing verdict looks like everywhere. That is a design
  > decision plus a **primitive public-contract** change (ADR-0105), not the small fold the wording
  > implies. The triage line above already called it "a ux call, not a correctness fix"; this says
  > _why_ it cannot be done as a swap, so the next reader does not open it expecting one.
- **(M6 addendum) `getCriticalPathTest` scans the plan's activities twice** — `buildEngineGraph`'s
  `loadActivities` plus `loadHealthActivities` for labels/factors, concurrent but on separate
  connections (so not one snapshot; a concurrent rename can label the offender stale, degraded
  gracefully to 'Unknown activity'). Measured immaterial (~0.7 ms beside an ~800 ms compute); fold
  the label columns into the engine loader, or a narrow `{id, code, name, calendarId}` loader, on
  next touch (the M6 backend-performance review).

### 211. Fix-slice M-G suggestions consciously not folded at the gate pass

**Status:** unverified · **Raised:** 2026-08-29 (fix-slice M-G — five specialist reviews over the combined diff; security,
ux, frontend-performance and accessibility all passed with nothing blocking, and the two folded
items were the accessibility review's CLAUDE.md correction and the performance review's
long-press listener cleanup, both landed with the pass) · **Size:** S ×3 · **Owner:** web

Three suggestions judged real and filed rather than quietly dropped:

- **The touch long-press has no visible affordance and no documentation a user would find** (ux).
  `useTooltip`'s 500 ms long-press names an icon-only control without firing it, and nothing in
  the product mentions the gesture — the shortcuts sheet is keyboard-shaped and unmounted from
  the Gantt-less panels anyway. It degrades gracefully (a tap still fires the command exactly as
  before), so this is an unadvertised affordance rather than a defect; the right home is
  whatever touch-help surface exists when one does.
- **A no-marks export shows a blank 22 px paper strip with no separator closing it off** (ux).
  `EXPORT_MARKER_ROW` is reserved unconditionally (deliberate — geometry stability, see
  DECISIONS.md 2026-08-29), so a plan with the data-date rule off and today outside the exported
  span carries an empty strip between the title separator and the diagram. Cosmetic,
  low-frequency, consistent with the on-screen ruler's own resting state.
- ~~**The export legend's group order differs from the DOM legend's**~~ — **CLOSED 2026-08-31.**
  `EXPORT_LEGEND` now runs Critical → Near-critical → On schedule → **Data date → Today** →
  Driving link → Non-driving link, which is `SHARED_CUES`' grouping. Its docblock had claimed to
  match "the DOM legend's order" and that was true only of Data-date-before-Today — the sentence
  that made the row worth filing, and it is corrected in place. The new assertion states the
  **rule** (markers precede links) rather than one expected array, because re-ordering both halves
  together would satisfy an array and lose the grouping; verified red first.

### 215. Dense rows are 28 px on touch, and their height is a JavaScript constant

**Status:** unverified · **Raised:** 2026-08-29 (ADR-0118 M4 gate pass) · **Size:** M · **Owner:** a row-rhythm pass

**ADR-0118 D1's second named exception, filed rather than solved.** `Button`'s `icon-sm` stays
28 × 28 on both pointers, and the five of its consumers that sit in a dense row stay with it
_(recounted 2026-09-01: this said "six of its eight". `context-drawer` was deleted with the drawer
mechanism (#156), so the dense-row set is **five**; and "eight consumers" was an undercount when
filed — there were ten `icon-sm` consumer files besides `button.tsx`, and nine today. Re-read
2026-09-01: that correction **left the deleted name in the list it was correcting**, so the row said
"five" and then named six — the count fixed, the evidence for it not. Corrected here)_:
`HierarchyTree`, `GanttRowMenu`, `ActivitiesTable`, `CalendarRowMenu` and `explorer-column`'s
collapsed spine. Under the house rule they should be 44 on touch. They are not, and the
reason is that **their containers are sized independently of them**.

**M3 tried the obvious thing and it was wrong.** Giving `icon-sm` a `pointer-coarse` floor made
every one of those buttons 44 px inside a container that did not grow. The sharpest case:
`HierarchyTree.tsx:26` is `const ROW_HEIGHT = 28` — a **JavaScript constant** feeding both the
absolute row style and the virtualizer's `estimateSize` — so a 44 px button centred in a 28 px row
overflows 8 px into the row above and 8 px into the row below, on a list whose rows are packed edge
to edge and whose trigger is `[@media(pointer:coarse)]:opacity-100`, i.e. permanently visible on
exactly the device that would see it. `GanttPanel.tsx`'s `GANTT_ROW_HEIGHT = 28` is architecturally
identical. `explorer-column.tsx`'s `SPINE_WIDTH = 34` is the same defect on the other axis.

**Three of the five ADR-0118 gate-pass reviews found it independently, and the epic's own gate could
not** — it asks whether a control's own box clears 44 and whether its own centre hits itself, and a
control overflowing its container passes both. That blind spot is now stated in ADR-0118 **D8**.

**What is owed, and why it is not a padding change.** A row height that must respond to the pointer
cannot be a CSS media query while a virtualizer needs it as a number, so this needs either a live
`matchMedia` hook feeding the row height (which introduces the first JS-side pointer read in the
product — a real architectural decision, and one that must listen rather than sample at boot,
because the value changes when a Surface Pro's keyboard folds back) or a decision that dense rows
are 44 px for everyone. Both change the product's row rhythm on a surface a planner reads all day.
That is a design pass, not a follow-up ticket.

**The equivalents that exist today, stated because D1 requires it of an exception.** `HierarchyTree`
alone honours the advice `icon-sm`'s docblock used to give: a long-press anywhere on the row opens
the same menu on touch, and Menu/Shift+F10 opens it from the keyboard on the focused treeitem. The
other **four** have no large-target equivalent, which is the honest reason this is a register row
and not a closed question.

**Where it is exempted, so it cannot hide.** `e2e-workspace-fit/command-surface.spec.ts` excludes
`[role="tree"]` from the coarse projection by ancestor selector — narrow, visible, and named — and
`apps/web/src/styles/control-height.structural.test.ts` exempts `button.tsx::size-7` with the same
reason. Neither hides anything else.

### 216. The favicon's brand glyph is set in `system-ui`, and no gate can reach it

**Status:** standing · **Verified:** 2026-09-01 · **Raised:** 2026-08-29
(`docs/specs/typeface-outward-artefacts/`, CQ-1) · **Size:** S ·
**Disposition: a NAMED EXCEPTION the product owner took, not an oversight**

**`standing`, not `unverified`** (2026-09-01). A row recording a decision somebody made is not a
row awaiting one, and `unverified` invites the next reader to re-open a question the product owner
already answered — which happened to #225 the same week, in the same wholesale classification.

`apps/web/public/favicon.svg:16` draws the brand `S` with
`font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif"`. It is therefore the one
outward artefact still not in IBM Plex Sans after M1 carried the face to the print documents and the
exported picture.

**It is also the one place `typeface-reach.structural.test.ts` structurally cannot reach.** That
gate is scoped to `apps/web/src`, deliberately, so it excludes the measurement harnesses that READ a
computed `fontFamily` rather than set one — and `public/` falls outside with them. Widening the
scope to catch one SVG attribute would sweep in every harness and produce the over-reporting that
gets a gate weakened rather than fixed.

**Why it stays.** One glyph at 16 px, rendered in browser chrome rather than in the product, where
a typeface is close to indistinguishable. The alternative — tracing the `S` from the vendored woff2
into a `<path>` — bakes a glyph outline into the repository and needs its own provenance note
alongside `src/assets/fonts/PROVENANCE.md`, so that the outline and the face cannot silently
disagree. That cost was put to the product owner with the option and they chose the exception.

**What is owed if it is ever revisited:** the conversion is cheapest in a commit that is already
touching brand assets, and there is **no automatable assertion for a favicon's typeface** — the
gate's blind-spot table says so, and this row does not pretend otherwise. A person looks at a
browser tab.

### 218. Two review suggestions from the typeface gate pass, not folded

**Raised:** 2026-08-29 (`docs/specs/typeface-outward-artefacts/`, gate pass) · **Size:** S ·
**Status:** open

Neither is blocking and neither was folded; both are recorded so they are decisions rather than
things that were dropped.

**(a) The printed programme's smallest type has never been looked at on paper.**
`GanttPrintSurface.css` sets 9 px column text (`:77`), 8 px (`:135`) and a 7 pt bar label (`:256`).
Those sizes are unchanged by this epic, but they now render in a self-hosted webfont rather than in
whatever highly-hinted native `system-ui` face the reader's machine supplied — and small type on a
real printer is where hinting differences show. **No WCAG SC applies** (the accessibility review
was explicit that WCAG constrains contrast, resizability and spacing, not which sans-serif is
used), so this is a legibility judgement somebody has to make by printing the page. The screenshot
harness photographs it (`gantt-print-programme`), which is a screen at 1646 px and not paper.

**(b) The `**Family:**` bullet check is tighter than it was and is still not the tightest possible.**
`typeface-reach.structural.test.ts` now parses the bolded family inside the bullet's parenthesis
rather than scanning the whole bullet — so a reverted value can no longer be satisfied by the
correction prose the same bullet carries by design. What it still cannot see is a bullet rewritten
into a different shape: the regex is `**Family:** … (**<name>**`, and an edit that drops the
parenthesis fails the "no claim at all" assertion rather than a wrong-family one. That is the right
way round (loud, not silent), but the failure message would name the wrong cause.

---

### 225. A resource's histogram colour follows its rank, so re-ranking repaints the chart

**Status:** deferred · **Owner:** web · **Raised:** 2026-08-31 (stacked-histogram, spec Q9)

The stacked histogram assigns cycle member _n_ to segment _n_ **by rank** — biggest total gets the
first colour. So when two resources swap totals (an assignment edit, a recalculation, an exact tie
under a granularity change) **their colours swap**, and a planner who has learnt "the steel crew is
the purple one" sees purple move.

**P6 is the opposite**, and that is what a planner arriving from it expects: colour is assigned by
hand, per filter, and is therefore permanent — one of the reasons its setup is the tedious thing its
own advocates complain about.

**The product owner was told this plainly and chose rank-assignment (2026-08-31).** Two properties
paid for the choice: no two visible bands can ever share a colour, and the dialog and the canvas
strip agree by construction because both derive rank from the same query. The reshuffle is also
**visible rather than silent** — the legend re-orders with it, on screen, in the same frame.

**Why the alternative is a different epic, not a fast-follow.** Stability cannot be had by hashing
the resource id: a hash can collide among the _shown_ set, which is the failure rank-assignment
structurally cannot have. Genuine stability needs a colour **persisted against each resource** —
a schema change, a picker to assign it, a default for the unassigned, and a rule for what happens
when two resources are given the same one. That is an epic with a database-architect engagement,
not a constant.

**Trigger:** a real report that colours moved, or the resource library gaining any other per-resource
display attribute (at which point the column is no longer this feature's cost alone).

**Re-confirmed 2026-09-01**, and the second asking is itself worth a line: this row was put to the
product owner again as one needing their input, and it already recorded their answer from the day
before. Nothing changed — they kept rank-assignment — but a row carrying a decision was read as a
row awaiting one, which is the same failure as the 2026-08-30 sweep's, in the opposite direction:
that one recommended work already done, this one re-asked a question already answered. The cue is
the same. A row whose Status is `deferred` **with a named trigger** is a decision, not an open
question, and the trigger is what to look at.

### 226. The strip painter has an unexplained 20x cost cliff at nine stacked segments

**Status:** open · **Owner:** web · **Raised:** 2026-08-31 (stacked-histogram M2-T5)

Measured by `apps/web/scripts/measure-strip-stack.mjs` — the real `paintResourceStrip` against a
real Chromium 2D context, 1646 CSS px, DPR 1.75, 72 px band, 300 frames, a 104-bucket (two-year,
weekly) programme at **Fit** zoom where nothing is culled:

| segments  |   2 |   3 |   4 |   6 |   7 |   8 |        9 |  10 |
| --------- | --: | --: | --: | --: | --: | --: | -------: | --: |
| delta p95 | 0.1 | 0.1 | 0.2 | 0.3 | 0.1 | 0.5 | **10.0** | 9.7 |

(ms over a one-segment baseline measured in the same session. Reproduced at nine three times:
+14.7, +14.2, +10.5.)

**`p50` barely moves across the whole sweep — 0.3 to 0.4 ms.** So this is a tail, not fill rate: a
handful of frames in every hundred cost ~10 ms while the median frame stays cheap.

**Two hypotheses were tested and FALSIFIED, and the arithmetic does not explain it either.**

1. _Sub-pixel bands._ The skewed fixture gives its ninth segment a vanishing height, so the obvious
   candidate was Chromium's antialiased fill of sub-pixel rects. An **even** split at nine segments
   costs the same 10.2 ms. Not it.
2. _Distinct fill colours._ Nine segments drawn with only **four** colours still costs 9.7 ms. Not
   it.
3. _Volume._ Nine segments is roughly 13 % more `fillRect` calls than eight, not 20 % more, and
   certainly not 20x.

**Why this is filed rather than chased.** `#75` records the same discipline for the main painter's
own unattributed ~8 ms: where the time goes "is not yet measured, and must not be guessed". A
DevTools Performance recording of one of these runs would attribute it; nothing short of that
should be written down as the cause.

**What was done meanwhile.** The cost remedy set `STRIP_STACK_CAP` to six named segments plus the
aggregate — seven, two steps clear of the cliff. **The shipped value is three**, and this row said
six until 2026-08-31: the very next commit cut it further, for a different reason entirely
(legibility at 72 px, ADR-0121 D3 — six named bands put the aggregate at 0.52 px), and nothing
propagated that here. Two reviewers found the stale figure independently in the same gate pass. It
is filed as an understatement of the safety margin rather than an overstatement, which is the
harmless direction and is exactly why nobody would have noticed.

So the cap is no longer this row's to set. Height binds before cost does: at four segments the
measured delta is +0.2 ms, roughly fifty times clear of the discontinuity, and a legibility argument
would refuse to raise it long before a cost argument would allow it. The dialog keeps its cap of
eight: it is DOM and SVG, not this painter.

**Remedy:** attribute the tail (DevTools Performance over one Fit-zoom run). What that buys is now
narrower than when this row was written — it removes an unexplained discontinuity from a painter the
product depends on, rather than unlocking a cap that something else is holding down anyway.

### 228. Stacked-histogram gate-pass suggestions, consciously not folded

**Status:** open · **Raised:** 2026-08-31 (ADR-0121 D8) · **Size:** S

Six specialists reviewed the stacked-resource-histogram diff. Every blocking finding was folded with
a regression test verified red first (ADR-0121 D8). These are the non-blocking ones, each left with
its reason rather than quietly dropped.

- **The painter walks its segments twice per bar** — once to fill, once to draw the boundary rules —
  recomputing each band's height both times. `frontend-performance` measured the cost as immaterial
  at the shipped cap of four segments and flagged it as an unforced duplicate rather than a defect.
  Folding the two loops means carrying `previousHeight` through the fill pass, which is exactly the
  state the DOM chart's equivalent now carries; worth doing when either is next touched, and NOT
  worth doing while the nine-segment discontinuity (#226) is unattributed, because it changes the
  shape of the thing somebody will be profiling.
- **`stackOffsets` is called in `ResourceStackChart`'s render body rather than memoised.** O(buckets
  x segments), roughly 1,600 operations at the dialog's caps, on a dialog that re-renders rarely and
  is nowhere near an animation loop. Recorded because it is free to fix, not because it costs
  anything measurable.
- **`LEGEND_WIDTH_PX` is applied through an inline `style`, so it is invisible to the sizing
  ratchet.** `component-reviewer` noted Tailwind v4's dynamic spacing scale would compile `w-42` as a
  real utility and bring it back into that gate's reach. `PLOT_HEIGHT` genuinely cannot move — it is
  read in JS to compute the scale — so this is one of a pair and only half of it is movable.
- ~~**The plan describes a third stacking mode, `Kind`, that was never built.**~~ **BUILT
  2026-09-01.** `StackBy` is `'resource' | 'group' | 'kind'`; the invariance gate now compares all
  three against the raw input rather than only against each other, and was verified red by making
  the shared partition re-sum. Two things came out of building it that the finding did not
  anticipate. `groupSeries` became a caller of one `partitionSeries`, because a second near-copy is
  exactly where the invariance gate would go wrong. And the picker's `disabled` rule was **wrong
  the moment a third mode existed**: it shaded the whole `<select>` when the library held no group,
  which would have withheld `Kind` — the one mode needing no groups at all — from precisely the
  unorganised programmes it is most useful on. It now shades the `Group` **option** and carries the
  reason in that option's own label. Neither was covered by any test before: the "no groups" state
  had no assertion anywhere, which is why the regression would have shipped silently.
- **The disclosure copy diverged from the approved spec without a recorded reason** — the spec says
  `Show data table (all resources)` and the shipped label is `Show data table`. The shipped wording
  is better beside a picker that already says "All resources (stacked)"; the undocumented divergence
  is the finding, not the words.

**Remedy:** fold the first three whenever `paint.ts`'s strip layer or `ResourceStackChart` is next
touched; the last two want a decision rather than an edit.

### 227. Nothing asserts the register's heading form, so it drifts silently

**Status:** open · **Raised:** 2026-08-31 · **Verified:** 2026-09-01 · **Size:** S ·
**Owner:** repo

> **The headings are normalised (2026-09-01). What remains is that nothing stops it happening
> again.** 41 rows were converted from `##` to `###` — 30 in the plain `N.` form and **11 more in
> two forms the first pass missed** (`## 118a.` lettered rows and `## #208 —` em-dash rows), which
> is itself worth recording: a sweep written from the commonest shape found 30 of 41.
>
> Two claims in this row's own body were corrected with it. The **count** was never stable — the
> convention paragraph said "three rows had drifted", this row measured 70 of 100, and the fix
> converted 41 of 71; a number in prose that changes every epic is not a fact, which is the argument
> for the gate below rather than against it. And the convention paragraph's **explanation was
> inverted**: `##` makes a row a _sibling_ of `## Detailed items`, not a _child_ of "Principles for
> managing debt".

**The gate is the part that is still owed**, and it is deliberately not built here.
`check-debt-status.mjs` reads BOTH heading levels — correctly, per ADR-0120 Finding 0: the gate's
job is to find every row, and a row in the wrong form is still a row. But nothing then asserts the
**form**, so the widening that stopped the gate missing rows also stopped anyone noticing the drift.

Adding a form assertion is a change to a **shared gate**, which ADR-0105 makes a spec-and-plan
trigger — the same reason #222 and **#231** are deferred. Worth doing as one slice with those two,
since all three are `scripts/` changes to the same family of checks and all three want the same
question asked once: what should a register parser refuse, and what should it merely find?

### 223. The canvas resource strip does not export or print, and the gate for that cannot see it

**Status:** open · **Owner:** web · **Raised:** 2026-08-31 (stacked-histogram UX review)

The Stage-E resource strip (ADR-0049, `VITE_CANVAS_RESOURCE_VIEW`) is painted from `TsldCanvas`'s
own `stripRef`, which is a **separate ref from `sceneRef`**. `use-diagram-image.ts` has **zero**
references to `stripRef` / `resourceStrip` / `ResourceStripSnapshot` — verified by grep across
`features/tsld/export/` — so the exported PNG/PDF and the printed diagram silently omit the strip a
planner is looking at.

**The sharp half is that ADR-0103's gate structurally cannot report it.**
`export/scene-parity.structural.test.ts:30-31` parses exactly two files: `TsldCanvas.tsx` (for the
`sceneRef` object literal) and `use-diagram-image.ts`. `resourceStrip` was never a **scene key**, so
it is invisible to the comparison in _both_ directions — it can be neither a composed key nor a
declared exclusion-with-a-reason. The gate built precisely because nine features silently dropped
seven layers from the exported diagram has a blind spot of exactly the shape it exists to close, and
that blind spot is a consequence of where the state lives rather than of anything anyone wrote.

Today's cost is low: one grey bar for one resource. The stacked-histogram epic raises it — a
coloured, multi-trade composition missing from the deliverable is the ADR-0103 `#164` shape again,
and the strip is about to become the thing a planner most wants in a handout.

**Remedy:** decide whether the strip belongs in the export at all (it may legitimately not — it is a
lens, and `#167` already holds five lens keys as an open question), then make that decision
_visible_ to the parity gate rather than leaving it as an absence. Widening the gate to read
`stripRef` is the smaller half; the honest half is that a gate keyed on one ref name will go blind
again the next time a layer gets its own ref.

### 229. Two latent primitive keyboard residuals, carried out of #196

**Status:** open · **Raised:** 2026-08-31 (register verification sweep) · **Size:** XS each

#196 closed on its headline — the `preventDefault` + `stopPropagation` ordering, and the third and
fourth clamp copies moving to `overlay-position.ts`. These two survived it, and are recorded rather
than lost with the row:

- **`combobox.tsx:223` assigns `activeIndex` to disabled options**, so arrow keys skip them — which
  is exactly what ADR-0082 stopped `Menu` doing, for the reason that a shaded option's REASON then
  becomes unreachable by keyboard. Latent only because no production caller sets
  `ComboboxOption.disabled` today; the day one does, the defect is live and nothing reports it.
- **`menu.tsx:188`'s outside-pointerdown handler does not exclude its own trigger**, so a press on
  the trigger closes and reopens rather than toggling.

**Verified 2026-09-01, and BOTH are bigger than "XS each".**

- The combobox half is real (`combobox.tsx:223` assigns `-1`; `:235` filters on `>= 0`), but
  `activeIndex` is doing **double duty**: the same counter yields `selectableCount`, which is the
  number announced as "N results available" (`:271`), the `Load more` row's position (`:245`) and
  the empty-state test (`:545`) — and `:261`'s own comment says counting non-selectable rows "would
  be a lie". So the fix is **splitting navigable from selectable**, a refactor of the primitive's
  internals rather than a one-line change.
- The menu half is real (`menu.tsx:189` closes on any pointerdown outside the panel, and the trigger
  is outside it) — but **the obvious fix is wrong**. Excluding `restoreFocusRef.current` fails,
  because that ref is not always the opener: `selection-actions.tsx:320` and
  `tsld-toolbar-items.tsx:707,875` pass `mainButtonRef`, and `tsld-toolbar-authoring.test.tsx:263`
  records why — for a split button the **caret** opens the menu and is `tabIndex={-1}`, so the
  focus-restore target is the main button instead. Excluding it would stop a press on the main
  button (a separate command) from closing the menu, and still not fix the caret. The correct fix
  needs the opener's element, i.e. a **new optional prop** — a component's public contract, and an
  ADR-0105 trigger.

**Both are primitive keyboard-model changes**, so CLAUDE.md §19.13 requires accessibility-reviewer
(and component-reviewer) BEFORE either ships — that rule exists because this exact class shipped
wrong twice in two days (#189, then #192 inside its fix). They belong with #197's shared-contract
slice rather than alone.

### 222. `check:counts` reads any "N ADRs" in a gated file as a claim about the repository

**Status:** open · **Raised:** 2026-08-30 (ADR-0120 M7) · **Size:** S

`scripts/check-counts.mjs:129` matches ADR counts with `phrase('(\\d+) ADRs')` — unanchored, anywhere
in a gated document. So a sentence that merely _mentions_ a number of ADRs is read as a stated count
and fails the gate.

**Found by writing the ADR about exactly this class of defect.** ADR-0120's `CLAUDE.md` §16 entry
described the reconciliation threshold as "T = 8 ADRs from p75 = 7.50". The gate reported:

```
  - CLAUDE.md — ADRs: says 119, the repository has 120     ← a real, correct finding
  - CLAUDE.md — ADRs: says 8, the repository has 120       ← my prose, read as a claim
```

The first line is the gate working. The second is the **seventh** recorded instance in this
repository of a scan matching explanatory prose rather than its subject — and it happened inside the
entry documenting the gates built to stop that happening.

**Worked around, not fixed.** The prose was reworded, because weakening a live gate to accommodate a
sentence is the wrong direction and the ADR text lost nothing. `docs/adr/0120-*.md` keeps the natural
phrasing, since `docs/adr/` is not in the gated set.

**The fix, when someone touches this file:** the same treatment `scripts/lib/doc-register.mjs` gives
every field — anchor the match to the shape a _claim_ takes rather than the shape a _mention_ takes.
The banner states counts in one known form; a phrase mid-paragraph is not that form. `check:counts`
is a **shared gate**, so a change to it needs a spec (ADR-0105), which is why this is a row and not
a commit.

**Why it is debt and not a defect:** the gate is over-eager, never under-eager — it cannot miss a
real stale count, only invent one. The cost is that an author writing about counts must phrase around
it, without being told why until the gate fires.

### 231. `sections()` ends a row at the next SAME-level heading, so a `###` row borrows its neighbour's fields

**Status:** open · **Raised:** 2026-09-01 (the register verification sweep) · **Size:** S ·
**Owner:** repo

`scripts/lib/doc-register.mjs`'s `sections(md, level)` collects headings at exactly `level` and
gives each a body running to **the next heading of that same level** (`:100-110`). It never ends a
section at a _shallower_ heading. So for a `###` row followed by `##` rows, the body runs past every
one of them to the next `###`.

**Measured, and it was hiding a real hole.** `#117` carried **no `**Status:**` line at all**, and
`pnpm check:debt-status` reported `71 detailed rows (71 with a status, 0 without)`. Its body ran
**1,115 lines** to the next `###` and picked up **#118's** status on the way:

```
117 at line 1501, next ### heading at 2617 — body 1115 lines
first Status line found in that body: "**Status:** unverified" at document line 1543  ← #118's
```

**A9 cannot see it, and A9 is the assertion written for exactly this question.** ADR-0120 D5's
control asks _"did we read less than we think?"_ by comparing **heading counts** — 71 against 71,
which agree. The defect is in **body boundaries**, a different axis, so the control and the parser
share no blind spot and the control still cannot report it. That is the seventh recorded instance of
a check whose subject was not what it believed, and the second inside the gate ADR-0120 built to
close that class.

**Not fixed here.** `doc-register.mjs` is a **shared gate** — `check:debt-status`, `check:doc-links`
and `check:doc-register` all read it — and changing where a section ends moves every body boundary
in every document those gates parse, so the blast radius is the ratchets and counts derived from
bodies rather than the one-line predicate. ADR-0105 makes that a spec-and-plan trigger, and #222 and
#227 both defer shared-gate edits for the same reason. The immediate hole is closed by giving #117
the status line the gate could not demand.

**The fix, when someone specs it:** end a section at the next heading of the same level **or
shallower**, and give A9 a second limb that counts **fields** rather than headings — a control that
compares the same quantity on both sides can only ever agree with itself.

### 230. A cascade delete's undo still truncates the history, and its reason has lapsed

**Status:** open · **Raised:** 2026-08-31 (closing #92) · **Size:** S

Deleting a WBS summary with a subtree clears the undo stack
(`use-plan-workspace-model.ts` `recordActivityDelete`). That is ADR-0048 M2's decision, and its
stated reason was that a re-create could only rebuild the summary — "a partial re-create would be a
broken undo".

**That reason is now false.** #92 pointed the leaf inverse at
`POST …/activities/restore-batch/:batchId`, and a cascade delete stamps **one** `deleteBatchId`
across the whole subtree (`activities.service.ts:1191-1221`), which `restoreDeleteBatch` restores in
one call with ids and links intact. So the cascade case would work with the code that is already
there — the branch that refuses it is the only thing stopping it.

**It is filed rather than done**, because it is a capability change and not a defect fix: a planner
who deletes a phase today loses their history and would then keep it, which is a different product
behaviour, reversing a decision an accepted ADR records. ADR-0105's rule says a register row covers
stages 1–2 only while the change adds no new surface; this reverses an ADR decision, so it wants an
ADR-0048 amendment naming the M4 restore as what changed.

**One thing to check before building it**, rather than assume: the restore is top-down
parent-active, so a subtree whose summary's OWN parent was deleted afterwards is a case the
amendment has to answer — refuse, or restore what it can and say so.
