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

Headings are `### <number>. <title>`, always. Three rows had drifted to `##`, which made every
detailed item a child of "Principles for managing debt" in the document tree rather than a sibling
of its peers.

### 58. The tiered ruler and TODAY chip (ADR-0055 S4, deferred)

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

### 63. The Progress tab carries no unsaved marker for its three panels

> **The confirmation half is CLOSED (2026-08-23, ADR-0108 D2); the tab-marker half remains open.**
> The three panels now report dirtiness up to the editor via one `onDirtyChange` callback each —
> which is the lift this row prescribed — and the editor composes a six-scope report that the
> discard confirmation reads. So closing the editor with a changed weighted step now confirms and
> names the scope; before, `requestClose` called `onClose()` outright and the work went in silence.
> That was the more consequential half, and this row was right that the lift closes it.
>
> **Still open:** the tab LABEL still carries no dirty marker for Progress, so switching to General
> with unsaved step edits shows nothing on the tab itself. The report now exists to drive it, so what
> is left is presentation rather than plumbing.

Every other tab in the activity editor shows a dirty/error marker in its tab label (ADR-0060 §4).
**Progress does not** — its three panels (Reported progress / How value is measured / Weighted
steps) own independent forms, and none of their state reaches the tab.

So: edit the weighted steps, switch to General, and nothing anywhere says the Progress tab has
unsaved work. The discard confirmation on close has the same blind spot — it names General,
Scheduling and Cost, never Progress. Neither is data loss with consequences (each panel is one
Save from durable, and the panels are visible the moment you return to the tab), which is why this
is debt and not a defect — but it is an inconsistency the tab strip's own rationale argues against,
found by the M6 UX gate.

**What would close it:** lift the three panels' `isDirty`/`errorCount` to the dialog — a callback
prop per panel, or a small shared context — and fold them into the same `marker()` the other three
tabs use, plus into `dirtyScopeNames` for the confirmation.

### 64. Fields still use native `disabled`, so a mid-session pen loss can drop focus

ADR-0060's Save buttons were moved to `aria-disabled` + a pointer-events guard (`ScopeSaveBar`),
because a natively-disabled button is blurred to `<body>` the instant it flips — and they flip on
every save. The **fields** they sit beside were not: they are still natively `disabled` when the
scope is un-writable.

That is fine while writability is fixed for a session, and it is not — the pen can be taken over
by another user mid-edit (ADR-0028), which flips every definition field from enabled to disabled
under whatever focus the user had. Rarer than the Save case (which fired on the happy path, every
time), same root cause, same WCAG 2.4.3 exposure. Raised by the M6 accessibility gate as the
lower-priority half of that finding.

**What would close it:** extend the `aria-disabled` treatment from `ScopeSaveBar` to the form
primitives (`TextField`/`SelectField`/`CheckboxField`), which would fix every gated surface in the
app at once rather than this editor alone — which is also why it is a separate piece of work.

**Widened by the convergence epic (ADR-0062).** The Resources surface is now a tab of the same
long-lived session rather than a dialog opened and closed in seconds, so its natively-`disabled`
controls (`ActivityResourcesPanel`'s assign fields, and `AssignmentRow`'s cost / units / rate saves,
driving checkbox, curve select and Unassign) sit inside exactly the window this entry describes.
`AssignmentRow` is the **worse** case and the one to fix first: on `canWrite` going false it does not
disable its editors, it **unmounts** them for a read-only summary line — a guaranteed focus-to-`<body>`
rather than a possible one. Raised by the ADR-0062 accessibility gate.

### 65. A link's lag or type edited from the dialog is not recorded for undo

The undo stack now covers a dependency **add** and **remove** symmetrically (the convergence epic's
M5, `recordDependencyAdd` / `recordDependencyRemove`), and the canvas lag-anchor drag records its
own change. What is still missing is the third way a link changes: the **Edit link** dialog, where a
planner sets the type, the lag and the lag calendar.

So `Shift+←/→` on a link is undoable and typing `5` into the same link's lag field is not — from one
panel, one row apart. That is a worse inconsistency than the gap the add seam just closed, because
both routes are visible at once.

**What would close it:** an `onEdited` seam on `EditDependencyDialog` carrying the **pre-edit**
snapshot (the inverse needs the old type/lag/lagCalendar, which the mutation's response does not
contain), recorded through a `dependencyEditCommand`. It wants a coalescing key so a lag nudged five
times is one undo step rather than five — which is why it is its own piece of work rather than a
line in the epic that noticed it.

### 66. A shaded create form still accepts input it cannot submit

The house rule is shade-with-a-reason, and `ScopeSaveBar` implements it correctly: the Save is
`aria-disabled` with the reason `aria-describedby`-linked. But on the two create forms this epic
shipped — **Add a link** (`AddLinkSection`) and **Assign a resource** (`ActivityResourcesPanel`) —
only the Save is gated. The fields above it stay fully interactive, so a member who cannot write can
fill in an entire form and meet the refusal at the end of it.

Not a WCAG failure (the reason is announced, and the control is reachable), and deliberately not
"fixed" by adding native `disabled` — that is #64's defect, reintroduced. It is the same question as
#64 from the other side: what the shaded _state_ of a whole form should look like.

**What would close it:** decide the pattern once — a `readOnly` pass-through on the form primitives,
or a section-level treatment — and apply it to both forms together. Raised by the ADR-0062
accessibility gate as a nit, and by its ux gate as "the form should say so before the last click".

### 67. The Logic panel's post-remove focus target is the whole panel

After removing a dependency, `ActivityLogicPanel` moves focus to a wrapper around **everything** —
both tables, the add form and the cross-plan/notes slots. It is not a regression (it is what
`DependencyEditor` always did, and it beats dropping focus to `<body>`), but this epic shipped a
better pattern one file over: `ActivityResourcesPanel` falls back to a narrow region around just the
assigned list, and lets its host override the target — which the dialog uses to focus its Close
button.

**What would close it:** narrow `regionRef` to the two `<section>`s and add the same host-override
seam Resources has, so removing a link from the dialog lands on Close and from the tab lands on the
list. Raised by the ADR-0062 accessibility gate.

### 68. **Add note** lands on the Notes tab but not in its composer

`openActivityEditor`'s `steps` intent carries `focusSteps`, which the editor wires to the steps
heading. The `notes` intent carries only the tab, on the reasoning that "the intent IS the reveal" —
true visually, but the native `<dialog>`'s initial focus is the ✕ close button regardless of which
tab is active (the pre-existing gap in #17c). So a keyboard or screen-reader user who chose **Add
note** still traverses ✕ → the Notes tab → the panel before reaching the composer.

**What would close it:** a `focusNotes` flag on the intent, mirroring `focusSteps` one line above it,
with the composer exposing a ref. Raised by the ADR-0062 accessibility gate.

### 69. Two idioms for editing a row in place

`AssignmentRow` saves each field with its own inline button; `DependencyTable` opens a dialog per
row. Both are defensible on their own and they now sit two tabs apart in one editor, so the
inconsistency is visible in a way it was not when each lived in its own pop-out.

**What would close it:** pick one row-edit idiom and state it in `docs/DESIGN_SYSTEM.md` (the
list/manage archetype is the natural home), then move whichever surface loses. Raised by the
ADR-0062 component gate as a suggestion — deliberately not rushed inside the epic that noticed it.

### 70. The API e2e harness cannot reproduce a same-plan write race

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

**What would close it:** either drive the race below HTTP (two concurrent service calls, or two
hand-rolled transactions racing the read-then-write with a barrier between the read and the write),
or accept the HTTP tests as invariant tests and rename them so they stop implying a concurrency
guarantee. Until then, do not add another "serialises concurrent …" e2e test and treat it as a gate.

### 71. The WBS band's derived bucket is distinguished by colour and label, not shape

`paintWbsBand` draws the derived **Unassigned** bucket as the same rounded rect as a real summary,
in a different fill (`--color-muted-foreground` vs `--color-primary`) with its label on top. Every
pairing clears 4.5:1 in all three themes today, so this is not a contrast failure — but at a zoom
where `truncateToWidth` drops the label entirely, the only remaining difference is colour (WCAG
1.4.1). Its Gantt sibling deliberately does better: `GanttBucketRowView` draws a **bracket**, not a
bar, precisely so the bucket is not a fourth kind of bar on the chart.

**What would close it:** give the derived bar a shape cue — a hairline dash, a squared corner —
matching the Gantt's stated rule. Raised by the ADR-0063 M6 accessibility gate as a recommendation;
also flagged by the UX gate, which noted the `muted-foreground`-as-fill / `primary-foreground`-as-ink
pairing is not one of the design system's validated pairs and has no contrast test pinning it.

### 72. Bulk-selection checkboxes are a 16px target, and hand-rolled

The activities table's new selection column renders a bare `size-4` `<input type="checkbox">` per
row. `ActivityMembersPanel` does better for the same job — the whole row is a clickable `<label>` —
and `CheckboxField` (`components/ui/form.tsx`) exists to stop the chrome being hand-assembled at
all. It is not a regression (`TsldViewControls` and the toolbar registry already hand-roll the same
className for compact inline toggles), but the selection column is the fifth occurrence of a shape
the design system has a primitive for.

**What would close it:** widen `CheckboxField` to support a visually-hidden label and trailing row
content — the two reasons a straight swap is not free today — then move all five call sites, and
make the table row itself the hit target. Raised by the ADR-0063 M6 component and UX gates.

### 73. `Column.srHeader` is dead once `headerCell` is set

`DataTable`'s render ternary takes `headerCell` first, so a column declaring both (the activities
table's Select column does) silently ignores `srHeader`. Harmless today — the checkbox carries its
own `aria-label` — but it is a prop that looks load-bearing and is not.

**What would close it:** either drop the redundant `srHeader` at the call site and say so in the
`Column` docblock, or make the two compose (render the sr-only text _beside_ the control). Raised by
the ADR-0063 M6 component gate.

### 74. The plan advisory lock's contention headroom is unmeasured

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
   container harness the working zoom can be less than half the cost, so a **Week-zoom run is still
   owed** and may well show the surface a planner actually uses is smooth. And **DPR 1**: at 150%
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

**Found by** the backend-performance review of ADR-0071 M2, which measured `level.ts` before and
after the join-lag rework and reported the honest result: the new implementation is marginally
**faster** than the old at every size tested (500 → 16,000 activities), and both are quadratic in
one specific shape — many activities competing for a **single** resource. At 16,000 such activities
a levelling pass takes ~11.6 s.

**It is pre-existing and this diff did not change it.** It is recorded because ADR-0041 §F's
boundedness wording ("`O(k log k)`, never a per-minute scan") is easy to read as ruling this out,
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

**Found:** 2026-08-03, by the component gate on the derived-duration fix. **Pre-existing** — the fix
inherited it rather than introducing it.

`effectiveHoursPerDay()` (`apps/web/src/lib/effective-hours-per-day.ts`) resolves the factor as the
**activity's own** `calendarId`, falling back to the plan's. That is correct for every activity type
but one. For a **`RESOURCE_DEPENDENT`** activity, ADR-0039 §23 makes the **driving resource's**
calendar authoritative — the service resolves and overrides the activity's own, which
`ActivityCalendarField.tsx` already documents on screen. The web factor never accounts for it.

**What it costs.** Any day-denominated figure the client _renders_ for such an activity is measured
against the wrong day length: the assignment join-lag field (shipped under ADR-0071) and now the
derived-duration preview. Both are display and neither writes a wrong value — the API stores
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

### 88. An email link scanner reaches the verification URL before the recipient

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

**Found:** 2026-08-03, reading production request logs during the Theme B2 verification test.

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

### 92. An undone delete leaves a deletion with no matching restore

> **Re-verified 2026-08-08 — the stated blocker is gone.** This row says the fix waits on "ADR-0048
> M4 — the optional id-stable restore endpoint". That endpoint **shipped** when #113 closed:
> `DELETE …/activities/:activityId` now returns `{ deleteBatchId }`
> (`activities.controller.ts:140-153`) and `bulkDeleteCommand` already restores by batch. What is
> left is pointing `deleteActivityCommand`'s undo at `restoreDeleteBatch` instead of `createActivity`
> (`commands.ts:376-386`) — **hours of client work, not an epic**.

**Found:** 2026-08-04, writing ADR-0073 C3.1. Named in the feature spec (CQ-D / §2.5) as the honest
cost of a decision rather than discovered afterwards.

`activity.deleted` and `activity.restored` are a pair, and a reader's question — "what happened to
the Northgate piling activity?" — is answerable because both halves are recorded. **Undo does not
produce the second half.** ADR-0048's undo of a delete is a **re-create** (M1–M3: a new row, a new
id), and `activity.created` is deliberately absent from the catalogue because a create is already
durably attributed by `created_by`/`created_at`. So a planner who deletes an activity and
immediately presses Undo leaves a `activity.deleted` row, a live activity, and nothing in the log
tying the two together.

Dependencies do **not** have this problem: their undo re-creates too, but `dependency.created` IS in
the catalogue (it earns its row on the blast-radius test), so the pair closes.

**Why it is not patched by auditing creates.** That would add a row per created activity — the
largest single class in the excluded catalogue, and the one whose exclusion makes the whole
coverage rung affordable (ADR-0073 §2.4). Recording thousands of rows to close one gap of
interpretation is the wrong trade, and it would be irreversible: the table refuses `DELETE`.

**The fix when it is taken:** ADR-0048 **M4** — the optional id-stable restore endpoint, reusing
the existing soft-delete `delete_batch_id`. Undo then calls **restore** rather than create, the
existing `activity.restored` producer fires with the original id, and the pair closes with no new
audit action and no new rows on the common path. Until then the screens say what they record and
the log is not wrong, only incomplete in a way a reader cannot see.

---

### 93. The audit epic's non-blocking review findings (ADR-0073 C4.1)

**Found:** 2026-08-04, from six specialist reviews over the combined C1–C3.4 diff. The six blocking
findings were folded with regression tests; these are the remainder, recorded rather than rushed.

(a) **Two producers read one extra row inside a held lock** to label their audit event —
`baselines.service.ts` (`activate`, `remove`) looks up the plan's name inside the plan-advisory-lock
transaction, and `activities.service.ts` (`updateParents`) looks up the destination parent's name.
Each is one indexed primary-key lookup, sub-millisecond, and each producer is a single call rather
than a loop — so this is a shape to watch, not a cost to pay down now. It becomes real if any of
those actions is ever driven from a batch.

(b) **`AuditEventList` has seven inline-typed props and no named `Props` interface**, unlike
`AuditFilterBarProps` beside it. Predates the epic; worth extracting the next time the file is
touched.

(c) **Counts render without locale grouping** — `plural()` uses `String(n)`, so a 2,400-row cascade
reads "2400 activities" while the dates in the same file go through `Intl.DateTimeFormat`. Not an
established pattern for plain counts elsewhere in the app either, so this is a consistency question
rather than a defect.

(d) **`DataTable`'s `describedById` contract holds only for the populated table** — the empty state
returns the message without the `role="region"` wrapper, so the My-activity safety caveat is
reachable by serial reading but not by landmark navigation when there is nothing to show. Harmless
today (there is no region to land inside), but the contract is undocumented and a future change to
the empty-state markup could silently regress the populated case's fix.

(e) **Directional facts use a bare `→` glyph** — "Planner → Contributor", predecessor → successor,
calendar scope from → to. It is real text, so 1.4.1 is satisfied, but glyph pronunciation varies by
screen reader and the dependency-direction line is the one ADR-0064 names as the defect this row
exists to prevent. A textual equivalent (`"X to Y"`, or an `sr-only` sibling) would settle it.

(f) **`AUDIT_CATEGORY_LABELS.settings` reads "Settings & calendars"** but the category now also
holds baseline and library-governance events, so a reader looking for "why did my baseline
disappear" may not think to try it. The label predates the widened scope.

---

### 95. `apps/api`'s Vite configs are ESM in a CommonJS package, and a future Vite major will stop loading them

**Found:** 2026-08-04, by accepting the Dependabot vite bump (8.1.4 → 8.2.0), which added the
warning. It is a new warning, not a new defect — the mismatch predates the bump.

```
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is
    planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.e2e.config.ts:1:1)
```

`apps/api/package.json` has **no `"type"` field**, so Node treats its `.ts`/`.js` as CommonJS, while
`vitest.config.ts`, `vitest.e2e.config.ts` and `vitest.pairwise.config.ts` are written as ESM. Vite
currently bundles the config before loading it, which hides the mismatch; when `configLoader:
'native'` becomes the default it will load them directly and they will fail to parse. The root and
`apps/web` are already `"type": "module"` — `apps/api` is the only workspace that is not.

**Risk:** none today, and loud rather than silent when it lands — the API's three test configs stop
loading, so `pnpm test` and `scripts/e2e-local.sh api` fail immediately and obviously. The cost of
ignoring it is that it will arrive attached to an unrelated Vite upgrade, at the least convenient
moment.

**Remediation:** add `"type": "module"` to `apps/api/package.json` and fix the fallout, which is the
part to scope properly rather than bundle into a dependency bump — a NestJS app has CommonJS
assumptions (`__dirname`, `require`, the Nest CLI's own build output, `nest-cli.json`) that need
checking one at a time against the API e2e suite. Alternatively rename the three configs to
`.mts`, which is the smaller change and fixes exactly what the warning names. Do it before the Vite
major that flips the default, not after.

### 96. The router JSON-parses every search param, so a foreign one can arrive as the wrong type

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

**Found:** 2026-08-05, by the five specialist gates over the M0–M5 diff. Each was raised as
non-blocking by its reviewer and is recorded rather than rushed, per the ADR-0064/0073 precedent.

- **(a) `AUDIT_ACTION_CATEGORY` files the three new password actions under `sign-ins`**
  (api-reviewer). `auth.password_reset_requested`, `auth.password_reset_completed` and
  `auth.password_changed` are credential-lifecycle events, not sign-ins, so the audit log's
  **Access** chip returns them together with successful and failed authentications. Not wrong
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
- **(c) `password-reset.parity.test.tsx` overstates itself, and one of its assertions is vacuous**
  (test-engineer). Its docblock calls the suite "the only gate" on the flag structure, which was
  true when written and is not now — `router-search.test.ts` and the flag-on journey both cross it.
  And its `redirectTo` origin assertion checks the value against `window.location.origin`, which is
  what produced it: it cannot fail. Both are documentation defects in a test rather than missing
  coverage, which is why they are here and not in the fix.

**Risk:** neither remaining item is user-visible. (a) makes one audit question unaskable; (c) is a
test that reads as stronger than it is, which is the failure mode this register exists to name.

**Remediation:** (a) with the next audit-coverage slice; (c) whenever that file is next touched — it
is a comment and one assertion. (b) is closed.

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

| #   | What it was                                                               | Closed     | Where the record is                                                                                        |
| --- | ------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------- |
| 106 | `render-model.ts` could not be barrel + core model without a cycle        | 2026-08-30 | ADR-0078 S8. `render/geometry.ts` exists; the barrel is 128 lines.                                         |
| 109 | `bulkDelete` cascaded one activity at a time under the plan lock          | 2026-08-30 | `cascadeSoftDeleteActivityLeaves`, shipped in `3cf27de4` (an ADR-0082/0083/0084/0085 commit).              |
| 127 | Toolbar touch targets were 40 × 36 against a 44 × 44 house rule           | 2026-08-29 | ADR-0118 — the rule became per-pointer, and the coarse gate enforces it.                                   |
| 134 | A `render` item outranked every command on its row                        | 2026-08-30 | ADR-0109 D1 deleted the ladder; the diagnosis was right and the remedy expired with it.                    |
| 144 | `e2e-multi-select`'s focus assertion failed under sweep load              | 2026-08-30 | `focusListboxAfterModal` self-verifies; `e2e-overview`'s `createPlan` waits for the pen. Filed under #184. |
| 146 | The `chrome` surface scope had no measured current-page state             | 2026-08-30 | ADR-0109 D2 restored the header, so `e2e-designed-ui` D3 measures two scopes again.                        |
| 147 | The merged command strip stopped fitting below ~900 px                    | 2026-08-30 | ADR-0109 D1 — the surface wraps; the ladder, the `⋯` and the floor are gone.                               |
| 148 | Canvas date pills were painted on top of the first two lanes              | 2026-08-22 | ADR-0106.                                                                                                  |
| 157 | Every colour gate was a floor and none a ceiling                          | 2026-08-21 | ADR-0102 — ANSWERED, deliberately no gate: the window is two points wide and tuned to two samples.         |
| 158 | The printed and exported diagram was painted on a near-black ground       | 2026-08-21 | ADR-0102.                                                                                                  |
| 159 | `--color-*` aliases were frozen at `:root`                                | 2026-08-21 | ADR-0102 — the canvas painter had never once used the canvas surface scope.                                |
| 163 | The print palette was a surface family truncated to three members         | 2026-08-22 | ADR-0103 — `[data-surface="print"]` is all 31 members.                                                     |
| 164 | The exported diagram silently dropped seven default-on view layers        | 2026-08-22 | ADR-0103. One half remains open as **#166**.                                                               |
| 168 | Below `lg`, Escape closed and announced a drawer the reader could not see | 2026-08-22 | ADR-0104.                                                                                                  |
| 201 | Two independent mode toggles read as one four-way group                   | 2026-08-30 | ADR-0119; released in `web-v0.115.3`.                                                                      |
| 213 | Two controls painted and not clickable at 390, and a 20 px breadcrumb     | 2026-08-29 | ADR-0118 M3 — the first was off-screen; the second is a named exception.                                   |
| 115 | The pen sentence named a button the reader could not see                  | 2026-08-09 | ADR-0083 M7 — one refusal sentence chosen from the live role and pen state.                                |
| 124 | The selection bar's `<Toolbar>` had no fit coverage                       | 2026-08-27 | ADR-0114 M1 — and the row's own reasoning was wrong: the bar could overflow, by 408 px.                    |
| 29  | Released images not pulled — "shipped but not live"                       | 2026-07-30 | ADR-0047; `docs/DEPLOYMENT.md`. Superseded by #5.                                                          |
| 59  | The device-authoritative draw measurement was never made                  | 2026-08-03 | Folded into **#75**, which waits on the same single run.                                                   |
| 77  | The demo Unit 300 file was a lossy rendering of the fixture               | 2026-08-01 | ADR-0066; `docs/TEST_PLAYBOOK.md`.                                                                         |
| 78  | Public activity/dependency API was day-denominated                        | 2026-08-02 | ADR-0070. `durationMinutes` / `lagMinutes` are on both DTOs.                                               |
| 79  | A window-only calendar was rejected by the API                            | 2026-08-01 | ADR-0067. Pinned by `calendars.e2e-spec.ts` "window-only".                                                 |
| 80  | Intraday shift patterns had no write path                                 | 2026-08-01 | ADR-0067. `shifts` on the calendar create/update DTOs.                                                     |
| 82  | Shift-editor epic — the non-blocking half of five gates                   | 2026-08-01 | ADR-0067 M4; all seven sub-items landed.                                                                   |
| 87  | Import rejected a file with two activities of the same name               | 2026-08-03 | Fixed in `validate.ts` (`repairDuplicateCodesAndNames`).                                                   |
| 90  | `idx_audit_events_actor_occurred` was never measured                      | 2026-08-03 | Measured at 1M rows; ADR-0072 "Storage measured (2026-08-03)".                                             |
| 91  | A failed sign-in was recorded and readable by nobody                      | 2026-08-04 | ADR-0073 C2. Attributed at write time; `/me?include=attempts`.                                             |
| 30  | Canvas-first workspace fast-follows (ADR-0030 M1–M5)                      | 2026-08-08 | Verified done: `components/ui/segmented-control.tsx` + four `usePlanWorkspaceModel` hook suites.           |
| 85  | Two `react-hooks/refs` suppressions in the toolbar-context memo           | 2026-08-07 | ADR-0078 S11 split the commands out; zero suppressions remain.                                             |
| 94  | A verification email that never sends is invisible to everyone            | 2026-08-08 | Every remediation paid; ADR-0075 records the decision. Live gap is **#100**.                               |
| 111 | The row menu hid pen-gated actions instead of shading them                | 2026-08-08 | ADR-0082, merged `d8d8c34`. `itemsOf` keeps disabled items; `disabledReason`.                              |
| 103 | ADR-0064's recalculation hold was not wired on the shipped host           | 2026-08-08 | Debt-paydown M1-T1; pinned in `plan-workspace-toolbar.test.tsx`.                                           |
| 107 | ADR-0080 shipped without the specialist-agent review pass                 | 2026-08-08 | ADR-0080 §9 — the pass ran and folded five blocking defects.                                               |
| 113 | Redo unavailable after undoing a band copy                                | 2026-08-08 | `DELETE …/activities/:id` answers `200 { deleteBatchId }`; `docs/API.md`.                                  |
| 119 | The API e2e suite "fails intermittently"                                  | 2026-08-10 | Order-dependent, not flaky. The live residue is **#119a**.                                                 |
| 125 | `View ▾` held one toggle that ejects you from it                          | 2026-08-12 | ADR-0090 M5 — a standing note, `aria-describedby`-linked, with a neighbour test.                           |
| 83¹ | A typed duration overwritten by the calendar factor landing               | 2026-08-02 | ADR-0070 M6. `useDurationSeed` reads the field, not a flag.                                                |
| 135 | The Gantt drew a VISUAL plan's bars from the early-date columns           | 2026-08-17 | ADR-0095. `barGeometry` takes a `source`; `date-source-consistency.test.ts`.                               |
| 136 | The Gantt's M5 remainder — T1, T4, T5, T6                                 | 2026-08-18 | ADR-0095 M5, released `web-v0.92.0`. `e2e-gantt-editing/view-state.spec.ts`.                               |
| 137 | The shortcuts sheet was inert while the Gantt was on screen               | 2026-08-18 | ADR-0095. `PlanShortcutsHelp` mounts at the workspace, above both views.                                   |
| 126 | The two segmented pairs had no icons, so they could not go icon-only      | 2026-08-20 | ADR-0099 M5 chose all four and moved them to the rail, where they render icon-only.                        |
| 129 | The 56 px app header row was the last recoverable band above the canvas   | 2026-08-20 | ADR-0099 M3 deleted it at `lg`+ (`chrome-band.tsx` — `lg:hidden`). `aboveCanvas` 249 → 135.                |

¹ **The collision.** This 83 is _not_ the 83 in the table above, which is open (ADR-0068 §6's missing
usage count). Two pieces of work took the same number. The live row keeps it; this one is recorded
here by title so neither reference is ambiguous.

### 98. The guest share view scrolls sideways at 320 px (WCAG 1.4.10) **(CLOSED 2026-08-08)**

**Closed by the debt-paydown programme M1-T3.** `TsldViewControls`' zoom group gained `flex-wrap` —
on the **shared** control, with the member workspace re-checked at the same widths, rather than
branched by surface (a control that behaves differently depending on who is looking at it is how two
surfaces drift). The assertion this row exists for is now written and enabled in
`e2e-share/share.spec.ts` at **320 and 360 px**, and was verified red by removing the wrap: 436 px
against a 320 px viewport, exactly as first measured.

**Found:** 2026-08-05, by the ADR-0075 M3 accessibility gate — but not the way the finding was
written. The reviewer reasoned from the CSS that nothing on the guest view's chain sets
`overflow-hidden`, concluded the page would simply scroll vertically and pass, and **suggested a
test to confirm it**. The test was written and **failed on its first run**. That sequence is the
row's real subject: a correct-sounding chain of CSS reasoning, from a specialist, about a property
that takes one browser measurement to settle.

**Measured** (`apps/web/e2e-share`, Chromium, 320 × 720): `documentElement.scrollWidth` is **436**
against a 320 px viewport. The overflowing node is the TSLD zoom-preset row —
`flex items-center gap-1` with no `flex-wrap`, containing Day / Week / Month / Quarter / Year, the
−/+ buttons and **Fit to plan** — which measures **420 px** and cannot shrink.

**It is pre-existing, and that is the uncomfortable part.** The height fix in PR #238 did not cause
it; it made it _observable_. While the canvas rendered at 1 px nobody scrolled this screen, and no
gate looked. The share view has been publicly reachable since 2026-07-21.

**Why it is not fixed here.** The offending row is `TsldViewControls`, shared with the member plan
workspace, which has its own responsive story — ADR-0031's three prominence tiers and responsive
overflow, plus ADR-0030's below-`md` single-pane toggle. Adding `flex-wrap` is a two-word change
and might well be right, but it is a change to a shared control's layout at exactly the widths
another ADR governs, and it needs the member workspace re-checked at 320 px in a browser rather
than reasoned about — which is the mistake this row exists to record.

**Remediation:** decide whether the guest view should get the member workspace's responsive
treatment or its own reduced control set (a guest cannot edit, so several controls are arguably
noise on a phone), then fix and re-enable the assertion in `apps/web/e2e-share/share.spec.ts`,
which currently checks only that the canvas keeps its height at that width.

**Risk:** moderate-frequency, low-severity. A recipient on a phone gets a horizontally scrolling
page; nothing is unreachable, but 1.4.10 is a WCAG 2.2 AA criterion this project claims to meet
(`CLAUDE.md` §13), so the claim is currently wrong for this surface.

---

### 99. `/request-password-reset` leaks account existence through timing

**Found:** 2026-08-05, by the ADR-0075 M4 backend-performance and security gates independently.

The endpoint is uniform in **everything the caller can read** — same status, same body, whether the
address exists or not (ADR-0074, and the property `sendPasswordReset` holds rather than borrows).
It is not uniform in **how long it takes**. Better Auth awaits the send
(`runInBackgroundOrAwait` → `else await promise`, `better-auth@1.6.25`,
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

### 100. The operator-facing mail signal has no operator-facing channel **(code half CLOSED 2026-08-09)**

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

## 101. `check:claims` completeness has structural blind spots

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

## 102. The public screens' deferred review findings (ADR-0077 M6-T2)

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

## 104. Two live-region owners can collapse one recalculation into one sentence

**Status:** open · **Owner:** web · **Raised:** 2026-08-07 (canvas status & feedback, M5)

`useAnnounce` clears the polite region and sets it on the next animation frame, so **two calls in one
frame collapse to the last**. After M5 there are two owners for a single settle: the manual
Recalculate command announces `'Schedule recalculated.'` from `flush`'s success callback
(`use-tsld-toolbar-context.tsx`), and the new settle announcer speaks the dates on the next render
(`use-recalc-outcome-announcer.ts`). Press Recalculate inside the 500 ms debounce of a canvas edit and
both fire.

M5 made the loss direction **safe** rather than fixing it: the settle facts land after the
confirmation, so the utterance that can be dropped is the redundant status word, never the
informative one. Fixing it properly means one owner at the `flush` call site, which the approved plan
precluded by putting the announcer in `TsldPanel`. Worth doing when ADR-0078 is written, since that
is where the announcement ownership should be stated.

## 105. Two follow-ups from the canvas status & feedback gate pass

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

## #108 — The plural drag: model, command and endpoint landed; the gesture did not

**Status:** unverified · **Found:** 2026-08-08, by the component review over the ADR-0080 diff.

`model/bulk-move.ts` (`movedPlacement`, `bulkMoveSnapshots`, `isLaneOnly`), `bulkPlacementCommand`
in `features/undo-redo/commands.ts`, `useBatchPlacements`, and the `PATCH …/activities/placements`
endpoint with its DTO and API e2e are all built, tested and correct. **Nothing calls them.** The
gesture machine's `repositioning` state still keys on one `activityId`, so dragging one of twelve
selected bars moves that one bar, exactly as before the epic — which is the implementation plan's
own M4-T1 ("`repositioningMany` + N ghosts") and M4-T2 ("the write path"), landed as a data layer
and never as an interaction.

**What shipped wrong, and what was done about it.** The bulk bar carried a sentence — _"Moving these
will pin a start-no-earlier-than date on all N"_ — describing the consequence of a gesture a planner
cannot perform. That is worse than the "lit but inert" class this repo keeps finding (ADR-0059 M6,
ADR-0064 §7): an inert control does nothing, a false sentence asserts something. The sentence and
its prop are **removed**, with a test asserting the bar says nothing about moving; ADR-0080's
Consequences and this repo's CLAUDE.md entry are corrected to say the drag is not wired.

**The dark layer is kept**, deliberately and in line with how this repo ships (M1 "dark, unflagged"
slices throughout ADR-0053/0072/0080): the endpoint is real, exercised by
`apps/api/test/activity-batch-ops.e2e-spec.ts`, and is the foundation the gesture will call. What is
not kept is any claim that it is reachable.

**The fix** is M4-T1/T2 as planned: a `repositioningMany` gesture state carrying N ghosts, the
batch write through `useBatchPlacements`, one `bulkPlacementCommand` on the undo stack, and the
caveat prop restored **with** it. Sized as its own slice rather than folded into the enablement
pass, because it is an interaction change with its own ghost-painting cost to measure.

### Narrowed 2026-08-08 — the write path is wired; the N-ghost preview is not

**CLOSED 2026-08-28 (correctness programme, Phase 1) — the preview half.** `livePeerGhostRects`
(pure, exported, unit-pinned) derives one outline ghost per selected peer from the grabbed bar's
live day/lane delta — the SAME per-activity delta `bulkMoveSnapshots` writes, so the preview and
the write cannot disagree about where a bar lands — and `paintInteractionLayer` draws them as
faint fills + solid outlines below the live ghost. Two costs are decisions rather than omissions:
peers ghost OUTLINE-ONLY (the grabbed bar keeps the full-fidelity ADR-0054 treatment; N labelled
ghosts would multiply the frame's text cost for detail the planner already has), and the peers'
SOURCE bars stay lit (dimming them means widening the scene layer's `gestureSourceId` to a set —
a `paintScene` behaviour change under the ADR-0078 golden oracle, not worth re-baselining for a
preview). The parity pin is the painter test's second half: an overlay without `peers` adds not
one call, verified red against the peers-less painter.

**Status at narrowing: open, narrowed.** The functional half is done and proven end to end. Dragging one of a
plural selection now moves every selected activity by the same delta, as **one** batch
(`PATCH …/activities/placements`) and **one** undoable step, mode-aware through `bulkMoveSnapshots`
so EARLY pins and VISUAL hand-places exactly as the single-bar drag does. A lane-only move still
skips the recalculation. `moveMany` joins `deleteMany`/`linkChain` on the host-supplied
`TsldBulkOperations`, which is where the mutation and the ADR-0048 command stack already live.

The caveat sentence comes back, **but not the one that was removed**. The original — "moving these
will pin a start-no-earlier-than date on all N" — is true only in EARLY mode, so restoring it
verbatim would re-introduce a false statement for every VISUAL plan: the same defect wearing a
different hat. It now reads "Dragging any of these moves all N", which is true in both modes and is
the fact a planner needs _before_ they drag. The test asserting the old wording absent is **kept**,
alongside a new one asserting the replacement present.

**What is still open: the N ghosts.** The gesture machine's `repositioning` state remains
single-`activityId`, so during the drag the planner sees one ghost and the other bars jump on
release. That is a preview gap, not a correctness one — the write, the undo and the announcement all
cover the whole set — but it is the half of M4-T1 with a painting cost to measure (ADR-0026 §16),
and it is not done. Recorded rather than quietly dropped.

**How it was proven**: this is the first slice built under ADR-0081. The journey step
(`e2e-multi-select`, "dragging one of a plural selection moves them ALL") was written **before** any
implementation and **verified red** — 1 of 3 bars moved, which is the defect exactly — then green
after. Writing it first also caught its own bug: the shared plan's bars have been dragged and linked
by earlier steps, so the one-column probe found one bar rather than three, which would have read as
a product defect had the step been written after the fix.

## 110. Milestone B (server-side duplicate endpoint) deferred, with the measurement attached

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

## 112. Copy/paste follow-ups from the W5 enablement gate

**Status:** open · **Owner:** web · **Raised:** 2026-08-08 (W5 M5 enablement gate)

Non-blocking findings from the six specialist reviews over the W5 diff, recorded rather than rushed.

1. **No `aria-busy` on the single-activity Duplicate while its write is in flight** (accessibility).
   US-1 names it. A single duplicate is deliberately confirmation-free, so there is no interstitial
   UI to carry the state, and the source stays selected — so the button remains mounted, focused and
   enabled through the whole composite. Two quick activations can fire two composites built from the
   same pre-write `usedNames` snapshot, and the second reports a generic 409 rather than being
   prevented. The toolbar primitive already supports `isBusy` (the Recalculate item's precedent).
2. **`ActivitiesTable` offers no "Duplicate band" for a summary** (accessibility), while the canvas
   bar now does. Not a dead end — an absence — but it breaks the cross-surface wording convergence
   the two entry points otherwise keep.
3. **`projectDuplicate` is exported, uncalled and untested** (component, test-engineer). Either wire
   it or delete it; `planClone` calls `projectClone` directly.
4. **No flag-off parity suite for the canvas selection bar's Duplicate** (component), though one
   exists for the table row menu. The flag-off suites are this repo's stated rollback contract.
5. ~~**`canEditSchedule` reuse across the two entry points is not pinned by a test**~~ —
   **CLOSED 2026-08-08.** `ActivitiesTable.row-gate-identity.test.tsx` pins it, and says so in its
   own docblock. Struck rather than deleted so the number keeps meaning what it meant.
6. ~~**Two untested branches in the clipboard keybindings**~~ — **CLOSED 2026-08-08.**
   `use-clipboard-keybindings.test.ts:91,100` covers both the null-selection and null-target
   branches.
7. **`env.test.ts` has no `ACTIVITY_COPY_PASTE_ENABLED` block** (test-engineer), which M0-T1 asked
   for; the flag is covered indirectly by the flag-mocked component suites.

**Risk:** low. None changes what the product does today; (1) is the only one a planner could meet,
and only by activating twice inside one round trip.

---

## 114. Two menus still hide rather than shade, for want of a reason to show

**Status:** open ·

**114.1 and 114.2 closed 2026-08-09** (ADR-0083 M7 — `scheduleRefusal`). What remains is **114.3**, and the heading is about that.
**Owner:** web · **Raised:** 2026-08-08 (ADR-0082)

> **Closed, and the blocker turned out not to exist.** This entry says the fix needs "a small piece
> of gating work" because `canWrite` "cannot say whether the planner lacks the role or merely lacks
> the pen". `derivePlanGating` has returned **`penReadOnly`** — exactly that distinction — since
> ADR-0028. What was missing was never the data; it was that every caller assembled its own string
> from the **fused** `canEditSchedule` and could therefore only guess. One shared
> `scheduleRefusal(gating, holder, action)` now picks the frame from the live state, and eleven
> hand-written sentences across the TSLD toolbar and the selection bar were deleted in favour of it.
>
> And the `plan-actions-menu` case is **more** exact than this entry allowed for: `model.canWrite`
> is `canManageHierarchy(role)`, role only and never pen-gated, so there is no pen branch there to
> get wrong. That was checkable in one grep, and the entry's own premise had not been checked —
> ADR-0076 Class 3, in the register rather than in a spec.
>
> `#116.4` (the `HierarchyTree` row menu, filed as the third case) is closed **as correct by
> design**: every action on a hierarchy node is a write, so for a Viewer _every_ item would shade,
> and ADR-0082's own clause says such a menu renders no trigger. Changing it would give a Viewer a
> menu of nothing but refusals on every row and reintroduce the focus trap the clause removes. The
> rule is now written at `tree-actions.ts` so it is not rediscovered as an oversight a third time.

ADR-0082 made a shaded menu item keep its place in the keyboard order and carry an
`aria-describedby` reason, and applied it to the activities-table row menu. Two consumers are
knowingly left behind, both recorded here rather than discovered again later — the ADR-0071 rule.

**1. `plan-actions-menu.tsx:62-66` hides "Edit plan…" on `!model.canWrite`.** The blocker is not the
markup, it is that **there is no sentence to show**. `canWrite` is a bare boolean; it cannot say
whether the planner lacks the role or merely lacks the pen, and a sentence that guesses — telling
someone "your role cannot do this" when they simply need the edit lock — is the exact false-statement
defect ADR-0082 §2 records shipping twice. The fix is to give the plan scope a `ScopeGate` carrying
its own reason, the way `deriveActivityEditorGating` does for activities, and then shade from it.
Doing that properly is a small piece of gating work, not a markup change, which is why it is not
folded into ADR-0082.

**2. `Combobox` still skips disabled options by arrow key.** The APG's _Developing a Keyboard
Interface_ practice names "Options in a Listbox" in the same keep-focusable list it names menu items
in, so the argument transfers exactly. It is a separate primitive with `aria-activedescendant`,
in-flow rendering, its own consumers and its own tests, and changing it inside ADR-0082 would widen
the blast radius well past what the row menu needed. The decision to leave it is deliberate; the
inconsistency between two APG primitives in one product is the cost.

**Risk:** low for both. Nobody is blocked — the plan edit is reachable for anyone entitled to it, and
a combobox's disabled options are not actions. Both are discoverability and consistency defects
against ADR-0062 M6, which is a real reason to close them and not an urgent one.

## 116. Consolidation-pass findings that were not folded

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

## 118. Staff-console M6 review findings that were not folded

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

**4. `--card` / `--muted-foreground` is not in the contrast matrix.** The staff console puts
`text-muted-foreground` directly on `Card` rather than through `CardDescription`, and
`token-contrast.test.ts` pins `--muted-foreground` only against `--background`. Recomputed
independently at the OKLCH→sRGB level: the worst case is dark theme at **6.91:1**, comfortably above
4.5, so **there is no failure today** — but it is ungated, and it is _less_ contrasty than the pair
that is gated (7.63:1), so the gate is currently reassuring about the wrong pair. Add the case.

**Not a finding, recorded because it was measured and the measurement inverted the recommendation:**
a partial index `(created_at, id) WHERE NOT email_verified` on `users`, serving the accounts panel.
The reviewer measured 43 ms → 0.05 ms and recommended it; the database-architect re-measured against
the **real** table (five rows, one heap page) at 0.036 ms and recommended deferring, because the
43 ms came from a synthetic million-row population that no longer exists. Deferred against a trigger
rather than a date — build it when unverified accounts on the deployed installation reach five
figures — and recorded in `20260809180000_audit_events_staff_index/migration.sql` so the question is
not reopened from scratch.

## 118a. `audit_events`' 12-month `auth.*` period is still unenforced, and the sweep may never enforce it

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

## 118b. The CSP period bounds staleness, not data age — and the sweep does not change that

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

## 123. One create-dialog earned-value case failed once in a full run and has not repeated

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

## 122. Two Class A flags are deferred, and the payoff is not where the register said it was

**Status:** unverified

**CLOSED 2026-08-17.** `VITE_ACTIVITY_EDITOR_TABS` retired with ADR-0089 (2026-08-11);
`VITE_CANVAS_WORKSPACE` retired in the dedicated flag-cleanup pass the product owner called for.
`classACap` is now **0** — the estate has no alternative-surface flags left, and every one of the 52
that remain is a one-line guard formally kept by ADR-0088 D4.

The closing measurement, for the record, because this row's own numbers were wrong twice. All seven
flag-off harnesses were finally probed — two had only ever been inferred, see the correction in
`docs/specs/workspace-layout/m6-harness-conversion.md` — and all 27 specs were converted. **None was
deleted as redundant and none had the legacy layout as its subject**; the only suite that ever did
went with `VITE_CANVAS_TOOLBAR`. `plan-detail.tsx` goes 391 lines to 67. The line below said "five
harnesses left rather than seven" and corrected itself twenty lines later; both are history now.

The original entry follows, kept because its estimates are what those numbers correct.

**Parked by the product owner 2026-08-12**, after the measurement below was put to them: **every
flag stays ON for now, and the estate is cleaned up in one dedicated pass** rather than a flag at a
time. So `VITE_CANVAS_WORKSPACE`'s deferral trigger is no longer `epic-touch: plan workspace` — which
ADR-0090 fired and discharged — but a new `flag-cleanup pass` term, added to
`scripts/flag-retirement.json`'s **closed** `deferralTriggers` vocabulary in the same commit, which is
the form ADR-0088 D3a asks for: a decision somebody makes in a diff, not a sentence in one flag's
reason field. Worth noting it is a **wider** trigger than the epic-touch ones, so a second flag
deferred under it should be a deliberate choice rather than a habit.

**Measured and re-deferred 2026-08-12 (ADR-0090 M6).** This epic fired the `epic-touch: plan
workspace` trigger and took the milestone's own stated off-ramp, on evidence rather than instinct:
all **seven** flag-off harnesses were probed with a bare pin-flip and **all seven fail — 27 specs**
(base 8 of 17, `activity-editor` 11, `edit` 3, `sub-day` 2, and one each for `notes`, `programme`,
`assignment-lag`). **Not one is a configuration edit**; every one needs new selectors against the
surviving surface. Three — base, `programme`, `notes` — also pin `VITE_TSLD_EDITING` /
`VITE_PLAN_EDIT_LOCK` off **deliberately** to stay pen-free, so converting those must first establish
that the journey works pen-free against the surviving workspace or it silently changes what the
journey tests. The count above ("five harnesses left rather than seven") is superseded: seven remain.
Survey and per-suite probe results:
[`docs/specs/workspace-layout/m6-harness-conversion.md`](specs/workspace-layout/m6-harness-conversion.md).
The `deferredUntil.reason` in `scripts/flag-retirement.json` carries the same measurement, so the
next attempt starts from evidence rather than a file list.

`VITE_ACTIVITY_EDITOR_TABS` and `VITE_CANVAS_WORKSPACE` are the two alternative surfaces the batch-2
retirement did **not** take. Both carried `deferredUntil` in `scripts/flag-retirement.json` (ADR-0088
D3a), which suspends their batch dates against a **named event** rather than a date — so this row is
the thing the gate points at, and deleting it fails `pnpm check:flags`.

**`VITE_ACTIVITY_EDITOR_TABS` — RETIRED 2026-08-11 (ADR-0089). This half is closed.**
Its trigger — the next epic touching the activity editor — fired, and the analysis below held
exactly: the dialog-unification epic closed all ten create/edit divergences and extracted eleven
shared field groups **first**, so the retirement collected the payoff this row said a bare
retirement would not. Both flag-off harnesses (`sub-day`, `assignment-lag`) were **converted to the
shipping surface before the flag went**, which is the ADR-0084 batch-1 lesson applied in advance
rather than re-learnt. `classACap` ratcheted 2 → 1. The `VITE_CANVAS_WORKSPACE` half below stays
open, and is now two harnesses cheaper for exactly the reason this row predicted.

The original analysis is kept below because it is the argument, not just the outcome:

**`VITE_ACTIVITY_EDITOR_TABS` — trigger was: the next epic touching the activity editor.**
The register described this as the estate's worst case, on the strength of nine unrelated features
having had to patch both branches. That is **true about the codebase and false about the flag**, and
the distinction is the whole point of this row:

- `ActivityEditorDialog.tsx:154` — _"This editor is edit-only; creation stays with
  `ActivityFormDialog`."_
- `CreateActivityButton.tsx` renders `ActivityFormDialog` with **no flag reference in the file**.
- 0 of 11 `ActivityFormDialog.*.test.tsx` suites reference the constant — they are flag-unaware.

So retiring the flag deletes three mount sites and leaves the legacy monolith alive as the **create**
surface, carrying every field those nine features added, and moves none of the nine suites. **The
receipts belong to create and edit being two components** — an ADR-0060 decision — not to the flag.
The work that would actually collect the payoff is unifying the two dialogs; retiring the flag first
buys nothing and costs 2 flag-off harnesses (`sub-day`, `assignment-lag`) plus 2 derived children.

**`VITE_CANVAS_WORKSPACE` — trigger: the next epic touching the plan workspace.**
Seven flag-off Playwright configs pin it and their specs are written against the legacy stacked
plan-detail page: `activity-editor`, `assignment-lag`, base, `edit`, `notes`, `programme`, `sub-day`.
That is the largest conversion cost in the estate, and ADR-0084 D5 forbids retiring before the
coverage is replaced. Note `sub-day` and `assignment-lag` harness **both** deferred survivors, so
converting either flag pays down part of the other.

**Why this is debt and not a decision to close.** Neither flag is hurting anybody today — both are
compiled on and unreachable (ADR-0088 D1), so no user can select the deleted branch. The cost is that
every change near either surface has to be made twice, and the failures that causes are the quiet
kind: ADR-0080 wired `bulk` into one host and not the layout `VITE_CANVAS_TOOLBAR` selected, unit-green
throughout.

## 121. The base Playwright journey proves editing in a world no shipped bundle can produce

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

## 120. The first retention drain leaves 10–20% dead tuples for several ticks, and nothing says so

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
real backlog**, which on the deployed host is a month away for `csp_reports` and a year for
`mail_events` — so there is time, and nothing to do today.

If it ever matters, the remedies in order of cost are: watch `n_dead_tup` rather than assume it
self-heals; set a per-table `autovacuum_vacuum_scale_factor` on the two swept tables; or raise
`RUN_CAP` so a drain crosses the default threshold in one run. Do none of them without measuring
first — the last one trades a bounded connection hold for a faster vacuum, which is the opposite of
what `RUN_CAP` exists for.

## 119a. The API e2e suite fails intermittently, and the failure has never been captured

**Status:** unverified

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

## 128. The multi-select journey's post-delete focus assertion is flaky, ~1 run in 4

**Status:** unverified · **Raised:** 2026-08-12 (ADR-0090 M3) · **Size:** M · **Owner:** whoever next touches the bulk delete

`e2e-multi-select/multi-select.spec.ts:214` — `expect(list).toBeFocused()` after a bulk delete —
fails intermittently with `Received: inactive`. Everything downstream of it depends on that focus:
the undo accelerator is a **React** `onKeyDown` on the workspace root, so focus on `<body>` means the
Ctrl+Z the next assertion presses reaches nothing (ADR-0080, which is where this fix came from).

**Attributed by running it, not by reasoning.** It surfaced during M3, whose changes add an extra
render pass to `<Toolbar>` on mount (the band resolves after the first measure), which is exactly the
sort of thing that shifts a timing race. So the M3 commit was reverted with `git revert --no-commit`
and the journey run **four times against the pre-M3 tree: 3 passed, 1 failed** — the same rate
observed with M3 in place (3 of 4). It is pre-existing, and M3 neither caused nor worsened it.

**The likely mechanism, stated as a hypothesis rather than a finding.** `focusListboxAfterModal`
(`TsldPanel.tsx:655`) is a **single** `requestAnimationFrame` after the native `<dialog>` closes.
That wins the race against the dialog's own synchronous focus restore — which is the defect it was
written for — but it does not survive the listbox being re-created afterwards, and a bulk delete
triggers a refetch and a recalculation. One frame is a guess about how long that takes.

**What to do:** do not paper over it with a longer timeout — the assertion is about focus landing,
not about how long it takes. Establish whether the `<ul>` remounts after the rAF (a `key` or
conditional-render change would do it); if it does, the restore belongs on the listbox's own mount
rather than on a frame counted from the dialog. Until then the journey should be treated as a known
intermittent, and a red run on this assertion alone re-run before being investigated as new.

**Re-measured 2026-08-14 (ADR-0094), doubling the sample — and the result is that the sample is
still too small to say anything.** That epic's local journey sweep hit it, and ADR-0094 adds an item
to the very selection bar this journey drives (`clear-visual-placement` moves there), which is the
same class of change M3 was suspected of. So the method above was repeated: five runs on the epic
branch, five on the pre-epic tree at `fdc21ef`, `retries: 0` on both.

| tree                  | pass rate |
| --------------------- | --------- |
| pre-epic (`fdc21ef`)  | 4 / 5     |
| ADR-0094 branch       | 3 / 5     |
| M3-era figure (above) | 3 / 4     |

All three are consistent with one underlying rate somewhere around 70–80 %, and 3/5 against 4/5 is
not a difference five runs can detect. **The honest reading is that the flake is confirmed
pre-existing and unchanged as far as this can tell — not that the change is exonerated**, which
would need a sample nobody has yet paid for. Recorded because "we re-ran it and it passed" is how an
intermittent gets quietly re-attributed to whoever last touched the file.

**One thing that measurement did settle**, and it explains why this has never been red in CI:
`playwright.multi-select.config.ts:32` sets `retries: process.env.CI ? 2 : 0`. A ~25 % per-run
failure rate becomes ~1.5 % with two retries, so CI absorbs it and only a local sweep sees it. That
is the right configuration and it is also why the rate can drift a long way before anything notices.

## 130. The zoom trigger's icon says "date range", and it now owns the viewport

**Status:** unverified · **Raised:** 2026-08-12 (ADR-0090 M5, ux gate) · **Size:** S · **Owner:** a design pass ·
**Status: CLOSED 2026-08-28 — overtaken.** The control this row describes no longer exists:
`ZoomPresetControl` and the `comfortable`-band fold were deleted with the width ladder (ADR-0109
D1 — a command surface wraps; it never hides), zoom presets moved into `View ▾` (ADR-0099), and
the viewport commands are now separate icon-only deck items with universal glyphs (`zoom-in`,
`zoom-out`, `fit` — `Deck.tsx` `ICON_ONLY`). `CalendarRange` appears nowhere in the workspace
(verified by grep: its two remaining uses are the overview empty state and the navigator).
Nothing left to choose an icon for; #126's segment-icon half was settled by its own pass.

`ZoomPresetControl`'s icon is `CalendarRange`, which was right while the control did one thing: its
presets **are** time ranges (Day / Week / Month / Quarter / Year). Below the `comfortable` band it now
also holds Zoom out, Zoom in, Fit to plan and Go to today (ADR-0090 M3-T2), so the subject it names is
the **viewport**, and a calendar glyph is no longer the honest cue.

M5 fixed the half that could be fixed without a design decision: the visible label becomes
`Zoom · Week` exactly when the fold is active, so there is on-screen text saying "Zoom". The icon is
left alone deliberately — picking a glyph that means "the viewport" rather than "a date range" is a
statement about the control, and this milestone is about width.

**It matters most in the collapsed band**, where there is no visible label at all and the icon is the
only cue a sighted pointer user gets.

**What to do:** choose an icon with the design pass that also settles `docs/TECH_DEBT.md` #126's four
segment icons — they are the same kind of question, and answering them together stops the toolbar
acquiring two glyph vocabularies.

## 131. An icon-only toolbar control names itself only on hover, and the target device has none

**Status:** unverified · **Raised:** 2026-08-12 (ADR-0090 M5, ux gate) · **Size:** M · **Owner:** a design-system pass

_**CLOSED 2026-08-28** (fix-slice M-B, ADR-0117). The Tooltip primitive this row asked for exists —
`useTooltip` in `components/ui/tooltip.tsx`, hand-rolled to the APG with WCAG 1.4.13 in full
(Dismissible/Hoverable/Persistent, each red-verified), opening on hover, on focus, and on a
coarse-pointer **long-press that does not fire the command**. Adopted on `ToolbarButton`'s
icon-only branch (title deleted there, character-identical content, `purpose: 'name-echo'` so AT
hears nothing twice) — which covers every icon-only registry item including the collapsed band's —
and on `UndoRedoControl`, whose bespoke render path the flag-on journey caught still carrying
`title` on its first run. Reviewed by accessibility + component reviewers before merge (§19.13).
One coupling recorded by that review: `ToolbarPopover`/`ToolbarSplitButton`'s compact (icon-only)
branches still use `title` — NOT live today, because `Deck`/`Toolbar` pin `layout: 'comfortable'`
(#193) so `compact` never resolves true — but ADR-0110 M5 deliberately kept the band machinery, so
**reactivating the compact bands must adopt `useTooltip` on both controls in the same change**, or
the day the bands return silently reopens the defect this row closed._

Every icon-only toolbar control carries its name in `aria-label` and `title`. A screen-reader user
gets it; a **sighted, touch-only** user does not, because `title` tooltips never fire on tap. That is
long-standing convention here and was acceptable while icon-only controls were the exception.

ADR-0090 M3-T3 made it the rule in the **collapsed** band (< 1024 px container): `Go to date`, `Zoom`,
`View`, `Filter` and `Summary` all become icon-only there. Collapsed is Surface Pro **portrait** —
the device this epic names as its target — so the case where the names are least reachable is exactly
the case the milestone was built for.

**Not a WCAG failure**: the accessible name is present and correct, and 2.5.8 target size is met and
gated. It is a usability gap against a real user on a named device.

**Why it was not fixed here:** the answer is a tooltip primitive that opens on long-press/tap as well
as hover, which is a design-system component with focus, dismissal (WCAG 1.4.13 Content on Hover or
Focus) and portal concerns of its own. Inventing one inside a layout milestone is how a primitive
ships without those. The alternative — keeping labels in the collapsed band — is what the measurement
ruled out (`docs/specs/workspace-layout/m3-narrow-widths.md`).

**What to do:** build the tooltip primitive, then adopt it on `ToolbarButton` and `ToolbarPopover`
together, rather than on whichever control someone is holding at the time.

**Narrowed 2026-08-28 (re-verified against the post-ADR-0109 deck).** The premise lapsed: there
is no collapsed band any more — the width ladder and its floors were deleted (ADR-0109 D1), and
`Go to date`, `View`, `Filter` and the rest carry visible labels at **every** width. Icon-only is
now a deliberate closed set of **six universal glyphs** (`Deck.tsx` `ICON_ONLY`: zoom-in,
zoom-out, fit, undo, redo, print), each still named on hover only via `title`. The residual gap
is therefore six controls whose glyphs are close to self-evident, not five popovers on the target
device — real, small, and adjacent to #133's coarse-pointer state. The remedy is unchanged (a
long-press-capable tooltip primitive, WCAG 1.4.13 concerns and all) but it is a design-system
spec item under ADR-0105 (a new shared primitive is exactly the trigger), not a defect fix, and
its size against six universal glyphs is no longer M. Decide it beside #133's coarse-pointer
pass rather than alone.

## 132. `mail-alerting.e2e-spec.ts` sees its own writes late, and the two cases then swap answers

**Status:** unverified

**Observed in CI, 2026-08-12**, on a branch that changes **zero files under `apps/api`** (verified:
`git diff --name-only origin/main...HEAD | grep -c '^apps/api'` → 0). So it is a pre-existing flake
surfacing, not a regression from the change under review — worth recording precisely because the
next reader will meet it on an unrelated PR and start looking in the wrong place.

Both cases in the file failed together, and the pair is the diagnosis:

```
expected [ { …(7) } ] to have a length of 5 but got 1   (test 1, :147)
expected 5 to be 1                                       (test 2, :182)
```

Test 1 sends five messages and asserts five `mail_events` rows; it saw **one**. Test 2 asserts
exactly one row; it saw **five**. The other four arrived between the two assertions — so `settle()`
is not waiting for all five **fire-and-forget** writes, and the rows land during the next test.

Two things follow. The obvious fix is to make `settle()` wait on the row count rather than on a
fixed delay — test 2 already does exactly that (`for (let i = 0; i < 50 && count === 0; i++)`), so
the pattern is in the file, applied to one case and not its neighbour. The less obvious one is that
test 2's own poll waits for `count === 0` to become false, which the leaked rows satisfy
**immediately** — its wait cannot distinguish its own write from test 1's, which is why it reports a
confident 5 rather than timing out.

The file's docblock records that a `reset()` for tests was considered and rejected, for a good
reason (a production-caller-less method existing only to make an assertion true). That argument is
about isolation, not about waiting, and does not cover this.

**Impact:** a red CI run on an unrelated PR, roughly one run in several. **Fix:** wait on the
expected count in test 1, and give test 2 a wait that is specific to its own row.

## 133. A coarse pointer costs the merged strip two commands, and one of them is Next conflict

**Status:** unverified

`toolbarControlVariants` carries `pointer-coarse:px-3` (`toolbar-styles.ts`), which takes every
toolbar control from 32 px to 40 px. A Surface Pro — the device this toolbar is judged on — reports
`pointer: coarse` **in tablet mode** and `fine` with its keyboard attached.

**Re-measured 2026-08-20 against the merged strip**, because every figure this row previously carried
described the two-row surface ADR-0099 M5 deleted, and two of the three levers it named
(`Report progress…`, `Snap to grid`) have since been removed from the product entirely by ADR-0093
and ADR-0092. A row whose evidence and whose remedies have both gone is worse than no row.

At **1646** — the width this work is judged on — with the same plan and the same build:

| pointer    | inline | labelled | what leaves the row                |
| ---------- | ------ | -------- | ---------------------------------- |
| fine       | 14     | 10       | —                                  |
| **coarse** | **12** | **8**    | `zoom-out` and **`next-conflict`** |

**The second one is the finding.** `next-conflict` carries `priority: 110`, the highest rank on the
strip, and it is still evicted — so the coarse padding costs more than any ranking can defend
against. ADR-0094 exists because a conflict count beside no way to act on it is the defect that
epic was opened on, and `docs/TECH_DEBT.md` #134 records that command being pushed into the `⋯`
once already. This is the same eviction, reached by a different route, on the device the product
owner actually uses in the mode they use it in.

It is **not a regression** and not a WCAG failure: the command is still reachable in the `⋯`, and
40 px targets are further from 2.5.8's floor than 32 px ones. It is a gap that predates both the
merge and the fit gate, and it stayed invisible because Playwright defaults to a fine pointer.

**What is gated already, and what is not.** `e2e-toolbar-fit`'s `coarse pointer` block (ADR-0090
M3-T4) runs at 1024 × 1366 and asserts every control clears 40 × 36 — so the _geometry_ is gated and
the _budget_ is not. Nothing anywhere asserts what the row can still afford to show under a coarse
pointer, which is why this needed a hand-run probe to find.

**The levers, re-derived rather than carried:** shorten `Share & export` (the longest survivor);
`gap-1.5` → `gap-1`; reduce the coarse padding itself (`pointer-coarse:px-3` → `px-2.5`, 40 → 36 px,
still well clear of 24 px). Reducing `px-2` does **not** help — the coarse variant overrides it.
Cheapest real fix is probably none of those: extend the fit gate to assert a _labelled_ floor under
coarse, so the next width decision is made with both pointers in view rather than one.

**CLOSED 2026-08-28 (correctness programme Phase 2) — re-measured under the wrap, and the defect
is gone with the mechanism that caused it.** Every figure above describes the width-ladder era:
ADR-0109 D1 deleted the ladder, the `⋯` and the eviction entirely — a command surface wraps, it
never hides — so nothing CAN leave the row under a coarse pointer any more, `next-conflict`
included. Measured in Chromium at 1646 with `hasTouch: true` against the same plan and build:
the command deck is **identical** fine vs coarse — 108 px tall, 25 buttons, 17 labelled, both
pointers — because the 32 px the coarse padding adds (visible on the mode row, 404 → 436 px) is
absorbed by the wrap's slack on the deck's existing lines. The worst coarse-pointer cost the
wrap model can now produce is one extra wrapped line on a fuller row, which is ADR-0109's stated
and accepted cost, not an eviction. The 2.5.8 geometry stays gated (`pointer-coarse:px-3` and
`TOOLBAR_CARET_TARGET` are live); the tooltip-primitive question this row's siblings raise stays
with #131/#204(a).

## 142. `<Link to="/orgs/$orgSlug/clients">` warns that the router matched a different template

**Status:** unverified · **Raised:** 2026-08-19 (ADR-0098 M2, seen in the base and overview journeys) · **Size:** S ·
**Risk if left:** low

Every navigation to the client list logs:

```
Generated path "/orgs/<slug>/clients/" for route "/_authed/orgs/$orgSlug/clients/$clientId"
matched route "/_authed/orgs/$orgSlug/clients" instead.
```

Five call sites use the identical `to` (`app-header.tsx:86`, `client-detail.tsx:38`,
`project-detail.tsx:61`, `plan-detail.tsx:58`, and now
`features/overview/components/OrganisationEmptyState.tsx`), so it is **pre-existing and general**,
not something this epic introduced — it surfaced here only because the overview journey is the first
to watch the console while landing on a fresh organisation.

**Navigation works**: the router lands on the list, which is why nobody has chased it. What it costs
is the console — a permanent warning on the commonest link in the product trains everybody to ignore
console output, which is exactly how the ADR-0074 CSP violation went unnoticed on the deployed origin
for a release.

**Not diagnosed yet, and the diagnosis is most of the work.** The message says TanStack resolved the
`to` against the `$clientId` template and then matched the parent — so the two templates are
generating the same URL, most likely because the child route's path segment allows an empty value.
The fix is either a route-tree correction or an explicit `from`, and which one depends on that; do
not guess.

## 143. The Project Explorer cannot open a client or a project — two of ADR-0029's three levels

**Status:** unverified

**CLOSED 2026-08-28 (correctness programme, Phase 1).** The row's own shape was followed: the
meanings are split rather than merged. `activate` — the name's click and the APG tree's Enter,
whose job is the default action — now navigates for **every** kind (client detail, project detail,
plan workspace); the row's remaining surface keeps the container toggle (the Q3 unit case passes
unchanged), and expansion keeps its dedicated keys (ArrowRight/ArrowLeft). The pointer handler sits
on an inner span sized to the TEXT, not on the `flex-1` wrapper — the wrapper stretches across the
row, so a handler there would have made most of the row's width navigate and inverted the rule in
the same commit that stated it. Regression test verified red against the pre-fix `activate`
(`HierarchyTree.test.tsx`, the #143 case); no journey clicks a container row to expand (checked,
not assumed — they use the action buttons and dialogs), so the blast radius the row predicted did
not fire. The Enter-semantics change is a tree keyboard-contract change, so the §19.13
accessibility review runs over it before the phase's release.

**Found 2026-08-19**, by the ADR-0097 Landing D1b sweep, and it is older than the milestone that
exposed it.

`features/navigator/components/HierarchyTree.tsx:208-219`:

```ts
const activate = (row: VisibleRow): void => {
  if (!row.node) return;
  if (row.node.kind === 'plan') {
    void navigate({ to: '/orgs/$orgSlug/plans/$planId', ... });
    onNavigate?.();
  } else {
    tree.toggle(row.node.id);
  }
};
```

A **plan** row navigates. A **client** or **project** row toggles its own expansion — which the
chevron beside it already does. So the rail ADR-0029 describes as the Client → Project → Plan
navigator can open exactly one of those three, and the client-detail and project-detail screens are
reachable only through the `Clients` destination and a scan down a list.

**Why it went unnoticed for so long, and why it is filed now.** Every surface that needed the hop
carried a breadcrumb, so the tree's hole was covered rather than absent. ADR-0097 D1b removed the
plan workspace's breadcrumb path as measured redundancy — correct about orientation, wrong about
navigation — and **three Playwright suites failed at once** (`programme`, `multi-select`,
`authoring-flow`), each on the same `getByRole('link', { name: 'Riverside' })` that had been the
breadcrumb. D1b restores a two-crumb trail, which closes the user-facing regression and leaves this
untouched.

**What it is not.** It is not "the tree should navigate on every row" — expanding a branch is the
right default for a container, and a row that both expands and navigates is a control with two
meanings. The likely answer is that the row's **label** becomes a link while the row keeps its
toggle, which is a change to a `treeitem`'s inner markup and to the roving-focus contract, so it
wants the APG's _Developing a Keyboard Interface_ read alongside it (the ADR-0082 precedent) rather
than a quick patch.

**Blast radius if fixed:** every journey that reaches a client or project through `Clients` could
then take the shorter route, so their locators would keep working; the risk is in the tree's own
keyboard model, not in its consumers.

## 145. A hand-rolled `Combobox` takes the platform picker away on touch, and nobody has measured what that costs

**Status:** unverified

**Raised 2026-08-19**, blocking the last two conversions of ADR-0097 Landing F1.

A native `<select>` gets the platform's own picker — the iOS wheel, the Android sheet. It is the
single best mobile control in the product and it is free. `components/ui/combobox.tsx` gets an
in-flow listbox competing with a virtual keyboard, and it is what F1's discriminator sends an
unbounded option set to.

**Two conversions are held on this and only on this.** `ActivityBreakdownField` (a plan's WBS
summaries) and `WbsBulkAssignBar` (the same set, from the bulk bar) both clear the rule — a plan's
summaries are bounded by nothing — and both live in the **activity editor**, which is reachable on a
tablet. The cross-plan Activity picker was converted because that dialog is a desktop workspace
flow; that is the whole of the distinction.

**Why it is filed rather than judged.** The failure is silent: a converted picker looks correct on
every desktop, and the only person who meets the worse control is on a device nobody tested. This is
`#133` one surface along — that row records that **no toolbar measurement in this repository has
ever been taken with a coarse pointer** because Playwright defaults to a fine one — but #133 is
about control _sizing_ in the toolbar, and this is about whether a _whole control type_ is the right
choice on touch. Different question, same blind spot.

**What would settle it.** A coarse-pointer run of the activity editor with both controls
(`hasTouch` + `pointer: coarse`, the shape `item-widths` used for #133), read by
`accessibility-reviewer` and `ux-reviewer` **before** either conversion — `migration.md` F1 names
that ordering and the reason for it. If the answer is that the combobox is worse on touch, the rule
gains a clause rather than an exception: a searchable picker on a surface a touch user reaches needs
a touch-appropriate presentation, not a desktop listbox.

**Measured 2026-08-19** (`apps/web/measure-toolbar/combobox-coarse.spec.ts`, Chromium with
`hasTouch: true` — which is what makes it report `pointer: coarse`, `any-hover: none` — at 1646 CSS
px, the Surface Pro width ADR-0091's retrospective established this product is judged at). The two
control types on **one screen**, so a difference cannot be the screen: the resource library's
native `Kind` filter, and the New-resource dialog's hand-rolled `Group` picker.

|                                      | native `<select>`                       | our `Combobox`                   |
| ------------------------------------ | --------------------------------------- | -------------------------------- |
| closed height                        | **36 px**                               | **36 px**                        |
| clears WCAG 2.5.8 (24 px)            | yes                                     | yes                              |
| clears the 44 px platform preference | no                                      | no                               |
| open list                            | platform-rendered, unmeasurable in-page | 138 px, 13 % of the viewport     |
| option height                        | —                                       | 32 px, every option clears 24 px |
| covers its own field                 | —                                       | no (588 px of space below it)    |

**CLOSED 2026-08-29 (ADR-0118 M3), by measurement rather than by argument.** This row's own
conclusion — "the 44 px line is missed by **both**, so it is a product-wide control-height question
(`--control-h`), not a reason to prefer one type over the other" — was exactly right, and giving
`--control-h` a `pointer: coarse` axis answered it for both at once. Re-measured on the same screen
with the same harness: the native `<select>` is **115 × 44** and the `Combobox` **303 × 44**, both
reporting `clearsPlatformPreference: true` where both previously reported `false`. Neither control
type is disadvantaged on touch, so the two held conversions have no coarse-pointer objection left.

The re-run also found the half nobody had asked about: the OPEN list's **options were still 32 px**,
and an option in an open listbox is a touch target like any other. Both the option rows and the
"Load more" row now carry the same coarse floor (`shortestOption` 32 → **44**, list height 138 →
186 px, still 17 % of the viewport). `Menu`'s items took it in the same pass — a menu is portalled
and only exists while open, so it is the one control class the epic's surface sweeps structurally
cannot see.

What this still does not answer is unchanged: Chromium renders its own picker rather than the
platform's, so how an iOS wheel or an Android sheet _feels_ against an in-flow listbox is a
judgement, and nothing here has been driven with a real virtual keyboard taking half the viewport.

<details><summary>The 2026-08-19 measurement, which set the question this row closed on</summary>

**On this evidence there is no coarse-pointer penalty to the two held conversions**, and the two
controls are indistinguishable closed. What the run **cannot** answer is unchanged and is why this
row is narrowed rather than closed: Chromium renders its own picker rather than the platform's, so
how the iOS wheel or the Android sheet _feels_ against an in-flow listbox is still a judgement, and
nothing here has been driven with a real virtual keyboard taking half the viewport. The 44 px line
is missed by **both**, so it is a product-wide control-height question (`--control-h`), not a reason
to prefer one type over the other.

**The run found a live defect, which is the more useful half.** Its first two versions each produced
a plausible number about nothing — `getByRole('combobox')` matches a native `<select>` (that is the
element's implicit role), so version one measured the org switcher twice; and the listbox is
deliberately always in the DOM (`hidden` when closed, so `aria-controls` always resolves), so
version two read a closed box as `listHeight: 0`. Fixing both left `optionCount: 1`, and the harness
now **throws rather than reporting a verdict it cannot justify** — the rule ADR-0097's closure
measurement earned by producing a PROCEED out of an `undefined`. The cause was in the product:
`CreateResourceButton` never passed `resources` to `ResourceFormDialog`, while `ResourcesTable`
passed its list to the same component on the edit path — so **the create dialog's Group picker could
only ever offer "No group (top level)"**, and a resource could not be filed into a group at the
moment it was created, only by editing it afterwards. It rendered, it looked right, and no unit test
covered the host. One correct pattern applied to one neighbour and not the other — the ADR-0064 §7
shape, and the fifth epic running. Fixed with a regression test verified red first
(`CreateResourceButton.test.tsx`).

</details>

## 149. The Graphite M10 gate pass's non-blocking findings

**Status:** unverified

**Raised 2026-08-20.** Five specialists over the ADR-0099 epic diff. Security and
frontend-performance passed outright, both having re-derived the epic's own numbers from the code
rather than trusting them (performance built both refs: **+1.9 kB gzip JS** for 163 files, and the
painter untouched, so TECH_DEBT #75's known overage is not attributable here). Component,
accessibility and UX each blocked, and every blocking finding was folded with a regression test
verified red first. What follows is what was deliberately **not** folded, with the reason.

- **`MenuItem.itemId` bakes toolbar vocabulary into a general primitive.** It emits the literal
  `data-toolbar-item`, and nine of `Menu`'s ten consumers are not toolbars. Kept as-is: the
  alternative is a name-agnostic passthrough, which is a wider API for one caller, and renaming it
  `toolbarItemId` would make the attribute and the prop disagree. Revisit when a second, non-toolbar
  consumer wants a stable per-row locator — that is the point at which the generic shape earns its
  keep rather than being speculative.
- **Nested landmarks share a name.** With the Explorer subject showing, `<aside aria-label="Project
Explorer">` wraps `<nav aria-label="Project Explorer">`, so a rotor lists the same words twice. Not
  a WCAG failure. The fix is a prop telling `NavigatorRail` it is hosted rather than freestanding,
  which is a change to a component eight screens render for a duplication on one.
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

## 150. The drawer overloads "Close", and the editor's Close leaves an empty panel open

**Status:** unverified

**CLOSED 2026-08-28 (correctness programme, Phase 1) — overtaken, verified rather than assumed.**
ADR-0101 (2026-08-21, the day after this was raised) returned the activity editor to `modalShell`,
so the state this row describes — an editor in the drawer with its own second "Close" — is
unreachable: the editor's drawer chrome and its "Select an activity to see its details here" empty
state have **zero** matches in `apps/web/src`, `registerDrawerSubject` has no production caller
(#156), and the only surviving control is the chrome's `Close context drawer` ✕, which has nothing
left to be confused with. Closed on those greps, not on the ADR's say-so.

**Raised 2026-08-20** (reconciliation pass, step 7 — ux review of the post-M10 diff). **Size:** S.

The context drawer carries two controls whose names both begin with "Close", in one panel, doing
materially different things:

| Control                               | Where              | What it does                                                                                                   |
| ------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------- |
| ✕ `aria-label="Close context drawer"` | the chrome, top    | Collapses the whole panel. Both subjects become unreachable until the rail is pressed again.                   |
| `Close` (text button)                 | the editor, bottom | Clears the editor intent only. The panel **stays open**, showing "Select an activity to see its details here." |

Neither loses work — the editor's form state lives above the `shell()` call and survives its portal
target going away, which `ActivityEditor.drawer-chrome.test.tsx` pins. So this is a discoverability
gap rather than a risk, and it is **not** a WCAG failure: the accessible names differ.

**What makes it worth a row** is that a planner arrives from the modal, where one "Close" dismissed
the whole thing. In the drawer the editor's Close leaves an empty panel sitting where the diagram
used to have room, which reads as a control that half-worked.

**Two candidate fixes, and the choice is a product one.** Rename the chrome control so it does not
overload the word (`Hide panel` / `Collapse drawer`); **or** have the editor's Close also collapse
the drawer when nothing else is registered to show, which matches the modal's mental model and costs
the planner the panel when they might have wanted the Explorer back in it. Not folded in the pass
because it is copy-and-behaviour rather than a defect, and the product owner has a view on both.

## 151. The Gantt grid splitter has no browser-level coverage

**Status:** unverified

**Raised 2026-08-20** (reconciliation pass, step 7 — component review). **Size:** S.

`grid-width.structural.test.ts` pins the arithmetic — the columns fill the pane exactly at and above
the floor, `name` absorbs the difference, and only the two pure helpers may read the intrinsic width.
Nothing drives the **splitter**: checked, and `e2e-gantt` and `e2e-gantt-editing` contain no
reference to the separator, the pane width or a column resize.

That matters here more than it usually would, because the defect this arithmetic exists to prevent
is a _picture_ one — ADR-0095 shipped a `GRID_WIDTH` literal that disagreed with its own columns and
painted Float over the chart, and the first version of this splitter reproduced it at a guessed
180 px floor. Both were found by looking at a browser, and neither would have been caught by the
structural test that now guards the sums.

**What is owed:** one journey assertion in `e2e-gantt` that drags the separator to its floor and
checks the chart's left edge equals the grid's right edge. `PanelResizer` is `role="separator"` with
`aria-valuenow`, so it is drivable by keyboard without a pointer gesture.

**How this row came to exist** is worth one line: the structural test's own docblock said the
browser-level proof "belongs to `e2e-gantt`", which reads as coverage held elsewhere. It was not
checked when written.

## 152. `zoomToSelection` frames the time axis and discards the lane axis

**Status:** unverified

**CLOSED 2026-08-28 (correctness programme, Phase 1) — candidate fix (a), command-local.** The
reveal arithmetic is extracted from the selection-reveal effect to a pure `revealOffset` in
`render/viewport.ts` (one implementation, the ADR-0065 rule — the row's fix (b) would have touched
`fitToContent`, which is also Fit-to-plan and the export framing), and `zoomToActivity` repairs the
lane axis after the fit with the same function the effect uses. Pinned by
`viewport.reveal.test.ts`, whose last case composes `fitToContent` + `revealOffset` on the row's
own numbers — a lane-273 bar in a 900 px viewport lands inside the margins after the repair, where
the unfixed command left it ~6,800 px below the window. One correction to this row itself: it says
the probe is "kept with this row", and `m0-t5-zoom-probe.mjs` no longer exists anywhere in the
repository — the claim was stale when re-read, so the closure proof is the composed unit case
rather than a probe re-run.

**Raised 2026-08-20** (minimap epic, M0-T5 — filed rather than absorbed). **Size:** S.

`zoomToActivity` is deliberately `fitToContent` handed a one-element array
(`TsldCanvas.tsx:1015-1044` — its own comment says a parallel implementation would drift).
But `fitToContent` computes `maxLane` and never uses it, pinning `originY` to the padding
(`render/viewport.ts:161,168,178`) — right for whole-plan Fit at lane 0, wrong for one
activity in lane 273. The selection-reveal effect pans vertically on **selection change**
only, so nothing repairs the framing after the command resets it.

**Proven live** (M0-T5 probe, 2026-08-20, seeded 2,160-activity plan packed to 274 lanes,
target activity in lane 273, viewport read through the M0 probe's live-view mirror):

- after selecting the bar: `topLane 242.8, visibleLanes 32, visible: true` — the reveal
  effect works, the gap is narrower than "zoom to selection does not reveal";
- after pressing **Zoom to selection**: `topLane −1.1, visible: false` — the command
  announced "Zoomed to Activity A01928" while scrolling it **out** of view.

**Two candidate fixes**, both outside the minimap epic because `fitToContent` is also
_Fit to plan_ and the export framing: (a) `zoomToActivity` restores the vertical reveal
after the fit (re-run the reveal for the current selection — smallest, command-local);
(b) `fitToContent` gains an opt-in "centre the lane span" parameter that only
`zoomToActivity` passes (touches the shared seam, needs the three call sites' suites as
the oracle). The probe (`m0-t5-zoom-probe.mjs`, method recorded in
`docs/specs/tsld-minimap/m0-measurement.md`) is kept with this row, not merged as a gate.

## 153. THREE icon sizes in one family of canvas panels, not the two this row named

**Status:** unverified

**Raised 2026-08-21** (minimap M2/M4, beside #127). **Size:** S.

The minimap's close is the new `icon-lg` (44 px) because `docs/UX_STANDARDS.md` sets that
floor for a NEW close/toggle affordance and a one-off `className` is banned. The Legend —
the other floating panel, sometimes parked in the same corner — closes with `icon-sm`
(28 px, `TsldLegendPanel.tsx`). The inconsistency is **recorded rather than propagated**:
mass-migrating existing 40 px/28 px icon buttons is #127's scope, and doing it as a
side-effect of the minimap would have put a dozen unrelated screens on this diff. What is
owed: when #127 is picked up, the Legend's close moves to `icon-lg` in the same pass.

**Re-derived 2026-08-29 (ADR-0118 M0-T4) and the row understated itself.** It describes _two_
buttons at two sizes. The tree holds **three** sizes in the same family of floating canvas panels:
`TsldLegendPanel.tsx:166` `icon-sm` (28), `TsldMinimap.tsx:375` `icon-lg` (44), and
`TsldViewControls.tsx:92,98` `icon` (40) — the third never mentioned here at all, which is why a
reader picking this row up would have fixed two thirds of it and believed they were done. Written
down because a row that names its own subject incompletely is the same defect class as one whose
numbers have gone stale (#133), and only the second kind gets noticed.

**CLOSED 2026-08-29 (ADR-0118 M3) — and NOT the way this row and the epic's own plan said.** Both
said the Legend's close moves **up to `icon-lg` (44)**, and the plan extended that to all three.
That instruction was written before ADR-0118 **D2**, which narrowed the 44 px house rule to
`pointer: coarse` — so following it would have applied a rule the same epic had already withdrawn,
costing every fine-pointer planner 16 px of floating-panel chrome for no accessibility gain (28 and
40 both clear the AA floor, and all three reach 44 under coarse through `--control-h` regardless).
The §19 rule is to re-verify a plan's **problem**, and here it was the plan's **remedy** that had
gone stale against its own epic three milestones later.

So all three unify **downward-compatibly on `icon`** — 40 px fine, 44 px coarse — and `icon-lg` is
**deleted**: its docblock cited a `docs/UX_STANDARDS.md` floor that ADR-0118 M1 had already
rewritten, and it had exactly one consumer, which was the odd size out. A variant kept for a rule
that no longer exists is this register's own drift class, living in the design system rather than
in prose.

The row's third correction stands and is worth keeping: the zoom steppers are a **stepper pair**,
not a close affordance, so "three sizes in one family" was really two closes at two sizes beside an
unrelated control class. Both closes now assert the shared size in their own suites, so they cannot
part company again.

## 154. Minimap M4: the two "reasoned, not observed" AT verifications remain owed

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

## 155. The minimap M4 gate pass's non-blocking findings

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

## 156. The drawer-subject mechanism has no registrant

**Status:** unverified

**Raised 2026-08-21** (ADR-0101). **Size:** M to delete, or it becomes ADR-0097 D2's foundation.

The activity editor was the only caller of `useDrawerSubject`, and ADR-0101 moved it back to a
modal dialog. So `drawer-subject.tsx` (273 lines), its rail button, its `show`/`focusRailButton`
controls and `ContextDrawerEmpty` are now unreferenced by production code — the plan workspace
runs the null-registration path every other route already ran. The drawer itself is very much
alive: it holds the Project Explorer.

**Kept rather than deleted, and this row is the reason it is not silent.** ADR-0097 D2 — a
docked activity editor with its own epic and its own design pass — is still on `docs/BACKLOG.md`
and this is precisely the foundation it would build on. The mechanism is self-contained and has
its own tests, so the carrying cost is low.

**Two exits, and one of them has to be taken.** Either D2 is built and this earns its place, or
D2 is closed as "not wanted" and all of it is deleted — `CLAUDE.md` §5 is unambiguous that dead
code goes and git remembers. What is not acceptable is the third thing, which is this row never
being looked at again: an unused branch nobody maintains is the second product ADR-0088 was
written about.

**Related, and the sharper half:** `drawer-entry-point.test.tsx` mounts a synthetic `ProbeRoute`
that registers a subject, so it stayed green through the removal of the only production
registrant. It proves the shell _can_ show a subject; it never proved anything does. Its
docblock now says so. That is ADR-0081's shape one level along, and worth remembering when
reading any "the entry point works" test.

## 160. `resolveLensPalette` is resolved twice per cycle

**Status:** unverified

**Raised 2026-08-21** (ADR-0102's performance gate). **Size:** XS.

`TsldPanel.tsx` calls `resolveLensPalette(canvasSurface)` twice — once for the bar fills and once
for the bar inks — so every `getComputedStyle` read in that resolver happens twice. Pre-existing
duplication; ADR-0102 mildly compounds it by taking the WBS ramp from 5 members to 12, so the reads
per resolve cycle go from 20 to 48.

**Not blocking, and the reason is the call site rather than the count**: both calls sit inside
`useMemo`s keyed on `[colourMode, activities, themeVersion, canvasSurface]`, so they fire on a
user-triggered lens or data change and never per render or per frame. `resolveLensPalette` appears
nowhere in `paint.ts` or the rAF loop.

The fix is to pull one resolve into a single `useMemo` and derive both maps from it. Worth doing
when that file is next open; not worth a commit of its own.

## 161. Four screens the harness photographed for the first time, and one question for the product owner

**Status:** unverified

**Raised 2026-08-21** (ADR-0102's UX gate). **Size:** S each, none blocking, none introduced by the
light theme — they became visible because the shot list went 12 → 25 and started covering states
nothing had ever looked at.

**a. The empty-state pattern is inconsistent.** `org-home-empty` uses icon + heading + explanation +
action, which is the documented archetype. `resources`, `calendars` and `recently-deleted` render
text-only inside a dashed box with no icon and the create action at the header instead. Pre-existing;
pick one and apply it.

**b. `clients-loading` is a bare spinner** where `docs/UX_STANDARDS.md` expects a skeleton. Also
pre-existing, and only visible now because the loading state had never been captured.

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

## 162. The legend's slack chip does not match what the canvas paints

**Status:** unverified

**CLOSED 2026-08-28 (correctness programme, Phase 1).** The swatch names `--primary` + `--border` —
what the painter actually draws the chip with (`palette.bar` / `palette.barStroke`, confirmed at
`palette.ts` rather than recalled) — with the reason `--card` could never work kept in the
swatch's own comment: ADR-0097 made `Card` a reset, deliberately outside the canvas scope's rebind
closure, so even a correctly-scoped legend resolved it to the page's card colour.

**Raised 2026-08-21** (ADR-0102's component gate). **Size:** XS. **Pre-existing** — the light theme
only re-pointed its token names, it did not introduce the mismatch.

`TsldLegend.tsx:399-407` draws the link-slack chip from `--card` and `--border`. The canvas draws the
real one from `palette.bar` and `palette.barStroke` — `--primary` and `--border`
(`render/paint.ts:1493-1499`). So the legend's swatch is a different colour from the thing it
describes.

**`--card` is the interesting half.** ADR-0097 made `Card` a **reset** rather than a scope member, so
`--card` is deliberately absent from the canvas scope's rebind closure — which means that even inside
`<Surface tone="canvas">` it resolves to the page's card colour. The legend is now correctly scoped
(ADR-0102 D5) and this one swatch still cannot follow, because the token it names was never part of
the family. Naming `--primary` is the fix; the wrapper is not.

**Correction, same day (§19.13 gate):** "the legend is now correctly scoped" was true of the
**guest view's** legend only — ADR-0102 D5's wrapper sits in `TsldPanel`'s `!chromeless` branch,
and the authenticated workspace renders the floating `TsldLegendPanel` as a **sibling** of the
canvas surface, outside any `[data-surface="canvas"]` element. So in the workspace every swatch
`var()` resolved the PAGE family while the painter draws the PLOT family — the token rename alone
would have swapped an invisible swatch for a wrong-hued one. The panel's key now takes the same
`Surface tone="canvas" className="contents"` wrapper (the `TsldPanel.tsx:2522` precedent), pinned
by a structural seam test verified red against the unwrapped panel; the card's own chrome stays
page-scoped deliberately. The mechanism is the validated one — the swatches read `--primary`
directly (custom properties inherit through the rebind), not the frozen `@theme inline` aliases
that defeated the painter in ADR-0102.

## 165. Five screens photographed for the first time, and what they showed

**Status:** unverified

**Raised 2026-08-22** (W1 of the post-theme consolidation). **Size:** S each. **(a) is CLOSED
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

## 166. A whole-plan export of a long programme loses weekends entirely

**Status:** unverified

**Raised 2026-08-22** (TECH_DEBT #164's remaining half, identified by the accessibility review of
the W3 plan). **Size:** S–M. Filed separately because it is a different defect from #164: that row
was about layers the export never composed, and this is about a layer it composes and then culls.

**CLOSED 2026-08-28 (correctness programme Phase 3).** `paintScene` gains an options seam
(`minNonWorkingPx`) and the export passes `0`: below the screen's 3 px/day floor the wash paints
as **merged runs** — a weekend is one crisp band, never two sub-pixel blends — and the sub-floor
branch is unreachable with the option absent, so the live painter is byte-identical (the golden
log did not move). One detail below has changed since this row was written: ADR-0109 D4 deleted
the hatch, so the flat wash (`--canvas-nonworking`, a real value now) is the only weekend channel
on paper — which made the cull worse than this row describes, not better. Regression pinned in
`paint.test.ts` (verified red against the option-ignoring painter, and its own first assertion
corrected: an edge-clipped weekend legitimately fills one day) and in
`render-export-image.test.ts` (the override reaches the painter).

`paint.ts` paints the non-working wash and its hatch as **one `fillStyle`**, and culls both below
`NON_WORKING_MIN_PX = 3`. An export can frame the **entire plan** rather than a viewport, so on a
long programme the per-day width falls under that floor and weekends disappear — not degraded,
absent.

**Why it matters more on paper than on screen**, which is the whole reason it is a row rather than
a note: on screen a planner who cannot see the weekends zooms in. A sheet of paper has no zoom.
And on paper the wash carries no colour signal of its own (~1.11:1 against the ground), so the
hatch is the **sole** channel for weekend indication — culling it removes the only one.
`token-contrast.test.ts`'s existing WCAG 1.4.1 exemption for the wash was written for the screen,
where the wash carries some signal and the hatch is a second channel; that premise does not hold
here, and `print-palette.structural.test.ts`'s docblock now says so.

The plan's CQ-2 deferred this as "exactly as on screen at the same scale". The artefact is not the
screen, and this is the one place that distinction bites. Not addressed in W3-M2, which restored
the layer rather than changing how it culls.

## 167. The exported diagram is the default picture, not the planner's picture

**Status:** unverified

**Raised 2026-08-22** (the W3-M2 component review). **Size:** M. The spec's CQ-5 promised this row
and it was never filed — the enumeration lived only in a `SCREEN_ONLY` record whose reasons were
partly wrong, which is the opposite of a durable record.

**CLOSED 2026-08-28 (correctness programme Phase 3).** All five LENS keys now export as shown:
`TsldCanvasHandle` gains `getSceneLenses()` — a pure read of `barFill`, `barInk`, `flaggedIds`,
`baselineGhosts` and `dimmedIds` off the LIVE scene ref, so the deliverable is the planner's
picture **by the one derivation the screen uses**, never a second one that agrees until it does
not (the ADR-0065 rule). The composer's call is optional (`?.()`), so a partial handle degrades
to the default picture rather than crashing an export — and because that tolerance would let
"lenses flow" and "lenses silently dropped" share a green, the pdf suite pins a distinctive lens
set end-to-end into the scene `renderExportImage` receives. The five entries left `SCREEN_ONLY`,
which turned the parity gate into the red-first proof: it named exactly the five missing keys
against the pre-fix composer. Interaction state (selection, hover, drags) stays screen-only —
a delivered picture has no cursor. **One suggestion from the phase's ux gate is filed rather than
built**: the Export menu gives no cue that an active lens will shape the deliverable (its copy is
static whichever picture is about to be produced), so a planner isolating a subnetwork for their
own analysis could hand a client the isolated picture unreminded. Defensible as-is — the behaviour
matches US-2's own contract and lens state is session-local, never persisted — so an export-menu
indicator is a design-pass item, not a correctness fix.

#164 restored the seven layers the export never composed. **Five more keys it does not compose are
lens state**, and they are a different question: not "a layer nobody wired up" but "whose picture is
the export". `feature-spec.md` US-2 words it as _the export is my picture rather than a fixed one_.

| key                  | what it actually is                                        | consequence today                                                      |
| -------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| `barFill` / `barInk` | the **Colour-by** lens (`TsldPanel.tsx:1091-1100`)         | a planner colouring by resource exports a criticality-coloured picture |
| `flaggedIds`         | the **over-allocation** highlight, ADR-0041 (`:1143-1146`) | over-allocated bars carry no badge in the deliverable                  |
| `baselineGhosts`     | the baseline variance ghosts                               | a plan with a baseline set exports without its variance                |
| `dimmedIds`          | filter **∪ isolate ∪ float-path** dimming (`:1076-1085`)   | an isolated subnetwork exports as the whole plan                       |

**Three of those descriptions replace wrong ones.** `barFill`/`barInk` were recorded as a live drag
preview and `flaggedIds` as the conflict cycle; neither is gesture-scoped, both are persistent view
modes. A wrong reason is worse than a bare absence, because it closes the question — which is
exactly what happened for as long as the record said "drag preview".

**Not simply a matter of adding four keys.** `dimmedIds` unions three sources with different
intents — a _filter_ is a search, but _isolate_ and _float-path_ are deliberate framing acts a
planner performs in order to show something, so the honest default may differ per source.
`baselineGhosts` is the one a planner is most likely to expect and the most work: it needs
`varianceRows` threaded and re-derived against the export viewport, the way `wbsBandBars` already
is. That is why it is deferred rather than done — but deferred with the enumeration attached, which
is the part CQ-5 called durable and did not deliver.

## 169. The Project Explorer's actions row duplicates its writer gate in two branches

**Status:** open · **Raised:** 2026-08-22 · **Size:** S

> **Corrected by the 2026-08-30 verification sweep, and the correction is this row's own warning
> landing on it.** It was raised saying #165a's wording "will otherwise read as closed when it is
> half closed" — and the sweep's first pass reported _this_ row as fixed. It is half fixed, and the
> halves are not the ones the row predicted.
>
> **The empty strip is gone, incidentally rather than deliberately.** ADR-0109 D2 docks the Explorer
> and gives it a fold-to-spine control, and that control lives in this actions row
> (`navigator-rail.tsx` — `Hide Project Explorer`, `ml-auto`). So the drawer branch has a permanent
> occupant and is no longer "40 px of bordered nothing" for anybody; the below-`lg` branch renders
> `SheetHeader`, which carries a Close regardless. **Nothing was done about this defect — a feature
> was added on top of it**, which is why no commit closed the row and why the fix has no test.
>
> **The second observation is still true, verbatim.** The `crud.canWrite` block is duplicated at
> `navigator-rail.tsx:95` and `:139` — same gate, same button, same four-paragraph comment, twice —
> and the row's reason for noting it is unchanged: the neighbouring copy is exactly how #165a
> happened. That is what remains owed here, and it is now the _whole_ of what this row is about.
>
> **Worth keeping for the method rather than the defect.** A subagent sweep reported this row FIXED
> and it was not; six sibling closures in the same batch were verified and held. Spot-checking the
> claim you are about to act on is the cheap step, and a report about the register is a document
> like any other (ADR-0076 Class 2).

**Raised 2026-08-22** (found while fixing #165a). **Size:** S.

`navigator-rail.tsx` gives the Explorer a 40 px actions row below the drawer's header, whose only
child — the **New client** button — is gated on `orgSlug && crud.canWrite`. For a Contributor or a
Viewer the gate is false, and the row renders anyway: 40 px of bordered nothing above the tree, on
every organisation route, for every reader who cannot create a client.

#165a removed it from the three org-less routes by removing the whole rail there, and that row's
own wording ("above an EMPTY 40 px actions row") will otherwise read as closed when it is half
closed. The remaining case is the role one, which is the commoner of the two.

ADR-0082's rule points at omission rather than shading: there is no action to shade — the row is a
container whose contents are absent, not a control that is shut. The empty container is the thing
to remove, on the same clause as "a menu whose every item would be shaded renders no trigger".

Note the shape before fixing: the row is rendered twice, once in the below-`lg` `SheetHeader`
branch and once in the drawer branch, with the same gate duplicated. Whatever the fix, it wants to
be one derivation rather than two — the neighbouring copy is exactly how #165a happened.

## 170. Three axe scans run every rule, because `.options()` replaces `.withTags()`

**Status:** unverified

**Raised 2026-08-22** (found while closing #165a). **Size:** S.

`@axe-core/playwright`'s builder is not a merge. `dist/index.js:170-172` is
`options(options) { this.option = options; return this; }` — a **wholesale replacement** — while
`withTags()` (`:195-202`) works by assigning `this.option.runOnly`. So the natural-looking spelling

```ts
new AxeBuilder({ page })
  .withTags(['wcag2a', 'wcag2aa', …])
  .options({ rules: { 'target-size': { enabled: true } } })
```

**discards `runOnly` entirely** and axe runs every rule it has, `best-practice` and `RGAA` ones
included. Three shipped suites have exactly that shape:

- `apps/web/e2e-gantt-editing/object-actions.spec.ts:153-154`
- `apps/web/e2e-minimap/minimap.spec.ts:103-104`
- `apps/web/e2e-toolbar-fit/fit.spec.ts:742-743`

All three pass, and only because each `.include()`s a narrow subtree where the extra rules happen
not to fire. Nothing is currently broken — the defect is that **their `withTags` line does not
describe what they scan**, so a reader (or a future edit that widens the `include`) is working from
a false statement about the suite's own scope. Found by writing that spelling in `e2e-shell` without
an `.include()` and getting a `region` violation, a rule in none of the six requested tags;
confirmed by reading the package rather than inferring it from the symptom, and the claim is
registered in `scripts/dependency-claims.json`.

The fix is one `options()` call carrying both, which `e2e-shell/org-less-screens.spec.ts` now uses:

```ts
.options({
  runOnly: { type: 'tag', values: [/* … */] },
  rules: { 'target-size': { enabled: true } },
})
```

Verified by probe that this evaluates `target-size` and does **not** evaluate `region` — asserted
against `results.passes ∪ violations ∪ incomplete ∪ inapplicable`, because a rule that is disabled
and a rule that passes are indistinguishable from `violations` alone, which is how the no-op
inclusion survived in the first place.

**Not fixed in the three siblings here**, deliberately: correcting them NARROWS what they scan (from
every rule to six tags), which is a coverage change on three suites in a PR about the app shell. Each
is a one-line edit and none should change colour.

**CLOSED 2026-08-28 (correctness programme Phase 4).** The siblings are **two, not three** — the
third (`e2e-toolbar-fit/fit.spec.ts`) was deleted whole with the width ladder (ADR-0109 D1), which
this row could not have known. `e2e-gantt-editing/object-actions.spec.ts` and
`e2e-minimap/minimap.spec.ts` now carry the single-`options()` shape with the reason at each site.
Both previously passed while running MORE rules than they claimed, so the narrowing cannot turn
either red; what changes is that "the scan is green" now means what its docblock says it means.

**Two gate findings came out of the same thread and ARE fixed**, both in `scripts/check-claims.mjs`'s
neighbourhood:

1. The citation walk covered `apps/web/src` and **none of the 39 journey directories**, so a claim
   about a dependency's internals made in a Playwright suite was invisible in both directions — it
   could not be registered, and it could not be noticed going stale on a bump. That is the ADR-0077
   M0 blind spot one directory along, and the file's own reasoning for including `scripts/` ("a
   harness is one of the likeliest things in the tree to rest on a dependency's internals") applies
   verbatim to a journey. Measured before adding, the way `packages/` was: the 39 directories turn up
   exactly two refs, both already registered — so it was free. One of them had been citing from an
   unscanned directory the whole time.
2. `installed()` resolves a package by scanning pnpm's content-addressed store, so an **orphaned**
   copy left in `node_modules/.pnpm` by an earlier install shadows the one the workspace actually
   links. Locally this reported `@axe-core/playwright@4.12.1` while `apps/web/node_modules` linked
   4.13.0 and `pnpm-lock.yaml` pinned only 4.13.0 — a version nothing in the tree referenced. It is
   benign on CI, which installs fresh, and it is **not fixed**: the resolution is shared by all 51
   claims and changing it to follow the link graph is a change to a gate this register depends on.
   The consequence to know is that on a developer's machine this gate can watch the wrong copy, so a
   local green is weaker evidence than a CI green.

## 171. `schedulepoint-active-org` is never cleared, and carries no user id

**Status:** unverified

**Raised 2026-08-22** (found by the #165a spec check while costing a rejected option). **Size:** S.

`apps/web/src/lib/active-org.ts` writes and reads `schedulepoint-active-org` in `localStorage` and
**nothing ever removes it**. Sign-out sweeps its sibling — `forgetAllForUser` clears the
`recent-plans` entries (`features/auth/api/use-session.ts`) — and does not touch this one. The key
also carries no user id, where `recent-plans` deliberately does.

**That is ADR-0098's own rule, decided the other way by accident rather than by argument.** That
milestone keyed its store by user id and swept it on sign-out for stated reasons: a rename should
correct itself, a plan the reader has lost access to should disappear rather than 404, and one
person's history must not become another's on a shared browser. Every one of those reasons applies
to the active organisation.

**It is not a data leak, and the row should not be read as one.** The slug is a name, not a
credential; the home resolver validates membership through `ensureOrgMembership` and the API 404s a
non-member, so the next signed-in reader is bounced to their own organisation. What survives
sign-out is a previous account's organisation **name**, briefly, on a shared machine — and a
resolver round-trip nobody needs.

The fix is the shape `recent-plans` already has: key by user id, and sweep on sign-out beside it.
Both halves in one change, since keying without sweeping leaves orphans and sweeping without keying
still shows the wrong slug to a second reader in the same session.

## 172. No authenticated journey has ever run below `lg` — the shell's narrow half is unexercised

**Status:** unverified

**Raised 2026-08-22** (found while scoping #168). **Size:** M if actioned. **Filed, deliberately not
scheduled** — the product owner's call, and the right one: they work at 1646 px, so nothing is
failing for the person actually using the product.

**Measured, not impressionistic.** Every one of the `playwright.*.config.ts` files that sets a
viewport sets one at **1440 px or wider**; the rest inherit Playwright's 1280 default. The `lg`
breakpoint is **1024**. So **no authenticated journey has ever driven the app below `lg`.** The only
suite that sweeps narrow viewports is `e2e-public`, and its subject is the six **unauthenticated**
screens.

**What that leaves untested**, all of it live code with explicit breakpoint branches:

- the off-canvas `Sheet` that IS the Project Explorer below `lg`, and the header hamburger that
  opens it — a whole navigation surface no browser has ever opened;
- `app-header.tsx`'s below-`lg` row, which renders a second `BrandLink`, the org switcher and the
  account chip;
- every `hidden lg:flex` / `lg:hidden` branch in the shell, including the drawer column whose
  invisibility below `lg` is the entire premise of **#168**;
- the `useMediaQuery(LG_QUERY)` transition effect that closes the sheet on crossing the breakpoint.

**Why it is worth a row even unscheduled.** #168 was found by _reading_, which is not a repeatable
method — the register's standing position (ADR-0058) is that what can be checked should be. A defect
in any of the above ships silently today, and the next person to notice the gap would re-derive it
from scratch. It is also the same shape as `docs/TECH_DEBT.md` #133, which records that a
coarse-pointer run had never been taken in this repository until ADR-0091 M7 took one and
immediately found Row 2 losing all nine labels.

**Two honest options when it IS actioned**, and they point in opposite directions:

1. **Cover it** — a narrow-viewport authenticated journey. Note this fires ADR-0105's Playwright-config
   trigger, so it needs a spec and plan before code, whatever its size.
2. **Decide below-`lg` is not a supported surface for the authenticated app, and write that down.**
   That is the honest alternative rather than the lazy one: an untested branch is a promise the
   product has not verified, and ADR-0088's argument about unexercised alternative surfaces applies
   one layer along — a second layout nobody verifies is maintained on every change to the code
   around it, forever.

Do not read this row as "narrow viewports are broken". Nothing here says they are; it says **nobody
knows**, which is the point.

**CLOSED 2026-08-28 (correctness programme Phase 2) — option 1, and the row's warning was right.**
`apps/web/e2e-narrow-shell/` (`docs/specs/narrow-shell-journey/`, its own CI step, spec written
first per this row's own ADR-0105 note) drives the sheet, the hamburger, the breakpoint crossing
in both directions, the below-`md` facts fallback and an axe scan at 390 × 844. **Its first run
found the sheet had no ground at all**: the workspace redesign moved the rail's `Surface` out to
its containers and only the docked `ExplorerColumn` got one — `Sheet` is `bg-transparent` by
design, so below `lg` the Explorer painted its rows straight over the page (measured in Chromium:
dialog and nav both `rgba(0, 0, 0, 0)`), while the rail's own docblock claimed the Sheet owned
the scope. Fixed at the call site with the `ExplorerColumn` pattern, pinned red-first in
`app-shell.test.tsx` — and the phase's ux gate caught that sentence overclaiming: the first fix
copied only the GROUND half of the pattern, omitting the `border-border border-r` trailing edge
every `panel`-tone consumer carries, so the panel's edge faded into the scrim. Both halves now
applied — the claim matches the code because the code was finished, not because the sentence was
softened (ADR-0076). The run also corrected the journey's own first draft: creating the plan at
a wide viewport auto-expands the path to it (reveal-on-create persists per organisation), so a
blind container click COLLAPSES the branch — the spec now reads `aria-expanded` before clicking,
with the reason recorded in the file.

## 173. The canvas painter draws every glyph in a typeface the product does not use

**Status:** unverified

**Raised 2026-08-22**, found while measuring for #148 rather than reported.

`LABEL_FONT` (`apps/web/src/features/tsld/render/geometry.ts:254`) is

```
11px system-ui, -apple-system, 'Segoe UI', sans-serif
```

and names **Space Grotesk nowhere**. Measured in Chromium, the ruler one pixel above the canvas
resolves `normal 400 12px/12px "Space Grotesk", ui-sans-serif, system-ui, …`, and
`apps/web/src/styles/globals.css` carries two real `@font-face` blocks for it (`:55`, `:66`) with
the stack declared at `:893`.

So every activity name, every date label, every lag chip and every pill on the primary surface — the
one this product exists to be — is set in whatever `system-ui` resolves to on the reader's machine,
while the entire rest of the application is set in the face somebody chose. On this container that
is a difference of about 4 px of width per short label; on a reader's machine it is a different
typeface, silently.

**It is not a regression and nobody has done anything wrong.** `LABEL_FONT` predates the typeface
decision; ADR-0097 recorded that the product had never chosen one (`globals.css:278` opened with
`'Inter'` and there was no `@font-face` anywhere), and when that was fixed the canvas was not in the
diff, because the canvas resolves nothing from the cascade — it is the same seam ADR-0102 found when
`resolveTsldPalette` turned out never to have reached the canvas surface scope. **One layer of the
product opts out of the cascade, so every cascade-level decision has to be applied to it by hand,
and nothing says so.**

**What actioning it costs, honestly.** `LABEL_FONT` is a fixed string on purpose
(`render/measure.ts:4`: "a given string always has one width"), and `paint.golden.test.ts` records
every `ctx.font` write, so changing it re-baselines the golden oracle — the one gate whose docblock
names thoughtless re-baselining as the ADR-0034 failure. It also changes every label width on the
canvas, which the ADR-0054 date-label level-of-detail rule and the ADR-0052 lag anchoring both
consume. That is a measurable, contained epic, not a constant edit.

**A web font also introduces a failure mode the canvas does not have today.** `system-ui` is
available at the first frame; a `@font-face` may not be, and a canvas does not re-paint when a font
finishes loading the way DOM text re-flows. Whoever picks this up needs `document.fonts.ready` in
the paint path, or the first draw of every session is in the fallback face.

**Not scheduled.** The three marks #148 moves to DOM pick up Space Grotesk incidentally, which
narrows the inconsistency without addressing it; that is a side effect, not a fix, and it is
recorded so the next reader does not mistake it for one.

**CLOSED 2026-08-28 (correctness programme Phase 3) — and this row itself had gone stale in the
way it warns about**: the product's face is no longer Space Grotesk but **IBM Plex Sans** (the
workspace redesign, 2026-08-24, self-hosted for GDPR reasons), and nothing updated this row when
the face changed — the exact "cascade-level decision applied by hand to the layer that opts out"
failure, one document over. `LABEL_FONT` now leads with the product's face, and the family is
**derived, not remembered**: `label-font.structural.test.ts` parses `--font-sans` out of
`globals.css` and asserts `LABEL_FONT` carries its leading family, so the NEXT face change fails
a gate instead of shipping a third era of the drift (verified red against the `system-ui`
constant). The two costs this row priced were both paid as it said: the golden oracle was
re-baselined and audited line by line — the diff is exactly the two `font=` lines and nothing
else — and the load race is handled at both ends: the shared width memo gains `clear()`, busted
once on `document.fonts.ready` (a fallback-face width would poison the memo for the session, the
hazard its own docblock had carried since it was written), and the one-shot export render awaits
`fonts.ready` before painting, because the live canvas repaints every frame and the deliverable
paints once.

## 174. The axis-markers gate pass's non-blocking findings

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

## 175. The exported diagram has never carried the date marks, and nobody decided that

**Status:** unverified

**Raised 2026-08-22**, established while fixing #148 rather than reported. **Closed 2026-08-28**
(fix-slice M-F): the product owner chose **marks on the axis** over legend-only. The export now
reserves a marker row under the title band (`EXPORT_MARKER_ROW`, unconditional so the geometry
never depends on which marks are on) and draws the chips from **the same `axisMarkers` model the
screen's ruler renders from** — one implementation of culling, coincidence (`Data date · today`),
clamping and the collision rule, per the ADR-0065 argument that module's docblock makes. The
legend keeps naming both marks (also the product owner's call). The WBS band moves down with the
row; `render-export-image.wbs-band.test.ts`'s offset expectation was the one existing assertion
that legitimately changed, audited rather than accepted. The journey samples the reserved row of
the decoded PNG and was verified red against a row-reserved-but-undrawn mutation; the printed
diagram inherits by construction (PrintSurface embeds the same blob). **One correction to this
row's own framing (spec F9):** the _rules_ always reached the export — what never appeared were
the _labels_, and there was no axis band for them to sit on; "has never carried the date marks"
over-read the defect by half a channel.

`export/render-export-image.ts:127` calls `paint(...)`, and `:153` `drawTitleBand` then fills
`palette.ground` **opaquely** over `(0, 0, width, EXPORT_TOP_BAND)` with `EXPORT_TOP_BAND = 96`
(`export/export-image.ts:42`). The `Data date` and `Today` labels sat at y 24–60. **So they have
never appeared in an exported PNG or PDF** — not since either shipped. The export names both marks
in its legend instead (`render-export-image.ts:97`, `:103`), which is a different thing from
marking the column.

**It is not a regression and #148 did not cause it.** After ADR-0106 the labels are DOM in the
ruler, which no canvas export composes at all, so the same fact now has a second and more
structural cause. That is what makes it worth a row: the _reason_ changed and the _outcome_ did
not, so a future reader tracing either cause would find it already handled by the other.

**The question is a product one and is deliberately not answered here.** Should a deliverable carry
the data date and today as marks on its own axis, or is naming them in the legend the right answer
for a picture somebody prints and hands over? Both are defensible: a printed programme has no
"today" by the time it is read, and a data date is arguably a fact about the file rather than about
the diagram. What is _not_ defensible is that neither was ever chosen — the vertical rules do reach
the export, so today it draws two unlabelled verticals and explains them in a legend a reader has to
cross-reference.

**Belongs with the ADR-0103 family** (#164 the export composition, #166 the whole-plan weekend cull,
#167 the export being the default picture rather than the planner's) — all four are the same
question in different costumes: nobody has re-read the export against the screen since the features
that diverged them shipped.

**This row exists because two shipped documents said it already did.** ADR-0106's Context section
and #148's own amendment both state that the finding "is filed with the ADR-0103 family", and it
was not — I wrote down where it belonged and did not put it there. That is the ADR-0071 failure
exactly (noticing drift and stepping over it leaves the register as wrong as not noticing) in the
epic that quotes ADR-0071, and an ADR-0076 Class 3 claim (asserted, never checked) in the epic that
quotes that too. Caught by re-reading my own check-in notes against the register rather than by any
gate: **`check:doc-links` verifies that a link resolves, not that a claim about filing is true.**

## 176. Better Auth 1.7 needs a schema migration, and a minor bump is how we found out

**Status:** unverified

> **CLOSED 2026-08-23 — ADR-0107.** Both workspaces run `^1.7.1`; the pin is gone. `accounts.issuer`
> shipped first, alone, in `api-v0.52.0` (migration `20260823120000_account_issuer`), with the
> library following in its own release so the irreversible and reversible halves could fail
> separately. `scripts/e2e-local.sh api` is **565/565** against the 522-of-559 baseline recorded
> below, and the three account journeys (public screens, reset with session revocation, change
> password, verification enforcement) pass at 1.7.1.
>
> Two things this left behind rather than fixed, both because they are shared-gate changes that fire
> ADR-0105's trigger: **#178** was observed live — with the API on 1.7.1 and the web client still on
> 1.6.28, `check:claims` reported 52 claims OK _against 1.6.28_ — and is worked around by keeping one
> installed version, not closed; and **#181** was filed after a 1.7.1 citation passed the gate on a
> line coinciding with a registered 1.6.28 one.
>
> **Still owed, and only the product owner can do it:** on the deployed host, after each of the two
> releases, sign in as a user whose account predates the migration, change a password, and complete a
> reset. They declined the read-only pre-flight, so the deployed `accounts` table was never measured;
> a migration failure appears as the API **restart-looping**, not as a broken page.

**Raised 2026-08-22** while working the dependency backlog. The version pin is now `~1.6.28`
(patch-only) in both `apps/api/package.json` and `apps/web/package.json` **specifically so 1.7
cannot arrive unattended**; that tilde is a deviation from this repo's `^` convention and it is
deliberate.

**What happens if you just bump it.** Better Auth 1.7 scopes account identity by a new
`account.issuer` column and ships an upgrade guide for it: `dist/db/get-migration.mjs` holds a
`columnBackfillGuideUrl` pointing at `…/1-7-upgrade-guide#account-identity-is-scoped-by-issuer`,
and `dist/db/internal-adapter.mjs` gains a `findAccountOwnerByKey({ issuer, accountId })`.
**Deliberately no line numbers**: those were read in 1.7.1, which this branch does not install, and
a pinned citation into an uninstalled version is precisely the rot ADR-0076 exists to stop — the
register can only pin what is on disk. Whoever does the upgrade re-reads them at the version they
land on. Our Prisma `Account` model has no such column,
so `prisma.account.create()` throws `Unknown argument 'issuer'` on **every sign-up**. Measured on
this branch at 1.7.1: **522 of 559 API e2e tests fail**, across 37 of 42 spec files.

**The measurement that matters is which gate caught it.** `pnpm lint`, `pnpm typecheck` and all
**5,004** unit tests passed at 1.7.1, and so did all ten `check:*` gates including
`check:claims` — because the unit suites mock Better Auth and the claims gate reads its source
rather than running it. Only `scripts/e2e-local.sh api`, which drives the real library against a
real Postgres, failed. That is CLAUDE.md §19.8's "the e2e half is not optional and not CI's job"
stated as a number rather than as advice, and it is the strongest evidence for that rule the
register has.

**Why it is not a dependency bump.** It adds a column and needs a backfill for existing rows, so it
fires two mandatory rules at once: **ADR-0105**'s schema trigger (a full spec and plan before code,
whatever the size) and **CLAUDE.md §19.3** (every schema change goes through the
**database-architect** agent — no exceptions, and deciding a change is too small to need it is the
judgement the agent exists to make). It also wants a real read of what "identity scoped by issuer"
means for a single-provider `credential` install like this one before anybody writes a migration:
the answer may be a constant, which would make the backfill trivial, but that is a thing to
establish rather than assume.

**What was verified along the way, so it is not re-derived.** All 36 citations into
`better-auth`'s internals were re-read at 1.7.1: every cited behaviour is intact, 19 anchors were
still exact, 15 moved by line only, and 2 had their code rewritten without changing what they do
(`onPasswordReset`'s guard became "is a handler configured" rather than "is there a user"; the
403 `EMAIL_NOT_VERIFIED` path is unchanged bar `user.user.email` → `user.email`). Both
version-stamped citations still hold: the rate limiter is 3-per-10s on
`/sign-in*`/`/sign-up*`/`/change-password`/`/change-email` and 3-per-60s on the two email routes,
and `rememberMe` still defaults to `true`. **So the citation work is done and only the schema is
outstanding** — whoever picks this up inherits a verified register, not a cold start.

## 177. A compound citation is invisible to `check:claims`

**Status:** unverified

**Raised 2026-08-22.** The completeness scan's regex is
`\b([a-z0-9.-]+\.m?js):(\d+(?:-\d+)?)\b`, which matches `sign-up.mjs:163` inside
`sign-up.mjs:163,169-207` and stops. The second range was therefore **never registered**, never
version-pinned and never re-verified — while sitting inside a citation that looks complete and
carries a real claim: ADR-0075's synthetic-200 anti-enumeration control, which is the reason that
ADR rejects an abort-on-send-failure design.

**Worked around rather than fixed, deliberately.** All seven occurrences were split into two
register-visible citations, so the hidden half is now watched and the immediate hole is closed
without touching the gate. Extending the regex would be a **shared-gate** change and fires
ADR-0105's trigger, which is not something to smuggle into a dependency bump.

**Sized before deciding:** a repo-wide sweep found **8** compound citations, 7 of them this one
claim and the eighth in `shoot.mjs`, which the gate excludes anyway as this repository's own file.
So the convention "one citation, one range" now holds everywhere, and the regex change buys
enforcement rather than coverage. That is worth doing and worth doing on its own.

## 178. `check:claims` resolves a package by the first store entry it finds

**Status:** unverified

**Raised 2026-08-22** while bumping `react-hook-form`, and it produced a **wrong answer**, not a
missing one — which is the reason it is worth a row.

`installed()` in `scripts/check-claims.mjs` resolves a package by scanning `node_modules/.pnpm` and
taking the **first** directory whose name starts with `<name>@`:

```js
const dir = readdirSync(store).find((entry) => entry.startsWith(stored) && …);
```

pnpm does not eagerly unlink a superseded version, so immediately after a bump the store holds
**both** — `react-hook-form@7.84.0_react@19.2.8` and `react-hook-form@7.86.0_react@19.2.8` — and
`readdirSync` returned the older one. The gate reported _"claims were verified against 7.86.0,
7.84.0 is installed"_ with the register freshly and correctly updated against 7.86.0, which is the
message inverted: it names the stale directory as the truth and the verified register as the drift.
The lockfile referenced only 7.86.0 throughout.

**Both directions are possible and the dangerous one is the quiet one.** Here it failed loudly and
cost a few minutes. Had the orphan been the _newer_ directory — which happens when a bump is
reverted, exactly what happened on this branch an hour earlier going from 1.7.1 back to 1.6.28 —
the gate would have compared the register against a version the application does not load and
**passed or failed on the wrong evidence**, silently. A gate whose subject is "we verified this
against what is installed" must not guess which of two things is installed.

**Worked around, not fixed:** the orphan was deleted by hand (`rm -rf` the stale store directory)
and the gate then read 7.86.0 correctly. The fix is to resolve the version the way the application
does — read `node_modules/<name>/package.json` through the consuming workspace, or the resolution
in `pnpm-lock.yaml` — rather than by directory-name prefix. That is a **shared gate**, so it fires
ADR-0105's trigger and wants its own change rather than riding along inside a dependency bump.

**Not the same bug as #177.** That one is the completeness scan's regex halving a compound
citation; this is the version resolver picking the wrong directory. They share only a file.

### A second flavour, found the same day: a package legitimately resolved TWICE

`axe-core` is not an orphan case. Two resolutions coexist **by design** in `pnpm-lock.yaml`:

| copy       | pulled by                              | used at                                     |
| ---------- | -------------------------------------- | ------------------------------------------- |
| **4.13.0** | `@axe-core/playwright`                 | **journey** time — the Playwright axe scans |
| 4.12.1     | `eslint-plugin-jsx-a11y`, `vitest-axe` | lint and unit-test time                     |

The register pins **4.12.1**, because `installed()` returns the first directory and `4.12.1` sorts
before `4.13.0`. But the claim it holds — that `validateContext` **throws** on an empty `include`,
so a scan whose `.include()` names a deleted row goes red rather than green-for-having-tested-
nothing (ADR-0099 M5, cited from `CLAUDE.md`) — **is a statement about the journey path**, which
loads 4.13.0.

**The claim is true in both** and was checked in both rather than assumed: the same
`No elements found for include` throw is present in 4.13.0's `axe.js`, roughly four hundred lines
further down than in 4.12.1. So nothing is currently wrong, and the entry is left as it is.

_(No line number for the 4.13.0 copy, deliberately, and the reason is this row's own subject: the
register can only pin the copy `installed()` resolves, which is 4.12.1 — so a `file:line` citation
into 4.13.0 is one the gate would demand an entry for and then refuse, because the anchor is not at
that line in the copy it checks. Writing it that way failed `check:claims` on the first attempt,
which is a fair demonstration that the hole is real.)_

What is wrong is that **the register cannot say which copy a claim is about**, and the gate silently
picks one. If the two copies ever diverge on this behaviour, the register would go on asserting a
verification against the copy that does not run — and, unlike the orphan case above, there is
nothing to delete that would fix it, because both resolutions are correct. The register format
needs a way to name the consumer (`axe-core` _via_ `@axe-core/playwright`), not just the package.
That is the same shared-gate change as the resolver fix and belongs with it.

## 179. Changesets v3 stops versioning private packages, and says nothing

**Status:** unverified

**Raised 2026-08-23**, found while bumping `@changesets/cli` (Dependabot #318) and closed in the
same change. Recorded because the **failure mode** is the interesting part, not the fix.

`@repo/api` and `@repo/web` are both `private: true` — they are applications published as container
images, never to npm. Changesets **3.0.0 stops versioning private packages by default**; the opt-in
is a new `privatePackages` config key that `.changeset/config.json` did not have.

**What that looks like is the problem.** Run against v3 without the key, on a real pending
changeset:

```
🦋  changeset v3.0.1
All files have been updated. Review them and commit at your leisure
```

**Exit code 0.** `@repo/web` stayed at 0.99.2. The changeset was not consumed, no `CHANGELOG.md`
moved, and nothing anywhere said a package had been skipped. Every downstream consequence is silent
in the same way: the "Version Packages" PR would carry no version bump, `hasChangesets` would stay
`true`, the release gate would correctly conclude there is nothing to tag, and the workflow would go
**green** — while no new image ever reached GHCR and the host kept serving the old one.

That is the identical shape `.github/workflows/release.yml` already carries a fail-loud assertion
for on a _different_ input (the v1→v2 `hasChangesets` → `has-changesets` rename, #323): a release
pipeline whose only symptom of failure is that nothing happens. Two independent routes to it in one
dependency family is a fair argument that this pipeline's real risk is silence rather than error.

**Fixed by `privatePackages: { version: true, tag: false }`** — `version: true` restores the bump,
`tag: false` keeps changesets out of tagging, which the workflow does itself with per-package
`api-vX.Y.Z` / `web-vX.Y.Z` tags (ADR-0027). Verified in both directions rather than reasoned:
without the key nothing moves; with it, `api` 0.51.1 → 0.51.2 and `web` 0.99.2 → 0.99.3, both
changelogs written, the changeset consumed.

**What is NOT covered, stated plainly.** The proof above is `changeset version` run by hand. The
release **pipeline** cannot be fully exercised without cutting a real release, so the first genuine
test of this configuration is the next release that lands. If that release produces no version bump,
this row is where to look first.

**Two other v3 breaks were checked and are inert here**, so nobody re-derives them:

- **`changeset version` now exits 1 when there are no unreleased changesets** (it exited 0 in v2).
  Read `changesets/action@v1`'s source to be sure rather than assuming: it runs the version command
  only inside its `case hasChangesets:` branch, so the pipeline never invokes it on an empty tree.
  It **does** bite anyone running `pnpm version-packages` by hand on a clean checkout, which is now
  a failure rather than a no-op.
- **`changeset tag` renamed to `changeset git-tag`**, and `--sinceMaster` removed. Neither appears
  anywhere in this repository — grepped, not assumed.

`engines.node` moved `>=22.0.0` → `>=22.11.0` to match v3's own floor (`^22.11 || ^24 || >=26`).
The old range admitted 22.0–22.10, on which v3 refuses to run.

## 180. A workflow's renamed INPUTS have no equivalent of the output guard

**Status:** unverified

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

## 181. `check:claims` matches a citation by ref string, so a coinciding line in a different version passes

**Status:** unverified

_Found 2026-08-23, by the gate accepting a citation it should have refused._

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

## 182. Three base-journey sign-up specs sit close enough to a 5 s timeout that Firefox tips under load

**Status:** unverified

_A second, em-dash-styled row briefly shared this number (the deck's folded groups); it is now **#207**._

_Found 2026-08-23, on the Better Auth 1.7 release (#176 / ADR-0107). Filed because a green re-run
proves the failure is not **deterministic**, not that the tests are not **marginal** — and the
evidence for that distinction only exists while somebody has just looked at it._

PR #367's end-to-end job failed with **three tests, all Firefox, 48 passed**. All three died at the
same place: after clicking **Create an account**, waiting `5000ms` for the
`Create your organisation` heading, `element(s) not found`.

- `apps/web/e2e/clients.spec.ts:10`
- `apps/web/e2e/dependencies.spec.ts:15`
- `apps/web/e2e/dependencies.spec.ts:76`

Re-running the same job passed all three and completed all 58 steps with no failures.

**It is not the 1.7 bump**, and that was established by reading rather than by the re-run. 1.6.28
was fetched with `npm pack` and diffed against the installed 1.7.1: the session cookie attributes are
identical (`sameSite: "lax"`, `httpOnly: true`, `secure: !!secureCookiePrefix`), `setSessionCookie`
is byte-identical apart from line numbers, `dist/client/index.mjs` has a **zero-line** diff, and the
browser-client changes are additive opt-ins (`hydrateSession` / `hydrateSessionAtom`, which returns
immediately unless configured). The sign-up route's diff is a refactor, one new argument, one error
branch and the `issuer` line — and **a server response cannot vary by browser**. Corroborating:
Firefox passed **14 of 17** base specs, and nearly every one of them signs up, so sign-up is not
broken on that engine.

**What it is, most likely:** the base journey is 17 specs × 3 engines, and it runs inside a job that
also runs the API Supertest suite, the pairwise suite and 36 further Playwright suites — 58 steps
back to back on one runner. Firefox is the heaviest engine, and a 5 s budget for a post-submit
heading is the tightest assertion in those three specs.

**The remedy is not re-running.** Re-running is what makes this invisible: it converts a marginal
test into an occasional mystery, and the next occurrence may be during a release nobody is watching.
Two candidates, neither costed yet:

- raise the timeout on the post-sign-up heading assertion specifically (it follows a form submit, a
  network round trip and a client-side route change — 5 s is not generous for that on a loaded
  runner), rather than raising the global `expect` timeout, which would hide real regressions
  everywhere else;
- split the end-to-end job so the base journey is not competing with 36 flag-scoped suites.

**Local reproduction is impossible here**, which is why this row carries the analysis rather than a
fix: this dev container ships **no Firefox or WebKit binary** and `playwright install firefox` fails
on download, so the base suite is Chromium-only locally whatever the config says (see **#1**, which
records the same limitation and notes this journey has caught a _real_ Firefox-only failure before —
which is why the flake verdict here is stated with its evidence rather than assumed).

Cross-references **#1** (web e2e is Chromium-first, and the flag-scoped suites never run these
engines at all).

**CLOSED 2026-08-28 (correctness programme Phase 2) — the row's own first candidate.** The three
post-sign-up heading assertions (`clients.spec.ts`, `dependencies.spec.ts` ×2) carry an explicit
`{ timeout: 15_000 }` with the reason in a comment at each site — the assertion spans a form
submit, a network round trip and a client-side route change, and the default 5 s was measured
marginal only under a loaded CI runner on Firefox. The global expect timeout is untouched, per
this row's own warning that raising it would hide real regressions everywhere. The job-split
candidate stays uncosted and is deliberately not taken here (a CI-topology change for a margin a
targeted timeout already covers). Firefox still cannot run locally (#1), so the proof is the
assertion now failing only past 15 s — three times the measured envelope — rather than a local
re-run.

---

## 183. `check:claims` cannot see a camelCase basename in its colon form

**Status:** unverified

_A second, em-dash-styled row briefly shared this number (API-seeding journeys); it is now **#208**._

_Found 2026-08-23 by the `ui-architect` while designing the unsaved-work guard, and confirmed here._

`scripts/check-claims.mjs`'s colon-form citation pattern is case-sensitive lowercase, so a citation
written as `useBlocker.js:35` is invisible to the completeness scan **in both directions**: it is
not demanded when unregistered, and a registered entry for it reads as uncited. The prose form
carries an `i` flag and does match, which is the workaround this epic used.

This is the same family as the dotted-basename hole the file already records about itself — the scan
is a text pattern over shapes, and every shape it does not anticipate is a silent gap rather than a
failure. It matters more now than it did: this repository's dependencies are increasingly camelCase
module files (`useBlocker.js`, `useNavigate.js`), so the blind spot is growing rather than static.

**Not fixed here, deliberately.** Widening the scan is a change to a **shared gate**, which fires
ADR-0105's trigger and would mean the gate changing underneath the citations it is checking — the
same reason **#178** and **#181** were left alone during the Better Auth upgrade. Fix it on its own,
with its own before/after count of what the widened pattern newly demands, because the last two
widenings each surfaced unregistered citations that had been sitting in the tree (ADR-0077 M0).

Cross-references **#178** (the resolver takes the first store directory) and **#181** (a `ref`
carries no version) — three holes in one gate, all found by using it rather than by reading it.

---

## 184. Unsaved-work guard: the findings its gate pass did not block on

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
- **`describeUnsavedWork` has no upper-bound treatment.** All six editor scopes dirty produces
  `"General, Scheduling, Cost, Reported progress, How value is measured, Weighted steps have
unsaved changes."` — a comma list with no "and", delivered as one sentence with no structure. The
  multi-surface branch two lines away _does_ use "and", so the two read inconsistently. Consider a
  count past two or three ("6 sections have unsaved changes: …"), which is what ADR-0094 did with a
  list for the same reason. No test has ever read the six-scope sentence.
- **Silent auto-proceed.** If the registry goes clean while the confirmation is open, the guard
  calls `proceed()` and the navigation completes with no announcement — an unexpected context change
  while the reader may be mid-sentence. Low likelihood; nothing currently guards it.

**From the component review**

- **`useUnsavedWorkReports` has no production caller.** Only tests import it. It is documented as
  future-facing, and it is exactly the ADR-0081 shape — a capability with no entry point — one
  register along. Either wire a consumer or say plainly that it is dormant.
- **The `onDirtyChange` effect is authored three times** in `ActivityProgressPanels.tsx`, identical
  body and deps. `WeightedStepsPanel` does not use `useScopeForm`, so a shared two-line hook is a
  better home than a `useScopeForm` option.
- **Thirteen conditional array spreads** across the four report builders
  (`...(cond ? [{ key, label, savable }] : [])`). A pure `buildReport(subject, scopes)` helper in the
  already-React-free `lib/unsaved-work/report.ts` would read declaratively and be independently
  testable. Every current call site is correct; the idiom is the risk, and ADR-0074 records this
  exact shape going wrong elsewhere.

**From the security review, and it is about my own conduct**

- **Coverage was deleted and not replaced.** An earlier commit on this branch (`33b12b8f`) drove
  `page.goBack()` with a dirty scope and asserted the confirmation, "Keep editing" and "Leave". When
  Back turned out not to reach the blocker, that whole case was replaced with the narrower
  reload-only journey — and the in-app confirmation lost its only browser-level coverage in the
  process. The allow-list's _behaviour_ now has a real unit test (added at the gate pass, verified
  red), but **no journey opens the in-app `ConfirmDialog` at all**, so the "Keep editing" focus
  return is asserted nowhere a real `<dialog>` exists. That matters because the focus defect the
  accessibility review found was invisible to jsdom by construction.

**Why Back is unresolved**, since it belongs beside the above: instrumented in a real browser,
`shouldBlockFn` is **never called** on `page.goBack()` while the guard is mounted and the URL does
not change — so something other than this guard reverts the pop. Recorded rather than claimed
(ADR-0108 D7).

---

## #207 — The deck's folded groups are unreachable by any journey

**Status:** unverified

_Renumbered from #182 on the 2026-08-28 reconciliation pass: the number collided with the
dot-style row `## 182.` filed the same week, and a register whose ids are ambiguous fails at its
one job. Every reference that meant THIS row now says #207._

_Filed 2026-08-24 with ADR-0109 M2._ **CLOSED 2026-08-25 (ADR-0110 M4).**
**The subject itself was then REMOVED (workspace visual polish, 2026-08-28):** the deck's fold went
on the product owner's steer ("it adds very little and I don't think someone is ever going to
collapse a toolbar"), so the two browser cases this row's closure describes went with it — a gate
whose subject no longer exists does not become a safety net by staying green (ADR-0109 D1). The
roving-walk half survives inside the replacement case in `command-surface.spec.ts`, which pins the
NEW contract: no disclosure captions, groups still named for AT, the walk still laps every command.
`apps/web/e2e-workspace-fit/command-surface.spec.ts` now drives the fold path in a real browser,
in both halves this row asked for: a pointer fold **and unfold** that proves the commands come
back, and a keyboard one that folds with `Enter`, asserts the deck still has **exactly one** roving
stop pointing at something rendered, arrow-keys across the surface to prove the folded group's
caption is still in the sequence — it is the only route back into what it hides — and unfolds from
the keyboard with every command restored. The fold-only half was written first and would not have
closed this: proving a group can be hidden says nothing about whether a keyboard reader is left
stranded, which is the sentence below that this row already got right.

`Deck` renders four captioned groups that a reader can fold, and a folded group's items are absent
from the DOM. **Nothing exercises that path.** Every Playwright suite starts from a fresh profile,
the fold state lives in `localStorage` under `schedulepoint-deck-folds`, and no journey writes it —
so every run drives the all-open case and the folded one is dark.

`revealToolbarCommand` in `e2e-support/toolbar.ts` is where the answer belongs (its docblock says
so) and it is currently a straight `getByRole` because the width ladder it was written for is gone.
Its `⋯` branch is kept as the shape that would serve a folded group, not as live code.

**Why this is not urgent and is still worth writing down.** A fold is a deliberate act by a reader
who then knows the group is folded, so the failure mode is not silent — unlike the ladder, which
folded commands away at widths nobody had measured. What is untested is whether a _keyboard_ reader
can get back to a folded group's contents, and whether the roving `tabindex` stays coherent across a
fold. Both are asserted at unit level (`Deck.test.tsx`) and neither has been driven in a browser.

Cost: one journey that folds a group, tabs through the strip, and unfolds it.

---

## #208 — A journey that seeds through the API must tell the client itself

**Status:** unverified

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

**What is left is an audit rather than a defect.** The sweep proves today's estate green, so no other
suite is currently relying on it — but "no suite relies on it today" is a fact about today, and the
next API-seeding helper will be written by copying one of the existing ones. The candidates are the
nine support files that POST through `page.evaluate`; each should either reload or say in a comment
why its caller does not need it to.

Cost: one pass over nine files. There is no gate for this and a structural one looks unpromising —
"does this helper's caller later observe what it wrote" is not a property of a file.

---

## #209 — The bulk-delete focus restoration is a race, and it failed once under load

**Status:** unverified

_Renumbered from #184 on the 2026-08-28 reconciliation pass (the #207 note explains why)._

_Filed 2026-08-24 with ADR-0109 M5 as **not reproduced**. **Closed the same day, reproduced under
load and hardened** — the update is below._

`e2e-multi-select`'s "a bulk delete is ONE undo step" asserts `expect(list).toBeFocused()` after a
bulk delete. It failed once, in a 35-suite sweep, and **passed on its own immediately afterwards**.

The assertion is not decorative: the workspace's undo accelerator is a React `onKeyDown` on the
workspace root, so focus landing on `<body>` makes Ctrl+Z reach nothing. `focusListboxAfterModal`
(`TsldPanel.tsx:686`) exists because that already shipped once, and its docblock records the cause —
a native `<dialog>` restores focus to the element that opened it, and when that element has itself
unmounted (the bulk bar's Delete button, once the selection is gone) the browser lands on `<body>`
and a synchronous `focus()` from the handler is silently undone a moment later. The fix was **one**
`requestAnimationFrame`, i.e. a race won by a margin nobody has measured.

**The leading hypothesis is my own change and it is UNVERIFIED.** `usePlanAutoRecalc` was
deliberately render-free — its docblock says "all burst state is in refs" — and ADR-0109 D3 added
two pieces of React state to it, so `notify()` now causes a render at exactly the moment of the
delete where it never did before. An extra render plausibly narrows the rAF's margin. Plausibly.
The alternative is that the sweep's machine load did it, which is what a single-frame race looks
like on a loaded runner either way.

**Nothing was changed on that hypothesis**, because ADR-0064's rule is that an unreproduced report
is closed unreproduced rather than fixed, and because twice in this same session a plausible cause
turned out to be the wrong one.

What would settle it, in order of cost: instrument `focusListboxAfterModal` to record whether the
first frame won, and run the suite under load; if it loses, replace the single frame with a bounded
self-verifying retry — check `document.activeElement` and try again next frame, up to a small cap —
which converts the race into a check and cannot make the winning case worse.

**UPDATE, same day — reproduced, and the second half of that sentence is what shipped.** A second
35-suite sweep failed the identical assertion at the identical line, and the suite passed on its own
again immediately afterwards. Two failures under load, two passes in isolation, is a pattern rather
than an event: a single-frame race losing on a busy runner.

`focusListboxAfterModal` now asks whether it won instead of assuming — focus, compare
`document.activeElement`, try again next frame, bounded at five frames (~80 ms). `then` fires
exactly once whether the retry succeeds or the cap is reached, because the deletion announcement
must not be spoken twice and must still be spoken if focus never lands, or a planner loses the
confirmation as well as the focus.

**What was NOT done, and why it is worth recording:** the leading hypothesis for the narrowed margin
— that ADR-0109 D3 added React state to a deliberately render-free `usePlanAutoRecalc`, so `notify()`
now renders where it did not — is still unverified, and no attempt was made to revert it. The
hardening fixes the class regardless of which change narrowed the margin, which is the right shape
of fix for a race whose cause is uncertain: it cannot make the winning case worse, and it removes
the failure mode rather than one of its possible causes.

---

## #185 — The command deck is 182 px tall, and nobody measured it before building it

**Status:** unverified

_Filed 2026-08-24 with ADR-0109. **Cause ESTABLISHED 2026-08-25** by workspace-chrome-fit M0
(`docs/specs/workspace-chrome-fit/m0-measurement.md`), and it is not the one this row expected._

**The anomaly below is resolved.** This row flags the height being identical at 1920 and 1280 as
suspect, since a `flex-wrap` container should reflow. It does not reflow because its **2089 px of
items fit in exactly two lines at every width from 1280 to 1920**. The height is a **wrapping**
cost, not a **stacking** one.

**So the lever this row names is worth 8 px.** It calls un-stacking "the single biggest term in
the height"; measured, inlining every control takes the deck 116 → 108 px at 1920/1646/1440 —
and 116 → **224** at 1280, where the cards wrap from two lines to four. The product owner chose
inline anyway on 2026-08-25, for the label-alignment win rather than the height: worst within-row
label spread 12 px → 3 px. That shipped as M1.

**What this row got right** is that the obvious arithmetic was suspect and that the decision was
the product owner's. What it got wrong is the size of the prize — which is the argument for
measuring a lever before naming it the biggest one.

`measure-toolbar/vertical-stack` on a populated plan with the pen held, after the redesign:

| band                 | before | after      |
| -------------------- | ------ | ---------- |
| **above the canvas** | 135 px | **357 px** |
| the command strip    | 44 px  | **182 px** |
| app header row       | 0 px   | 56 px      |
| identity row         | 28 px  | 28 px      |

Canvas height falls to **284 px at 1440×960** and **224 px at 1280×900**.

**The header row is only 56 of the 222 px added.** The deck is 182, and that is the finding: the
wrap solved the overflow the product owner complained about and spent four times the vertical to do
it. Their original words were that "the 6 tool bars take up a lot of space" — this makes that worse
in the other dimension.

**ADR-0090 and ADR-0091 both record this project building a command surface and measuring it
afterwards; ADR-0109 did it again.** M0 of both those epics exists precisely because a design
written without a shell is arithmetic over class names. This epic had a mockup at 1646 and no
vertical measurement of the built thing until after it shipped to the branch.

**The cause is NOT established and the obvious arithmetic is suspect.** "34 stacked buttons over
four cards must wrap to two lines" is a guess, and it is contradicted by the figure being
**identical at 1920 and 1280** — a `flex-wrap` container should reflow between those. A probe
written to answer this returned nulls for `[role="toolbar"][aria-label="Plan commands"]` on a
freshly-created plan while `vertical-stack` finds it, so the two harnesses disagree about when the
deck exists; that discrepancy is itself worth resolving first. The probe was deleted rather than
committed reporting nulls.

**The likely lever reverses an approved decision, which is why it is filed rather than taken.**
Mockup decision 1 is stacked buttons — icon above a 9.5 px label — and un-stacking them is the
single biggest term in the height. That is the product owner's call, and it wants the measurement
and a recommendation put to them, not a unilateral revert.

**`e2e-toolbar` line 134 is a symptom of this, not a separate defect.** The activities panel's
`effectiveMax` is `max(140, bodyHeight − 240)`, so once the chrome takes 357 px the panel is pinned
at its 140 px minimum and a keyboard shrink step has nowhere to go. Fixing the height fixes the
test; changing the test would be hiding the finding.

---

## #186 — WCAG 2.5.8 lost its only automated cover when the fit gate was deleted

**Status:** unverified

_Filed 2026-08-24 with ADR-0109 M5. **CLOSED 2026-08-25** by workspace-chrome-fit M1-T3:
`apps/web/e2e-workspace-fit/command-surface.spec.ts`, its own CI step, green at 1280 / 1440 /
1646 / 1920 on its first run. The replacement is cheaper than the original, exactly as this row
predicted: a wrapping surface has no demotion to model, so the sweep is "every command clears
24×24 and a pointer can reach it" with no width ladder to drive. Both traps this row named were
taken rather than rediscovered — it descends to each item's focusable control (so a split
button's `tabIndex={-1}` caret is swept, the half that once shipped at 23×36) and asserts
`elementFromPoint` reachability rather than overhang (a control at zero width has zero overhang
and is still in the DOM). A pinned positive requires more than fifteen controls swept, so it
cannot pass against a deck that renders nothing._

ADR-0090 M5 established that **axe cannot see target size**: `target-size` is tagged `wcag22aa`,
every scan in this estate requests `wcag2a`/`wcag2aa`, and the rule ships `enabled: false` besides.
"The axe scan is green" was true and meaningless for 2.5.8. What covered it instead was
`e2e-toolbar-fit`'s `elementFromPoint` sweep, which asserted every command was pointer-reachable at
eight widths — and ADR-0109 D1 **deleted that journey with the ladder it tested**, correctly: it
asserted a row that no longer exists, and a gate whose subject is gone does not become a safety net
by continuing to pass.

**The deletion was right and it left a hole.** Nothing now checks that a command's target clears
24×24.

**Measured, so this is a missing gate rather than a live defect.** The deck's controls at 1646 are
40 px tall and 51–69 px wide (`measure-output/m4-vertical-stack.json`), and the group captions —
which are real controls, being fold toggles — stretch to the card height at 54 px rather than the
19 px they were as a full-width row. Everything clears the floor with room to spare.

**Why it is not fixed here.** The obvious move is to lift the `elementFromPoint` sweep out of the
deleted journey into one that survives. That is a new Playwright step and a shared gate, which
ADR-0105 says makes it spec work rather than a tech-debt row. It is also genuinely easier now: a
surface that wraps has no demotion to model, so the sweep is "every `[data-toolbar-item]` clears
24×24 and is hit-testable", with no width ladder to drive.

**The trap for whoever writes it**, from ADR-0090 M5's own findings: sweep the item's _focusable
control_, not `[data-toolbar-item]` on a wrapper — that is how the split-button caret went unmeasured
at 23×36 — and assert pointer reachability rather than overhang, because a control shrunk to zero
width has zero overhang and is still in the DOM.

---

## #187 — The deck's labels sit 3 px apart and three hypotheses are falsified

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

## #188 — Eight of fourteen measurement harnesses cannot run

**Status:** unverified

_Filed 2026-08-25 with ADR-0110 M4. **CLOSED 2026-08-26** — seven deleted, one repaired, estate
green. **And the row's own inventory was wrong in three ways**, which is worth more than the fix._

**What it claimed, and what the tree holds.** The title says "eight of fourteen". The directory held
**16 spec files and 17 test cases**, of which **9 cases across 8 files** failed — established by
running `pnpm measure:toolbar`, which nobody had done. The row also named "both `item-widths`
specs"; there is **one** file with **two cases**, so its list of eight names only seven files, and it
**omitted `attribution` entirely**. A register row about instruments that mislead, itself
miscounting its subject, written the day before by the same hand — the failure mode is not
ignorance, it is that a list assembled by reading is not a list derived by running.

**Predicting which to delete was also wrong.** Classified by subject, `graphite-strip` looked like a
clear delete — it is the densest of all of them in references to the width ladder and the overflow
ADR-0109 D1 removed. **It passes.** It was deleted and restored in the same minute, and only because
the estate was run first.

**What shipped.** Seven deleted, because their subject no longer exists and repairing them would
mean maintaining a measurement of a mechanism the product does not have:

| Harness        | Subject, and why it went                                                                |
| -------------- | --------------------------------------------------------------------------------------- |
| `measure`      | ADR-0090 M0, "the two toolbar rows" — merged by ADR-0099 M5, ladder deleted by ADR-0109 |
| `loaded-plan`  | M0c, a correction to `measure`                                                          |
| `reachability` | M0b, clipped controls — clipping was the ladder's failure mode                          |
| `attribution`  | M1-T1, attributing a row overshoot that ADR-0090 M1 fixed                               |
| `item-widths`  | M2-T0, sizing the ADR-0090 M2 consolidation, which shipped                              |
| `menu-band`    | ADR-0097 Landing C — **withdrawn on its own falsification condition**, never built      |
| `search-icon`  | ADR-0091 M0-T2 — answered (COVERED, geometry already correct)                           |

One repaired: **`header-fit`**, whose subject — does the app header row fit its container, and is
every control in it pointer-reachable — is exactly the question the one-row header work asks next.
It waited on a toolbar named `View and navigate`, a name **ADR-0099 M5 removed**, so it had been
dead since then while still reading as the authority on header fit. One locator.

**The remaining nine all pass** (`busy-band`, `combobox-coarse`, `graphite-strip`, `header-fit`,
`m0-bands`, `m0-header-and-treatment`, `m0-merged-row`, `m0-repaired`, `vertical-stack`).

**The stale JSON this row worried about is still in `apps/web/measure-output/`** and is not
addressed here: outputs from deleted harnesses now describe mechanisms with no code behind them.
Deleting those files is the obvious follow-up and was left deliberately, because some are cited by
name in ADR-0090/0091's own reasoning and removing them would break those citations.

---

## #189 — The command deck's search field made 18 of its 27 commands unreachable by keyboard

**Status:** unverified

_Filed and **FIXED** 2026-08-25 (ADR-0110 M4). WCAG 2.2 §2.1.1 Keyboard, level A._

`Deck`'s roving-tabindex handler vetoed **all six** navigation keys whenever focus sat on a form
field, so the caret in the Find group's search `<input>` kept ArrowLeft/ArrowRight/Home/End — which
is correct and is why it was written that way — **and also ArrowUp/ArrowDown, which it has no use
for**. Because focusing the field also makes it the roving stop, every other control drops to
`tabIndex={-1}`, and the deck's only Tab entry point is that stop. So a planner who put focus in
Find had no key left that reached anything else on the surface.

Measured in Chromium rather than reasoned about — the probe pressed the keys and recorded where
focus went:

```
start: INPUT#search
ArrowRight -> INPUT#search
End        -> INPUT#search
Tab        -> UL [OUTSIDE DECK]
Shift+Tab  -> UL [OUTSIDE DECK]
```

with all 27 stops enumerated and exactly one — `search` — carrying `tabindex="0"`. Unreachable:
`filter`, `next-conflict`, `float-paths`, the whole Author group, the whole Plan group, and the nine
View-group stops before it.

**It is not a keyboard trap**, and that is why it survived: §2.1.2 is satisfied because Tab exits
the deck. Focus was never stuck; only the commands were unreachable, which no trap check looks for.

**Fixed** by making the veto per **key** rather than per **element**: a single-line `<input>` claims
the horizontal keys and the line keys and nothing else, so the vertical arrows stay with the toolbar
and are the route out. `<textarea>`, `<select>` and contenteditable genuinely navigate with the
vertical arrows, so for those the veto stays total.

**Two things about how it was found are worth more than the fix.** It was found by the `#207`
journey (then numbered #182) — written to close a row about folded groups, which is not this — and it was invisible to
every existing instrument because **`Deck` had no unit suite at all**, while its keyboard docblock
said "the test caught it immediately". That sentence is true of `Toolbar.test.tsx`, about the other
primitive: a comment claiming coverage that belonged to a neighbour, which is ADR-0076 Class 3 in
the file the defect lived in. `Deck.test.tsx` now exists and pins the contract in both directions —
the caret keys the field must keep, and the vertical ones it must not.

---

## #190 — `Toolbar`'s vertical variant has no consumer, and a standard still documents it

**Status:** unverified

_Filed 2026-08-25 by the reconciliation pass. **CLOSED 2026-08-26** — the product owner chose
deletion over keeping it. The prop, its three branches, its `showLabel` clause and the
`DESIGN_SYSTEM.md` rule went in **one commit**, which was the point: the standard and the code could
not then disagree about which existed. `Toolbar` now announces `aria-orientation="horizontal"` as a
literal. What a future vertical surface would need is recorded in the primitive's own docblock — a
few lines of branch, and the **announcement** as the part to get right._

`Toolbar` supports `orientation="vertical"` and its docblock (`Toolbar.tsx:106`) calls it "the
**vertical mode rail**". `docs/DESIGN_SYSTEM.md:195` documents the rule that governs it — _"the
vertical variant is always icon-only; a 48 px rail cannot hold a label without wrapping, clipping,
or widening the leading edge of the application."_

**ADR-0109 D2 deleted that rail on 2026-08-24, and it was the variant's only consumer.** Verified
rather than assumed: `grep -rn 'orientation="vertical"' apps/web/src` returns five hits and **not one
is a `Toolbar`** — four are `PanelResizer` and one is `Tabs`.

So the branch is live code with no caller, and the standard beside it reads as a rule somebody must
follow. That is the ADR-0088 Class A shape one layer down — an alternative surface kept alive by
documentation rather than by a flag.

**Not fixed here, deliberately.** Removing the variant changes `ToolbarProps` — a component's public
contract — which fires an ADR-0105 trigger and wants a spec rather than a paragraph inside a
reconciliation pass. The cheap first move when it is picked up is to decide whether the vertical
option has a _future_ consumer (a rail is a plausible thing to want again) or whether it is dead:
if dead, delete the prop, the branch, its two `cn()` arms and the DESIGN_SYSTEM clause together, so
the standard and the code go in one commit.

---

## #191 — The local pre-push gate costs 8 minutes and 96% of it is two steps

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

## #192 — The fix for #189 broke the shipped `Go to date` field, and shipped that way

**Status:** unverified

_Filed and **FIXED** 2026-08-25 by RECONCILE step 7 — two independent specialist reviews reached it
separately, one reproducing it in real Chromium._

`#189`'s fix narrowed the deck's key veto from "any form field claims all six navigation keys" to
"a single-line input claims only its caret keys". The narrowing was right for a **text** field and
wrong for every other kind, and the discriminator was `tagName` alone:

`GoToTodayControl` renders `<Input type="date">` (`tsld-toolbar-items.tsx:533`), its item is
`row: 'strip'` (`:1930-1940`), so **`Deck` renders it** — and a date input steps its focused segment
with ArrowUp/ArrowDown. After the fix those keys were no longer vetoed, so the deck called
`preventDefault()` and moved the roving stop: **pressing ArrowUp in the date field changed no date
and threw focus onto an unrelated command**, closing the popover on the way.

That is **worse than the defect it replaced**. `#189` meant a command could not be _reached_; this
destroys an interaction the planner had already opened, and relocates focus with no announcement.
It was released in `web-v0.106.0` and lived for about ninety minutes.

**A second defect, same shape.** `Deck` did not check `event.defaultPrevented`, so a descendant that
had already handled the key was overruled. `ToolbarSplitButton`'s caret calls `preventDefault()`
without `stopPropagation()`; when the caret is **disabled** it moves focus to an element carrying no
`data-toolbar-focusable`, the roving lookup returns `-1`, and focus is thrown to the deck's **first**
stop — taking with it the only keyboard route to the caret's shaded reason (ADR-0082). That state is
routine, not rare: `Add ▾` and `Link ▾` are in it for every Viewer and every Contributor without the
pen.

**Fixed** by extracting one shared `toolbar-keyboard.ts` consumed by **both** `Deck` and `Toolbar`,
discriminating by `HTMLInputElement.type` in three cases — text entry claims the caret keys, a
value-stepping or group-navigating control (`date`, `datetime-local`, `month`, `number`, `radio`,
`range`, `time`, `week`, plus textarea/select/contenteditable) claims all six, and everything else
claims none — plus a `containerShouldStandDown` covering `defaultPrevented` and IME composition.
Verified red against the shipped guard: `date must keep ArrowDown: expected false to be true`.

**The reason it is one module now is the more useful half.** `Toolbar.tsx` carried a **byte-for-byte
copy** of the pre-#189 guard, still under a docblock describing _the deck's_ search field. The fix
had been applied to one of two copies — "one correct pattern applied to a control and not its
neighbour", which this register has recorded in five consecutive epics and which had gone unnoticed
here for a day. `Toolbar.test.tsx:219-241` names the "Go to date" control **by name** and tests only
the horizontal keys, on the primitive that has never rendered it.

**Two claims corrected in the process.** "The vertical arrows are the route out of a field" is true
only of **text** entry; a date field legitimately traps them and the route out is Tab or Escape. And
the first version of the `Deck` regression tests put a date input in the shared fixture, which
modelled nothing — in production that input exists only inside an **open, portalled popover**, and
the deck's permanent stop is the trigger button.

---

## #193 — Four more toolbar docblocks and five exports describe deleted machinery

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

**Five exports have no production caller**: `priorityOf`, `partitionByTier`, `resolveLayoutMode`,
`TOOLBAR_LAYOUT_BANDS`, `TOOLBAR_LAYOUT_HYSTERESIS_PX`. Both `Deck` and `Toolbar` now hard-code
`layout: 'comfortable'` as a literal, so `resolveLayoutMode`'s other three bands are unreachable and
`triggersAreCompact`/`searchFieldWidth` always take their roomy branch. They are exercised only by
their own tests — the ADR-0081 shape: tests validating code nothing calls.

### Two more, and how the first grep missed them (2026-08-30 verification sweep)

**The four docblocks above are now all corrected** — each carries a paragraph naming what it used
to say and citing this number. **The five dead exports all still stand**, re-verified: `priorityOf`
has no reference of any kind outside its own definition, `partitionByTier` and
`TOOLBAR_LAYOUT_HYSTERESIS_PX` are reached only by `toolbar-registry.test.ts`, and
`resolveLayoutMode` + `TOOLBAR_LAYOUT_BANDS` form a closed loop with it.

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

## #194 — "The epic's own gate pass removes it" has now failed twice as an instruction

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

## #195 — `pnpm prepush` cannot see uncommitted work in its diff-based checks

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

## #196 — Two primitive keyboard defects the ADR-0111 sweep found, one of them a data-loss path

**Status:** unverified

_Filed and **FIXED** 2026-08-26. Found by the first sweep run under ADR-0111, which the product owner
approved the same morning; both verified by **executing** code — one in real Chromium, one against
the real primitive — rather than by reading it. Neither was introduced by recent work._

### a. Escape inside a `Menu` or `Combobox` also closed the enclosing modal `<dialog>`

_2026-08-28 (fix-slice M-C): the fix's **third copy** landed. `usePopoverPanel` carried the same
capture-phase Escape listener with `stopPropagation()` alone — one directory from the two files
fixed below, unfound because the contract existed three times (#197 item 3's exact argument). It
now calls `preventDefault()` first, with a unit case red-verified against the stopPropagation-only
version; the clamp consolidation that fixed it also makes a fourth copy fail
`overlay-position.structural.test.ts`._

Both primitives owned a capture-phase Escape listener calling `stopPropagation()` and **not**
`preventDefault()`. `stopPropagation` withholds the key from other **listeners**; a modal
`<dialog>`'s Escape-to-close is a **default action**, evaluated against `defaultPrevented` once the
whole dispatch completes — so propagation was never relevant to it. Confirmed in Chromium: with
`stopPropagation` alone the dialog's `cancel` and `close` both fired and the dialog closed; adding
`preventDefault` left it open.

One Escape therefore did two things wherever either popup was opened inside a `Dialog` or `Sheet`:

- **`ResourceFormDialog` and `AddCrossPlanLinkDialog` set no `confirmBeforeClose`** — Escape to
  dismiss a dropdown discarded the whole half-typed form, silently. That is the data-loss half.
- `ActivityEditorDialog` sets one, so Escape either closed the editor or raised the discard
  confirmation over it — not destructive, but not what the reader asked for either.
- The mobile Project Explorer `Sheet`: Escape in a node's row menu closed the whole drawer.

**`combobox.tsx`'s docblock asserted the opposite** — _"so it closes the popup WITHOUT also closing
a surrounding Dialog"_ — and read as verified because `combobox.test.tsx`'s stand-in for a
surrounding dialog is a plain `<div onKeyDown>`, whose own comment admits it is "never a real
control". No jsdom test could have done better: `src/test/setup.ts` stubs `showModal`/`close` as
property flips that never fire `cancel`, so a real `<dialog>`'s Escape default action is
**unreachable in this repository's unit environment**. That is ADR-0111's argument, arrived at
independently by the instrument the ADR mandates, hours after it was written.

### b. A portalled `MenuItem` click also fired a React-tree ancestor's `onClick`

`Menu` renders through a portal, and React dispatches along the **React tree**, not the DOM one — so
an item's click reached whatever JSX encloses `<Menu>`. In the Gantt, `GanttRowMenu` is a React
child of the row, so **choosing any row-menu action also re-selected the row underneath it**.

`GanttRowMenu`'s trigger already stops propagation, with a comment giving the exact reason ("the row
itself selects on click; a menu press must not also change the selection out from under the
planner"). `GanttPanel` had applied the same insight to `onKeyDown` via `rowOwnsKey`. Neither was
extended to **choosing an item from** the menu the trigger opens — the rule applied to one control
and not its neighbour, twice over, in the same feature.

**Both fixed in the primitives** rather than at the call sites, since both are properties of what a
portalled popup owes its host. Regression tests verified red against the shipped code, with the
failure messages naming the defects. They assert the **mechanism** (`defaultPrevented`,
`stopPropagation`) rather than the outcome, because jsdom cannot reach the outcome — stated in the
tests rather than implied.

**Still open, non-blocking, from the same sweep:** `Combobox` filters disabled options out of its
arrow-key set while `Menu` (post-ADR-0082) keeps them focusable with a reason, and nothing records
why the two disagree — latent, since no production caller sets `ComboboxOption.disabled` today.
`Menu`'s outside-pointerdown listener does not exclude its own trigger, which can race a
toggle-to-close (mouse only).

---

## #197 — Three rules with two or three implementations each, agreeing by discipline

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

## #198 — `inkOf` measured a span, not ink — and my first framing of why was wrong

**Status:** unverified

_Filed and **FIXED** 2026-08-26 while preparing the one-row header decision. Recorded with its own
correction, because the correction is the more useful half._

`measure-toolbar/m0-merged-row.spec.ts`'s `inkOf` returned `max(right) − min(left)` over an
element's leaf rectangles — a **span**, not a measure of how much of the row is inked. It now returns
the **covered extent**: leaf x-intervals with overlaps merged. The old measure is kept as `spanOf`,
under a name that says what it is, and both are emitted.

**What I said it was, and what it actually is.** I filed this as "the span counts the empty middle of
a `justify-between` row". Measured, that is **wrong**: covered extent came back **equal to the
container** at all four widths (1222/1382/1588/1862), marginally _above_ the span. The header's leaf
rectangles tile the full width, so there is no empty middle to count. The real defect is that
`querySelectorAll('*')` filtered to `children.length === 0` treats a **stretched, non-inking
wrapper** as a leaf — a `flex-1` div with no children has width and height and therefore "covers"
everything beneath it.

The prediction was written into `docs/specs/one-row-header/falsification.md` **before** the run, as
hypothesis 1, precisely so it could be falsified. It was.

**The repair still mattered, for a different reason than I gave.** Every per-occupant figure came
down once internal gaps stopped counting: header cells 374 → **358**, breadcrumb 424 → **388**, mode
cluster 435 → **313**, pen furniture 173 → **157**. Those are the numbers the header decision needs,
and they were all overstated.

**Consequence for ADR-0110 D3.** It withdrew the one-row header on "536 px short at 1440". Measured
with the repaired instrument the shortfall is **266** at 1440 and **60** at 1646. The withdrawal
stands — it fails at three of four widths before gaps are even counted — but **the figure that
justified it was inflated**, so that decision was right for a wrong reason.

**Still not measured: inter-element gaps.** Every figure in the header spec is therefore a best case.
Anyone taking the merge further needs to measure them; the current per-occupant approach may not
survive it (hypothesis 3 in that document).

**The aggregate `headerInk` remains a poor question badly asked.** Equal to the container at every
width, it tells a reader nothing, and it is the field ADR-0110 D3 was priced from. Sum the occupants
instead. Left in place rather than deleted so the next reader can see why it is useless.

---

## #199 — `shoot.mjs` cannot photograph three of its own shots, and has not been able to for some time

**Status:** unverified

**Filed 2026-08-26** (the one-row header, M2-T5). **Pre-existing — verified against the stashed
pre-change tree, where it fails identically.**

`node scripts/shoot.mjs --width 1646` runs 21 shots and then **throws**, killing the process before
the remaining ones are taken. The failure is in `toggleViewSwitch`, which every shot needing a
`View ▾` switch goes through — `gantt-arrows` (logic links), the minimap shot, and the lens shot
that toggles float & drift, link slack and the late-start overlay:

```
locator.waitFor: Timeout 5000ms exceeded.
  - waiting for getByRole('dialog').last().getByRole('checkbox', { name: /logic links/i }).first()
    at toggleViewSwitch (apps/web/scripts/shoot.mjs:461)
```

**Two things are wrong and only one of them is the locator.**

1. The helper opens `getByRole('button', { name: /^View/ }).first()`. Since ADR-0109 D1 the deck
   renders foldable **group cards**, and the first group's caption is `VIEW` — a button, matching
   `/^View/` case-insensitively, and earlier in the DOM than the `View ▾` command it means. So the
   helper very likely folds a group card and then looks for a checkbox in a dialog that never opened.
   The docblock immediately above it records the previous version of this same helper timing out
   "against a perfectly correct control" for an analogous reason, which is why this is filed rather
   than fixed on a guess: **the next fix must be established by probing the live DOM**, not by
   reading, exactly as that docblock says its own correction was.
2. **A throw kills the run.** One unreachable control costs every shot after it, and the shot list is
   ordered, so the loss is silent unless somebody counts the files. A harness whose job is to put a
   screen in front of a reviewer should record "could not reach this control" against that shot and
   carry on — the ADR-0100 lesson that an instrument which produces nothing must say so.

**Why it matters more than a harness bug normally would.** ADR-0102 records two defects that _only_
photographs found, with every automated gate green, and ADR-0101 records the one surface the shot
list did not cover being exactly where a four-scrollbar panel reached a user. The three shots this
kills are the canvas lens states — the ones a contrast matrix and an axe scan structurally cannot
judge.

**Not fixed here** because it is unrelated to the one-row header and its fix needs a probe rather
than a reading; the 21 shots it did take were enough to judge M2-T5's question (what the merged
header did to the twelve screens that are not a plan).

**FIXED 2026-08-28 (correctness programme Phase 4), and hypothesis 1 was FALSE.** Probed on the
live workspace as this row demanded: `getByRole('button', { name: /^View/ }).first()` resolves
`[data-toolbar-item="view"]` — the RIGHT control — and no deck group card matches `/view/i` at
all, so the fold-a-caption theory does not hold on today's tree. The 2026-08-26 failure's exact
cause is unrecoverable (three epics have reshaped the deck since), which is itself the argument
for the shipped fix: the helper now locates by `[data-toolbar-item="view"]` (ADR-0091's own rule
— by the registry id, never the copy), so a renamed caption cannot recreate the failure class.
The second half shipped as specified: a failed shot records `FAILED — <reason>` and the run
carries on, with a non-zero exit naming every missing picture. Proven by running the instrument:
all 25 shots at 1646 including the three this row said were lost (`gantt-arrows`,
`plan-workspace-minimap`, `plan-workspace-lenses`), zero failures, one documented staff opt-in
skip.

---

## #200 — Two named-slot registries, one of them the better pattern, neither shared

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

## 202. Six non-blocking findings from the foot-row gate pass

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

**(b) The dock's precedence is three independent guards, one of them a conjunct.** `TsldPanel` spells
it `conflict ?`, `conflict ? null :` and `!conflict` inside a five-term `&&`, and the invariant holds
partly because `CanvasModeBand` returns `null` for a null statement two hundred lines away. A fourth
strip has to remember it in a third spelling. One derived
`const dockStrip: 'conflict' | 'mode' | 'empty' | null` would put the decision in one place and let
the test assert a value rather than the DOM. Deferred because the behaviour is correct and pinned,
and the refactor is a `TsldPanel` change with no user-visible half.

**(c) The object-action sweep runs collapsed-only and TSLD-only.** M1-T1 specified widening the fit
gate "in both panel states, on TSLD and Gantt"; the shipped case covers the collapsed TSLD state.
That is where the measured defect was, and the expanded state is the one M4 created, so the gap is
real. This is the ADR-0090 M5 drift class — a plan describing work correctly and the work not
happening — recorded here so it is a decision rather than an omission.

**(d) `LockView.badgeName` and `messageVisible` are optional fields on a flat interface.** Both are
governed by rules about the tone ("only on `locked`", "only on `lost` and the incoming-request
branch") that are held by unit cases rather than by the compiler. A discriminated union split by tone
would make them type-level facts. The cases exist and are verified red; the invariant is simply not
structural.

**(e) The foot row's own branching has no unit coverage.** `activity-bottom-panel.tsx` is covered
transitively through two callers and end to end by `dock.spec.ts`. The positional invariant genuinely
needs a real layout, so e2e is the right tier for that — but `hostsPlanSlots` toggling both outlets,
and `toggle` rendering when present and absent, are cheap to pin at the unit level and are not pinned
anywhere. This is the seam that produced the milestone's largest blocking finding.
**Re-verified 2026-08-28 (correctness programme Phase 4): STALE — the coverage exists.**
`activity-bottom-panel.test.tsx` pins exactly the two branches this item names ("gates BOTH plan
slots on `hostsPlanSlots`, never just one"; "renders the toggle when given one, and nothing in its
place when not"), 4/4 green. Added after this row was filed; the row was not updated. Item closed.

**(f) `bg-foreground/5` now paints on the canvas-dock surface scope for the first time.** The token
pairing is unchanged from `Deck`'s pre-existing use, and the card is decorative grouping with every
control inside carrying its own boundary, so 1.4.11 does not apply to the card itself. But
`token-contrast.test.ts` has no pair for this background on that scope, and ADR-0102's finding was
precisely that a scope can go unreached for a long time without anything reporting it. Worth adding
the pair rather than reasoning about it. Raised by the accessibility gate as a suggestion.

## 203. Two menu-positioning clamps, one now measured and one still guessing

**Status:** unverified · **Raised:** 2026-08-27 (`docs/specs/object-bar-defects/` M2) · **Size:** S · **Owner:** unassigned

_**CLOSED 2026-08-28** (fix-slice M-C, `docs/specs/fix-slice-2026-08/`), both halves. The clamp,
the measured correction and the top-layer portal target moved verbatim to
`components/ui/overlay-position.ts` — ONE implementation, with `menu.test.tsx` and
`ToolbarPopover.test.tsx` passing untouched as the move's oracle and a structural gate (verified
red naming both old hosts) against the next copy. **(a)**: both `Menu` and the popover now cap
their height to the space below the clamped top and scroll inside it, `clampAnchor`'s boundary
arithmetic gained the unit coverage this row asked for (red-verified against two deliberate
breaks), and the short-viewport pointer sweep in `e2e-toolbar` was verified red against the
estimate-only clamp. **(b)**: `usePopoverPanel` measures via the shared leaf; `View ▾`'s local
`max-h-[60vh]` workaround is deleted with its docblock (the arbitrary-value ratchet fell 18 → 17),
and the adoption also surfaced and fixed #196a's third copy — the Escape handler there still
lacked `preventDefault`._

`Menu` positioned its portalled panel from a hard-coded `ESTIMATED_HEIGHT = 200` and never measured
the real box, so a taller menu opened low in the window ran off the viewport and its last item was
**present, focusable and unclickable** — WCAG 2.4.11 for the item that was entirely below the fold.
Fixed by measuring (`useClampedPosition`), with an `elementFromPoint` gate in `e2e-wbs` verified red
first. Two things that fix does **not** cover, recorded rather than carried:

**(a) A menu taller than the viewport still overflows, with no scroll.** When the measured height
exceeds `window.innerHeight - 2 × CLAMP_MARGIN`, `maxTop` collapses to the margin: the top pins at
8 px and the bottom is still off-screen, and the panel has no `max-height`/`overflow-y`. Reachable
today at a short viewport or under browser zoom — 200% roughly halves `innerHeight` in CSS px, which
is exactly the population 2.4.11 protects. The two tallest menus in the product are the activities
table's `WBS_SUMMARY` row menu (8 items, ≈300–320 px) and `Share & export` (up to 10 items across
four captioned sections, ≈450–500 px). **What to do:** a `max-height` clamped to the available space
plus `overflow-y: auto`, so the panel scrolls instead of running off. Worth a unit test on
`clampAnchor` at the same time — it is a pure function and the boundary arithmetic currently has no
coverage but the browser gate.

**(b) `ToolbarPopover` is the same defect, unfixed.** `use-popover-panel.tsx` carries a **second,
duplicated** estimated-height clamp that also never measures. Its own known-tall case — `View ▾`'s
grouped checkbox panel — is worked around locally with `max-h-[60vh] overflow-y-auto`, and the
comment doing so names `ToolbarPopover`'s `ESTIMATED_HEIGHT` as the cause it is routing around. That
is the "one correct pattern applied to a control and not its neighbour" shape this register keeps
recording (ADR-0064 §7, ADR-0067, ADR-0080, ADR-0111). Not fixed here because it is a different file
and outside the stated scope of the change that found it — but the two clamps should become one.

Both raised by the accessibility gate on the `Menu` fix, which passed it with no blocking finding.

## 204. Four things the foot-row-and-deck epic found and did not fix

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

**(d) Two of three lens toggles offered to the product owner for promotion did not exist.** The
`AskUserQuestion` options named `Critical path`, `Float paths` and `Baseline overlay`. Only the
third is a promotable `LensToggle`: `float-paths` is **already** a deck item
(`tsld-toolbar-items.tsx`, `group: 'find'`, tier 3) and `Critical path` is not a lens at all — it is
a column header in the activities table and a settings-section heading. The options were written
from the M0 enumeration and from memory rather than from `LENS_TOGGLES`, which is ADR-0076 Class 3
one step upstream of a document: a decision-bearing claim asserted without checking, inside a
question put to somebody else. No code defect; recorded because the rule §19.11 states is about
claims in documents and this was a claim in a **choice**, and nothing currently covers that.

## 205. The fixture plan is unschedulable as seeded, and the horizon guard was an untyped 500

**Status:** unverified · **Raised:** 2026-08-27 (schedule-health-check M0-T1, F-M0-2) · **Re-diagnosed:** 2026-08-28 ·
**Closed:** 2026-08-28 (both halves — (b) `7aaf155c`, (a) fix-slice M-E fixture revision 2) ·
**Size:** S (done) + decision (taken) · **Owner:** api / product owner

**(b) is FIXED and proven live** (2026-08-28, `7aaf155c`). The engine's horizon guard is now a
typed `WorkingTimeHorizonExceededError` mapped to `422 VALIDATION_FAILED` reason
`CALENDAR_WORKING_TIME_UNREACHABLE` at both the recalculate transaction and the critical-path
test, per the ADR-0071 pattern; the calendar is named only when it is unambiguous (plan default
in play and no per-activity calendars), because naming a guess would be the ADR-0076 failure.
Regression: `working-time-calendar.spec.ts` (typed error, verified red) and
`schedule.e2e-spec.ts` ("refuses a calendar whose working time is unreachable with a 422, not a
500", against a real database).

**(a) was a misdiagnosis on both halves, and the control was the culprit.** Measured 2026-08-28:

- The seeder already refuses a re-seed cleanly — the plan create answers 409, the run reports
  `alreadyExists`, and **nothing is created or modified** on the second pass (ORG-library
  calendars are reused by name, their exceptions posted only on create). "The second seed pass
  corrupts working time" is false.
- The real trigger is the **fixture itself**: CAL-05 "Turnaround Window" has an empty base week
  and one working exception range, 05–16 Oct 2026 × 12 h = **144 h of working time that will
  ever exist**, while its TT.10 FS chain (A10200 24 h → A10300 96 h → A10400 36 h, zero lag)
  needs **156 h in sequence**. No valid schedule exists; the 422 is the correct answer to an
  infeasible network, not a defect.
- The row's "fresh single-seeded fixture recalculates cleanly" control was almost certainly the
  **legacy catalogue plan** seeded 2026-07-31 — before window-only calendars were creatable
  (#79, closed by `8e106b1f` on 2026-08-02) — so its CAL-05 was refused with a finding and the
  TT.10 activities fell back to the plan default. Every fixture seed **since 2026-08-02**
  attaches CAL-05 honestly and cannot recalculate (fresh-project seed + recalculate → 422,
  re-measured twice on 2026-08-28). The conformance harness never sees any of this because the
  adapter **substitutes** window-only calendars with the plan default
  (`conformance/adapter.ts:666-676`, its own recorded approximation — "in-window placement is an
  M5-epic edge case"), so the engine goldens stay green while the application is honest.

**A third defect fell out of the reproduction and is FIXED**: the seeder sent holiday exceptions
as `windows: []`, which the API deliberately refuses as "a second spelling of holiday"
(`create-calendar-exception.dto.ts` `@ArrayNotEmpty()`) — so **every empty-window exception in
the catalogue was dropped as a 422 finding**, and the Night Shift and Heavy Lift calendars
silently lost their non-working seasons. It now sends `isWorking: false`
(`packages/seed-http/src/runner.ts`, regression in `runner.spec.ts`, verified red).

**(a) is CLOSED — the product owner chose the amendment, and the measurement changed its shape**
(2026-08-28, fix-slice M-E; the full campaign is
`docs/specs/fix-slice-2026-08/m-e0-measurement.md`). CAL-05's window is now
**2026-10-01 → 2026-10-30** as fixture **revision 2** (`fixture.revision` + `revision_note` are
now required schema fields, so a content amendment cannot land undeclared). The spec's proposed
end-only widening was **disproved by running it**: with the end at 30-Oct the recalculation
still answered 422, because the **backward** pass starves independently — A10500's
`MANDATORY_FINISH 2026-10-16T18:00` needs the chain's 9,360 working minutes at-or-before the
pin and a window opening 05-Oct holds 8,610; on a window-only calendar there is no
representable late date before the window exists. Widening the start to 01-Oct gives the late
pass 11,490 minutes while **moving no forward date** (A10100's `MANDATORY_START` still pins the
chain to 05-Oct), so the breaks-logic case lands exactly as the fixture intended: fresh seed +
recalculate → **200**, A10400 EF 2026-10-17 past the pin, A10500 the plan's one flagged
violation, −1 float on the chain. Zero conformance/golden changes (the §4.8 audit's right-hand
column did not move — and could not, since the pure harness substitutes window-only calendars);
the generator, JSON, CSVs and the orphan `.xer` mirror moved together, with
`fixture-csv-consistency.spec.ts` now gating JSON↔CSV drift. Playbook Tier 1 and the ADR-0116
DCMA rows re-read fresh: every structural metric held to the digit; metric 7 moved 65 → 67 (the
chain's now-reachable negative float).

## 206. Health-check review suggestions consciously not folded at the M5 gate pass

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
- **(M6 addendum) `getCriticalPathTest` scans the plan's activities twice** — `buildEngineGraph`'s
  `loadActivities` plus `loadHealthActivities` for labels/factors, concurrent but on separate
  connections (so not one snapshot; a concurrent rename can label the offender stale, degraded
  gracefully to 'Unknown activity'). Measured immaterial (~0.7 ms beside an ~800 ms compute); fold
  the label columns into the engine loader, or a narrow `{id, code, name, calendarId}` loader, on
  next touch (the M6 backend-performance review).

## 210. The panel-Surface-plus-border pairing is a literal in four places, and it has already drifted once

**Status:** unverified · **Raised:** 2026-08-28 (reconciliation-pass component review) · **Size:** S · **Owner:** web

_**CLOSED 2026-08-28** (fix-slice M-D, `docs/specs/fix-slice-2026-08/`), with this row's own claims
corrected on the way — recording the corrections is the ADR-0071 lesson:_

- _**Seven pairings, not four.** The spec's re-derivation found six occurrences (four switchable +
  two `className="contents"` resizer scopes that must NOT switch, because a border needs a box) —
  and then the new structural gate's own first run found **three more** this row and the spec both
  missed: the workspace's three right docks in `plan-workspace-toolbar.tsx` (ADR-0110's rule — the
  gate found the defect its author could not enumerate). All seven switched to `PanelSurface`._
- _**"Trailing-edge border" was wrong for one of them**: the context drawer and the three right
  docks carry `border-l` (`border="start"`), not `border-r`. Building to this row's wording would
  have put a wrong edge on four of seven sites._
- _**Neither travelling minor was folded**, because neither trigger fired: nothing in the epic
  edits `paint.ts`'s wash branch or `HierarchyTree.tsx`. They stand below as filed._

_`PanelSurface` lives in `surface.tsx` with `panel-surface.test.tsx`, the missing border half is
asserted through the primitive's `data-panel-border` stamp in `app-shell.test.tsx` (verified red
against the raw-Surface call site), and `panel-surface.structural.test.ts` (comment-stripped,
pinned positive) fails the next raw pairing._

Every `tone="panel"` consumer pairs the `Surface` with a trailing-edge border, and the pairing is
a copied literal rather than a primitive: `app-shell.tsx:549-551` is character-for-character
`explorer-column.tsx:119`, `explorer-column.tsx:76-77` is the same pairing with the collapsed
spine's layout classes, and `context-drawer.tsx:81` is the fourth consumer. The drift is not
hypothetical — the first version of the `#172` fix copied only the ground half of the pairing and
was caught by a ux reviewer reading a screenshot, and `app-shell.tsx`'s own comment says so. The
fix is a small named primitive (e.g. `PanelSurface`, co-located with `Surface`) that renders
`tone="panel"` + the border together and takes only the layout classes, with all four sites
switched to it — **which changes a shared primitive's public surface, so it takes the ADR-0105
spec step rather than being folded mid-reconciliation-pass**; that is why this is a row and not a
commit (the review explicitly allowed either).

Two companions travel with the extraction:

- **The half that broke has no regression test.** `app-shell.test.tsx`'s `#172` assertion pins
  `data-surface="panel"` and never `border-r` — the ground half is pinned and the border half
  (the half the first fix dropped) is not. Assert through the shared primitive when it exists,
  not against the raw class string.
- **Two verbatim minors from the same review, on next touch of their files:** the
  `toggles.nonWorking && scene.isWorkingDay` guard is repeated by `paint.ts`'s primary and
  sub-floor wash branches (hoist once when the block is next edited — not now, the primary branch
  is byte-pinned by the golden log); and `HierarchyTree.tsx`'s `suppressClick` check-and-reset is
  duplicated between the row's and the name span's `onClick` (a `consumeSuppressedClick()` helper;
  no correctness bug today because `stopPropagation` means only one runs per click).

## 214. An approved plan clause was never built, and its own risk table says it shipped

**Status:** unverified · **Raised:** 2026-08-29 (ADR-0118 M0) · **Size:** S · **Owner:** web

`docs/specs/workspace-chrome-fit/implementation-plan.md:306` (approved) requires the target-size
sweep to run "…at every width, **in both plan views, once with a coarse pointer**", and its US-5
carries an approved acceptance criterion for the coarse minor axis. Its risk table at `:622` then
lists that sweep as the **mitigation** for the named risk _"a touch target shrinks (TECH_DEBT
#127/#133 are open)"_.

The shipped `apps/web/e2e-workspace-fit/command-surface.spec.ts` contains **zero** occurrences of
`hasTouch`, `pointerType` or `view=gantt`. Two clauses of an approved task were not built, one
acceptance criterion was never asserted, and **the document asserts the mitigation as delivered**.

This is the ADR-0090 M5 shape — _a document describing work correctly and the work not happening_ —
with a risk table claiming otherwise on top, which is worse than the plain version: ADR-0058's rule
is _verify the claim_, and here the claim is that something is already verified.

Discharged by **ADR-0118 M2**, which builds the coarse projection the clause asked for; the Gantt
half (`view=gantt`) is carried into M3 with the surfaces it belongs to.

## 212. An overlay's height ceiling must not be measured from its own output

**Status:** unverified

**Raised and FIXED:** 2026-08-29 (fix-slice M-G gate pass) · **Size:** S · **Owner:** web

Recorded rather than merely fixed, because the mechanism is a class this register keeps meeting
and the shape is worth naming once more.

M-C gave `Menu` and `usePopoverPanel` a height ceiling so a tall overlay scrolls inside itself
instead of running off the viewport (`#203(a)`). Both derived it as
`window.innerHeight - top - CLAMP_MARGIN` — **from their own clamped `top`** — which closes a
loop: the ceiling is applied to the element, `useMeasuredBox` then measures the element it just
constrained, and `useClampedPosition` clamps `top` against that constrained height. An overlay
whose natural height would have pushed it upward therefore learns nothing and settles at a fixed
point at the **pre-measurement estimate's** height, with its lower items in an internal scroll
region **below the fold** — the exact WCAG 2.4.11 defect the measured clamp exists to prevent,
reintroduced by the mechanism written to strengthen it. ADR-0090's _"the pass stopped measuring
its own output"_, one primitive over.

**Found by the sweep, not by a reviewer, and only because the anchor was low enough.** `e2e-wbs`'s
row-menu pointer-reachability sweep reported `Dissolve` at 1101 and `Delete` at 1133 against a
1080 viewport; re-run in isolation it **passed**, because the defect needs a row low enough
(anchor y ≥ `innerHeight − estimate − margin`) for the ceiling to bind. That is why the numbers
matter more than the pass/fail: they match the fixed-point arithmetic to the pixel, which is what
established the diagnosis rather than a re-run.

Fixed by one `overlayMaxHeight()` in the shared leaf — a **viewport-constant** ceiling, which
binds only when the overlay is genuinely taller than the screen (then `top` clamps to the margin
and it scrolls, `#203(a)`'s real case) and is inert otherwise. Guarded three ways, each verified
red first: a structural gate forbidding `innerHeight - top` anywhere in `apps/web`, a pinned
positive that both consumers call the leaf, and two unit cases pinning the ceiling's **value**
and its independence from the anchor. The unit test that existed asserted only that a ceiling was
`!== ''` — green against the looped derivation and the fixed one alike (the ADR-0093 shape),
which is why it was strengthened rather than trusted.

## 211. Fix-slice M-G suggestions consciously not folded at the gate pass

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
- **The export legend's group order differs from the DOM legend's** (ux, verified at the gate
  pass rather than assumed): `TsldLegend` lists the marker entries (Data date, Today) before the
  link entries; `EXPORT_LEGEND` lists links first. Pre-existing — M-F deliberately left
  `EXPORT_LEGEND` untouched — and the relative Data-date-before-Today order the docblock pins
  holds in both. The #48(e) hand-authored-mirror rule covers presence, not order; align order
  the next time either legend is edited.

## 215. Dense rows are 28 px on touch, and their height is a JavaScript constant

**Status:** unverified · **Raised:** 2026-08-29 (ADR-0118 M4 gate pass) · **Size:** M · **Owner:** a row-rhythm pass

**ADR-0118 D1's second named exception, filed rather than solved.** `Button`'s `icon-sm` stays
28 × 28 on both pointers, and the six of its eight consumers that sit in a dense row stay with it:
`HierarchyTree`, `GanttRowMenu`, `ActivitiesTable`, `CalendarRowMenu`, `explorer-column`'s collapsed
spine and `context-drawer`. Under the house rule they should be 44 on touch. They are not, and the
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
other five consumers have **no** large-target equivalent, which is the honest reason this is a
register row and not a closed question.

**Where it is exempted, so it cannot hide.** `e2e-workspace-fit/command-surface.spec.ts` excludes
`[role="tree"]` from the coarse projection by ancestor selector — narrow, visible, and named — and
`apps/web/src/styles/control-height.structural.test.ts` exempts `button.tsx::size-7` with the same
reason. Neither hides anything else.

## 216. The favicon's brand glyph is set in `system-ui`, and no gate can reach it

**Status:** unverified · **Raised:** 2026-08-29 (`docs/specs/typeface-outward-artefacts/`, CQ-1) · **Size:** S ·
**Disposition: a NAMED EXCEPTION the product owner took, not an oversight**

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

## 217. Two defects in the printed documents, found by photographing them for the first time

**Status:** unverified · **Raised:** 2026-08-29 (`docs/specs/typeface-outward-artefacts/`, M2-U2) · **Size:** S each ·
**CLOSED 2026-08-30** — both, plus two more the fix's own photographs found

The screenshot harness had **one** print shot — the health report — so the two documents a planner
actually hands over, the printed diagram and the printed programme, had never been photographed by
anything. M2-U2 added `tsld-print-diagram` and `gantt-print-programme`, and both defects below were
visible in the first picture each took. Neither is a typeface defect, so neither is fixed here.

**(a) The printed diagram states its title twice, in two date formats.** The print document draws
its own heading (`PrintSurface.tsx`) — `Riverside — Phase 2 Substructure` over `As of 05 Jan 2026` —
and the PNG mounted beneath it carries the export band, which draws the same plan name over
`As of 2026-01-05 · Generated 2026-08-29`. So the top of the page reads the plan's name twice, six
lines apart, with the same date rendered two ways. The band exists because the exported PNG is also
a standalone artefact (`export-image.ts:42`, `EXPORT_TOP_BAND`) and has to name itself; the print
document's own heading exists because a printed page needs a heading. Both are right alone. The fix
is a decision about which one paper keeps, not a bug in either — and the generated date is the one
fact only the band carries, so "delete the band on paper" is not free.

**(b) The printed programme's `Predecessors` column is `—` on every row, on a plan that has
links.** The shot is of the seeded programme, whose ten activities form a real dependency chain
(`shoot.mjs` `seedProgramme`), and the screen's Gantt grid shows those predecessors — ADR-0095 M5
shipped that column. `GanttPrintSurface` renders the column and receives no predecessor data to put
in it, so paper asserts, in a column of its own, that a linked programme has no logic. That is worse
than omitting the column: an em dash is a statement.

**Both are the same finding about the instrument.** ADR-0102 recorded that the shot list
photographed twelve screens and never once what the product PRODUCES; W1 added the exported PNG and
`docs/TECH_DEBT.md` #158 recorded the gap. The print documents were the remainder of it, and the
cost of that gap is measurable here: two defects in the deliverable, both plainly visible, neither
reported by any test, sitting in the artefact that leaves the building.

### How they closed, and what closing them turned up

**(a) is a DECISION, not a bug, and the code said so before I did.** `PrintSurface.tsx`'s docblock
records the duplication as deliberate — the image "is already self-describing… this surface adds
the plan-name · date heading the plan calls for". Both halves are right alone; nobody had looked at
the two together on a page, because nothing photographed the printed diagram until 2026-08-29.
Resolved in favour of the **document**: it is the accessible, selectable carrier and the one a
browser's print outline can see, so it keeps the name and now carries BOTH dates in one format,
while the picture keeps the legend — meaningless outside it — and the "scaled to fit" note, which
is a fact about that raster that nothing outside it knows. `renderExportImage` gains
`bandContent: 'full' | 'legend-only'`, defaulted, so the standalone PNG and PDF are unchanged; the
band shrinks 96 → 48 px and the printed diagram gets that back as chart.

**(b) is the second instance of one failure in one file.** `barDateSource`'s own docblock in
`GanttPrintSurface.tsx` records the first: props threaded onto the surface while `PrintGanttInput`
stayed silent, so "the only production caller could not pass it and never did". `predecessorNames`
is the same shape — the column has taken a fourth argument since it shipped and the entry point
never had one to give it. **Optional is what both have in common**, so the two new inputs
(`dependencies`, `hiddenColumns`) are required, the ADR-0070 `hoursPerDay` pattern. Fixing it by
adding more optional parameters would have reproduced the cause.

**A third thing fell out of (b): paper ignored the reader's column choice.** The surface mapped
over all of `GANTT_COLUMNS` while the screen hides Predecessors by default — so once the column
carried real names it would have grown every existing plan's document a wide column overnight,
which is the change that column's own docblock says nobody asked for. Paper now follows the choice
(ADR-0103/#167's "the export is MY picture", one artefact along). Recorded in `docs/DECISIONS.md`.

**A fourth was visible only in the photograph after the fix.** With names arriving, the column
printed `Site setup & h…` and `Excavate to fo…`: it had no `PRINT_COLUMN_WIDTHS` entry, so it took
the 72 px default — on the column the screen calls the widest. It never mattered while every cell
was an em dash. Now 132 px, which fits every single-predecessor name on the fixture and truncates
only a genuine two-name list.

The instrument point stands and is now doubled: the shots found the two defects, and re-running
them **after** the fix found a fifth thing the tests could not see. A green suite says the names
are in the DOM; only a picture says they are readable.

## 218. Two review suggestions from the typeface gate pass, not folded

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

## 219. The register's own rows go stale, and nothing measures how much

**Raised:** 2026-08-30 (the verification sweep this row is the output of) · **Size:** M ·
**Status:** open

The product owner asked what was worth doing for polish and correctness, and the recommendation was
drawn from three register rows. **One of them — `#109` — had been fixed three weeks earlier**, which
was discovered only after it was recommended, by opening the code. That is ADR-0076 Class 3
committed against this file, in the same message that warned the reader this file drifts. So the
sweep that followed was not a tidy-up: it was an attempt to find out how big the error is.

### What was verified, and what it cost to verify it

Seven rows were checked against the code by hand. **Six were fixed and never closed** — `#106`,
`#109`, `#134`, `#144`, `#146`, `#147` — and each closure above carries the evidence that settled it.
**One, `#169`, was reported fixed by an automated sweep and is half fixed**, which is the calibration
worth keeping: an unverified report about the register is a document like any other.

Three distinct causes, none of them forgetfulness:

1. **The fix landed inside an epic named for something else.** `#109` shipped in `3cf27de4`, a
   commit about ADR-0082/0083/0084/0085. Nothing in either artefact pointed at the other.
2. **The subject was deleted rather than fixed.** `#134` and `#147` describe a width ladder ADR-0109
   D1 removed entirely. Their diagnoses were right; their remedies expired with the machinery.
3. **The premise lapsed under a later decision.** `#146` exists because Graphite M3 moved the
   wordmark into a rail; ADR-0109 D2 deleted the rail. Nobody was wrong at any point.

Cause 3 is the one with no available cue at all. A register row is a claim about the product frozen
at the moment it was written, and every subsequent epic is a chance for it to stop being true —
silently, because a milestone that fixes something does not go back and edit the rows that complained
about it. That is `docs/RECONCILE.md`'s rule stated for the register rather than for prose, and
ADR-0058's failure one artefact along.

### The measurement that makes this a row rather than an anecdote

**Status is not machine-readable, and nothing can count what has gone stale.** Of ~105 rows, only
**35 make a status claim a parser can find**; the other 70 say nothing, or say it in prose. Three
classifiers were written against the file and returned three different answers — and the second was
wrong in an instructive way: it matched the word "closed" inside `#169`'s own sentence explaining
that a neighbouring row _would read as_ closed when half closed. Scanning prose for a verdict is the
fourth instance of that mistake in this repository, and this one was made while auditing the register
for exactly this class of error.

So the residue is a **known-unknown of about 70 rows**, and the honest thing is to say that rather
than to have an agent classify them and write the answers in as fact.

### What is owed

**(a) A `**Status:**` line on every row, and `pnpm check:debt-status` to parse it.** Rows written
since roughly `#205` already carry one; the older ones do not. A gate would make a row that claims
`open` while its subject is deleted a build failure rather than a discovery three weeks later. This
is a **shared gate**, so it fires ADR-0105 and needs a spec and approval before any of it is built —
which is why it is recorded here instead of being slipped in with the closures.

**(b) The ~70 unclassified rows, verified in batches against the code.** Not by reading them: the
whole finding is that reading a row tells you what was true when it was written. The verification
unit is "open the file the row cites and see", which is what produced all seven results above.

**(c) A rule for cause 1**, which is the cheapest of the three to close: a commit that fixes a
register row says so, and the row says which commit. Every closure written above had to reconstruct
that link by `git log` on the file the row named.

**Why it is debt and not a defect:** nothing is broken in the product. What is broken is the register's
usefulness as an input to "what should we do next", which is the one job it has — and the cost has now
been paid once, in a recommendation to the product owner for work that was already done.

---

## 220. The reconciliation trigger's input is unsorted prose, and a careful reader misread it

**Status:** unverified · **Raised:** 2026-08-30 · **Size:** S · **Status:** open

> **This row's first version was built on a false claim and is rewritten rather than patched.** It
> opened with a table asserting the cadence had failed **twice** — eleven epics before the
> 2026-08-25 pass, then nine more before 2026-08-30. **The second half was wrong.** There was a pass
> on **2026-08-28**; the real gap was **three** ADRs over two days, which is a healthy cadence. The
> argument below is narrower and, unlike the version it replaces, is demonstrated by the mistake that
> produced it.

`docs/RECONCILE.md` says the pass runs **at each epic boundary**, with a three-month hard floor. The
floor works, because a date is a fact a person can check. The trigger is weaker, and the reason is
not that anybody forgets.

**The evidence is this row's own history.** Auditing that file _specifically for staleness_, with the
question "when was the last pass?" explicitly in mind, I read the pass table with `tail -8` and got
2026-08-19. I noticed line order was not date order, corrected to 2026-08-25 — **and stopped at the
first correction instead of sorting the column.** The table ran 08-20, 08-28, 08-30, 08-25, 08-19,
08-18, and 08-28 was two rows above where I was looking. The banner at `:7` said "Last full pass:
2026-08-28" and disagreed with the table's newest row, under a paragraph whose own rule is _record
the pass, add the row, update the date — all three, in the same commit_.

So the honest statement of the problem is **not** "people forget to run the pass". It is:

> **The only record of when the pass last ran is unsorted prose with a contradicting summary line,
> and reading it correctly is harder than it looks.**

That is a much better argument for a computed observer than a missed deadline, because it does not
depend on anyone's diligence. Both defects are repaired — the table is sorted newest-first and the
banner agrees with it — which removes the tripwire and leaves the underlying fact: nothing computes
the gap, and the answer still has to be derived by hand from two places that can disagree.

**One measured failure survives, not two.** The 2026-08-25 pass found **eleven** epics with no pass
since 08-20. That is real and quoted from the file. A gate is still worth building on one instance
plus a demonstrated misreading — but "it happened twice" was the claim, and it was not true.

**What is owed.** A `check:reconcile-due` deriving the gap from ADRs filed since the table's newest
date, **warning loudly in the pre-push gate and never blocking CI** (product-owner decision,
2026-08-30). Three things to settle, none obvious:

1. **The threshold must be derived, not picked** — from the realised inter-pass intervals, with the
   working shown. A threshold that fires constantly during a run of small epics gets ignored.
2. **Warn, not fail — with the weakness written down.** A hard failure blocks a release on a
   documentation chore, which is how a gate gets bypassed with `--no-verify`; once bypassed it is
   bypassed always. The honest cost of warning is that **a warning is ignorable**, which is a real
   objection and not one to design away.
3. **An ADR is a proxy for an epic, not the thing.** Some epics file none and some file two, so the
   trigger counts the wrong noun — acceptable only if stated.

**This is a shared gate**, so it fires ADR-0105. Spec and plan are at `docs/specs/drift-gates/`,
covering this and `#219(a)` as one epic — they are the same shape, a documented obligation with no
computed observer, and share their parser.
