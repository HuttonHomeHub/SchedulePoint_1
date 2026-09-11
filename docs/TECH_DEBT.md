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

**A table inside a detailed row must not lead with a bare number.** `check:debt-status`'s A6 reads
any `| N | … | … |` line as a Closed-numbers ledger entry and checks its third cell is a date, and
it cannot tell a ledger row from a data table in a detailed row — so a table of widths keyed
`| 1440 | … |` is reported as three malformed ledger rows (observed 2026-09-11, filing #294). Label
the cell instead — `| 1440 px |` — which costs nothing and reads better anyway. The alternative,
teaching the parser about sections, is a shared-gate change that fires ADR-0105, and the gate is
correct to be generous about what it finds (ADR-0124: finding is generous, refusing is strict).

**Normalised 2026-09-01** (`docs/TECH_DEBT.md` #227): 31 rows had drifted to `##` and are now `###`.
Two things that paragraph got wrong are corrected with it. It said **three** rows had drifted, which
was already wrong by a factor of ten when ADR-0120 — whose entire subject was this file — was
written; the count had reached 70 of 100 by the time #227 measured it, and 31 of 60 by the time it
was fixed. And its explanation was **inverted**: it said `##` "made every detailed item a child of
Principles for managing debt … rather than a sibling of its peers", and the nesting works the other
way round. A reader checking the rule against the document was told two things, one false and one
backwards.

### 58. The tiered ruler and TODAY chip (ADR-0055 S4, deferred)

**Status:** open · **Verified:** 2026-09-09

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
> is now the cursor-readout block. **What genuinely remains is the tiered ruler alone**, and it is
> worth noting that the band is no longer three rows but five: three tick rows plus two marker rows,
> whose y a redesign must respect (ADR-0106 D3 — the year label may never be occluded).
>
> **And that residual is smaller than both statements of it** (re-derived 2026-09-09). The row lists
> "year centred / month names / day numbers, month tint" in two places, and **month names and day
> numbers already ship**: `render/time-scale.ts:213` pushes `MONTHS_SHORT[m - 1]` and `:208` pushes
> `String(d)`, rendered at `TsldCanvas.tsx:2203-2207`. What is genuinely absent is **year-centring**
> — the year and month rows still clamp left (`syncRulerRow(…, true)`, `TsldCanvas.tsx:1607-1608`) —
> **and the month tint**, the ruler container carrying one flat `bg-canvas` with no per-month fill
> (`:2192-2196`). Two items, not four, and neither of the two that shipped was recorded as shipping.

S4 landed the canvas month bands — the diagram on its own banded ground — but deliberately stopped
short of the tiered ruler redesign (year centred / month names / day numbers) and the TODAY chip.
_(Both of those inner items have since shipped, and the TODAY chip with them — see the note above;
the outstanding pair is year-centring and the month tint.)_
Both are DOM work over the canvas, both were specified (`docs/specs/designed-ui/`, S4-F2), and both
were held back rather than rushed alongside a change to the painter's hot path in the same slice.

They are additive and behind the same `VITE_CANVAS_VISUAL_LANGUAGE` flag, so they can land as their
own slice without re-opening anything S4 shipped.

### 60. The Gantt's scroll behaviour is unmeasured on real hardware

**Status:** open · **Verified:** 2026-09-10

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

> **Two corrections, 2026-09-03 verification sweep.** This row refers twice to **#59**, which is not
> an open row — it was folded into #75 and closed on 2026-08-03, so a reader following it lands in
> the Closed-numbers ledger.
>
> And its stated obstacle has **lapsed**: the row says the only browser available is CI's headless
> Chromium, but #75's Route A (`apps/web/scripts/measure-draw-in-browser.js` plus its runbook) is a
> no-install DevTools method on the operator's own machine, added 2026-08-03. It has simply never
> been pointed at the Gantt. That makes this row **cheaper than it reads**, which is the direction
> that matters: it has been sitting behind an obstacle that was removed a month ago.

> **Re-derived 2026-09-10: STILL TRUE, and this row's own "cheaper than it reads" footnote is
> WRONG.** Nothing that has landed since covers it. `apps/web/measure-gantt/` measures **link
> density** and its own docblock excludes render cost by name (`link-density.spec.ts:36-39`, _"Not
> measured here: the render cost of drawing N paths… A render measurement is its own task"_); its
> sibling measures grid-width arithmetic. The ADR-0128/0130 staff perf probe — built precisely so an
> operator can measure on their own machine — has **two scenarios and neither is the Gantt**
> (`scenarios.ts:99`, `:123`). `e2e-gantt/gantt-scale.spec.ts:30-32` still delegates here by number.
>
> **The footnote claimed #75's Route A "has simply never been pointed at the Gantt", making this
> cheaper than it reads. It cannot be pointed at the Gantt.**
> `apps/web/scripts/measure-draw-in-browser.js` refuses it **twice** — `:44-49` aborts with "No
> canvas found. Open a plan on the Diagram (TSLD) view", `:63-68` aborts on the missing activity
> listbox — and the Gantt has neither, by ADR-0059 §1's whole decision. The runbook says so too
> (`docs/guides/measure-draw-performance.md:47-48`: "**not Gantt**"). The rAF-wrapping _technique_
> transfers; the shipped script does not. Cheaper than it was, not "point the existing script at it"
> cheap.
>
> **Two figures in the body are wrong.** The journey does not seed "two plans an order of magnitude
> apart": it seeds **one** plan and tops it up (`gantt-scale.spec.ts:67`, "Top the SAME plan up by
> three times"), from `FIRST_FILL = 100` to `TOPPED_UP = 300` (`:45-46`) — a factor of **three**. The
> spec's own comment says three. And the stale `#59` reference the footnote corrects here **still
> stands uncorrected in the code**, at `gantt-scale.spec.ts:30`.

### 62. `canReadCost` is derived from the role because the DTO cannot say

**Status:** open · **Verified:** 2026-09-09

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

**Status:** open · **Verified:** 2026-09-10 · **Size:** M · **Owner:** web

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

**Re-verified 2026-09-10**: `AssignmentRow.tsx:511` is still `{canWrite ? (`, unchanged, and
`components/ui/` still contains no checkbox primitive — so neither this row's survivor nor #72's
has moved since the narrowing.

**Already specified**: ADR-0083 D5 cites this exact line and schedules it as **M3** (_"`AssignmentRow`
(#64's worst case)"_), which has not landed. So no new spec is owed — the work is to delete the
summary branch and move six hand-rolled controls onto the gated primitives, plus tests.

**Sequence it with #69**, whose remedy may move `AssignmentRow` to a different editing idiom
altogether; doing this first and that second would rewrite the same file twice.

### 69. Two idioms for editing a row in place

**Status:** open · **Verified:** 2026-09-09

`AssignmentRow` saves each field with its own inline button; `DependencyTable` opens a dialog per
row. Both are defensible on their own and they now sit in **adjacent** tabs of one editor _(this
said "two tabs apart" until 2026-09-09; Logic registers immediately before Resources —
`ActivityEditorDialog.tsx:563` then `:575`, with the ordering reason between them — so the two
idioms are one tab-press away from each other, which makes the inconsistency easier to meet rather
than harder)_, so the
inconsistency is visible in a way it was not when each lived in its own pop-out.

**What would close it:** pick one row-edit idiom and state it in `docs/DESIGN_SYSTEM.md` (the
list/manage archetype is the natural home), then move whichever surface loses. Raised by the
ADR-0062 component gate as a suggestion — deliberately not rushed inside the epic that noticed it.

### 70. The API e2e harness cannot reproduce a same-plan write race

**Status:** open · **Verified:** 2026-09-09

The WBS re-parent path takes the plan advisory lock so two mirror re-parents cannot both pass a
still-acyclic ancestor walk (ADR-0038 invariant (a), fixed in the WBS-improvements M0). The natural
regression test — two mirror `PATCH`es fired with `Promise.all`, the shape used by
`resource-hierarchy.e2e-spec.ts` and `dependencies.e2e-spec.ts` — **does not actually race** in this
harness: instrumenting the ancestor walk showed the second request beginning ~15 ms _after_ the
first transaction had already committed, on two separate keep-alive sockets, so it passes
identically with the lock removed. Concurrency itself is fine (two interactive Prisma transactions
were measured interleaving correctly) — the requests are serialised somewhere earlier in the
in-process Supertest path.

The consequence is that the four existing "serialises concurrent mirror X" e2e tests are weaker
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

**Status:** open · **Verified:** 2026-09-10

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

**Status:** open · **Verified:** 2026-09-10

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

**Fourteen** call sites across five modules now serialise on the same per-plan advisory key —
`activities.service.ts` (6), `baselines.service.ts` (3), `plan-lock.service.ts` (3),
`dependency.repository.ts` (1) and `schedule.repository.ts` (1). If recalculate's hold time were to
approach the transaction timeout, a batch WBS write queued behind it would fail with a P2028 rather
than waiting cleanly.

_(Both halves of this paragraph were wrong and are corrected 2026-09-03 by the register verification
sweep. It said **"five write paths"**, an undercount of nearly three to one. And it said **"none of
the `$transaction` calls sets an explicit timeout, so they share Prisma's 5 s default"** — false, and
contradicted by this row's own header block: `prisma.service.ts` sets
`transactionOptions: { timeout: TRANSACTION_TIMEOUT_MS }` with `TRANSACTION_TIMEOUT_MS = 15_000` on
the client constructor, plus a 60 s batch override. So the headroom this row worries about is **3x
larger** than it claimed, against a recalculate route measured at 694.3 ms p95 — which makes the
P2028 scenario much less likely than the row implied, without making the measurement it asks for any
less worth taking.)_

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

> **Re-derived 2026-09-10: STILL TRUE, and every figure in it is exact.** Fourteen
> `acquirePlanWriteLock(` call sites across five modules — activities ×6, baselines ×3, plan-lock
> ×3, `dependency.repository` ×1, `schedule.repository` ×1 — counted, and matching the row row for
> row. The 15 s global and 60 s batch ceilings are `prisma.service.ts:25` and `:36`, applied at
> `:43`, with the two overrides where the row says. The parent-chain walk really has **no depth cap**
> (`activities.service.ts:184-193`, an unbounded `while` issuing one query per level inside the
> transaction that took the lock).
>
> **No contention benchmark exists anywhere** — all fifteen `measure-*` scripts were searched and
> `advisory`/`contention`/`concurrent` appear in none of them, and no API e2e drives two writers at
> one plan key. **ADR-0116 M6 does not close this**: its 694.3 ms recalculate figure is the whole
> HTTP route end to end, which bounds the hold from above and says nothing about how long the lock
> is actually held or how long a queued writer waits. The row cites it as indicative and is right to.
>
> One citation nit: `prisma.service.ts` lives at `apps/api/src/**prisma**/`, not under `common/`, so
> a reader grepping the path this row implies finds nothing.

### 75. The draw budget, measured on real hardware — and the budget itself was misquoted

**Status:** deferred (on a trigger) · **Verified:** 2026-09-10 · **PARKED 2026-09-10** — see the
box below. **No longer blocked on the product owner.** Five
sittings were taken 2026-09-10 (items 6, 6(e), 6(f)). §9's gate is **met at every judgeable point
that reproduces**, at both scales and both framings. What remains is one attribution (the ~8 ms,
which needs a DevTools recording) and one instrument gap (#283's unrecorded power state, now the
leading explanation for the only reading that ever missed the floor). Neither is a press.

> **PARKED — product-owner decision, 2026-09-10.** The canvas-performance programme is closed for
> now. The question it existed to answer is answered: **ADR-0026 §9 is met at every judgeable point
> that reproduces**, at 500 and 2,000, at both framings, and the layout gates run at the product
> owner's own widths (1920×1080, 1646×1097, 1440×960, 1280×800 — `apps/web/e2e-workspace-fit/
command-surface.spec.ts:35-40`). Nothing in the product is known to be failing for a user.
> **This is not "no longer a defect" — it is "not worth more of anybody's attention today".** The
> triggers below say when it becomes worth it again; none of them is a date, because a date would
> make somebody re-read this on a Tuesday for no reason.
>
> **Trigger for this row specifically:** somebody reports the diagram feeling slow, OR a reading is
> taken that misses §9's floor and reproduces. The residue is one attribution — the unaccounted
> ~8 ms per frame at Fit — and #75's standing rule still holds: **it must not be guessed**, and a
> DevTools Performance recording is the instrument, not another fps run.

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
   guessed — the surface a planner actually uses is smooth. ~~What is genuinely unmeasured is the
   **500-activity** limb of §9's two-limb gate, which has no real-hardware reading at all.~~
   **Struck 2026-09-09:** item 5(a) below measured it and it passes at both framings — 59.8 fps at
   Week, 57.2 at Fit. This sentence sat above the item that disproved it for a day, in the row whose
   own subject is a superseded figure surviving where a reader trusts it. And
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

5. **Second real-hardware reading set, 2026-09-08 — taken on the ADR-0128 staff panel, and it
   settles this row's own named residue while unsettling its verdict.** Same machine as the
   2026-08-03 set as far as the report can tell (`ANGLE (Intel, Intel(R) Arc(TM) Pro Graphics
(0x00007D55) Direct3D11)`, 22 threads), Edge 152, 60 Hz, DPR 1 — but at a **1912×1068** viewport
   against that set's ~1036×600 canvas. `scale-scene`, full run, 180 frames × 3.

   | framing | plan  | bars drawn | mean fps (slowest–fastest) | dropped  | interval p95 | §9 floor | against it |
   | ------- | ----- | ---------- | -------------------------- | -------- | ------------ | -------- | ---------- |
   | Week    | 500   | 243        | 59.8 (59.4–60.0)           | 0.19 pp  | 16.80 ms     | 45 fps   | **PASS**   |
   | Week    | 2,000 | 267        | 60.0 (60.0–60.0)           | 0.00 pp  | 16.80 ms     | 30 fps   | **PASS**   |
   | Fit     | 500   | 540        | 57.2 (54.0–59.7)           | 4.63 pp  | 33.40 ms     | 45 fps   | clears it  |
   | Fit     | 2,000 | 1,792      | 23.3 (22.6–24.2)           | 97.22 pp | 66.70 ms     | 30 fps   | **short**  |

   The two Fit rows are ungraded by P3 (`docs/specs/revision-compare-changes/m0-condition.md:87-90`),
   so "clears it" and "short" are arithmetic against §9's floor, not verdicts the panel issued.

   **(a) The 500-activity limb is measured, and it passes at both framings.** This row's own closing
   sentence names it as "the genuinely open residue"; ADR-0026 §9 has stated a 45 fps floor for it
   since 2026 and nothing had ever checked it. 59.8 fps at the working zoom and **57.2 fps even at
   whole-plan** — where the cull has nothing left to remove and all 540 bars are drawn. At the scale
   a planner's ordinary plan actually sits, the painter is not close to trouble anywhere.

   **(b) Step 3's question is answered, and the answer is the design property it hoped for: the cost
   is in the bars drawn, not in the plan.** That step asked for 500 as well as 2,000 precisely
   because "two points tell you whether the cost scales with the plan or with the viewport, and only
   the second is a design property worth having". The control is as clean as this instrument can
   produce — **Week/500 draws 243 bars at 59.8 fps and Week/2000 draws 267 at 60.0 fps**: four times
   the plan, 24 more bars, two tenths of a frame per second. Then Fit/500 draws 540 at 57.2 and
   Fit/2000 draws 1,792 at 23.3. Plan size does not appear anywhere in that; bars drawn explains all
   four. **So the remedy space is drawing cost — decimation at low px/day, dirty regions — and not
   anything about plan size.** ADR-0026's reserved escalation is still reserved, but the question it
   would answer is now the right one.

   **(c) The foot verdict above no longer holds unconditionally, and is amended rather than
   rewritten.** It reads "PASS at both zooms, at the 2,000 ceiling, on real hardware", from a Fit
   row of ~53 fps and 10.2 % dropped. This run puts Fit/2,000 at **23.3 fps against a 30 fps floor**
   — 6.7 fps short — and at 97.22 pp dropped. On the numbers in hand §9's gate is **met at Week at
   both scales, met at Fit at 500, and missed at Fit at 2,000**.

   **(d) That is NOT established as a regression, and must not be recorded as one.** The comparable
   quantity moved 10.2 % → 97.22 %, and three differences are live between the two runs, none
   eliminated:
   - **Canvas area.** ~1036×600 then against a 1912×1068 viewport now — roughly **2.3× the pixels**.
     This row's own leading hypothesis for the unattributed ~8 ms is "full-canvas raster/upload each
     frame on an integrated GPU", and that cost is area-proportional, so the confound sits exactly on
     the mechanism.
   - **Scene.** Then, a 2,016-activity XER imported through the product's own importer. Now,
     `scale-scene`'s 2,160 bars / 3,200 links / 50 lanes. This row already records that **the scene
     dominates the number**.
   - **Bars drawn.** Today's Fit/2,000 draws **1,792**. The 2026-08-03 set does not record bars drawn
     at all — which is why the panel prints `on screen` on every limb — so the single quantity (b)
     shows to explain everything is unknown for the run being compared against.

   Week is consistent across both dates (0/600 dropped then, 0.00 pp now), which is what makes the
   Fit gap worth explaining rather than dismissing: whatever changed did not change the working zoom.

   **(e) The discriminating run was taken the same day, at 1016×636 — and it answers "mostly, but
   not entirely".** Fit/2,000 at the matched canvas: **39.5 fps, 47.78 pp dropped, 1,218 bars drawn**,
   against 23.3 fps / 97.22 pp / 1,792 bars at 1912×1068. Shrinking the window recovers **17.6 ms of
   the 24.1 ms gap (73 %)** against the 2026-08-03 figure of ~53 fps. **6.5 ms remains unexplained.**

   So viewport area is the largest single term and it does **not** close the gap, and the residual is
   not attributable from what exists: the remaining differences are the scene (a 2,016-activity XER
   imported through the product against `scale-scene`'s 2,160 bars / 3,200 links / 50 lanes) and
   bars drawn, **which the 2026-08-03 set does not record**. This row already establishes that the
   scene dominates the number. The verdict therefore stays where (d) put it — **not established as a
   regression, and no longer fully explained either** — and the honest close is that the one
   statistic that would settle it was never captured for the run being compared against. That is why
   the panel prints `on screen` on every limb.

   **Note the experiment does not isolate area cleanly, and was not expected to**: shrinking the
   window also drops bars drawn (1,792 → 1,218), because a shorter canvas frames fewer lanes. Both
   terms moved together, which is what the model below exists to separate.

   **(f) A two-term model fits all three uncensored Fit points, and its area term is the size of the
   unattributed time.** Fitting `frame = a + b·bars + c·area` to (540 bars, 2.04 Mpx, 17.48 ms),
   (1,792, 2.04, 42.92) and (1,218, 0.65, 25.32):

   - **~20.3 µs per bar drawn**
   - **~4.26 ms per megapixel of viewport** — 8.7 ms at 1912×1068, 2.8 ms at 1016×636
   - intercept −2.2 ms, which is unphysical and says the model is approximate

   The area term at the full-screen window is **8.7 ms**, and this row's long-standing unattributed
   figure is **~8 ms**, whose stated leading hypothesis is "full-canvas raster/upload each frame on
   an integrated GPU" — a cost that is area-proportional by nature. That is a striking agreement and
   it is **not evidence**: three points against three free parameters is exactly determined, has zero
   degrees of freedom, and cannot be falsified by the data that produced it. The one further point
   available (Fit/500 at the small window) is censored at the 60 fps cap and merely fails to
   contradict it. **A fourth Fit/2,000 run at an intermediate window — roughly 1450×850 — would give
   the model its first degree of freedom**, and until then it is a hypothesis with an arithmetic
   shape, not an attribution. Step 3's DevTools recording is still what would attribute it.

   **(g) §9's gate does not name a canvas size, and these two runs show that decides it.** ADR-0026
   §9 fixes the hardware — "a mid-tier laptop **and** an iPad-class tablet (Safari)" — and says
   nothing about the viewport. The same plan, same machine, same painter, minutes apart, measures
   **23.3 fps at 1912×1068 and 39.5 fps at 1016×636**: fail and pass against the same 30 fps floor.
   A gate whose verdict turns on an unstated parameter is underspecified, and that is a defect in the
   gate rather than in the painter. Filed as **#261**.

   **What is still unattributed is unchanged.** This panel reports frame pacing, not where the time
   goes inside a frame; the ~8 ms between "JS finished" and "frame presented" needs a DevTools
   Performance recording, exactly as step 3 says, and must still not be guessed.

6. **Third real-hardware reading set, 2026-09-10 — and it falsifies item 5(f)'s model with the very
   point 5(f) asked for.** Same machine (`ANGLE (Intel, Intel(R) Arc(TM) Pro Graphics (0x00007D55)
Direct3D11)`, 22 threads), Edge 152, 60 Hz idle interval 16.70 ms, DPR 1, attention held — at a
   **1912×948** viewport, `web-v0.125.3`. `scale-scene`, full run, 180 frames × 3.

   **The painter and the scene are unchanged between the two sittings**, which is what makes them
   comparable at all: `apps/web/src/features/tsld/render/paint.ts` last changed in `d4270f22`
   (2026-09-06) and `apps/web/src/features/perf-probe/scenes/` in `39de20bc` (2026-09-07), both
   **before** the 2026-09-08 set. The only change under `features/tsld/render/` since is
   `a11y.ts`/`a11y.test.ts` in `5d84bd05`, the parallel DOM layer, which is not on the paint path.

   | framing | plan  | bars drawn | mean fps | dropped  | interval p95 | §9 floor | against it |
   | ------- | ----- | ---------- | -------- | -------- | ------------ | -------- | ---------- |
   | Week    | 500   | 243        | 60.0     | 0.00 pp  | 16.80 ms     | 45 fps   | **PASS**   |
   | Week    | 2,000 | 267        | 60.0     | 0.00 pp  | 16.80 ms     | 30 fps   | **PASS**   |
   | Fit     | 500   | 540        | 60.0     | 0.00 pp  | 16.80 ms     | 45 fps   | clears it  |
   | Fit     | 2,000 | 1,658      | 35.2     | 70.37 pp | 33.40 ms     | 30 fps   | clears it  |

   As before the two Fit rows are ungraded by P3, so "clears it" is arithmetic against §9's floor and
   not a verdict the panel issued.

   **(a) The model is falsified, and the residual is 28 %.** Item 5(f) fitted
   `frame = a + b·bars + c·area` to three exactly-determining points and said in terms that it
   "cannot be falsified by the data that produced it", naming the missing experiment: "a fourth
   Fit/2,000 run at an intermediate window — roughly 1450×850 — would give the model its first degree
   of freedom". 1912×948 is that window in area (1.813 Mpx, between 2.042 and 0.646). Refitting the
   published coefficients reproduces them exactly (intercept −2.18 ms, 20.3 µs/bar, 4.26 ms/Mpx),
   so the model below is 5(f)'s and not a paraphrase of it:

   | Fit/2,000 @1912×948 | frame time   | fps      |
   | ------------------- | ------------ | -------- |
   | model prediction    | 39.22 ms     | 25.5     |
   | **measured**        | **28.41 ms** | **35.2** |
   | residual            | −10.81 ms    | −27.6 %  |

   The model over-predicts. Put the other way: an 11.2 % smaller viewport drawing 7.5 % fewer bars
   should have bought **3.70 ms** and bought **14.51 ms**. **The area term does not survive**, and
   with it goes 5(f)'s "striking agreement" between its 8.7 ms area term and this row's
   long-standing unattributed ~8 ms — which 5(f) had already labelled "not evidence". It was right
   to.

   **(b) The likely reason is that the fitted quantity is not continuous, and the tail says so
   discretely.** A frame is presented on a refresh boundary, so `1000 / mean fps` is a blend of
   integer multiples of the 16.70 ms period rather than a smooth function of draw cost. Expressed
   that way the four Fit points read 1.05, 1.52, 1.70 and 2.57 periods — and the **interval p95
   stepped from 4 periods (66.70 ms) to 2 (33.40 ms)** across an 11 % area change. A quantity that
   moves in whole vsyncs cannot be linear in bars and pixels, and near a boundary a small change in
   draw cost flips a large fraction of frames from N periods to N+1, which is exactly the
   over-sensitivity observed. **This is a hypothesis with a mechanism and a discrete observation
   supporting it, not an attribution** — the same standing this row gives the ~8 ms, and it must not
   be promoted without the DevTools recording step 3 has always asked for.

   **(c) §9's Fit/2,000 verdict has now flipped twice, and this time on an 11 % parameter.** 5(c)
   recorded the gate as "missed at Fit at 2,000" from 23.3 fps. Today the same plan, same painter,
   same machine, same scene measures **35.2 fps — above the same 30 fps floor**. Two days apart, the
   only recorded difference a viewport 120 px shorter. #261 argued that an unstated canvas size
   decides the verdict from a 2:1 comparison (1912×1068 against 1016×636); it is now shown by a
   **1912×1068 against 1912×948**, which is close to the difference between one operator's window
   and another's. **On the readings in hand §9's gate is met at Week at both scales and at Fit at
   500, and at Fit at 2,000 it is unanswerable until #261 names the size.** That is a stronger
   statement than 5(c)'s and it supersedes it.

   **(e) ANSWERED 2026-09-10 07:53. It is between-sitting machine state, not geometry — and the
   experiment ran in the direction that makes the conclusion unavoidable.** A fifth sitting at
   **1920×1080** (fullscreen), the closest reproduction of the 2026-09-08 geometry the machine can
   make:

   | sitting               | area      | bars drawn | fps      | dropped  |
   | --------------------- | --------- | ---------- | -------- | -------- |
   | 2026-09-08 @1912×1068 | 2.042 Mpx | 1,792      | **23.3** | 97.22 pp |
   | 2026-09-10 @1920×1080 | 2.074 Mpx | 1,825      | **32.2** | 85.37 pp |

   **1.5 % more pixels and 1.8 % more bars, and it is 8.9 fps FASTER — 22× the 0.4 fps noise floor
   item 6(f) measures.** Today draws more work on more pixels and does it quicker, which no
   monotonic cost model permits from geometry alone. So whatever separates the two sittings is not
   the window; it is something about the machine's state that neither report records, and
   **#283 — the probe's unrecorded power state — is promoted from a possible confound to the leading
   explanation** for a 38 % swing that made a shipped gate look failed. **#283 is nonetheless
   deferred on a trigger (product owner, 2026-09-10) and that is not a contradiction**: the swing it
   explains has already been explained, §9 is met at every point that reproduces, and nothing is
   blocked behind capturing the field. It becomes worth doing the next time two readings disagree —
   which is the only situation in which the missing field would have changed an answer.

   **Three things follow, and all three are withdrawals of claims made earlier in this row.**

   1. **Item 5(c)'s "missed at Fit at 2,000" is WITHDRAWN.** It rested on the single 23.3 fps
      reading, which is not reproducible. Every judgeable Fit/2,000 point taken on 2026-09-10 clears
      §9's 30 fps floor — **32.2 at fullscreen, 34.8 and 35.2 at 1912×948** — as does the
      2026-09-08 small-window point at 39.5. **On the readings that reproduce, §9 is met at Fit at
      2,000.** The honest summary of the whole set is that §9 passes everywhere except one sitting
      nothing has been able to reproduce.
   2. **Item 5(f)'s two-term model is dead rather than merely falsified.** Against today's two
      judgeable points it over-predicts by **10.79 and 12.65 ms**, and worse, its per-bar term alone
      charges 3.39 ms for the 948→1080 step, which measured **2.65 ms in total** — so the area
      coefficient would have to be negative to fit. That is unphysical, and no re-fit rescues it.
   3. **The vsync-quantisation hypothesis offered in item 6(b) is WITHDRAWN — it was mine, and the
      data no longer needs it.** It was invented to explain a steep response to canvas area, and
      that steepness was an artefact of comparing across sittings. Measured **within** one sitting
      the response is close to proportional: +10.1 % bars and +14.4 % area buy **+9.3 %** frame
      time. The discrete p95 step from 4 refresh periods to 2 is real and still unexplained, but it
      is no longer evidence for anything, because the two readings it spanned were not comparable.

   **The lesson is the one this register keeps re-learning, in a new place: two readings can differ
   by 38 % with every recorded field identical.** The probe records viewport, DPR, GPU, threads,
   memory, display interval, attention and motion, and none of them moved. A comparison is only as
   good as the variables the instrument captures, and the one that matters here is not captured at
   all.

   **(d) What did NOT move is the finding.** Week is identical across all three sittings — 60.0 fps,
   0.00 pp dropped, 16.80 ms p95, at both 500 and 2,000 — which is the surface a planner works on.
   Item 5(b)'s conclusion also survives intact and is strengthened by a third point: Week/500 draws
   243 bars and Week/2,000 draws 267, four times the plan for 24 more bars and no measurable
   difference. **The cost is in the bars drawn, not in the plan**, and the remedy space is still
   drawing cost at low px/day rather than anything about plan size.

Raised by ADR-0065 T21; the product owner accepted the routing cost and asked for the benchmark
itself to be examined. Related: #59 (the unmeasured envelope, which this supersedes in part).

> **The "no §16 in ADR-0026" finding is RETRACTED, 2026-09-01 — by ADR-0026 itself** (§9b,
> "Numbering correction — and a correction to the correction"), and this row carried the withdrawn
> version until the 2026-09-03 verification sweep. §9 reads "on the **§16 target hardware
> envelope**", an unqualified cross-document reference in the same style as its neighbours, and
> `docs/PROJECT_BRIEF.md` **§16 Deployment** carries exactly that envelope. The drift was not an
> invented number: it was a citation that resolves at its origin and stops resolving the moment it
> is copied — subtler, and commoner.
>
> Two consequences for this row. **Step 4(a) — "fix the dead §16 citations repo-wide" — is now wrong
> advice** and should not be done; §9b deliberately leaves them. **Step 4(b) is already done**: the
> real-hardware numbers are recorded in ADR-0026 §9b. The sentence "every ADR-0026 §9 citation points
> at a section that does not exist" is also literally false as written — §9 exists, and the same
> sentence names it as the gate.
>
> **What stands, and is the half that matters:** 4 ms was never a budget, and the gate is fps.
> ~~The genuinely open residue is the 500-activity limb and the unattributed ~8 ms at Fit.~~
> **Corrected 2026-09-09:** the 500-activity limb was measured on 2026-09-08 and passes at both
> framings (item 5(a)). The residue is now the **unattributed ~8 ms**, **#261's unstated canvas
> size**, and the **1036×646 / ~1036×600 disagreement** between ADR-0026 §9b and this row — which is
> an input to item 5(f)'s model fit, so it is arithmetic and not bookkeeping.
>
> **Amended 2026-09-10 (item 6).** The third clause is now worth less than it was: 5(f)'s model is
> falsified out of sample, so an input to a fit that no longer stands is bookkeeping after all. The
> first two clauses are unchanged and the second has grown — #261's unstated size now flips the
> Fit/2,000 verdict across an **11 %** viewport change, not a 2:1 one, so it is the largest open
> item on this row rather than a footnote to it.

> **Status re-derived 2026-09-10, and what changed is a document rather than a number.** No new
> reading was taken and none is claimed. What was checked is the row's relationship to the ADR it
> points readers at: **ADR-0026 §9b's table still showed a bare `PASS` for the Fit framing**, while
> §9c — filed the day before, from the 2026-09-08 set — measures the same framing at **23.3 fps
> against the same 30 fps floor**. This row's step 4(b) sends readers straight to §9b, so a reader
> following it met the reassuring half and would have had to scroll to find the correction. §9b now
> carries an inline marker at the table itself, because a correction a reader has to scroll to find
> is a correction that does not reach the reader who stopped at the table.
>
> **What is still owed is unchanged and is not mine to produce**: the outstanding probe presses
> belong to the product owner, on their own hardware, and the unattributed ~8 ms at the whole-plan
> framing must not be guessed at. This row and **#261** both stay open on that.

### 76. Deferred follow-ups from the ADR-0064/0065 enablement review

**Status:** open · **Verified:** 2026-09-09

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

> **All four line citations in this row are dead** (2026-09-03 sweep): ADR-0078 moved the code.
> `crossedLanes` is not in `render-model.ts` — that file is now a 128-line barrel — it is defined and
> called twice in `render/link-routing.ts`. The `RectCache` reference moved to `geometry.ts`.
> **Both open items are still true**: `crossedLanes` really is computed twice per edge, and no
> flag-off Playwright config pins `VITE_CANVAS_AUTHORING_FLOW` off (three configs name it, all
> pinning it ON). But the second item's premise has weakened: `scripts/flag-retirement.json`
> classifies that flag **Class B — formally kept**, and ADR-0088 records unit-level flag-off parity
> suites having exactly one catch in the project's history. Building a flag-off harness for a
> guard-only flag is a harder sell than it was when this was filed.

### 81. CodeQL `js/http-to-file-access` on the seeder's `--out` report

**Status:** open · **Verified:** 2026-09-09

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

**The CodeQL check going green does not mean this alert closed — and on a private repository it does
not even mean it ran.** `.github/workflows/codeql.yml:24` gates the whole job on
`github.event.repository.visibility == 'public'`, so on a private fork the analysis is skipped
entirely and "green" is weaker still than the rest of this paragraph allows (noted 2026-09-09). PR #204's check reported "2 new
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

> **Two corrections, 2026-09-03 sweep.** The row describes **one** write site; there are **two** —
> `main.ts` writes `results` (the expression the row quotes) and, later, `report`. The second is the
> same taint flow and is unmentioned. And the clamp sentence pairs its fields and numbers in
> **opposite orders**: it reads "`code`, `message` and `details` … (2,000 / 500 / 100)", which maps
> `code` to 2,000. The real mapping is details 2,000 / message 500 / code 100. All three numbers are
> right and the sentence is wrong.
>
> The alert's own open/dismissed state lives in GitHub's code-scanning UI and **cannot be read from a
> checkout** — that half stays unverifiable here, which is worth stating rather than leaving as an
> apparent omission.

### 84. Levelling is quadratic in the number of activities contending on ONE resource

**Status:** open · **Verified:** 2026-09-10

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

> **Re-derived 2026-09-10 and STILL TRUE, structurally.** `level.ts:222-226` hands each levellable
> activity `profile.get(asg.resourceId) ?? []` — the resource's whole growing placed-interval list —
> and `blackoutsOf` (`:361-373`) iterates and sorts all of it, called per resource per activity at
> `:450`. `occupy()` (`:138-143`) only ever pushes, so nothing prunes. No interval tree, no
> per-resource cursor. Placement _i_ costs O(i log i); n activities on one resource are O(n² log n).
> The 11.6 s figure is a measurement and was **not** re-run; the shape is what was re-checked.
>
> The 2026-09-01 footnote's three citations are exact (`level.ts:437-438`, `adr/0041:154`,
> `adr/0041:168-169`). One residual it does not name: **ADR-0041 has no section "§F"** — `:159` is a
> heading `### Invariants` with items lettered (a)–(f). The ADR uses "§F" as its own loose shorthand
> at `:154`, so this row inherits it rather than inventing it; a reader hunting for a §F finds none.

### 86. A `RESOURCE_DEPENDENT` activity's day factor is read from the wrong calendar

**Status:** open · **Verified:** 2026-09-10 · **Severity RAISED — it writes** (see the 2026-09-10
note; the "display only" framing below is false) · **Found:** 2026-08-03, by the component gate on the derived-duration fix. **Pre-existing** — the fix
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
>   (`features/resources/components/ActivityResourcesPanel.tsx:317-319`). Correcting it means the
>   panel deriving its own — which needs the activity's
>   `type` and the `calendars` list plumbed in, two new props on a component that currently needs
>   neither.
> - `ActivitiesTable`'s **Duration column** cannot. It resolves per row (`:663`) and the table
>   never loads assignments, so the driving resource is not in scope at all; getting it would mean
>   a bulk fetch this surface does not do today.
> - The two activity editors are in between and need checking when the work is taken.
>
> **So it needs a spec, not a register row** (ADR-0105): the panel's props are a component contract.
> That is a bigger trigger than the row's own "three-line formatter fix" framing implies, and the
> framing is what has kept it looking cheaper than it is.

> **Two line citations drifted, and the row misses a call site** (2026-09-03 sweep).
> `ActivityResourcesPanel`'s forward is at `:317-319`, not `:318-320`; `ActivitiesTable`'s Duration
> column is at `:663`, not `:639`. More usefully: `ActivitiesTable` has a **second** call site
> (`resourcesHoursPerDay`, `:302`, the Resources dialog's join lag) on the same defect, which the row
> does not mention. The defect itself is confirmed live and unfixed — `effectiveHoursPerDay()` takes
> no activity type and no assignment input, so it has nothing to resolve a driver with — and the rest
> of the scoping note verified exact, including the twelve call sites.
>
> **Both citations were corrected in this note and left standing in the text above it for six days**,
> which is the failure this sweep kept finding: a reader meets the wrong figure first and the
> correction only if they read on. Applied in place 2026-09-09, along with the panel's real path —
> it is `features/**resources**/components/`, not `features/activities/`, which is why a reader
> checking the citation finds nothing at all rather than finding it moved.
>
> **Re-derived 2026-09-09 against the current tree**, because a citation sweep that does not re-run
> its own count is the same defect one level up: twelve call sites across eight files
> (`plan-dialogs`, `plan-workspace-toolbar`, `PlanScheduleSettings`, `lag-factor` ×2,
> `use-float-paths-panel`, `ActivityEditorDialog` ×2, `ActivityCreateDialog` ×2, `ActivitiesTable`
> ×2), and the server's fallback order confirmed at `schedule.service.ts:1278-1287` — driving
> resource, then the activity's own calendar, then the plan's. The client's helper still takes
> `{ activityCalendarId, planCalendarId }` and nothing else, so it structurally cannot express the
> first rung.

> **Specced 2026-09-10 (`docs/specs/resource-dependent-day-factor/`), and three of this row's own
> claims are wrong — one of them the sentence that has kept it a low priority.**
>
> **1. It is NOT display-only. It writes.** This row says _"Both are display and neither writes a
> wrong value — the API stores minutes, and the engine reschedules on the correct calendar
> regardless."_ `durationWriteFields` (`duration-field.ts:118-131`) returns
> `{ durationMinutes: parsed.minutes }`, parsed against this helper's factor, and **both**
> `ActivityCreateDialog` and `ActivityEditorDialog` import it. Worked through: an activity on an 8 h
> calendar with a 24 h driving resource, planner types `5d` → 2,400 stored minutes → the engine
> spends them at 1440/day = **1.67 days of work**. The read comes back
> `minutesToDays(2400, 480)` = 5, so the field says `5d` and the table says `5 d`. **A
> schedule-affecting write with a fully self-consistent read-back** — which is precisely why nobody
> has reported it, and why the row's own reasoning ("the API stores minutes") reads as reassurance
> when it is the mechanism.
>
> **2. The defect is server-vs-server, not client-vs-server.** The client is a faithful mirror of
> `apps/api/src/modules/activities/day-factor.ts:19-24`, which is `activityCalendarId ??
planCalendarId` — the same rule. Two server rules both claim to name "the activity's effective
> calendar", and only `schedule.service.ts:1277-1287` is driver-aware. The consequence nobody had
> written down: `durationDays` and `totalFloat` sit on one DTO and are converted on **different
> factors** — `schedule.service.ts:428` passes the driver-aware `graph.calIdByActivity`, while
> `activity-response.dto.ts:406` uses the stored activity-own `dayFactorMinutes`. And
> `schedule.repository.ts:756-759` states the property that violates, in its own comment: _"Same
> factor as its duration, so '3 days of work with 1 day of float' is one consistent statement."_
>
> **3. The fix this row prescribes would BREAK three correct sites.** It says to teach the helper a
> `RESOURCE_DEPENDENT` branch _"so every caller is corrected at once"_. Three of the twelve are the
> assignment join lag, which is **correct today by decision**: ADR-0071 §1 is headed
> "activity-calendar-framed", ADR-0035 §34 says "the activity's own calendar", and
> `schedule.service.ts:1143-1146` refuses the substitution explicitly for the histogram. So one
> branch corrects five sites and breaks three. **The discriminator is which QUANTITY is being
> measured, not which activity** — which is why there can be no single-branch fix, and why this row
> has been scoped twice without closing.
>
> **What the spec recommends** is two named rules and a required discriminated `DayFrame`
> (`{kind:'own'} | {kind:'scheduling', drivingCalendarId?}`), so all twelve calls fail to typecheck
> and both wrong wirings are compile errors — the ADR-0117/ADR-0132 no-default shape. Sequencing is
> load-bearing: **server first**, because fixing the client first would make a planner type `1d` and
> the table say `3 d`. The client picker is `readOnly` for `RESOURCE_DEPENDENT`
> (`ActivityCalendarField.tsx:85,141`), so the "only the client knows the pending selection"
> argument — the reason this helper exists at all — does not apply to the one type it is about.
>
> **Deliberately not built here.** It is six milestones, it changes `durationDays` on existing rows
> (ADR-0068 §6's named hazard, verbatim), and it wants six specialist reviews. What this note buys is
> that the next reader does not inherit "display only".
>
> **The write half is now EXECUTED, not read** (`apps/web/src/lib/day-factor-divergence.characterisation.test.ts`,
> the spec's M0). Three cases, running: the helper returns **8** for an activity whose driving
> resource sits on a 24 h calendar that **is in the list the surface already holds** (so the obstacle
> is the signature, not the data); `durationWriteFields('5d', 8)` returns
> `{ durationMinutes: 2400 }` against the 7,200 the scheduling calendar would give; and a third case
> pins the two agreeing when the calendars agree, so a later green run cannot mean the fixture
> stopped discriminating. The flag is deliberately **not** pinned — its sibling pins it off to assert
> a rollback contract, and pinning it off here would take the degraded whole-days branch where the
> factor is provably unused, characterising a path on which the defect cannot occur.
>
> **The engine half is now EXECUTED too** (`apps/api/test/resource-dependent-day-factor.e2e-spec.ts`,
> M0-T1) — against a real database, through the public REST API throughout, so no step of the
> fixture reuses the assembly the defect lives in.
>
> **The measured result.** A plan on an 8 h calendar. Two activities, both written
> `durationDays: 5`, both storing **2,400 minutes** — the driver is not consulted on the way in. One
> is an ordinary `TASK`; the other is `RESOURCE_DEPENDENT` with a driving crane on a 24 h calendar.
> After one recalculate:
>
> | activity                          | written | stored    | early finish   |
> | --------------------------------- | ------- | --------- | -------------- |
> | Task twin                         | `5d`    | 2,400 min | **2026-01-05** |
> | Crane lift (`RESOURCE_DEPENDENT`) | `5d`    | 2,400 min | **2026-01-02** |
>
> A planner asked for five days of crane time and the programme reserves under two — while every
> read-out still says `5d`, because `minutesToDays(2400, 480)` returns 5 on the way back out.
>
> **The second case is the discriminator, not decoration.** With the driving resource on a calendar
> whose day length **matches**, the two finishes coincide. So the difference above is caused by the
> day length and not by a driver that failed to resolve — which is a different defect that would
> produce the same-looking failure, and without this case a green run could not tell them apart.
>
> **The seed catalogue could not supply the fixture**: every calendar it builds has
> `hoursPerDay: null` (`packages/seed/src/{fixture,pairwise,scale,negative}`), so no seeded plan can
> exhibit this divergence at all. `docs/TEST_PLAYBOOK.md`'s `plan:capability-resources` row watches
> the right distinction on calendars of **equal** day length — precisely the case where it is
> invisible. Both files are characterisation: when M2 lands, `2026-01-02` becomes `2026-01-05` and a
> green run stops meaning "the defect is still here".

### 88. An email link scanner reaches the verification URL before the recipient

**Status:** open · **Verified:** 2026-09-10

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

> **Re-derived 2026-09-10: STILL TRUE and unbuilt — and the gating question has an answer nobody
> had written down.**
>
> **The deployed host's flag state is readable from the staff console.**
> `staff-health.service.ts:271` returns `requireEmailVerification` on `GET /staff/health`, and
> `routes/staff.tsx:488-489` renders it as a badge. So "is this armed in production?" is a
> two-click lookup on `/staff` rather than a question only the product owner can answer — the same
> shape as #117's closing method. Worth knowing before anyone escalates this row on an assumption.
>
> **What the repository genuinely cannot tell you** is the value itself: `docker-compose.yml:65` and
> `docker-compose.release.yml:99` both read `${AUTH_REQUIRE_EMAIL_VERIFICATION:-false}` and
> `.env.example:41` is `false` — all defaults. The real value lives in the host's gitignored `.env`.
> So the row's flat sentence _"it has not bitten: `AUTH_REQUIRE_EMAIL_VERIFICATION` is still off"_ is
> a claim about production stated as fact, and is the one sentence here that **could not be
> established**. Read the badge rather than the row.
>
> **Two dependency-internals claims are unregistered** (ADR-0076 Class 2). The row attributes "a bare
> acting GET" to `better-auth.ts:249-250`, and those lines are the app's own _send seam_
> (`sendVerificationEmail: async ({ user, url }) =>`) — there is no route and no GET there; the route
> is inside `better-auth`, which this repository does not contain. The 2026-08-05 extension about
> `GET /api/auth/reset-password/:token` redirecting with the raw token is the same shape.
> `scripts/dependency-claims.json` has **no** entry for either, so `check:claims` cannot see them and
> a bump would move both silently. Registering them needs the claims read against the installed
> package, which is a task and not an edit — recorded rather than done here.
>
> Confirmed accurate: the invitation path is safe behind a real button press
> (`AcceptInvitationCard.tsx`, the `Button` spanning `:243-259`), and the web half does strip the
> token from the address bar (`routes/reset-password.tsx:46`, `replace: true`).

### 89. The reverse proxy forwards `X-Forwarded-Proto: http` on an HTTPS request

**Status:** open · **Verified:** 2026-09-09

Every request arriving through Cloudflare → Nginx Proxy Manager → web → api carries:

```
"x-forwarded-proto": "http",  "x-forwarded-scheme": "https",  "cf-visitor": "{\"scheme\":\"https\"}"
```

Two of the three say HTTPS and the standard one says HTTP — it reflects the proxy's plaintext hop to
the web container rather than the scheme the browser used. `docs/DEPLOYMENT.md` "Cloudflare & TLS"
asserts this header arrives as `https`; it does not. Corrected in that document alongside this row —
_and only half corrected, which is the point worth keeping_: the correction was appended as a third
bullet while the **first** bullet went on saying Full (strict) makes `X-Forwarded-Proto: https` reach
the API, five lines above it. One bullet list contradicting itself, in the operator-facing document,
for a fortnight. Swept 2026-09-09; the first bullet now claims only what Full (strict) actually buys.

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

**Status:** open · **Verified:** 2026-09-09
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

### 242. `/forgot-password?email=` is a specified capability with no producer

**Status:** open · **Verified:** 2026-09-10

**Found:** 2026-09-02, while scoping #96 — by asking which of the eighteen search params the
application itself writes, and finding that this one is not among them.

`docs/specs/account-security/feature-spec.md:805` specifies a prefilled address on the
password-reset request screen, and `routes/forgot-password.tsx` reads `?email=` and prefills from
it. **Nothing in `apps/web/src` or `apps/api/src` writes it.** The two in-app links to that
screen — `routes/sign-in.tsx` and `routes/reset-password.tsx` — pass no search at all, and Better
Auth composes its own redirects, none of which target this route.

So the reader is correct, the route validator is correct, the screen behaves correctly on the URL it
never receives, and a planner who mistypes their address on sign-in retypes it on the next screen.
That is ADR-0081's shape one layer below a screen: a capability with no entry point, where every
piece in isolation looks right.

**Two ways out, and neither is obviously correct**, which is why this is a row rather than a fix:
carry the address from the sign-in form's own field into the link, which is a small kindness and
puts an address a stranger typed into a URL that lands in browser history; or delete the parameter,
its validator branch and the spec line, and let the reader type it. Deliberately not decided here —
#96's scope was the codec, and deciding this inside it would have been the drive-by that row
warns about.

**Narrowed 2026-09-02, by reading how it would be built rather than by weighing the two in the
abstract.** They are not symmetric, and both are ADR-0105 spec triggers:

- **Carrying it** needs `SignInForm` to expose its current email to the screen — the link lives in
  `routes/sign-in.tsx`, outside the form — which is a change to that component's **public
  contract**.
- **Deleting it** removes `?email=` from `/forgot-password`'s declared search, which is a change to
  a **route's** contract, and takes the spec line with it.

So "just pick one" is not available, and neither is a drive-by. Also worth carrying into whichever
spec picks this up: the capability was specified **by analogy** with the row directly beneath it in
the same table — `/verify-email`'s _"optional `?email=` so resend works session-less"_ — and the
analogy does not hold. That one has real producers (Better Auth's verification redirect, and
sign-up's own `callbackURL`); nothing composes a forgot-password redirect at all. A specification
inherited from a neighbouring row is the same shape as a docblock inherited from a neighbouring
file, one layer up.

### 97. The account-security epic's non-blocking review findings (ADR-0074 M5)

**Status:** open · **Verified:** 2026-09-09
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

### 246. The register's diagnoses survive and its citations rot

**Status:** open · **Verified:** 2026-09-10 · **Raised:** 2026-09-03 (the 32-row verification sweep) · **Size:** M ·
**Owner:** repo

The 2026-09-03 sweep verified all 32 substantive `unverified` rows against the code. The
distribution is the finding, and it is not the one the previous sweep would have predicted.

**What was in scope, stated rather than implied.** The register held **43** `unverified` rows.
Thirty-two were verified: `58 60 62 69 70 74 75 76 81 84 86 88 89 99 117 118a 118b 120 121 123 154
165 181 187 191 193 194 195 197 200 215 239`. Sixteen of those needed a correction (`60 74 75 76 81
86 99 120 165 181 187 191 193 194 197 200`) and sixteen were checked and found accurate (`58 62 69
70 84 88 89 117 118a 118b 121 123 154 195 215 239`) — the second list is here because otherwise a
clean check leaves no record and the next sweep repeats it.

The other **eleven were deliberately skipped, not overlooked**: `93 97 118 149 155 174 184 202 204
206 211` are deferred-review piles — collections of findings from a gate pass, each of which is its
own question. Verifying a pile means verifying its members, which is a different exercise from
checking whether a row's diagnosis still holds, and it was scoped out at the start rather than
abandoned partway. `32 + 11 = 43`, with nothing unaccounted; the arithmetic was reconciled against
the document rather than counted by hand.

**Almost nothing was already fixed.** The 2026-09-01 sweep found six of seven verified rows already
resolved, and `#232` on 2026-09-02 was a seventh. This sweep found **zero** wholly-stale rows out of 32. That difference is explainable rather than lucky: most of these rows carry dated notes recording
a deliberate, measured decision to leave the gap open, so they were accurate when filed and nobody
has since closed them by accident.

**What rots instead is the evidence, not the argument.** Roughly half the rows carry at least one
citation that no longer resolves — a line number moved by a refactor, a symbol renamed, a count that
grew. The pattern is consistent enough to state as a rule: **a row's diagnosis survives; its
file:line references and its numbers decay.** `#191` is the sharpest case — its argument is intact
and not one of its four figures was current.

**Three rows were wrong in a way that would have misled whoever picked them up**, and none of the
three was wrong by decay:

- `#74` contradicted its own header block, claiming a 5 s transaction timeout where the code sets
  15 s, and undercounting its own blast radius nearly three to one.
- `#99`'s mechanism table said the unknown-address branch does "nothing"; the library takes an
  explicit not-found branch precisely to blunt the timing signal.
- `#120`'s title said "nothing says so" about a behaviour its own ADR documents **in the commit that
  created the row**.

**And two rows were wrong at the moment of writing**, which decay cannot explain: `#165`(b)
misdescribed a control that had rendered as a segmented radiogroup for eighteen days before the row
was filed, and `#75`'s headline finding was retracted by the very ADR it exists to correct — with
the withdrawn version still propagated into `CLAUDE.md` and a guide two days later.

**Why this is a row and not a fixed thing.** The obvious remedy — gate the citations the way
`check:claims` gates dependency citations — does not transfer. Those are pinned by package version
and anchor text; a register row cites this repository's own moving files, where a line number is
expected to change and only a human can say whether the surrounding claim still holds. A gate that
demanded every `file.ts:123` in the register resolve would fire constantly and be silenced, which is
ADR-0058's fails-on-day-one shape.

**What might actually work, unbuilt and uncosted:** cite by **symbol** rather than line where the
symbol is stable, the way `docs/specs/better-auth-1-7-account-issuer/migration-design.md` already
does; or run this sweep on a schedule, since its cost is bounded and its yield was high. Both are
changes to how the register is written, so both need the spec ADR-0105 requires.

**And this sweep's own result could not be recorded in the field meant for it** — see `#247`. The
`Verified:` field is written inline and read at column 0, so `A8` has never fired and the sixteen
rows this sweep checked and found accurate carry no machine-readable trace of having been checked.

### 248. The DCMA what-if drops the levelling pass, and nothing says so

**Status:** open · **Verified:** 2026-09-10 · **Raised:** 2026-09-03 (the revision-compare review) · **Size:** S · **Owner:** repo

**Re-verified 2026-09-10 — the defect is unchanged and its CITATION has drifted**, which is this
row's neighbour #246 happening to #248: the destructure is now at **`schedule.service.ts:952`**, not
`:822`, and still reads `{ activities, edges, options, meta }`. A reader following the old line
lands in `buildEngineGraph`'s cross-plan guard and finds nothing.

`schedule.service.ts:822` destructures `{ activities, edges, options, meta }` from
`buildEngineGraph` — and the builder's return type also carries
`leveling: { assignments: EngineAssignment[]; resources: EngineResource[] } | null`, which is
**dropped on the floor**. So ADR-0116 M6's critical-path test runs `computeSchedule` twice and never
calls `levelSchedule`, while `recalculate` (`schedule.service.ts:277-296`) runs the levelling pass
whenever `plan.levelResources` is true and persists **that** result.

On a levelled plan the what-if therefore perturbs a schedule the product does not display. Its
control run reproduces the pure network dates, so the movement it reports is measured against the
wrong baseline — and the answer looks entirely reasonable, because every number in it is internally
consistent.

**Nothing records this as a limitation.** `grep -ci "level" docs/adr/0116-*.md` returns **0**. The
ADR is otherwise scrupulous about naming what its measurement does and does not cover — it carries
its own deliberately weaker parity sentence and a written non-mutation proof — so the omission reads
as an oversight rather than a decision, which is exactly what makes it worth a row: a reader
auditing that endpoint would find a careful document that never mentions the gap.

**Found by two independent reviewers** (database-architect and test-engineer) while reviewing the
revision-compare spec, because that spec proposed to reuse this module's replay mechanism and would
have inherited the gap. It is filed here rather than there because it is **live in shipped code**
and stands whatever happens to that epic.

**Why no gate caught it.** The seeded fixture plan reports `leveledActivityCount: 0` with
`level_resources = false` and 45 resource assignments — so every test that exercises this route runs
against a plan where the dropped pass would have been a no-op anyway.

**The fix is one of two, and the choice is the decision.** Either thread `graph.leveling` through and
run `levelSchedule` on both the control and the perturbed pass — which makes the what-if agree with
what the planner sees, at the cost of a second pass per side — or state the limitation in the route's
OpenAPI description and in ADR-0116, the way that ADR already states its parity caveat. The second is
cheap and honest; the first is correct. **Do not do neither.**

---

**2026-09-10 — the SECOND remedy is done; the first is still the open decision, and that is why this
row stays open.** The limitation is now stated in three places: the route's `@ApiOperation`
description, an addendum to ADR-0116 (recorded rather than rewritten, on the ADR-0026 §9b
precedent), and a comment at the destructure itself. Nothing about the engine changed, so a
levelled plan still gets a what-if measured against the network-only baseline — a reader is now told
so instead of trusting it. **Threading `graph.leveling` through remains unbuilt** and is a decision
about engine work: it costs a second levelling pass per side on every call to a route already
throttled at 14/60 s on a measured budget.

**Two things were found doing the honest half, and one is worse than what the row reported.**

1. **The route's OpenAPI did not merely omit this — it claimed the opposite.** The 422 description
   read _"the what-if runs the same passes a recalculation would, so it meets the same calendar
   states"_. The conclusion holds (those three errors come from the network pass, which does run),
   but the reason as stated is broader than the code and is simply false on a levelled plan. This
   row said "nothing records this as a limitation"; in fact the one document a caller reads asserted
   the gap away. Corrected in place with the old wording quoted, not silently replaced.
2. **The citation had drifted again while this row was being acted on** — the destructure is at
   `schedule.service.ts:953`, not the `:952` the 2026-09-10 re-verification recorded, which was
   itself a correction of `:822`. Third line number for one statement. The comment now lives **at**
   the destructure, so the next reader does not need a line number at all.

**No regression test, and the reason is stated rather than skipped.** What changed is prose. A test
asserting a description contains a word is the scan-matching-prose trap this repository has recorded
four times, and it would pass against a route that had quietly started levelling. The behavioural
assertion belongs with the first remedy, where there is something to assert.

### 247. A8 reads a field at column 0 that the register only ever writes inline, so it has never fired

**Status:** open · **Verified:** 2026-09-10 · **Raised:** 2026-09-03 (found while trying to record the sweep's result) · **Size:** S ·
**Owner:** repo

**Re-verified 2026-09-10 by probe rather than by reading**, because the previous verification was a
measurement and deserved the same treatment: `fieldValue` on a real inline header returns
`Status -> "open · **Verified:** 2026-09-09"` and `Verified -> null`. So the anchor is unchanged,
A8 still cannot fire, and — worth noting for whoever fixes it — `Status` does not merely survive,
it returns the **whole rest of the line** including the other fields, which every consumer is
today parsing past by accident.

`check-debt-status.mjs` reads exactly two fields through `fieldValue`: `Status` and `Verified`.
`Status` is written at column 0 on all 66 detailed rows and is read correctly. `Verified` is written
**only inline**, in the header block's `**Status:** … · **Verified:** … · **Size:** …` form — and
`fieldValue` anchors on `^`, so it returns `null` for every one of the six rows that carry a date.
Of the two fields the gate reads, one is 100% readable and the other is 0% readable.

So **A8 has never been able to fire**, and the contradiction it names is in the register right now:
`#117` reads `**Status:** unverified · **Verified:** 2026-09-01`, which is precisely the "one of the
two is wrong" case A8 was written to refuse. Measured rather than reasoned about — a script over the
real document reports `fieldValue` seeing `Verified` on **0** rows, and a whole-line scan finding it
on **6**, one of them `unverified`.

**Two assertions in the same file disagree about the document's shape, and the one that disagrees is
the silent one.** A2 splits the status value on `[\s·—|]` before checking the vocabulary, so it was
written by somebody who knew fields are `·`-separated on one line. A8 was written as though they are
not. Nothing was wrong in either assertion read alone; the wrongness is in the relationship — the
ADR-0093 shape, inside the gate rather than the product.

**This is `#245` stopping being hypothetical.** That row says the gate's assertions have no
re-runnable coverage and argues from principle. A8 is the first one shown to be dead, and it was
found by trying to _use_ the field rather than by reading the code — which is also why it survived
ADR-0120, its own red run, and two register sweeps.

**Do not fix it here.** `fieldValue` is shared by `check:debt-status` and `check:reconcile-due`
(ADR-0124 established both consumers), so widening it is a shared-gate change and ADR-0105 makes the
spec mandatory. It also needs a decision rather than a patch, because **A8's premise may be the
wrong half**: `#117`'s date is not a mistake — the row was verified on 2026-09-01 and its _subject_
(CSP report delivery from a real browser) genuinely remains unverifiable without a deployed host. If
"this row was checked" and "the thing this row describes is confirmed" are two different facts, then
`unverified` + a `Verified:` date is a legitimate state and A8 should be deleted rather than
repaired. Settle that before touching the parser.

**A near-miss worth knowing about while deciding.** `docs/TECH_DEBT.md:1235` opens a sentence with
`**Unverified:**` at column 0 — prose, not a field. It is harmless today because no assertion reads
that name, and it is exactly what a column-0 reader would misclassify if one were added.

**What the sweep could not do because of this.** The 2026-09-03 pass verified 32 rows and could
record the result only as prose, because the field meant for it is unreadable. Sixteen rows carry a
dated correction note and are identifiable from the diff; the other sixteen were checked, found
accurate, and left no trace **in the repository**. A clean check that leaves no record is work that
gets done twice.

**That sentence first read "left no trace at all", and it was wrong** — corrected here rather than
edited quietly, because how it was wrong is the useful part. The list of which rows were checked did
survive, in the scheduled wake-up message driving the sweep, which is outside the repository and
dies with the session. So the work was recoverable by luck for a few hours and unrecoverable after
that, which is worse than plainly lost: it reads as recorded right up until somebody needs it. The
list is now written into `#246`, so the practical half is closed and what remains is the mechanism —
a field the register writes and its own gate cannot read.

### 245. The assertions inside `check-debt-status.mjs` have no re-runnable coverage

**Status:** open · **Verified:** 2026-09-10 · **Raised:** 2026-09-02 (the ADR-0124 test-engineer gate pass) · **Size:** M ·
**Owner:** repo

`scripts/lib/doc-register.test.mjs` opens by calling itself _"the ONLY safety net both gates have"_,
and it covers the shared **module** — `sections`, `fieldValue`, `stripFences`, `tableRows`, `report`.
**Re-verified 2026-09-10, and the gap has become an ASYMMETRY rather than an absence.** `scripts/`
now holds `check-reconcile-due.test.mjs` and `check-spec-status.test.mjs` — both written after this
row — while `check-debt-status.mjs`, the gate with the most assertions and the one this row names,
still has none. So the pattern of a gate owning its own test file is established and this file is
the exception, which is a stronger argument for closing it than the row could make when filed.

It does not cover the assertions that live in `check-debt-status.mjs` itself: A9's field limb, both
A10 limbs, the `CANONICAL` regex and the ledger/compact classification.

Those were verified — against real revisions, each made to fail first — but the verification lives in
`docs/specs/gate-conventions/m0-measurement.md`, **a document rather than a re-runnable gate**. An
edit to `CANONICAL` or to the field arithmetic regresses silently. That is one level up from the
class ADR-0124 is about: a check whose own correctness is asserted in prose.

**Why it is not a quick win.** `main()` reads a fixed `DOC` and also reads
`scripts/debt-register.json`'s `compactTableRatchet`, so a fixture register fails the ratchet before
reaching the assertion under test. Closing it properly needs either a document seam (an env or argv
override, which is a public contract on a shared gate) or the assertions extracted into a pure
function the gate calls — the `doc-register.mjs` shape, and the better answer. Either is an ADR-0105
shared-gate trigger, which is why this is a row and not a commit: the epic that found it declined to
widen a shared gate inside its own gate pass, for the same reason `#240` declined to widen
`check:claims` inside the accessibility milestone that found it.

**Interim mitigation, so this is not a bare deferral:** every assertion added by ADR-0124 was
verified red against the specific defect it names, and each red run is recorded with the command that
produced it. That is evidence the assertion worked **once**, which is exactly what a regression test
adds to and does not replace.

### 244. CI's gate roster is hand-written while `prepush.sh` derives its own

**Status:** open · **Verified:** 2026-09-10 · **Raised:** 2026-09-02 (the ADR-0124 devops gate pass) · **Size:** S ·
**Owner:** repo

`scripts/prepush.sh` derives its gate list from `package.json` — deliberately, and its own comment
says why: _"a hard-coded roster beside a set that grows is the ADR-0073 C4 defect: an eleventh
`check:*` script lands and this gate silently stops covering the estate, with nothing failing."_

`.github/workflows/ci.yml` hand-writes a `run:` step per gate. So the two rosters can disagree, and
**they did**: ADR-0124 added `check:advisory-agreement`, `prepush.sh` picked it up for free, and CI
did not — leaving a blocking gate enforced only by a locally-run `pnpm prepush`, for a mechanism
whose whole subject is that local-only enforcement is the thing that does not happen. The epic's own
spec asserted it added no new `check:*` script, which was false as built.

**Found by comparing the two rosters, not by anything failing.** One command:

```
node -e 'const ci=require("fs").readFileSync(".github/workflows/ci.yml","utf8");
  const s=require("./package.json").scripts;
  console.log(Object.keys(s).filter(k=>k.startsWith("check:")).filter(k=>!ci.includes("pnpm "+k)))'
```

Today that prints `["check:reconcile-due"]`, which is the one **documented, deliberate** exclusion —
it is advisory, and adding it to CI would turn a product-owner decision into a blocking gate by the
back door. So any assertion has to carry that exemption, with its reason, the way
`scripts/adr-coverage.json` does.

**Not fixed in the epic that found it.** Making CI derive its roster, or asserting the two agree, is
a change to a shared gate and an ADR-0105 full-spec trigger; smuggling it into a gate pass is the
judgement that rule exists to remove. `#240` refused to widen `check:claims` inside the milestone
that found it for the same reason, and that refusal is why this register works.

**Why it was debt and not a defect when filed:** the rosters agreed as of this row, and CI's steps
carry per-gate comments explaining what each exists for — which a derived loop would lose. That is a
real cost of the obvious fix and should be weighed rather than assumed away.

**That last sentence is now FALSE, and the live instance has changed identity — 2026-09-10.** Re-run
of the row's own command: 16 `check:*` scripts, **two absent from `ci.yml`**. One is
`check:reconcile-due`, which is the exemption this row already anticipates two paragraphs above and
is therefore not a finding. The other is **`check:browser-safe`, a BLOCKING gate**, enforced today
only by a locally-run `pnpm prepush` — which is precisely the state the row describes, in a
different gate from the one it names. `check:advisory-agreement`, the instance the row was filed
on, has since been added to CI.

**The missing step was added 2026-09-10 and this row does NOT close.** `ci.yml` now runs
`check:browser-safe`, so the roster is down to one absence and that one is the documented
advisory exemption (`check:reconcile-due`). But adding a step is the fix this row exists to warn
against: it repairs today's instance and leaves the mechanism intact, which is exactly how the
condition moved from `check:advisory-agreement` to `check:browser-safe` in the first place. **The
row closes when something ASSERTS the two rosters agree**, with the advisory exemption carried as
a named entry and its reason, the way `scripts/adr-coverage.json` does. That assertion is a change
to a shared gate and therefore an ADR-0105 full-spec trigger — which is why the step landed alone
and the gate did not.

**The identity change is the point rather than a detail.** A reader who trusted this row would go
looking at `check:advisory-agreement`, find it present, and conclude the row was stale and closable
— when the condition it describes is live in a gate the row does not mention. A row naming its
instance rather than its rule decays into a false negative, which is the failure mode
`docs/RECONCILE.md` exists to catch and the reason the fix must assert the two rosters **agree**
rather than that any particular gate is present.

### 239. The plan's members query and its restore both scale with a fetch nobody profiles

**Status:** open · **Verified:** 2026-09-10

Two suggestions from that review, recorded rather than acted on because neither is worth its cost
today. Both were **measured**, not estimated.

**(a) The anchor could be one correlated subquery instead of a full member fetch.**
`batchRestoreAnchor` reads every member to pick one id. The predicate is self-referential ("parent
not in the batch") so no single-row Prisma query can express it — but raw SQL can, as a
`NOT EXISTS` self-join with `LIMIT 1`, measured at **0.11–3.3 ms across 2,000–50,000 rows** in
natural scan order. Declined for now: it trades the typed query builder for hand-written SQL on a
correctness-sensitive predicate, to save a few milliseconds of a cost that is itself a small
fraction of #238's fetch. Revisit only if a profile shows the whole restore near its budget **and**
this query is a meaningful share of it.

**(b) The scale harness measures an unrepresentative phase.**
`apps/api/test/cascade-restore-scale.e2e-spec.ts` seeds 2,000 flat `TASK` children of one summary
with no dependencies, notes, steps, assignments or baselines — so most of the `updateMany`s
in `restoreBatch`, and all but the first of `restoreLinksInBatch`'s queries, are never exercised. A
real WBS phase has internal logic and often assignments. Everything skipped is index-backed (all
`delete_batch_id` indexes confirmed present), so this is unlikely to move the verdict — the
measured restore sits well inside its 5,000 ms condition — but the number is not representative of
the shape #230 M1 actually restores, and saying so is cheaper than letting a later reader assume it
is.

> **Four of this row's numbers were invalidated by an unrelated epic, and one of its cross-references
> stopped resolving** (re-derived 2026-09-10; the substance of both halves survives intact).
>
> - **Thirteen `updateMany`s in `restoreBatch`, not twelve.** ADR-0126's revision snapshot added
>   `tx.baselineDependency.updateMany` **four days after this row was raised**, so the "six of
>   twelve" was stale on arrival. Counted directly:
>   `common/hierarchy/hierarchy-lifecycle.service.ts` holds 13, and `baselineDependency` is there.
>   That is precisely the hand-maintained-sweep hazard that epic filed as **#253**, biting a
>   neighbouring row rather than the sweep itself.
> - **`restoreLinksInBatch` has three queries, not two**, and on this seed only the **first** runs —
>   an early return skips the other two rather than executing them as no-ops. "Both … run as 0-row
>   no-ops" is wrong twice over, in a sentence whose point is that the harness exercises nothing.
> - **Seventeen `delete_batch_id` indexes, not twelve.** The substance holds — the new
>   `baseline_dependencies` one is present — but the figure counts nothing current.
> - **The restore's measured time is quoted as 337 ms here and 312 ms in #230**, from the same gate
>   pass. Neither is re-derivable without running the harness, so the figure is removed rather than
>   picked between: two numbers for one measurement means the register cannot say what was measured.
> - **`#238` no longer exists as a row.** It closed 2026-09-02 and lives in the Closed-numbers
>   ledger, so it resolves — but a reader grepping `### 238` finds nothing. Its resolution _chunked_
>   that fetch, which makes the "a small fraction of #238's fetch" reasoning **stronger**, not weaker.
>
> The claims that decide anything are unchanged: `batchRestoreAnchor` still reads every member to
> pick one id (`activities.service.ts:1402-1411`, then a `Set` filter with no raw SQL), and
> `cascade-restore-scale.e2e-spec.ts` still seeds 2,000 flat `TASK` children of one summary with no
> logic, notes, steps, assignments or baselines.

### 234. Fifteen page and panel loading states are spinners where the shape is known

**Status:** open · **Verified:** 2026-09-10 · **Found:** 2026-09-01 (empty-state consolidation §1.8) · **Size:** M · **Owner:** a loading-state pass

**Re-verified 2026-09-10, and the row's own count is NOT reproducible from it**: it says "fifteen"
and enumerates none, while `animate-spin` appears **55** times across non-test `.tsx`. Those are not
the same quantity — the row means fifteen _first-load_ states where the shape is known, and an
inline busy indicator on an action is the correct answer under the very standard it cites. So the
number cannot be checked without the list, and the list was never written down. **That is the
finding**: a row sized `M` on a count nobody can reproduce is one whoever picks it up must re-survey
before they can scope it, which is most of the work.

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

### 99. `/request-password-reset` leaks account existence through timing

**Status:** open · **Verified:** 2026-09-10

The endpoint is uniform in **everything the caller can read** — same status, same body, whether the
address exists or not (ADR-0074, and the property `sendPasswordReset` holds rather than borrows).
It is not uniform in **how long it takes**. Better Auth awaits the send
(`runInBackgroundOrAwait` → `else await promise`, `better-auth@1.7.1`,
`create-context.mjs:220`), so:

| address | work done                                      | response time           |
| ------- | ---------------------------------------------- | ----------------------- |
| known   | token minted, mail sent                        | a real SMTP round trip  |
| unknown | a token generated and discarded, one DB lookup | one database round trip |

_(Corrected 2026-09-03 by the register verification sweep. This row said the unknown branch does
**"nothing"** and returns **"immediate"**, and that is false: `password.mjs` takes an explicit
not-found branch that calls `generateId(24)` and awaits
`findVerificationValue("dummy-verification-token")`, under a comment saying it does so "to mitigate
timing attacks". The library already equalises the cheap half. That does **not** close this row — a
database lookup is not an SMTP round trip, and the gap this row is about is the send — but it makes
the signal smaller than the table claimed, and it would have sent whoever picked this up hunting for
a branch that does nothing.)_

A caller with a stopwatch can therefore still distinguish the two, which is the thing the uniform
body exists to prevent. Note this is the **opposite** shape to `/send-verification-email`, where Better
Auth mints a throwaway token and holds a 500 ms floor precisely to equalise the two branches
(`email-verification.mjs:104-116`) — the machinery exists in the library, and this route does not
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
   `/sign-in`/`/sign-up`/`/change-password`/`/change-email` (`index.mjs:309-314`) — and it is
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

> **Re-derived 2026-09-10 against the installed `better-auth@1.7.1` and STILL TRUE — every
> decision-bearing citation exact.** `create-context.mjs:220` is literally `} else await promise;`;
> `password.mjs:83` awaits the send on the request path; `password.mjs:61-72` really does
> `generateId(24)` plus a dummy verification lookup under a "mitigate timing attacks" comment (so
> the 2026-09-03 correction stands and the original "does nothing" wording would have sent a reader
> hunting a branch that does not exist); `better-auth.ts:271` is `enabled: options.isProduction`;
> and `SEND_TIMEOUT_MS = 10_000` is applied at `smtp-mail.service.ts:308-309`.
>
> **Two citations were wrong and are corrected above.** The 3-per-10 s rule covers **four** paths,
> not three — `/change-email` is in the same predicate (`index.mjs:305`) — and its block is
> `:309-314`, where the row said `:311-324`; the file is **318 lines**, so that range ran past the
> end of it. The 500 ms floor is `email-verification.mjs:104-116`, not `:108-121`, which was off at
> both ends. Both passed `check:claims` throughout, because a claim registers an **anchor** line and
> nothing validates a range's extent — **#181**'s blind spot, observed rather than argued, twice in
> one row.

### 100. The operator-facing mail signal still has no operator-facing channel

**Status:** open · **Verified:** 2026-09-10 · **Raised:** 2026-08-09 · **Size:** S

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

**Status:** open · **Verified:** 2026-09-10 · (narrowed) · **Owner:** repo · **Raised:** 2026-08-06 (ADR-0077 M0-T2) ·
**Narrowed:** 2026-08-08 (W5 M2-T4)

`pnpm check:claims` (ADR-0076) shipped matching one citation form, `<base>.mjs:<line>`, and passed
green on the day it was written **because it could not see half its input**. ADR-0077's M0-T2 widened
it — both `.js` and `.mjs`, the prose form ("`dist/api/routes/sign-in.mjs`, lines **264**"), and an
exclusion for files this repository owns — and the widening immediately surfaced **two dependency
citations that had been in the tree unregistered all along**: `nodemailer`'s `_formatError` and
`zod`'s `allowsEval` probe. Both were verified and registered. Two limitations remain, recorded here
rather than solved, because each trade is a real one:

**Re-verified 2026-09-10, and the blind spot is still LATENT rather than live.** Measured over the
real register: **100 claims across 15 packages**, 31 distinct dependency basenames, and **none** of
them is also a basename in this repository — so limitation 1 below still cannot be silently
skipping anything today. The register has roughly doubled since this row was narrowed (40 claims
across five packages at ADR-0077), which is what makes re-running the check worth more than
re-reading the row: the collision becomes likelier with every citation added, and nothing warns.

**The first probe run for this re-verification reported twelve collisions and was wrong**, which is
recorded because it is this row's own failure mode one level up: it matched every path-shaped
string in the JSON, including the repo-side fields that name _our_ files by design, so it
"found" exactly the citations that are supposed to be there. A measurement of a blind spot has to
read the field the gate reads — `claims[].path` — and not the file.

1. **The own-file exclusion is by basename.** `ownBasenames()` runs `git ls-files` and excludes any
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

4. **The extension class was written twice, and the two copies disagreed.** _(Found 2026-09-02
   building ADR-0122, closed the same day as #240 — the seventh hole, and the first that was
   symmetric.)_ Both citation patterns ended `\.m?js` while the own-file exclusion had always run
   `git ls-files '*.js' '*.mjs' '*.cjs'`, so the matcher and the exclusion disagreed about what
   JavaScript is — and a `.css`, `.cjs` or `.d.ts` citation was invisible in **both** directions,
   never demanded and, if registered, reported as uncited. Both halves failed towards green, which
   is why nothing ever went red.
   The fix is the shape the rest of this row argues for: ONE `CITED_EXTENSIONS` constant in
   `scripts/lib/citation-patterns.mjs` feeding both, with a sibling `node` test chained into
   `check:claims` asserting the derivation. **Widening one half alone was measured and rejected** —
   87 findings on the first run, nearly all this repository's own stylesheets, which is ADR-0058's
   fails-on-day-one gate. The full record is in `docs/specs/claims-citation-scan/`.

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

**Status:** open · **Verified:** 2026-09-10 · **Owner:** web · **Raised:** 2026-08-06 (ADR-0077 M6-T2)

**Depth of the 2026-09-10 re-verification, stated because the date alone would overclaim:** this is
a list of deferred findings, and it was checked as a LIST — that the epic which filed it has had no
follow-up landing its items — not item by item. Any single entry below may have been fixed
incidentally by neighbouring work without anyone striking it. Treat each as unverified until the
person picking it up checks that one, which is cheap because every entry names its file.

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

**Status:** open · **Verified:** 2026-09-10 · **Owner:** web · **Raised:** 2026-08-07 (canvas status & feedback, M6)

**Depth of the 2026-09-10 re-verification, stated because the date alone would overclaim:** this is
a list of deferred findings, and it was checked as a LIST — that the epic which filed it has had no
follow-up landing its items — not item by item. Any single entry below may have been fixed
incidentally by neighbouring work without anyone striking it. Treat each as unverified until the
person picking it up checks that one, which is cheap because every entry names its file.

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

**Status:** open · **Verified:** 2026-09-10 · **Owner:** web · **Raised:** 2026-08-08 (the A–D consolidation pass)

**Depth of the 2026-09-10 re-verification, stated because the date alone would overclaim:** this is
a list of deferred findings, and it was checked as a LIST — that the epic which filed it has had no
follow-up landing its items — not item by item. Any single entry below may have been fixed
incidentally by neighbouring work without anyone striking it. Treat each as unverified until the
person picking it up checks that one, which is cheap because every entry names its file.

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

**Status:** open · **Verified:** 2026-09-10

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

> **Re-derived 2026-09-10: STILL TRUE, and every figure in the row re-derives.** The
> browser→sink hop remains the untested segment and each artefact says so in its own file:
> `e2e-csp/csp.spec.ts:175-181` ("what it **cannot** prove: that the report is delivered… no request
> is ever interceptable") pointing back here at `:190`; `e2e-staff/staff.spec.ts:238-244` asserts the
> CSP panel renders and explicitly refuses to assert its state; and `csp-report.e2e-spec.ts`'s seven
> cases drive supertest into the Nest app rather than a browser.
>
> Counted: the unit suite really is **20** cases (13 `it` plus an `it.each` of 7 at `:194`). The
> parser registration is **three** content types, not two (`app-setup.ts:69` adds
> `application/reports+json`) — the row understates itself. `nginx.conf:112-115` and `:136` emit both
> directives, and the read route is `staff.controller.ts:166`.
>
> **One footnote is stale in tense:** it says the parser fix "is filed separately as #231", and #231
> **closed on 2026-09-02** under ADR-0124 — the fix is live at `doc-register.mjs:93-94,:120`. It
> reads as an outstanding filing and is done.

### 118. Staff-console M6 review findings that were not folded

**Status:** open · **Verified:** 2026-09-09

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

**3. ~~`Alert tone="info"` gives a live-region role to two static first-paint caveats.~~ CLOSED
2026-09-09 — ADR-0132, and it was bigger than this item in two directions and smaller in a third.**
The item's diagnosis was exactly right, including where the fix belonged: `Alert` inferred its role
from `tone` alone and could not express "reporting a change" vs "stating a standing fact". It now
takes a required `purpose: 'event' | 'condition'` with no default (ADR-0117's shape), so the wrong
announcement cannot be reached by omission, and `role` is still not a prop.

What re-deriving it found, none of which was in the item:

- **Six offending sites, not two, and two of them were `role="alert"` — assertive.** The sweeps-failed
  and sweeper-overdue caveats interrupted the reader, produced by a query settling.
- **Two of the six were already announced correctly elsewhere.** `retention-copy.ts` emits the same
  two sentences into `Panel`'s properly-mounted polite region, so for those the live role was pure
  duplication and removing it costs nothing at all. That is what made "do nothing" unarguable.
- **25 production call sites, not 33.** The larger figure counted the eight `render()` calls inside
  `alert.test.tsx`.

**No WCAG success criterion is failed**, stated plainly because this register overstated one once
(ADR-0082): 4.1.3 is engaged and _satisfied_ by the panel's polite region, and 2.2.4 is AAA. It is an
ARIA robustness defect — a live region should exist before its content changes — plus duplication.

**The gate pass found a regression the fix itself introduced, and fixed it.** Making the
stuck-sweeper alert a `condition` was correct and left that fact with **no announcement channel**:
`statusSentence` could not see `lastRunAt`/`processStartedAt`, so in the commonest stuck state it went
on saying "every table is inside its period" on the one polite channel while the visible alert said
the opposite. That is the defect its own docblock records fixing once for `consecutiveFailures`. The
parameter is widened so the facts cannot be omitted; two regression tests, verified red.

**What is NOT closed**, so this does not read as more than it is: `sign-in.tsx`'s signed-out alert
stays an event and its first-paint delivery is AT-dependent regardless; the three `DataTable
empty={…}` sites are classified but their _treatment_ belongs to the empty-state question; and
`NoticeStrip` unification is **refused** in ADR-0132 D3 rather than deferred — its callers span three
role outcomes and `purpose` expresses two. The two primitives now cross-reference each other, having
contradicted each other for months without ever being read side by side.

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
per-pair scope filter in `TEXT_PAIRS`. That is a change to a shared gate (ADR-0105).

> **Specced 2026-09-10, and the filter is REFUSED — see #279.** Two things this item could not see
> from one pair: the population is **34**, not one (17 of the matrix's 32 pairs anchor on
> `--background`, and inside a reset `--background` _is_ the reset fill, times two resets); and the
> mechanism ADR-0097 D6.3 decided on to close exactly this — the `card`/`popover` **reset** —
> **has no CSS rule, no production caller, and would paint the chrome fill if it had one**. So the
> filter would be a way of writing the hole down. This item's own analysis is otherwise confirmed in
> every particular, including the part that matters most: the naive addition really does go red at
> 2.00:1 in `chrome` and `brand`, and it really is **latent** — re-measured with the gate itself,
> and a spec claim that it was live was checked and withdrawn.

> **The "answer one question for three rows" argument has lapsed, and following it now misleads**
> (2026-09-09). This paragraph ended _"the same shape as **#231** and **#227**: three deferred edits
> to the same family of checks, all wanting one question answered once"_. Both of those **closed on
> 2026-09-02** under ADR-0124 — and they were never the same family: #227 and #231 are the register
> parser in `scripts/lib/doc-register.mjs`, and this one is `styles/token-contrast.test.ts`, which
> shares no code with it. So a reader following the grouping lands on two closed rows about a
> different file and concludes the question was answered. **This item now stands alone**, which
> makes it smaller than the paragraph implied rather than larger: a per-pair scope filter in one
> suite, with the naive addition already tried and its RED state already measured above.

**Not a finding, recorded because it was measured and the measurement inverted the recommendation:**
a partial index `(created_at, id) WHERE NOT email_verified` on `users`, serving the accounts panel.
The reviewer measured 43 ms → 0.05 ms and recommended it; the database-architect re-measured against
the **real** table (five rows, one heap page) at 0.036 ms and recommended deferring, because the
43 ms came from a synthetic million-row population that no longer exists. Deferred against a trigger
rather than a date — build it when unverified accounts on the deployed installation reach five
figures — and recorded in `20260809180000_audit_events_staff_index/migration.sql` so the question is
not reopened from scratch.

### 118a. `audit_events`' 12-month `auth.*` period is unenforced, and that is ADR-0085 D1's decision

**Status:** standing · **Verified:** 2026-09-09

> **Restatused from `unverified` to `standing` on 2026-09-09: this is a decision nobody can pick up,
> not work somebody owes.** Verified intact — the `BEFORE UPDATE OR DELETE` and `BEFORE TRUNCATE`
> triggers are `ENABLE ALWAYS` (`20260803170000_audit_events/migration.sql:110-122`) and **no later
> migration relaxes them**; `retention-boundary.structural.spec.ts:43-65` asserts `RETENTION_TABLES`
> **by equality** with `audit_events` in the forbidden set. ADR-0085 D1 refused to trade the
> structural guarantee for the period, and D6's build trigger has not fired.

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

**Status:** standing · **Verified:** 2026-09-09

> **Restatused to `standing` on 2026-09-09 for the same reason as #118a: a recorded consequence, not
> owed work.** Still exactly true — `retention-policy.ts:72-73` sweeps on `last_seen_at` at 30 days
> with the consequence stated in its own docblock at `:58-71`, and the guard against "tightening" it
> is live as a test: `retention-sweep.e2e-spec.ts:97`, _"KEEPS a violation that is old but still
> being reported"_.

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

**Status:** open · **Verified:** 2026-09-10

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

> **Attempt 27, 2026-09-10: no reproduction.** The file was run in isolation — 4 passed of 4 — and
> both halves of the row hold exactly: the case name is unchanged at
> `ActivityCreateDialog.earned-value.test.tsx:113`, and the call-count assertion added on 2026-09-01
> is present on **both** submitting cases (`:143`, `:160`) with the comment at `:136` distinguishing
> a slow submit from a double one. An intermittent claim cannot be falsified by a passing run, only
> given one more datum, and this is that. Nothing to change; the row stays open by design.

### 121. The base Playwright journey proves editing in a world no shipped bundle can produce

**Status:** open · **Verified:** 2026-09-10

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

> **Re-derived 2026-09-10 and STILL TRUE in every particular; no false claim found.**
> `playwright.config.ts:65-68` still pins `VITE_TSLD_EDITING` and `VITE_PLAN_EDIT_LOCK` to `'false'`,
> with its own comment naming this row. The six specs are exactly as counted — `activities` 1,
> `baselines` 1, `dependencies` 2, `schedule` 2 — and none of the four files nor `e2e/workspace.ts`
> contains any pen acquisition. `playwright.edit.config.ts` (the narrower harness) exists, and
> `plan-gating.ts` + its suite exist and are consumed at `use-plan-workspace-model.ts:180`.
>
> **One thing a reader should notice that the row does not say:** both flags carry a `batch` field
> in `scripts/flag-retirement.json` **alongside** a permanent `keep`. That reads as scheduled
> retirement work, and ADR-0088 D4 says it will never happen — a queue and a decision wearing the
> same clothes, which is the shape ADR-0073 C3.4 deleted `PENDING_COVERAGE` for.

### 120. Nothing reports `n_dead_tup` at runtime, so a retention drain's bloat is invisible while it happens

**Status:** open · **Verified:** 2026-09-09

> **The title ended "and nothing says so" until 2026-09-09, and that half is false.**
> `docs/adr/0087-scheduled-retention-sweep.md:244-249` states the behaviour, gives the figures and
> cites this row by number. The arithmetic still holds (`BATCH_SIZE = 1000`, `RUN_CAP = 50_000`,
> unchanged), and no `reloptions` override or `VACUUM` call exists. What is genuinely open is
> **remedy 1 only**: `n_dead_tup` / `pg_stat_user_tables` appear **nowhere** in `apps/api/src` or
> `apps/web/src`, and `RetentionTableDto` exposes `oldestAt`/`oldestAgeDays`/`overdue` and no bloat
> figure — so an operator watching a drain cannot see it happening.

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

> **Corrected 2026-09-03 by the register verification sweep — the title's second half is false, and
> was false on the day this row was filed.** `docs/adr/0087-scheduled-retention-sweep.md` states the
> dead-tuple behaviour explicitly under Consequences, gives the same measured figures, and cites
> **#120 by number**; `retention-sweep.runner.ts`'s own docblock says it too. `git log -S` puts both
> in the SAME COMMIT that created this row. So "nothing says so" described the state immediately
> before its own commit.
>
> **The behaviour half stands and is re-derivable without a host**: `BATCH_SIZE = 1000` and
> `RUN_CAP = 50_000` in `retention-sweep.runner.ts`, so a capped run leaves 50,000 dead tuples and
> does not cross Postgres' ~100,050 default autovacuum threshold for a 500k table. No `reloptions`,
> no `VACUUM` call, `RUN_CAP` unchanged.
>
> **What is genuinely open is narrower than the title**: nothing reports `n_dead_tup` at runtime.
> The staff Retention panel exposes `oldestAt` / `oldestAgeDays` / `overdue` only. The row's remedy 1
> — watch the dead-tuple count rather than assume it self-heals — is unbuilt.

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

**2026-09-02 — the count, and the fifth table.** It happened again, from the same cause and one
table further on: `activities.e2e-spec.ts`'s hand-rolled sweep omitted `plan_shares`, so its
`plan.deleteMany()` died on `plan_shares_plan_id_fkey` after a full Playwright sweep left a share
behind on the same database, failing **all 45** of that file's tests with a message naming a
constraint and no producer.

The file's own docblock describes this class in four paragraphs and cites this row three times, and
the code beneath it _was_ the class — nothing wrong in either half, the wrongness only in the
relationship, which is why reading the file never caught it.

That file now calls the shared `clearDomainData`, checked line by line first: it is a strict
superset in the same deepest-first order, ending identically. **Twenty-four other spec files still
hand-roll a sweep that omits `plan_shares`** — enumerated rather than estimated:
`activity-batch-ops`, `baselines`, `calendars`, `clients`, `cross-plan-dependencies`,
`dependencies`, `interchange`, `interchange-export`, `invitations`, `library-archive`,
`library-search`, `me`, `members`, `notes`, `organizations`, `overview`, `plan-lock`,
`plan-lock-write-gate`, `plans`, `programme-schedule`, `projects`, `recycle-bin`,
`resource-hierarchy`, `resources`.

Each was latent in the same way and **local-only**: CI provisions a fresh database per job, so the
residue can only come from a developer's own Playwright run against `app_test`.

**All twenty-four are now converted, and the fix was verified against the real defect rather than
against a reading.** Every one calls `clearDomainData`; a scan for a hand-rolled sweep missing
`plan_shares` returns nothing. Two of the twenty-four named `calendar_shifts` and
`calendar_exception_windows`, which the shared list does not — checked against the schema rather
than assumed, and both are `onDelete: Cascade` from their parents, so the shared list is a true
superset behaviourally as well as by name.

The proof is the sequence that produced the defect, run deliberately: `scripts/e2e-local.sh
web:share` leaves exactly one `plan_shares` row, and against it `plans.e2e-spec.ts` **fails all 14
tests on `plan_shares_plan_id_fkey` with the old sweep and passes with the shared one.** Then the
whole suite: 44 files, 573 passed, 1 skipped.

This row stays open on its remaining half: nothing stops a twenty-seventh copy being written. The
list is shared by convention, not by a gate, and the gate is not obvious — a census of `deleteMany`
call sites would sweep in every legitimate one inside a test body. Worth a thought, not worth a bad
rule.

### 149. The Graphite M10 gate pass's non-blocking findings

**Status:** open · **Verified:** 2026-09-09

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
  panel have done this since ADR-0030). Each write is a `JSON.stringify` of a two-field object and
  nothing has been profiled as hot, so a debounce would be an unmeasured optimisation — which is the
  thing this register keeps saying not to do. **The item's own arithmetic is stale, in the direction
  that matters** (re-derived 2026-09-09): it said "Graphite adds two more consumers", and the hook now
  has **nine** — the Explorer, the activity panel, notes, float paths, the Gantt grid, schedule health,
  the legend and revision compare. So does the hook's own docblock, which still opens "The single
  implementation behind **both** the Project Explorer rail and the plan workspace's activity panel"
  (`use-resizable-panel-prefs.ts:9-11`) seven consumers later. The remedy is unchanged — measure
  before debouncing — but a reader costing it from either number is costing it from 2026-08-20.
- ~~**`Toolbar`'s `ResizeObserver` re-observes on every commit.**~~ **CLOSED 2026-09-09, by
  relocation rather than by the accepted no-op argument.** The item was recorded as deliberate — the
  item set changes without a dependency the effect could key on, and `observe()` on an
  already-observed node is a no-op per spec. `Toolbar` no longer owns an observer at all: ADR-0091 M7
  moved the measurement up to one `ToolbarBandProvider` per band, because a row's own `clientWidth`
  is leftover width the moment anything sits beside it. That effect's dependency array is **empty**
  (`toolbar-band.tsx:62-75`), so it observes **once** for the band's lifetime — the concern is gone
  structurally, not argued away. The item's closing sentence ("it now iterates the union of what were
  two rows' `render` items") describes a pass ADR-0109 D1 deleted.
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

### 154. Three AT verifications are owed, and this row is now where the whole class is filed

**Status:** open · **Verified:** 2026-09-09

> **It has grown from two to three, and became a class rather than a row.** Beside the minimap's own
> two, `docs/TECH_DEBT.md:3591` files another owed listen explicitly as "the #154 shape", and
> `Toolbar.tsx:49`, `toolbar-segments.test.tsx:140` and `docs/adr/0119-…:86` all now defer nested
> `role="group"` AT behaviour here. None is reachable from this environment — there is no screen
> reader in the build container — so all three need a person on real hardware.

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

**Status:** open · **Verified:** 2026-09-09

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
   "no room" conclusion cites measurements taken before ADR-0099 reshaped the strip. The
   default stands (product owner Q2) and the minimap item still sits in `View ▾`; if it is
   ever revisited, the measurement comes first.
   > **The remedy this item prescribed no longer exists, and neither does the regime it
   > argued about** (2026-09-09). It named `PINNED_FLOOR_WIDTH` and `e2e-toolbar-fit`: the
   > constant has **zero occurrences** in `apps/web` and that suite, its config,
   > `ToolbarOverflow.tsx` and `toolbar-ladder.ts` were all deleted by ADR-0109 D1. The
   > successor is `apps/web/e2e-workspace-fit`. More than a citation drifting — **the command
   > surface now wraps rather than demotes**, so "is there room for one more pinned item" is
   > no longer the question: there is always room, and the cost is a wrapped line. Anyone
   > re-opening Q2 measures deck height at the four widths, not floor width.
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

### 165. Five screens photographed for the first time, and what they showed

**Status:** open · **Verified:** 2026-09-09

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
2. ~~**`focusRailButton`'s fallback goes dead the moment the button is withheld.**~~ **STALE
   2026-09-09 — the symbol is gone.** A callback ref fires with `null` on unmount, so the map held
   `'explorer' → null` and `button?.focus()` became a silent no-op — the WCAG 2.4.3 failure that
   function existed to prevent. `focusRailButton` has **zero occurrences in `apps/web/src`**: it
   went with the tool rail (ADR-0109 D2), and #156 deleted the drawer subject that would have made
   it reachable. The `#main` last rung landed anyway and is what survives. Recorded as stale rather
   than fixed — nothing was done about this; its subject was deleted for other reasons.
3. **The area's own suites used the broken state as their default fixture**, which is most of why
   nobody saw it. `app-shell.test.tsx` mocked `useParams: () => ({})` — no organisation — and then
   asserted the Project Explorer navigation IS present, so five of its six cases described the
   org-less shell and every reviewer read them as describing the product.
   `drawer-entry-point.test.tsx` had the same default. Both now carry an organisation, and the
   org-less shell is a case of its own.

The **derived** half of the journey's absence check (`a[href*="/orgs/"]`) passed against the pre-fix
code, which is the row's own finding restated as evidence: the rule existed and was applied to one
cluster, forty lines above a button that was exempt from it. _(This sentence quoted a
`tool-rail.test.tsx` case titled "renders no destinations outside an organisation — there are none
to show". Re-derived 2026-09-09: **neither the file nor that title exists.** ADR-0109 D2 deleted the
tool rail; the destinations live in `org-destinations.tsx`, whose four cases are titled otherwise.
The same dead citation was in `app-shell.tsx`'s own docblock and is corrected there too — a quoted
test title is the most persuasive kind of evidence and the easiest to keep after its file goes,
which is `#277`.)_

Gated by `apps/web/e2e-shell/` (`pnpm --filter @repo/web test:e2e:shell`, its own CI step), which
signs up and stops on the real `/onboarding` — the one moment in an account's life with no
organisation at all, and a state no seeded fixture can reach. Re-shot at 1646 before and after.

**One thing this deliberately did NOT fix, and one it exposed.** Below `lg` the Escape rung still
closes and announces a drawer the reader cannot see, because that column is `hidden lg:flex` — a
guard disagreeing with a CSS class, pre-existing, filed as **#168** rather than absorbed into a
change whose journey does not drive that viewport. And this row's own wording ("above an EMPTY 40 px
actions row") reads as fully closed and is not: that row is moot on org-less routes now, and still
rendered as an empty bordered strip on **every organisation route** for a Contributor or Viewer —
**#169**.

> **Both of those are now closed, and this paragraph read as though they were live until
> 2026-09-09.** #168 closed 2026-08-22 with ADR-0104; #169 closed 2026-08-31, its empty-strip half
> having been closed incidentally by ADR-0109 D2's fold control. Neither closure came back to this
> paragraph, so a reader arriving from #165 met two live-sounding defects and two numbers that
> resolve to the ledger. Kept in place rather than deleted, because the pair is the record of what
> this change knowingly did not do.

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

> **Item (b) misdescribes the control, and did so when the row was filed** (2026-09-03 sweep). It
> says `Outcome` is "plain text" beside `Show`'s chips, with no stated reason. `AuditFilterBar.tsx`
> renders Outcome as a **`SegmentedControl`** — an APG radiogroup — with the reason written above
> it: categories are independent booleans, an outcome is one of a set. `git log -S"SegmentedControl"`
> puts that in a commit dated **2026-08-04, eighteen days before this row was filed**, so this is not
> drift.
>
> What is defensible is the **appearance**: unselected options render `text-muted-foreground` with no
> border or fill, so at rest — which is the screen's opening state, `outcome` unset — the group does
> read as plain text beside filled chips. Reworded here as an appearance finding rather than a
> "no stated reason" one, because the two have different remedies.

### 174. The axis-markers gate pass's non-blocking findings

**Status:** open · **Verified:** 2026-09-09

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
  microseconds to low tenths of a millisecond and the painter itself has real headroom at the zoom a
  planner works at, so this is very unlikely to matter; it is recorded because CLAUDE.md §19.11 says a
  claim that decides something carries the evidence for the case it decides, and this one carries the
  evidence for a cleaner case.
  > **The supporting number was the retracted one, and the conclusion survives without it**
  > (2026-09-09). This read _"the painter itself is already 4–6× over its budget (#75)"_. **#75
  > retracted exactly that**, and `CLAUDE.md` §17 records the retraction in full: 4 ms was never a
  > budget but a throwaway prototype's measured p95, the real §9 gate is **frames per second**, and on
  > real hardware the painter is 3.9 ms p95 at the Week preset with **0 of 600** frames dropped. The
  > 16.7–23.1 ms figures are software-rasterised headless and explicitly not the target envelope. So
  > the sentence cited a withdrawn claim as evidence — the fifth recorded propagation of it, and the
  > first inside this register rather than in `CLAUDE.md` — and it argued the wrong way round: the
  > painter having headroom is a **better** reason to leave a sub-millisecond cost alone than the
  > painter being over budget.
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

**Status:** open · **Verified:** 2026-09-09

> **The mechanism is unchanged and the figures were stale twice.** `check-claims.mjs:382` builds the
> ref from **basename + line range only** and `:393-395` matches on that string alone; no claim in
> `scripts/dependency-claims.json` carries a `version`, and `verifiedAgainst` holds one version per
> package. The row says "all 78 entries" and its 2026-09-03 sweep said 97; the register actually
> holds **96 claims across 15 packages**. The worked example no longer reproduces (`better-auth` is
> pinned 1.7.1), which is a fact about the pin rather than about the blind spot.

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

> **The worked example no longer reproduces** (2026-09-03 sweep). This row illustrates the defect
> with a register entry "verified against 1.6.28"; the register now pins `better-auth` at **1.7.1**
> (ADR-0107), so the specific collision described was dissolved by the version bump itself. The
> **mechanism is untouched** — the ref is still `basename:lines`, built and matched with no version
> anywhere, and `verifiedAgainst` still holds one version per package with nowhere to put one. The
> row also says "a migration of all 78 entries"; the register now holds **97**.

### 184. Unsaved-work guard: the findings its gate pass did not block on

**Status:** open · **Verified:** 2026-09-09

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
  The fix gives `useUnsavedWorkReports` its **first production caller** (`navigation-guard.tsx:91`)
  — the subscribing reader this register recorded on 2026-08-31 as having none, kept "for a future
  consumer"; this is that consumer. _(For eight days the export's **own** docblock went on saying
  "Dormant: nothing in the application calls this", citing this row and a `rg` from 2026-08-31. The
  fixing commit recorded the change in the caller — `navigation-guard.tsx:82`, "until now it had no
  production caller" — and did not sweep the definition, so the two files disagreed about the same
  fact in the same tree. Corrected 2026-09-09.)_ The two blocker callbacks deliberately keep reading imperatively, because making them
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

- **Coverage was deleted and not replaced.** An earlier commit on this branch (recorded as
  `33b12b8f`; **that object does not exist in this repository** — it was a pre-squash branch commit,
  so the claim is unverifiable from the tree and is kept as testimony rather than evidence, noted
  2026-09-09) drove
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
  > it** is the first non-modal registrant — **an inline form, and only that**. _(This read "an
  > inline form, or a drawer-hosted editor — see #156". #156 closed on 2026-09-01 by **deleting the
  > whole drawer mechanism** (`app-shell.tsx:122-127`), so half of this item's stated route to
  > closure was removed the same week it was written, leaving a condition that reads as two
  > possibilities and has one. Corrected 2026-09-09.)_
  > At that point the journey becomes both possible and owed. Filed here rather than as a new row
  > because it is the same finding one level down.

**Why Back is unresolved**, since it belongs beside the above: instrumented in a real browser,
`shouldBlockFn` is **never called** on `page.goBack()` while the guard is mounted and the URL does
not change — so something other than this guard reverts the pop. Recorded rather than claimed
(ADR-0108 D7).

---

### 208. A journey that seeds through the API must tell the client itself

**Status:** open · **Verified:** 2026-09-10 · (audited 2026-08-31 — see below; kept as the standing
rule, not as owed work)

**Re-verified 2026-09-10 as a rule rather than a defect**, which is what this row is: it records a
standing constraint on how journeys seed, not a site to fix, so there is nothing to grep for. It is
dated so the next sweep can tell it was considered rather than skipped — the distinction the
`unverified` status exists to make.

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

### 191. The local pre-push gate is one expensive step, and it is `pnpm test`

**Status:** open · **Verified:** 2026-09-09

> **The title said "8 minutes and 96% of it is two steps" until 2026-09-09, and that is now false.**
> `eslint --cache --cache-strategy content` landed in all nine lint scripts (`apps/web/package.json`,
> `apps/api`, `apps/seed-cli`, every `packages/*`), so the lint half of the pair is seconds warm and
> candidate 1 is **done**. This is a one-step row now. Its counts had also drifted twice: **626** web
> test files (the row said 552, the 2026-09-03 sweep said 600) and **16** `check:*` gates (the row
> said ten, the sweep said fourteen) — which is why the standing advice below is stronger than when
> it was written, not weaker: sixteen gates still cost seconds between them.

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

> **Every quantity in this row is stale; the diagnosis is intact** (2026-09-03 sweep). Re-derived:
> **fourteen** `check:*` gates, not ten — the row's named list omits `doc-register`, `debt-status`,
> `reconcile-due` and `advisory-agreement`; **12.3 s** for the whole `--checks` pass, not 10.4 s; and
> **600** web unit test files, not 552. The argument — that `pnpm test` is the overwhelming majority
> and the `check:*` gates are the cheap part that catches what a reviewer cannot — is unchanged and
> if anything strengthened, since the gates grew by four and still cost seconds.
>
> **Its staleness had escaped the register**, which is the part worth acting on: `CLAUDE.md` said
> `prepush.sh` "derives **ten** of them" and `docs/TESTING.md` carried both 10.4 s and 11.5 s. Both
> are corrected — `CLAUDE.md` now says it **derives** them without a number, because the list is
> derived and a hard count in prose beside a growing set is ADR-0076 Class 1 by construction; that
> figure had already been wrong twice.

### 193. Four toolbar exports have no production caller, and are deliberately kept

**Status:** open · **Verified:** 2026-09-09

> **The docblock half of this row is CLOSED (2026-09-09).** All four named docblocks and both named
> residues were corrected, and the last one this row identified — `toolbar-registry.test.ts`'s
> `computeLadder` companion lookup, sitting fourteen lines above the correction meant to catch it —
> was fixed in the same pass. The corrected list of four dead exports was re-verified exact, and the
> row's own correction about `TOOLBAR_LAYOUT_BANDS` (module-private, read by a live feature, not an
> export) is right.
>
> **What survives is the export question alone**, and it is a deliberate keep rather than a task:
> ADR-0110 M5 kept the ladder machinery because the reduced strip does not fit at 1280 or 1440, and
> removing an export is a public-contract change (ADR-0105).
>
> **The class this row discovered is now `#277`**, which found nine citations of `autoLabelsFit` —
> a symbol with no definition anywhere — that this row's own grep was structurally unable to find,
> because it searched the names somebody remembered deleting.

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

#### Two more, and how the first grep missed them (2026-08-30 verification sweep)

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

> **Every line citation in the bullet list has moved** (2026-09-03 sweep) — the docblocks were
> corrected and the file shifted underneath the references to them. The **substance is unchanged and
> verified**: all four docblocks now name what they used to say, and the corrected list of four dead
> exports is exact — `priorityOf` has no caller at all, `partitionByTier` and `resolveLayoutMode` are
> test-only, and `TOOLBAR_LAYOUT_HYSTERESIS_PX` is read only inside `resolveLayoutMode`. The row's own
> correction about `TOOLBAR_LAYOUT_BANDS` is also verified right: it is module-private and read by a
> live feature, so deleting it would break something.
>
> **One residue the row does not cover:** `toolbar-registry.test.ts` still says "never enters
> `computeLadder`'s companion lookup" — a surviving citation of deleted machinery, sitting a few lines
> above the correction that was supposed to catch it. This row's own failure mode, one line from its
> own fix.

### 194. "The epic's own gate pass removes it" has now failed twice as an instruction

**Status:** open · **Verified:** 2026-09-09

_Filed 2026-08-26 by the reconciliation pass, after the declaration it describes blocked this pass's
own commit._

`scripts/frontend-only.json` arms an opt-in gate: while an epic declares itself frontend-only, any
change under `apps/api/` or `packages/` fails CI. It is a good gate and it has now gone stale
**twice out of two** _(this said "three times out of three" until the 2026-09-03 verification
sweep; the git history holds exactly TWO armings — armed 2026-08-17, deactivated 2026-08-18, armed
2026-08-25, deactivated 2026-08-26 — and `frontend-only.json`'s `history` array has two entries.
This row's own title and table both said "twice"; only this sentence and the JSON `reason` field
said three, and they were wrong. **The `reason` field went on saying three for six more days**,
because that correction recorded the discrepancy and did not fix it — the ADR-0071 failure, in the
row whose own subject is a written instruction nobody acts on. Swept 2026-09-09; the field now
carries both the corrected count and a note that it was corrected late, for the same reason this
parenthesis exists)_:

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

### 195. `pnpm prepush` cannot see uncommitted work in its diff-based checks

**Status:** open · **Verified:** 2026-09-10

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

> **Re-derived 2026-09-10 and STILL TRUE, with one qualification that changes how to read it.**
> `check-frontend-only.mjs:93` still diffs `${BASE}...HEAD` with `BASE = 'origin/main'` (`:48`), and
> the file contains no `porcelain`, no `dirty` and no `status --` — the cheap fix has not landed. It
> remains the **only** diffing gate: every other `check-*.mjs` that touches git uses `git ls-files`
> (`check-claims.mjs`, `check-reconcile-due.mjs`), which is a related but different blind spot —
> untracked files are invisible to **those**, which is why an uncommitted ADR makes the two
> reconciliation counts disagree by one until it is committed.
>
> **The qualification: the gate is currently inert.** `scripts/frontend-only.json` is
> `"active": false`, and `check-frontend-only.mjs:80-86` exits 0 with a "skipped" message long
> before it reaches the diff. So the blind spot exists in the mechanism and cannot bite until the
> next frontend-only epic arms the declaration — worth knowing before anyone tries to reproduce the
> false pass and concludes the row is stale.

### 197. Three rules with two or three implementations each, agreeing by discipline

**Status:** open · **Verified:** 2026-09-09

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

> **One citation corrected, and it weakens the row's own reasoning** (2026-09-03 sweep). Item 3
> describes the fourth copy (Tooltip) as having "deliberately different semantics (no outside-press
> close, no focus restore)". Tooltip **does** close on an outside press now — added by a later review
> finding, on the grounds that a touch device has no Escape and no reliable blur. Only the "no focus
> restore" half still holds. That makes the fourth copy **more** similar to the other three, so the
> stated reason for not extracting a `useEscapeToClose` leaf — accommodating the variance — rests on
> less variance than the row claims. Items 2 and 3 are otherwise confirmed at three and four copies.

### 200. Two named-slot registries, one of them the better pattern, neither shared

**Status:** open · **Verified:** 2026-09-09

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
docblock states as a rule of its own, and it needs no threading. It was written in the same commit as
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
`modeSlotRef` / `statusSlotRef` as props, `ChromeSlotHost`'s render-prop signature, and those
eleven call sites.

**Trigger:** the next named chrome slot. Adding a fifth this way pays the threading tax again, with
the better pattern sitting one directory over.

> **Citation corrected 2026-09-03 by the verification sweep.** This row listed `drawerSlotRef` among
> the props a merge would delete. That name has **no matches anywhere** in `apps/web/src`: the
> `drawer` slot was deleted on 2026-09-01 (`#156`) and `mode` added by the three-section header, so
> `CHROME_SLOT_NAMES` is now `['rows', 'identity', 'mode', 'status']`. The count is still four by
> coincidence, of a different set. The "eleven test call sites" figure is also historical — the test
> side is now absorbed by `test-chrome-host.tsx` iterating `CHROME_SLOT_NAMES`, so three test files
> reference these props. **The production-side threading tax the row is actually about is unchanged.**

### 202. Six non-blocking findings from the foot-row gate pass

**Status:** open · **Verified:** 2026-09-09

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
> `activity-bottom-panel.tsx:163,325` rather than guessed.
>
> **CLOSED 2026-09-09 — the Gantt half was owed and is built.** This paragraph said "still owed"
> until the register sweep re-derived it. `e2e-workspace-fit/command-surface.spec.ts:579-604` is the
> third state: it switches view, clicks a real row, pins the state positively on the `Actions for`
> toolbar being visible, and then runs `sweepObjectBar('Gantt, panel collapsed')`. The route is the
> different one this item predicted — a row click, not the canvas's parallel listbox, which does not
> exist in that view.
>
> **Three citations in this item were wrong, and two of them were wrong inside the journey too.**
> The bar renders at `plan-workspace-toolbar.tsx:1331`, not `:1151` (which is a `clearPlacement`
> gate object); the two labels are at `activity-bottom-panel.tsx:163,325`, not `:155,317` (which are
> `hostsPlanSlots` props). The spec repeated both — the second under a comment reading _"Names read
> from `activity-bottom-panel.tsx:155,317` rather than guessed"_. The **names** were read and the
> locators work; the **line numbers** were not, in the sentence claiming they were. All corrected.

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
`<Surface tone="chrome">` (`activity-bottom-panel.tsx:224-225`; this said `:217` until the
2026-09-09 sweep), which is the same scope `Deck` already sits in — verified from the other side too,
at `chrome-band.tsx:74` — so the pairing paints exactly where it always did. The row was filed on 2026-08-27 from
ADR-0114 M7, when the foot row genuinely had no scope at all; ADR-0115 gave it `chrome` that
evening, and nothing went back to re-read this item.

The residual observation is still true and its **class** is filed as #204(b): an alpha-composited
utility like `bg-foreground/5` is invisible to `token-contrast.test.ts` whatever scope it sits in.
Not re-filed here, because the same finding in two places is how a register starts disagreeing with
itself. _(This said "already filed as #204(b)" until 2026-09-09, which overstates it: #204(b) names
`hover:bg-accent/60` and `bg-warning/15` and does **not** name `bg-foreground/5`. The reasoning
transfers and the utility does not, so the honest word is the class. It is still live, at
`toolbar-styles.ts:119`, consumed by `selection-actions.tsx:1005` and `Deck.tsx:237`.)_

**Not worth a test either, and that is the decisive half.** The row concedes 1.4.11 does not apply
to the card; a contrast assertion asserts a **floor**, and a floor on a 5 % decorative wash would
fail by design. The pair that matters — control ink over the composited card — is already covered by
the chrome scope's existing text pairs.

### 204. Four things the foot-row-and-deck epic found and did not fix

**Status:** open · **Verified:** 2026-09-09

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
this row asked for. Re-derived 2026-09-09: `selection-actions.tsx:844` reads `showLabel: 'always'`
and **not one** of that file's thirteen entries is `'never'`, so the sentence that follows is kept
as the record of what was found and is **no longer true of the code**._ `zoom-to-selection` **was**
`showLabel: 'never'` (foot-row-and-deck M1), so a sighted
touch-only reader got no visible name: `aria-label` carries it for assistive technology and `title`
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

> **HALF CLOSED 2026-09-09, and the surviving half is narrower and better stated than the item
> managed.** A gate that did not exist when this was filed now covers one of the two named classes:
> `styles/alpha-composite.test.ts` scans source for a `bg-<token>/<alpha>` sharing a class string
> with a `text-<token>`, resolves the composite across all five surface scopes and asserts ≥ 4.5:1,
> behind a pinned positive case. `badge.tsx:28` (`bg-warning/15 text-warning-text`) is exactly that
> shape, so **the `Badge` half is gated**.
>
> **The toolbar half is live, and the reason is the discriminator rather than an oversight.**
> `toolbar-styles.ts:203` (`hover:bg-accent/60`) and `:119` (`bg-foreground/5`) carry **no `text-`
> token in the same class string**, so `findAlphaPairs` reaches `if (!fill || !ink) continue` and
> skips both. That is the gate working as designed — it asserts a **contrast pair**, and a
> decorative wash with no ink on it is not one. So this item is not "add two entries to a gate"; it
> is the open question of whether a fill with no co-located ink is worth an assertion at all, which
> is the same question #202(f) answers "no" for `bg-foreground/5` on 1.4.11 grounds. The residue is
> the **hover** state specifically: `e2e-designed-ui/designed-ui.spec.ts:142` records that axe never
> measures one, so no instrument in the repository sees `hover:bg-accent/60` in any scope.

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
> **Re-checked 2026-09-11, and the API half is now SETTLED: the route is open.** The obvious thing
> that would have made this moot is a pen gate — if changing the mode required the pen, the only
> user who could do it is the one already holding it, and taking the pen from the reader unmounts
> the whole bar anyway. It does not. `PATCH /organizations/:orgSlug/plans/:planId` is documented
> "Planner or Org Admin; optimistic locking" (`plans.controller.ts:60-61`), and
> **`assertHoldsPen` appears nowhere in `apps/api/src/modules/plans/`** — nor does `holdsPen` or
> `PlanLock`. So a second Planner can flip `schedulingMode` while the first holds the pen, changes
> nothing about that pen, and the first user's next refetch unmounts `Clear visual start` under
> whatever focus is on it.
>
> **Measured 2026-09-11, and (c) is SETTLED: the focus hazard is NOT reachable by this route.**
> `apps/web/measure-toolbar/tech-debt-204c-mode-flip-focus.spec.ts` drives two Planner sessions: A
> holds the pen on a Visual-mode plan with an activity selected and focus **on** `Clear visual
start` (asserted, not assumed); B flips the plan to `EARLY` through the public API holding no
> pen; A then waits out the 30 s `staleTime` and makes a real background→foreground transition.
>
> Result: the server reports `EARLY`, and **the control is still on A's screen with focus still on
> it**. Nothing unmounts, so nothing can drop focus. No WCAG 2.4.3 failure by this route.
>
> **The instrument was wrong first, and that is worth carrying.** The first version kept A in front
> and dispatched a synthetic `visibilitychange`, reasoning that `bringToFront` might restore focus
> and confound the reading. It returned the same verdict — and the trigger had almost certainly
> never fired, because TanStack Query's focus manager refetches on a **transition** into focus and
> a synthetic event on an already-focused page sets the state it already had. Reported then, this
> would have been a confident claim about the product from an instrument that did nothing. The
> answer only counts because the second version makes the transition real.
>
> **What the reading found instead is filed as #295**: the change does not reach the other reader
> at all, so they are looking at a Visual-mode control for a plan the server says is Early.
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

**Status:** open · **Verified:** 2026-09-09

_Triage 2026-08-28 (Phase 4): re-filed consciously. The print-header convention spans two print
documents and wants one decision, not a fold; the Badge swap changes a shipped panel's look (a ux
call, not a correctness fix); the two AT listens are environment-blocked exactly as #154 records
(no screen reader in this container — owed to a human pass); the rest stand on their filed
reasons._

**Raised:** 2026-08-28 (schedule-health-check M5-T1) · **Size:** S ×6 · **Owner:** web

The M5 gate pass blocked on findings that were all folded (token pairing, NoticeStrip reuse,
provenance on screen, the Viewer role sentence, `aria-describedby`, the announcement's four
counts, the G4 regex holes, the 429 citation). Five suggestions were judged real and deferred
rather than quietly dropped — **six bullets today**, because the M6 addendum was appended without
updating this sentence or the size beside it (swept 2026-09-09). All six re-derived that day and
all six are live:

- **The footer's "Next conflict" mention is prose, not a control.** The spec said the report
  "links to the conflict review"; the shipped footer names it. Wiring a button means handing the
  panel the conflict-navigation command, which lives on the toolbar context — a seam the panel
  deliberately does not hold today.
- **Rich per-metric `detail` is computed and never rendered** — the missing-logic
  predecessor/successor split, the relationship-type breakdown, metric 9's forecast/actual split,
  CPLI's target source and date, BEI's due/completed counts. The expanded row is the obvious
  home; M6 (which touches metric 12's row) is the natural vehicle.
  > **Still live, and a nearby closure is NOT this one** (re-derived 2026-09-09). All five details
  > are computed API-side (`compute-health.ts:326-329`, `:459-462`, `:510-512`, `:556-562`) and the
  > expanded row renders **offenders only** (`ScheduleHealthPanel.tsx:411-433`). `health-rows.ts`
  > reads `metric.detail` at exactly one place, `:140-143`, and that is **metric 12** — the vehicle
  > this item named, carrying none of the five it lists. An earlier pass read that as the item
  > closing; it is the vehicle arriving empty, which is the opposite. **A sixth thing was found on
  > the way**: metric 10's narrowing is a hardcoded string at `health-rows.ts:135-137` while the
  > docblock at `:33-34` implies it is read from `detail.narrowing`.
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
  > exists" reads as a swap, and it is not one: `Badge` has **no member for a PASS** — so closing
  > this means adding a variant to a primitive every badge in the product is
  > downstream of, and then deciding what a passing verdict looks like everywhere.
  > _(Corrected 2026-09-09. This said the variants are `default`/`secondary`/`outline`/`destructive`
  > with "no member for a PASS **and no member for a caution**". **None of those four names exists**:
  > `badge.tsx:25-29` declares `neutral`/`critical`/`warning`, replaced wholesale by ADR-0097. So the
  > caution half is false — `warning` is exactly that — and the cost is **one** variant, not two. The
  > conclusion survives on the PASS half alone: `TONE_CLASSES.pass` is `text-success-text`
  > (`ScheduleHealthPanel.tsx:84`) with no `Badge` counterpart, and it is still a primitive
  > public-contract change under ADR-0105. The assessment was written from a variant set the product
  > had not carried for twelve days.)_ That is a design
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

**Status:** open · **Verified:** 2026-09-09 · **Raised:** 2026-08-29 (fix-slice M-G — five specialist reviews over the combined diff; security,
ux, frontend-performance and accessibility all passed with nothing blocking, and the two folded
items were the accessibility review's CLAUDE.md correction and the performance review's
long-press listener cleanup, both landed with the pass) · **Size:** S ×2 · **Owner:** web

Three suggestions judged real and filed rather than quietly dropped; **two survive** — the third
closed on 2026-08-31 and the size beside this line still said three until 2026-09-09:

- **The touch long-press has no visible affordance and no documentation a user would find** (ux).
  `useTooltip`'s 500 ms long-press names an icon-only control without firing it, and nothing in
  the product mentions the gesture. It degrades gracefully (a tap still fires the command exactly
  as before), so this is an unadvertised affordance rather than a defect; the right home is
  whatever touch-help surface exists when one does.
  > **One clause is struck, and it was false on the day it was written** (2026-09-09). The item
  > read "the shortcuts sheet is keyboard-shaped and **unmounted from the Gantt-less panels
  > anyway**". The sheet has mounted **once for the whole workspace, above both views**, since
  > ADR-0095 M5 closed `#137` on 2026-08-18 — eleven days before this row was raised
  > (`plan-workspace-toolbar.tsx:1900-1911`, and `TsldPanel.tsx:3193-3198` records the removal). So
  > the sheet **is** a candidate home, and the clause that excused not considering it described the
  > previous arrangement. The finding survives on its other half: the sheet is keyboard-shaped, and
  > this is a pointer gesture. Re-derived at the same time — `HierarchyTree` carries a **second**
  > unadvertised long-press (`:16`, `:114`, `:203`, `:360`, `:385`) for row menus, so the class has
  > two members and not one.
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

**Status:** open · **Verified:** 2026-09-09 · **Raised:** 2026-08-29 (ADR-0118 M4 gate pass) · **Size:** M · **Owner:** a row-rhythm pass

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

**The 2026-09-01 recount was right and swept nothing** (found 2026-09-09). It corrected "six of its
eight" to five here and left that phrase standing in **both** places a reader is most likely to meet
it — `button.tsx`'s `icon-sm` docblock and the structural test's exemption comment, i.e. the variant
itself and the gate that excuses it. Corrected in place. Re-derived at the same time: there are
**five** `size="icon-sm"` call sites, and a **sixth** consumer that reaches the variant as
`SheetHeader`'s default and is not a dense row at all — filed as **#278**, because the exception this
row defends is about containers and that one is about a default.

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
**Status:** open · **Verified:** 2026-09-10

**Depth of the 2026-09-10 re-verification, stated because the date alone would overclaim:** this is
a list of deferred findings, and it was checked as a LIST — that the epic which filed it has had no
follow-up landing its items — not item by item. Any single entry below may have been fixed
incidentally by neighbouring work without anyone striking it. Treat each as unverified until the
person picking it up checks that one, which is cheap because every entry names its file.

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

### 228. Stacked-histogram gate-pass suggestions, consciously not folded

**Status:** open · **Verified:** 2026-09-10 · **Raised:** 2026-08-31 (ADR-0121 D8) · **Size:** S

**Depth of the 2026-09-10 re-verification, stated because the date alone would overclaim:** this is
a list of deferred findings, and it was checked as a LIST — that the epic which filed it has had no
follow-up landing its items — not item by item. Any single entry below may have been fixed
incidentally by neighbouring work without anyone striking it. Treat each as unverified until the
person picking it up checks that one, which is cheap because every entry names its file.

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

### 223. The canvas resource strip does not export or print, and the gate for that cannot see it

**Status:** open · **Verified:** 2026-09-10 · **Owner:** web · **Raised:** 2026-08-31 (stacked-histogram UX review)

**Re-verified 2026-09-10**: `use-diagram-image.ts` still contains **zero** occurrences of `stripRef`.

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

**Status:** open · **Verified:** 2026-09-10 · **Raised:** 2026-08-31 (register verification sweep) · **Size:** XS each

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

### 270. The frame count a run actually achieved is measured, carried, and then discarded

**Status:** open · **Verified:** 2026-09-10 · **Raised:** 2026-09-09 (probe-sweep M5) · **Size:** S · **Owner:** api

`scenes/revision-diff.ts`'s `PacingResult` carries `frames` — the number of intervals the window
really produced — and `toProbeBody` now drops it at the boundary, because the API declares four
fields per window and rejects a fifth. That was the right immediate answer (the alternative was a
schema change smuggled into a client fix) and it loses a real fact.

M4's `frames_per_phase` records the budget a run was **asked** for. `frames` records what it
**managed**. On a healthy machine they agree; on a stalled one they do not, and the difference is
precisely the kind of evidence `docs/TECH_DEBT.md` #75 has been waiting for — a reading whose window
ran short is a reading whose figures deserve less weight, and nothing stored today can say so.

`canvas-draw` does not compute it at all, so closing this means deriving it in both scenes, adding a
nullable column (**through `database-architect`**, per CLAUDE.md §19.3), and widening the DTO — a
milestone-sized slice rather than a follow-up commit. Until then the honest position is the one that
shipped: the field is not stored, rather than stored for one scenario and null for the other with
nothing saying which.

### 268. An e2e suite's coverage was bounded by a throttle counter it shared between tests

**Status:** open · **Verified:** 2026-09-10 · **Raised:** 2026-09-09 (probe-sweep M4) · **Size:** S · **Owner:** repo

`apps/api/test/staff.e2e-spec.ts` reached the ceiling of `StaffController`'s
`@Throttle({ default: { limit: 30, ttl: 60_000 } })` and nobody knew, because the symptom does not
name the cause: the suite passed at 22 tests, and adding a 23rd pushed **three unrelated tests**
into 429, each failing with a message about the assertion it was making. The whole file runs inside
one 60-second window against one in-memory counter, so a test's request budget was being spent by
its neighbours.

**Fixed for this file** by clearing the throttler storage in `beforeEach` — isolation, not a
weakened bound. The product limit is untouched, every test still runs its own requests under the
real 30 per minute, and nothing in `apps/api/test` asserts a 429, so no assertion was disarmed.
`docs/TESTING.md` already forbids exactly this ("deterministic and isolated — no shared mutable
state"); the counter was shared mutable state that nothing recognised as such.

**Re-verified 2026-09-10 by counting rather than reading**: `staff.e2e-spec.ts` is still the ONLY
suite in `apps/api/test/` that touches `ThrottlerStorage`, and both suites this row names by
implication — `share.e2e-spec.ts` and `share-guest.e2e-spec.ts` — still have zero references. The
trap is set exactly where the row says, and one file is still inoculated against it.

**Why it is still a row.** The fix is one file's `beforeEach`, and the same trap is set in every
other e2e suite that hits a throttled route — `share`, and any later one. Nothing detects the
condition: a suite silently loses headroom as it grows and then fails somewhere else. Two candidate
answers, neither taken here: clear the storage in a shared e2e setup so no suite can inherit the
problem, or assert the 429 deliberately in one place so the limiter has an owner and the rest can
be isolated without guilt.

**Three diagnoses were wrong before this one, and the sequence is the useful part.** First: "the
global `RATE_LIMIT_LIMIT` is 100 and we are over it" — raised it in the suite's `beforeAll` and
nothing changed, because the controller's own `@Throttle` overrides the global and the edit was
**inert while reading as a fix**. Second: "my new test is greedy" — trimmed it from seven requests
to five, still failed. Third: measured the baseline by stashing the new test, which passed at
exactly 22. Only then was the shape visible. The first attempt is the one worth remembering: a
change that looks like a remedy, sits in the tree, and does nothing.

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

| #   | What it was                                                                                         | Closed     | Where the record is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 250 | `FloatPathsPanel` shaded a missing activity with no reason at all                                   | 2026-09-10 | The row's one-line fix, taken as prescribed: an `sr-only` **sibling** linked by `aria-describedby`, matching `RevisionComparePanel`'s `MovedRow` two directories away rather than inventing a second answer (ADR-0082; ADR-0117's `purpose` distinction is the general form). **Verified red first** — the new case fails `expected null to be truthy` against the original component. Two cases, and the second is the one that matters: the reason must NOT be part of the accessible name, because folded into the button it joins the name and a screen-reader user hears the activity and its refusal as one run-on label — a test asserting only that the sentence exists would pass against exactly that mistake. A **pinned negative** (a live row carries no `aria-describedby`) stops the pair being satisfied by describing every row, which would state a refusal that is not happening. The defect was found by reviewing the SIBLING, not this file: nothing in the repository compares two panels for a rule both should follow, and that remains true.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 230 | A cascade delete's undo truncated the history, and its reason had lapsed                            | 2026-09-10 | **Found already shipped and unclosed — the eighth recorded instance of that shape, and the row's own instruction was to close it.** It read _"Built, not yet merged … Delete this row and ledger it once that is merged and released — not before"_, and all three conditions were met on 2026-09-02: `a356866e` (#460) removed the branch, and `web-v0.125.3` carries both `commands.ts`'s _"the branch is gone"_ recording seam and `use-plan-undo-redo.ts`'s `UNDO_PARENT_DELETED_MESSAGE`/`REDO_PARENT_DELETED_MESSAGE`. Verified against the **release tag** rather than the working tree, because "merged" and "released" are different claims and this row deliberately waited on the second. ADR-0048's amendment is filed (`0048-…:95`, _Register row: #230_). The delay is the interesting part: the row was correct, complete and self-closing for eight days, and nothing observes "a row whose stated close condition is now true" — `check:debt-status` asks whether a row HAS a status, never whether the status is still true, which is the gap `docs/RECONCILE.md`'s pass exists to cover and why it cannot be replaced by a gate.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 187 | The deck's labels sat 3 px apart, and the fourth hypothesis was never run                           | 2026-09-09 | **Closed by measurement, and the measurement falsified the row's own next step.** The row recorded three hypotheses built, measured and falsified, then named a fourth — the icons, since deck items carry `size-3`/`size-4` glyphs and in an `items-center` line the tallest child sets the line box — and said it was cheap and undone. Run at last (`apps/web/measure-toolbar/m7-icon-hypothesis.spec.ts`, four widths, real Chromium, pen held, 23 deck items at a uniform 36 px): **the spread does not reproduce at all — 0 px on every row at 1280, 1440, 1646 and 1920**, one distinct label top per row. Confirmed independently by the row's OWN named instrument, `m0-repaired.spec.ts`, which reports `worstRowSpread: 0` in all sixteen of its reads. So the null test was **vacuous** — there was no spread for removing the icons to close — which is why the probe checks non-vacuity first and says VACUOUS rather than reporting a treatment of zero as a success (the ADR-0093 shape: a green result that cannot tell "the rule holds" from "the population was empty"). A **positive control** rescued the run: shrinking one labelled item's icon from 16 px to 12 px — the very `size-3` the hypothesis names — moved that item's label by **zero**, so hypothesis four is FALSIFIED on today's deck exactly like the other three, and not merely unreproducible. A fixed-height item (`min-h-9`, measured 36) centres its label on the item and not on the tallest child, so an icon cannot move it. What closed the original 3 px is **not established** and is deliberately not guessed at; the row's whole purpose was to stop the next person re-running these experiments, and with the defect absent and its last hypothesis dead there is nothing left to re-run. The probe is kept rather than deleted — it is the evidence, and its positive control is what makes a future zero mean something.                                                                                                                                                                                                                       |
| 267 | (never a distinct defect) The performance panel announces its outcome twice                         | 2026-09-09 | **Filed in error and withdrawn the same day.** It is `docs/TECH_DEBT.md` #259 item 10, raised 2026-09-07 at the staff-performance-probe gate pass — noticed independently in the code by somebody who did not look for it in the register first. The analysis it carried (what M3 sharpened, and the three candidate remedies with their costs) is folded into #259 item 10, which is where the defect already lived. The number is ledgered rather than freed, because two live rows for one defect is exactly the failure this table exists to prevent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 260 | A saturated dropped-frame baseline made the difference gate arithmetically unfailable               | 2026-09-09 | `docs/specs/probe-sweep/` M1 (the ADR is filed at M7 — the number is not reserved here, per ADR-0071). `judgeRun` computes `headroomPp`/`saturated` on **every** result and returns INDETERMINATE when a gated run is saturated. **Verified red first**: against the old judge the product owner's own reading — baseline 98.33 pp, delta −0.19 pp — returned `PASS` with the gate armed. Two corrections to the row itself, both found by building it. Its proposed placement ("where the spread guard sits") was **wrong**: its own headline exhibit is an **ungated** Fit run, which returns `REPORTED_ONLY` before any gated branch — so the fact is computed before the `!gated` return, only the verdict is gated, and the first unit case is the ungated one. And saturation is checked **before** the spread guard, because a ceiling compresses the spread beneath it: a baseline pinned near 100 on every repeat has almost no run-to-run spread, so the existing refusal reads the machine as perfectly quiet at the exact moment the metric has no room to express an answer — observed, not argued, in the M1-T3 run that records `baseline 100.00 pp (spread 0.00 pp)` and `delta +0.00 pp`, this defect at its purest. There were also **four** renderers of a delta and not the three the plan named: the CLI driver prints one and does not call `verdictNote`, so the structural enumeration written for the browser surfaces could not see it. `docs/specs/probe-sweep/m1-cli-oracle.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 288 | `DECK_GROUPS[].caption` named a rendering the deck no longer has                                    | 2026-09-10 | Renamed to `name`, which is what it always meant: its only consumer is `aria-label`, so the field is the group's accessible name and had captioned nothing since M6 deleted the visible spans. `name` rather than `label` because `ToolbarItem.label` already means the word printed beside a control, and this subsystem has just been through one collision of that kind — `name` is also the ARIA vocabulary for what `aria-label` sets, so the identifier and its one consumer now agree. **The row overstates the blast radius**: `DECK_GROUPS` is module-local rather than a shared table, so the change does not leave `Deck.tsx`. **No test changed, and that is the proof** — a rename alters no behaviour, so the 121 toolbar and 291 toolbar-plus-workspace tests passing unchanged are the before/after oracle (the ADR-0078 barrel-preserving argument); a regression test would have had nothing to assert that the existing ones do not. One adjacent line was corrected with it: the layout comment two lines below opened _"A ROW, caption leading"_ in the present tense about a caption M6 had deleted — this row's own defect class, one layer over — now marked as history with the measurement kept, since that is why the card is one row tall at all. Done as its own commit for the reason M7 deferred it: a mechanical rename hides among prose corrections.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 269 | A failed store said it failed and never why, and offered a Retry some failures cannot use           | 2026-09-11 | The status now reaches the operator and the button is **shaded with a reason** where a retry structurally cannot clear the failure. The `catch {}` in `run-sweep.ts` discarded the error entirely — under a comment asserting a failed POST is "retryable", true of the case it was written for and false of a 422 — so one sentence covered a dropped socket and a refused body alike. **Which statuses are retryable is the decision this row said it was**, and it lives in one place (`model/store-failure.ts`) rather than at a call site: no status and 5xx retry; **429 retries** because it is the one 4xx worth pressing again after a wait — the trap the row names in as many words, and a blanket "4xx cannot retry" would get it wrong; 408/425 retry, being about timing rather than content; every other 4xx does not. An unrecognised shape retries rather than being asserted away, because offering the cheap action beats withholding it on a guess. **Both panel cases verified RED first**, and the 429 one is the pinned counter-case without which the 422 assertion is satisfied by a panel that shades Retry on everything — which would break the button's original purpose. `aria-disabled` and not the native attribute (a natively disabled button leaves the tab order, taking the linked reason with it), an `sr-only` **sibling** rather than text folded into the name, and a **guard in the handler**, because a shaded control that still fires is a shading in appearance only. One model invariant is pinned over every branch — a blocked reason exists exactly when the retry is withheld — so a reason can never sit beside a live control stating a refusal that is not happening (ADR-0082).                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 275 | A floor above the display's own refresh rate was unreachable, and the probe reported it as FAIL     | 2026-09-10 | `judgeAbsolute` now computes the display's arithmetic ceiling (`1000 / idleInterval`) and returns **INDETERMINATE** — ADR-0130 D8's first-class fourth verdict, already rendered — naming the ceiling, the floor and the arithmetic, whenever the ceiling is at or below the floor. **Checked BEFORE the straddle case**, because when the ceiling binds the repeats agree perfectly and "the repeats disagree" is the wrong explanation to hand a reader; both return INDETERMINATE and which reason prints is the whole value. `idleInterval` is a **required, never-defaulted** input (the ADR-0070 `hoursPerDay` precedent): the field was stored on every row and printed in every block while the judge never read it, and a default would reintroduce exactly that at whichever call site forgot to pass it — the compiler caught **both** production callers, which is the mechanism working. Verified RED first against the row's own observed reading (33.00 ms, 30 Hz, floor 45), with **three controls**: a genuine FAIL on the same display at the 30 fps floor, an ordinary 60 Hz PASS, and an unusable interval skipping the rule rather than guessing — without the first, the case is satisfied by a rule that fires always. **A margin was deliberately NOT added.** The row's sharper case — a 30 fps floor against a 30.3 fps ceiling, decided by the third decimal place — is real and stays open as `#293`, because catching it means choosing a margin and no margin has ever been measured; inventing one would be the number-tuned-to-the-answer this register keeps refusing. The stored-row caller coalesces to `NaN` and **not** `?? 0` like its neighbours: zero would make the ceiling infinite and silently disable the rule, where `NaN` is the honest "no usable interval".                                                                                                                                                                                                                                                                                                                                           |
| 287 | The pen's foot-row home is `shrink-0`, and its worst case was never measured                        | 2026-09-11 | **Measured, and the hypothesis is disproved.** The reading the row asked for was taken — a peer request outstanding (so `Hand over` and `Keep editing` render), an activity selected (so the object-action bar occupies the dock), at 1440, 1646 and 1920 (`apps/web/measure-toolbar/tech-debt-287-pen-foot-row.spec.ts` — re-runnable; `measure-output/` is gitignored, so the figures live here and in #294 rather than in a file). **Nothing is clipped and nothing is unreachable**: `scrollWidth` equals `clientWidth` at every width in both states, no control's right edge passes the row's, and every control's centre resolves to itself under `elementFromPoint` — the ADR-0114 M1 lesson applied, that a box measurement is not reachability, since a control clipped by an ancestor's `overflow-hidden` has an ordinary rectangle and focusing it moves that rectangle by zero. `shrink-0` is still on the container, so the premise holds; the consequence is simply not the one feared, because the row it sits in WRAPS (ADR-0114 M1's `min-w-0`). **The cost is real and it is VERTICAL, which is filed as #294**: the hand-off controls take the foot row from 51 to 127 px at 1646 and from 87 to 167 px at 1440, costing the diagram 76 and 80 px. **One of the three committed conditions was unanswerable by its own instrument and is recorded rather than quietly dropped**: C3 asked the control case to show a narrower _required width_, which a wrapping row can never report — required width is always the container width. The discriminator that works is the control count (13 with the request, 11 without, the two extras named), and the fixture is proven to have reached the state by that instead. Two instrument defects found on the way: the first version guessed `Dismiss` for a control that reads **Keep editing**, and nudged the holder's lock query once where the peer's request needs polling — an earlier run reached the end and the next failed at that line with nothing else changed.                                                                                                          |
| 290 | Two Gantt date cells opened, accepted a keystroke, and refused every value                          | 2026-09-10 | Live on the auto-pulling host since `web-v0.92.0`. The Start and Finish cells were listed in `GANTT_EDITABLE_COLUMNS` while `cellWriteFields` returned `null` for both keys before parsing anything, which the commit path turned into _"That value is not something this cell accepts."_ — shown **and spoken** — for a correctly formatted date. There was no value it accepted, so the message blamed the planner for the product's gap. **Both files were internally correct and defensible; only the RELATIONSHIP was wrong**, which is why the fix is a derived assertion rather than deleting two lines: `cell-commit.test.ts` now asks, for every column the grid will OPEN, whether any value is accepted — with a **pinned positive**, because an empty roster satisfies that loop perfectly and a green run could not then tell "every editable column works" from "no column is editable" (ADR-0093). Verified RED first, naming `earlyStart` in the failure message. The keys stay in `GanttCellKey` and the gate keeps its `!hasComputedSchedule` branch on the `percentComplete` precedent, so landing the typed-date cell (`docs/specs/gantt-editing-gaps/` M3, which needs an ADR — it is a schedule semantic) is a column rather than a re-decision. **One assertion changed rather than being deleted, and the change is the honest direction**: the cells used to announce `aria-readonly` with _"Recalculate…"_, a promise unfulfillable in BOTH states — before the fix recalculating only reached a cell that refused, after it the column never opens — so keeping it would have stated a falsehood in the one channel with no way to check. They are now ordinary read-only columns beside Float and Predecessors, which is ADR-0082's discriminator applied rather than overridden. Also fixed: the deferral cited `M2-T3b`, a task in no approved spec. Found by writing the `gantt-editing-gaps` spec — nothing in the product can notice that a gate says `writable` and a commit says `null` — and every particular was verified against the code before filing.                                                         |
| 254 | The revision-compare benchmark never exercised the projections it is quoted for                     | 2026-09-10 | Closed by measurement, with the condition committed in its own commit before the harness was touched, exactly as the row asked (`docs/specs/revision-compare-delta/f3-include-condition.md`, result in `f3-include-measurement.md`). **The client's own configuration clears the published 250 ms bar** — 147.3 ms p95 with `&include=changes&include=ghosts` against 120.7 ms delta-only, non-vacuous on every limb (700 change rows of 3,180 before the cap, 200 ghosts of 1,020, 100 link changes). **The ratio is deliberately NOT closed**: the two runs that are the same measurement repeated disagree by 21.8 ms on a quantity of about 15 ms, so C3's refusal to gate a ratio nobody had measured was right for a reason the condition could only guess at — any of the three runs could have decided a threshold (the ADR-0127 D8 / ADR-0128 finding one route along). **Two of the row's own claims were wrong**: its density complaint read a chain _length_ as a density and was out by about nineteen times (0.95:1, not 0.05:1), and the remedy it prescribed — `?include=changes,ghosts` — is refused with **422**, because the DTO reads a comma-joined value as one invalid member; following it literally would have thrown before a sample was taken. **Three defects the row did not name**: the teardown was the **fourteenth** copy of the sweep #253 removed — invisible to that pass, which swept `apps/api/test/` while this file is in `apps/api/scripts/` — and because the teardown runs _before_ the assertions, the harness's docblock claim to assert its bar had been false since ADR-0126, a real regression surfacing as a foreign-key error in cleanup code; the first run reported `0 links`, leaving the ghost _link_ builder (one of the two the row names) untimed, so the mutation now changes logic in both directions, exceeding the committed C1 floor rather than relaxing it; and the header printed the count _inserted_ rather than the count _measured_. `docs/API.md`'s 58.7 ms figure is deliberately **not** replaced — it is another machine's, and two numbers from two machines do not compare. |
| 253 | Thirteen hand-maintained copies of the baseline-children delete sweep                               | 2026-09-06 | One `clearBaselineTree(prisma)` in `apps/api/test/`, called by `audit-reset.ts` and all twelve e2e specs, with the children **asked of `Prisma.dmmf` rather than listed** — listing them in one place instead of thirteen would still have to be remembered, and remembering is what failed when ADR-0126 added `baseline_dependencies` and broke **557 of 587** tests in thirteen files at once. Three things checked rather than assumed: the count is fourteen files (the row's thirteen plus the runner, as it said); the DMMF reports exactly three children, all RESTRICT, and **none holds a foreign key into another**, which the runner's comment asserted and nothing had verified — the helper re-derives that and **throws** rather than guessing if it ever stops holding; and the four lines were byte-identical in all thirteen, so this is a replacement rather than a merge of thirteen dialects. The **retention runner is deliberately unchanged**: its ordering is already gated by `hierarchy-expiry.structural.spec.ts` and its rule genuinely differs — it must not name an `onDelete: Cascade` child, where a test reset may. Two consumers, two correct rules, stated in both docblocks rather than merged behind a flag. `clear-baseline-tree.e2e-spec.ts` pins it, **verified red first** against the one regression the thirteen callers structurally cannot catch: a hard-coded list replacing the DMMF walk, which passes every one of them and then misses the fourteenth table.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 252 | `pnpm measure:draw` could not bundle: the seed barrel forced a Node-only module on a browser        | 2026-09-06 | `docs/specs/seed-browser-safe/`. `5a5f00da` moved the fixture tier into `packages/seed` and re-exported it from the barrel; that tier imports `@repo/engine-conformance`, which imports `node:fs`, so importing `scaleSpec` dragged a filesystem reader into a browser bundle and the benchmark this repository quotes for every canvas claim stopped bundling for a day. **No user was ever affected** — nothing under `apps/web/src` imports that package — which is exactly why nothing went red. Fixed additively with subpath exports (`./spec`, `./scale`, `./pairwise`, `./negative`, `./fixture`); the root export is untouched. The `--external:node:*` workaround was **removed**, not left, and the bundle verified to build without it. New gate `pnpm check:browser-safe` bundles every browser-side entry point for a browser and was verified red against the real defect — **and its own first run was wrong**, running esbuild from the repo root where it is unresolvable (a transitive Vite dependency) and reading only `stderr` where pnpm writes to `stdout`, so it failed all four entries while printing a blank, confident diagnosis about a widened barrel. A gate that always fails for a reason it misreports trains a reader to ignore it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 231 | `sections()` ended a row at the next SAME-level heading, so a `###` row read its neighbour's fields | 2026-09-02 | ADR-0124 and `docs/specs/gate-conventions/`. A section now ends at the next heading of the same level **or shallower**. The falsification condition predicted at most two moved boundaries and named one; **three** move, and the two it missed by reading are the large ones — `docs/RECONCILE.md`'s "Record the pass" (31 → 5 lines) and a `docs/DECISIONS.md` entry silently swallowing **1,160**. Its second half held exactly, so the repair-then-arm branch did not fire: a moved boundary only matters where a body carried a field belonging to another row, and only this document has a field reader. The fixtures then caught an **off-by-one in the fix itself** — every body kept the heading that terminated it, and both consumer gates still reported byte-identical output, because a heading line is not a column-0 field declaration. The row also named `check:doc-links` as a consumer (it imports only node built-ins) and missed `check:reconcile-due` (which does).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 227 | Nothing asserted the register's heading form, so it drifted silently                                | 2026-09-02 | ADR-0124. A10, in **two limbs**: the first refuses a misshapen row heading, the second refuses a `###` that is not a row at all — which the first structurally cannot see, since its predicate only fires on lines already shaped like a row. That second case is not cosmetic: after the depth fix, any `###` inside the detailed region **terminates the row it sits in**. Nine repaired, of two kinds — eight rows in an `### #<n> —` form and one sub-heading demoted to `####`. Both limbs verified red. A10 deliberately does **not** narrow what the parser reads: ADR-0120 Finding 0 says a row in the wrong form is still a row.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 274 | Fifty-four shipped epics' specs still said they were awaiting approval                              | 2026-09-09 | ADR-0131 and `docs/specs/spec-status-gate/`. A gate, not a sweep — the sweep alone fixes today's fifty-four and guarantees tomorrow's, because `docs/PROCESS.md` names the header as front matter and names no step that revisits it. The predicate is **citation**, and the refinement (cited by an _Accepted_ ADR) was measured and rejected: eleven ADRs are `Proposed` and four are live production surfaces. **Three of this row's own figures did not survive re-measurement** — the population is 91 and not 88 (three epics name their spec `spec.md`), the Draft count is 72 and not 67 (three headers are bold `**Draft — …**`, invisible to a string match), and the cited-Draft figure went 28 → 50 → **54**, each correction upward. Report-only, then swept 66 findings to 0, then armed and **watched failing** rather than assumed. Its own join first found **70 of 72** cited slugs, anchored on `docs/specs/` while ADRs link relatively — caught only because M0 had produced an independent number. **17 Draft specs remain and none is a finding**: no ADR cites them, which is the stated blind spot.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 222 | `check:counts` read any "N ADRs" in a gated file as a claim about the repository                    | 2026-09-02 | ADR-0124. An **escape**, not a narrowing: an inline code span marks a mention, fenced blocks stay in scope. The row's own proposed remedy — narrow to "the shape a banner claim takes" — was **rejected on measurement**, because four of the six live claim sites are not in a banner (two inside a fenced repository-layout tree, two in plain prose) and narrowing would have silently stopped checking them: this gate's own failure mode, introduced by the fix for a different one. Measured before arming: 19 matches, **0** inside a code span. The failure message names the escape, so an author meets the remedy when the gate fires.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 235 | The prepush 0/2/other exit convention collided with `tsc`, which exits 2 for type errors            | 2026-09-02 | ADR-0124. The **default is inverted**: a non-zero exit blocks unless the gate is named in `ADVISORY_GATES`. The earlier fix marked three gates never-advisory, which covers the three somebody thought of and leaves the default on the dangerous side for everything else; inverting makes the residual risk **harmless rather than closed** — an unanticipated exit 2 now blocks — and retires `run_strict` as a special case instead of it being the safe path nobody remembered to take. Measured: all thirteen `check:*` are node, and `report()` is the only producer of a 2. `check:advisory-agreement` asserts the list against the code both ways, reading it out of `prepush.sh` rather than restating it; verified red in both directions, and **its own first run was a false positive** on a test file that merely exercises `report()` — the same class as `#222`, inside the check written about it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 237 | The journey sweep aggregated nothing, so one `EXIT=1` among forty scrolled past                     | 2026-09-02 | ADR-0124. The sweep ends with a named verdict and a matching exit status, and **refuses an empty population** — every assertion in it is over a list, and an empty list satisfies "nothing failed" perfectly (the ADR-0093 shape). Failures are **named, not counted**: "1 failure" is a number somebody scrolls past. Both branches exercised; the empty-population refusal verified in isolation, since reaching it through the real script requires the derivation itself to break.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 226 | The strip painter's unexplained 20x cost cliff at nine stacked segments                             | 2026-09-02 | **Attributed, and there is no cliff in the painter — the discontinuity was in the ESTIMATOR.** The row's own remedy (a DevTools Performance recording) was not needed; asking a cheaper question answered it. The slow frames are **periodic**, not clustered at the start and not random: measured at indices 19, 39, 59, 79, 100 … at eight segments and 16, 34, 52, 71, 90 … at nine — one every ~19-21 frames, which is a compositor flush absorbed by whichever paint call it lands on rather than the painter's own work. Their COUNT rises perfectly smoothly with segment count: **9, 12, 13, 14, 15, 16, 19** at 4/6/7/8/9/10/12 segments, with p50 flat at 0.2-0.9 ms throughout. `p95` over 300 frames reads `times[285]` of a list sorted ascending, so it is a slow frame exactly when **15 or more** are slow — and 15 is reached at precisely nine segments. The prediction was checked against every measured point and matches all seven. So the three things the row found puzzling are all explained at once: p50 barely moving, the even split costing the same, and four colours costing the same are correct observations about a metric that flips at a percentile boundary. **The harness now reports the slow-frame count against that boundary and says plainly when a delta is decided by the estimator** rather than by paint cost, so the next reader is not sent after a discontinuity that is not there. `STRIP_STACK_CAP` is unaffected — height binds at three long before cost does, as the row already said.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 232 | The WBS band's derived bucket had no accessible name or count                                       | 2026-09-02 | `docs/specs/wbs-bucket-a11y/`. A non-focusable `sr-only` list beside the activity listbox (`TsldPanel.tsx`, `aria-label="Work breakdown bands"`), covering the **whole band** rather than the bucket alone, with the **subtree count inside the accessible name** — the `GanttBucketRowView` treatment, whose own comment says why: "Unassigned" alone does not say whether the row is worth expanding. `aria-level` mirrors the Gantt's hierarchy so a reader does not sum a parent's count and a child's, and nothing is focusable or operable, so the count of AT-reachable activities is unchanged (ADR-0063 §4). The two false claims the row was raised on — `TsldCanvas.tsx`'s "its a11y equivalent is the band group in the parallel DOM listbox" and ADR-0063 §7's "announced as a group" — are corrected rather than left. **Found closed rather than built:** this row was still open when the register was re-surveyed on 2026-09-02, and the code, the test file and both corrected claims were already there — the already-fixed-and-unclosed shape `check:debt-status` exists for, and the seventh recorded instance.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 142 | `<Link to="/orgs/$orgSlug/clients">` warned that the router matched a different template            | 2026-09-02 | **Closed as UNREPRODUCED, not as fixed — nothing was changed to fix it.** The row's last open question was one channel: the base journey, whose specs carry no console listener, so its routes had never been watched. A listener was patched into all eleven base specs behind a throwaway `test` override and the whole journey run: **17 tests, 17 control emissions caught, ZERO real hits.** The control is what makes the zero mean anything — each test emitted a message carrying the needle text, and every one was captured, so a zero is the absence of the warning and not the absence of capture. Together with the earlier six-route probe in `e2e-overview`, every route the row named has now been watched and none warns. The half-diagnosis stands as the record of what it was: only an **empty-string** `clientId` reaches that message, an absent one does not, and no call site in `apps/web/src` passes one. If it recurs, the trailing slash in the logged path is the tell.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 240 | `check:claims` recognised a citation only if the file ended `.js` or `.mjs`                         | 2026-09-02 | `docs/specs/claims-citation-scan/`. **It was never a CSS hole** — the same pattern could not see `.cjs` either, while the own-file exclusion had always listed `'*.js' '*.mjs' '*.cjs'`, so the matcher and the exclusion disagreed about what JavaScript is. The rule is now ONE `CITED_EXTENSIONS` constant in `scripts/lib/citation-patterns.mjs` feeding both halves, with a `node`-runnable sibling test chained into `check:claims` that asserts the **derivation** rather than the values. Widening only the obvious half was measured before it was rejected: patterns alone produces **87 findings** on the first run, nearly all this repository's own stylesheets — ADR-0058's fails-on-day-one gate. Both halves widened together produces 4, and all four were real: Tailwind's Preflight rule (the claim that raised the row), `useBlocker.d.ts:35` — which ADR-0108's design calls its single most consequential claim, unregistered the whole time while its seven `useBlocker.js` siblings were registered purely because those end `.js` — and `lucide-react.d.ts:342`, whose citation still holds across five minor versions **by coincidence**, which is #181 in miniature. The gate also gains a third ownership category, `FOREIGN_UNVERIFIABLE`: the previous Flask app's `auth.css`, which no installed package resolves and `git ls-files` will never list, yet whose line ranges are load-bearing in ADR-0077 §9.3. Five red runs recorded in `m0-measurement.md`, one of which caught that file describing the notation twice and thereby demanding a register entry for its own illustration.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 96  | The router JSON-parsed every search param, so a foreign one arrived as the wrong type               | 2026-09-02 | ADR-0123 and `docs/specs/router-search-params/`. The codec is replaced at the router, which is the only place it could be — `parseSearch` has no per-route override. Three of the epic's own load-bearing claims were false and each correction changed the work: the row's proposed remedy (`parseSearchWith(v => v)`) would have fixed nothing, because the decode step coerces before the parser is reached; a validator cannot rename a key any more than remove one; and the library pair round-trips everything it wrote itself, so the damage was only ever to URLs this app did not compose. Two census gates keep the next route and the next reader honest. Follow-up filed as #242.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 238 | `restoreDeleteBatch`'s response fetch threw above 32,767 activities                                 | 2026-09-02 | Chunked through the new shared `common/db/id-chunks.ts`, which is the expiry runner's own measured constant and helper **extracted rather than copied** — two copies of a limit measured once would drift, and the drift would be invisible. The comment states the trade (the fetch is the endpoint's dominant cost, so chunking is slower at every size and correct above the ceiling), why re-keying on `deleteBatchId` is impossible (`restoreBatch` nulls it), and why the file's six other `{ in: ids }` sites need nothing — all six read request ids bounded at 2,000 by `@ArrayMaxSize`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 241 | A wall-clock assertion in the unit suite, next to the test that argues against it                   | 2026-09-02 | All four absolute wall-clock assertions in `apps/api` deleted — the row named one, a sweep found four, and **three of them sat under a comment arguing against exactly that assertion** ("assert completion + shape, not a CI wall-clock", then a CI wall-clock on the next line). Nothing was wrong in any single file; the wrongness was between each comment and the line beneath it. The deterministic assertions and the ratio gate stay, and the discriminator is written where the next reader will meet it: an elapsed-time assertion is legitimate only when the noise divides out.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 243 | `e2e-csp`'s authenticated case failed locally on its own interceptor                                | 2026-09-02 | The interceptor fetched and re-fulfilled **every** request to read a content-type, and `Route.fulfill({ response })` asserts the fetched body is still held by uid (`playwright-core` `coreBundle.js:13373`, now a registered claim) — on a loaded machine a burst of sub-resource fetches outlives its own routes. A CSP header only means anything on a **document**, so every one of those round trips was work done to hand a response back unchanged; `resourceType()` is known before any fetch, so a sub-resource takes `continue()` now. Exposure drops from every request on the page to one per navigation — stated as a reduction, not an impossibility. Three of three pass, including the violation-still-fires case, so the policy is still applied. The row's first version claimed the gate was blind to the authenticated shell; corrected before it merged, because CI ran that suite green throughout.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 95  | `apps/api`'s three Vite configs were ESM in a CommonJS package                                      | 2026-09-01 | Renamed to `.mts` (the row's own smaller alternative — `"type": "module"` would have meant auditing NestJS's CommonJS assumptions one at a time). Warning reproduced first, then gone; all three configs load, ESLint still reaches them, and the API e2e suite passed 572/572 under the renamed ones. The sweep for the same class then found a **second** occurrence the row did not know about, in `apps/web/vitest.config.ts` — an extensionless `./vite.config` import, fixed the same way; every other workspace is clean.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 151 | The Gantt grid splitter had no browser-level coverage                                               | 2026-09-01 | `e2e-gantt/gantt.spec.ts` now drives the separator to its floor and one step above it and asserts the pinned columns end exactly where the chart begins — verified red by understating `ganttFixedWidth` by 80 px, which reproduced ADR-0095's incident verbatim (`Float` at 881–941 against a chart starting at 861). It then found **two live defects** on its first extension: the `vs baseline` column is not a `GanttColumn`, so the pinned block summed to `pane + 72` whenever a baseline was active; and `useResizablePanelPrefs` clamped a stored size only in its `useState` initialiser, so a floor that rose afterwards never reached it. Both fixed with cases verified red. `grid-width.structural.test.ts` was green against both and now records why it structurally cannot see the second.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 71  | The WBS band's derived bucket was distinguished by colour alone                                     | 2026-09-01 | `docs/specs/wbs-bucket-bracket/`. The bucket is now an unfilled three-sided bracket, open at the foot — the language the Gantt already uses, for the reason it states: it is not a scheduled thing, it is the extent of things that are. **Decided by looking, not by reviewing.** The two specialist reviews disagreed; both remedies were mocked up on a real canvas with the product's own tokens, geometry and `truncateToWidth`, with a greyscale toggle applying the actual 1.4.1 test. The rejected remedy — a dashed outline over the fill — had been argued to "stay visually distinct at any bar width above a couple of px", and at 12px with colour withdrawn it reads as a slightly textured block: `--muted-foreground` and `--foreground` are both mid-greys once hue is gone. The label's ink moved with the fill in the same change, because it was `--background` — the canvas ground itself — so removing the fill alone would have painted the name invisible. `paint.wbs-band.test.ts` is the band's first paint-level test, verified red first.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 132 | `mail-alerting.e2e-spec.ts` saw its own writes late and the two cases swapped answers               | 2026-09-01 | Fixed in `e560ac2c`, whose own message names #132, and the row was left open — the already-fixed-and-unclosed shape, found by the verification sweep. `settleRows(expected)` polls the row count and throws with a diagnostic rather than sleeping 50 ms; both cases share it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 214 | An approved plan clause was never built, and its own risk table said it shipped                     | 2026-09-01 | Both halves now built. The coarse half landed at ADR-0118 M2; the row said the Gantt half was "carried into M3" and **it did not land there either** — verified by grep, then built. Its first run found six sortable column headers at **16 px** against WCAG 2.2 §2.5.8's 24 px floor, live on a shipped surface nothing had ever swept.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 177 | A compound citation was invisible to `check:claims`                                                 | 2026-09-01 | **Won't-fix**, on the row's own measurement: a repo-wide sweep found exactly two compound citations left, one excluded as this repository's own file and one that IS this row quoting the defect. Extending the regex is a shared-gate change (ADR-0105) that would then demand a register entry for an example. The seven real occurrences were already split into two citations each, so the hole is closed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 156 | The drawer-subject mechanism had no registrant                                                      | 2026-09-01 | Deleted, on the product owner's call: ADR-0097 D2 is closed as not wanted. The row's own premise had gone stale — it said the drawer "is very much alive: it holds the Project Explorer", which ADR-0109 D2 had already moved to its own column, so the dead set was the whole mechanism plus `ContextDrawer`, `useContextDrawerPrefs`, the `drawer` chrome slot and the shell's Escape rung. See `docs/DECISIONS.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 63  | The Progress tab carried no unsaved marker for its three panels                                     | 2026-08-31 | The confirmation half closed with ADR-0108 D2; this is the tab's own dot, which the lifted six-scope report already had the state for. Never a padlock — the pen does not gate Progress.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 67  | The Logic panel's post-remove focus target was the whole panel                                      | 2026-08-31 | Narrowed to the two dependency tables. No host-override seam: the Logic dialog owns no Close button to land on, so it would have shipped with no registrant (#156's shape).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 68  | **Add note** landed on the Notes tab but not in its composer                                        | 2026-08-31 | `focusNotes` on the intent, mirroring `focusSteps`, through to a `NoteComposer` `autoFocus`. Both entry points require `canWriteNotes`, so there is no reader-without-a-composer case.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 73  | `Column.srHeader` was dead once `headerCell` was set                                                | 2026-08-31 | Dropped at its one double-declaring call site; the `Column` docblock now says which wins and why a `headerCell` control needs no hidden text.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 169 | The Project Explorer's actions row duplicated its writer gate in two branches                       | 2026-08-31 | One `NewClientButton`, rendered by both the `SheetHeader` and drawer branches. The empty-strip half had already been closed incidentally by ADR-0109 D2's fold control.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 66  | A shaded create form still accepted input it cannot submit                                          | 2026-08-31 | Both create forms take a `FieldGateProvider`, so the fields shade read-only with the same reason node the Save points at. ADR-0083 had decided the pattern; these two forms had never used it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 224 | `plan:scale-500` was described as fully unassigned and its spec assigns 168 activities              | 2026-08-31 | The playbook said "478 of 478 unassigned" about a fixture that is 35 % assigned — on the document whose job is to say what wrong looks like. Corrected to 310 of 478, the denominator established from the engine's write set rather than from a seeded run.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 65  | A link's lag or type edited from the dialog is not recorded for undo                                | 2026-09-01 | `dependencyEditCommand` + `onSaved`/`onEdited` at both hosts, and a journey reading the lag back from the API.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 92  | An undone delete left a deletion with no matching restore                                           | 2026-08-31 | The inverse is now the id-stable `restore-batch` rather than a re-create, so `activity.restored` fires with the original id and the pair closes. It also stopped the re-create silently dropping every dependency the activity had. Cascade undo is #230.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 233 | A canvas lag drag read and wrote rounded days, so a sub-day lag could not survive one               | 2026-09-01 | The gesture now says how many DAYS it moved and the write carries minutes (`resolveLagDragWrite`), so the remainder rides through and the rounding cancels. Pixel-precise dragging was measured and rejected: one pixel is 5 min at the Day preset and 6.3 h at Year. Undo restores the stored minutes too — the same defect one layer along. Proven end to end against a real API on an eight-hour calendar, and **verified red**: pre-fix, nudging a four-hour lag stored 960 minutes, i.e. the lag DOUBLED rather than merely losing its remainder, because 240 min rounds up to 1 day.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 236 | Three placeholder sites of one kind carried two treatments                                          | 2026-09-01 | Bare prose everywhere (product-owner decision): the dashed frame came off `AddLinkSection` and `ImportScheduleDialog`, matching `ActivityResourcesPanel`. A precondition is not an absence, which is the reason these sites were excluded from the empty-state pass rather than converted by it. Both allow-list entries then went stale and the gate's third assertion caught them; the list fell 3 → 1. **The blind spot the row also named stays open in the gate's docblock**: the count was by TREATMENT, so an absence nobody drew a box around is invisible to it, and there is no cheap predicate for one.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 161 | The empty-state pattern was inconsistent, and `clients-loading` was a bare spinner                  | 2026-09-01 | `docs/specs/empty-state-consolidation/` — 34 hand-rolled dashed boxes counted, 5 that were errors or refusals reshaped, 27 converted, 3 left as placeholders with permanent reasons, and `empty-state.structural.test.ts` gating the result. `DataTable` renders a column-matched skeleton; its 15 page/panel siblings are #234. (c) and (d) had resolved in `web-v0.97.0` before anyone acted on them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 160 | `resolveLensPalette` was resolved twice per cycle                                                   | 2026-08-31 | One memo, both maps derived from it — which also makes the `barFill`/`barInk` pairing come from one resolve, as it must.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 171 | `schedulepoint-active-org` was never cleared and carried no user id                                 | 2026-08-31 | Keyed `<prefix>:<userId>` matching `recent-plans`, and swept beside `forgetAllForUser` at sign-out. On a shared machine the next person in was silently sent to the previous person's organisation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 108 | The plural drag: model, command and endpoint landed, the gesture did not                            | 2026-08-28 | `useBatchPlacements`/`moveMany`/`bulkPlacementCommand` plus `livePeerGhostRects` drawn into the overlay.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 128 | The multi-select journey's post-delete focus assertion was flaky                                    | 2026-08-24 | `focusListboxAfterModal` is a bounded self-verifying retry, not one rAF — a different remedy from the one this row prescribed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 179 | Changesets v3 stopped versioning private packages silently                                          | 2026-08-23 | `privatePackages: { version: true, tag: false }`. The residual it called untestable has since been exercised by a real bot-cut release.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 185 | The command deck was 182 px tall and nobody measured it first                                       | 2026-08-25 | Stacked geometry and its `!important` overrides deleted, every control inline. The row's height table was superseded three times (ADR-0110/0112/0115).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 189 | The command deck's search field made 18 of 27 commands unreachable by key                           | 2026-08-25 | One shared `toolbar-keyboard.ts` consumed by `Deck` and `Toolbar`; `containerShouldStandDown` called first in both.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 192 | The fix for #189 broke the shipped `Go to date` field                                               | 2026-08-25 | `toolbar-keyboard.ts` discriminates on `HTMLInputElement.type`, not `tagName`, and both containers import it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 196 | Two primitive keyboard defects, one a data-loss path                                                | 2026-08-28 | Fixed in the primitives. Two latent residuals carried out to #229 rather than closed with it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 198 | `inkOf` measured a span, not ink                                                                    | 2026-08-27 | `coveredWidth` merges leaf x-intervals; `spanOf` kept separately under a name that says what it is.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 199 | `shoot.mjs` could not photograph three of its own shots                                             | 2026-08-28 | Located by `[data-toolbar-item]` rather than by copy, and a per-shot catch exits non-zero naming every missing picture.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 212 | An overlay's height ceiling was measured from its own output                                        | 2026-08-28 | `overlayMaxHeight()` is viewport-constant with no `top` term; both consumers call it and a structural test pins that they do.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 186 | WCAG 2.5.8 lost its only automated cover when the fit gate was deleted                              | 2026-08-25 | `e2e-workspace-fit/command-surface.spec.ts`, its own CI step. ADR-0110 D5 later found that sweep blind to a split button's caret and fixed it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 188 | Eight of fourteen measurement harnesses could not run                                               | 2026-08-26 | Seven deleted, one repaired, estate green — and the row's own inventory was wrong in three ways, which the close records.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 190 | `Toolbar`'s vertical variant had no consumer, and a standard documented it                          | 2026-08-26 | Deleted on the product owner's call — the prop, its three branches and the `DESIGN_SYSTEM.md` rule in ONE commit, so code and standard could not drift apart.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 207 | The deck's folded groups were unreachable by any journey                                            | 2026-08-25 | ADR-0110 M4 — and the subject was then removed entirely on the product owner's steer, so the fold no longer exists.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 209 | The bulk-delete focus restoration was a race that failed once under load                            | 2026-08-24 | Reproduced under load the same day and hardened; `focusListboxAfterModal` self-verifies.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 183 | `check:claims` could not see a camelCase basename in its colon form                                 | 2026-08-31 | The class carries `A-Z`. It hid 15 citations resolving to **seven** unregistered claims into `useBlocker.js`/`Transitioner.js` — the behaviour ADR-0108 rests on. All seven read and registered.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 178 | `check:claims` resolved a package by the first store entry it found                                 | 2026-08-31 | Resolved through the LINK, with `resolveVia` naming the dependent for a transitive package. It was live on `axe-core`: the register was pinned to 4.12.1 while the journeys run 4.13.0.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 217 | Two defects in the printed documents, found by photographing them                                   | 2026-08-30 | Both, plus two more the fix's own photographs found. The harness had one print shot; the two documents a planner hands over had never been photographed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 153 | Three icon sizes in one family of canvas panels                                                     | 2026-08-29 | ADR-0118 M3, and not the way this row or its epic's plan said: `icon-lg` was deleted and all three panels unify on `icon`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 145 | A hand-rolled `Combobox` took the platform picker away on touch                                     | 2026-08-29 | ADR-0118 M3, closed by measurement rather than argument — including the open list's 32 px options, which nobody had asked about.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 210 | The panel-Surface-plus-border pairing was a literal in four places                                  | 2026-08-28 | Fix-slice M-D — **seven** pairings, not four; the new structural gate's first run found three the row and the spec both missed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 205 | The fixture plan was unschedulable as seeded, and the horizon guard was an untyped 500              | 2026-08-28 | Both halves — `7aaf155c` and fix-slice M-E's fixture revision.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 203 | Two menu-positioning clamps, one measured and one guessing                                          | 2026-08-28 | Fix-slice M-C. Both moved verbatim to `components/ui/overlay-position.ts`, with a structural gate against the next copy.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 182 | Three base-journey sign-up specs sat close to a 5 s timeout                                         | 2026-08-28 | Correctness programme Phase 2 — the row's own first candidate: an explicit `{ timeout: 15_000 }` with the reason at each site.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 175 | The exported diagram had never carried the date marks                                               | 2026-08-28 | Fix-slice M-F. `EXPORT_MARKER_ROW`, drawn from the same `axisMarkers` model the screen's ruler uses.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 173 | The canvas painter drew every glyph in a typeface the product does not use                          | 2026-08-28 | Correctness programme Phase 3 — and the row had itself gone stale: the face is IBM Plex Sans, not Space Grotesk.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 172 | No authenticated journey had ever run below `lg`                                                    | 2026-08-28 | `apps/web/e2e-narrow-shell/`, its own CI step. Its first run found the sheet had no ground at all.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 170 | Three axe scans ran every rule, because `.options()` replaces `.withTags()`                         | 2026-08-28 | Correctness programme Phase 4 — and the siblings were **two**, not three: the third died with the width ladder.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 167 | The exported diagram was the default picture, not the planner's                                     | 2026-08-28 | Correctness programme Phase 3. `TsldCanvasHandle.getSceneLenses()` reads all five lens keys off the live scene ref.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 166 | A whole-plan export of a long programme lost weekends entirely                                      | 2026-08-28 | Correctness programme Phase 3. `paintScene` gains a `minNonWorkingPx` seam; the export passes `0`, so a weekend is one crisp band.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 162 | The legend's slack chip did not match what the canvas paints                                        | 2026-08-28 | Correctness programme Phase 1. The swatch names `--primary` + `--border`, confirmed at `palette.ts` rather than recalled.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 152 | `zoomToSelection` framed the time axis and discarded the lane axis                                  | 2026-08-28 | Correctness programme Phase 1. `revealOffset` in `render/viewport.ts` — one implementation, shared with `zoomToActivity`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 150 | The drawer overloaded "Close", and the editor's Close left an empty panel open                      | 2026-08-28 | Correctness programme Phase 1 — overtaken by ADR-0101, verified rather than assumed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 143 | The Project Explorer could not open a client or a project                                           | 2026-08-28 | Correctness programme Phase 1. `activate` now navigates for every kind; the container toggle keeps its own surface.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 133 | A coarse pointer cost the merged strip two commands, one of them Next conflict                      | 2026-08-28 | Overtaken — ADR-0109 D1 deleted the width ladder and the `⋯`, so nothing can leave the row. Re-measured at 1646.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 131 | An icon-only toolbar control named itself only on hover                                             | 2026-08-28 | ADR-0117 (fix-slice M-B). `useTooltip` in `components/ui/tooltip.tsx`, WCAG 1.4.13 in full.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 130 | The zoom trigger's icon said "date range" while owning the viewport                                 | 2026-08-28 | Overtaken — ADR-0109/0110 deleted the control this row describes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 176 | Better Auth 1.7 needed a schema migration, and a minor bump is how we found out                     | 2026-08-23 | ADR-0107. Both workspaces run `^1.7.1`; `accounts.issuer` migrated in two releases.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 122 | Two Class A flags were deferred, and the payoff was not where the register said                     | 2026-08-17 | `VITE_ACTIVITY_EDITOR_TABS` retired with ADR-0089; `VITE_CANVAS_WORKSPACE` in the flag-cleanup pass. `classACap` is now **0**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 112 | Copy/paste follow-ups from the W5 enablement gate                                                   | 2026-08-08 | `ActivitiesTable.row-gate-identity.test.tsx` and `use-clipboard-keybindings.test.ts` pin both, each saying so in its own docblock.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 106 | `render-model.ts` could not be barrel + core model without a cycle                                  | 2026-08-30 | ADR-0078 S8. `render/geometry.ts` exists; the barrel is 128 lines.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 109 | `bulkDelete` cascaded one activity at a time under the plan lock                                    | 2026-08-30 | `cascadeSoftDeleteActivityLeaves`, shipped in `3cf27de4` (an ADR-0082/0083/0084/0085 commit).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 104 | The manual Recalculate confirmation stood down against a settle that never came                     | 2026-08-30 | The row's own scenario was already guarded in the commit it was raised from; the real defect was the inverse. `settleIsComing`, two tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 114 | Two menus hid rather than shaded, for want of a reason to show                                      | 2026-08-30 | Verified in code: `menu.tsx:316-325` shades with `aria-disabled` and keeps roving focus; `plan-actions-menu.tsx:70` passes `disabledReason`; `tree-actions.ts` states the no-trigger rule.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 127 | Toolbar touch targets were 40 × 36 against a 44 × 44 house rule                                     | 2026-08-29 | ADR-0118 — the rule became per-pointer, and the coarse gate enforces it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 134 | A `render` item outranked every command on its row                                                  | 2026-08-30 | ADR-0109 D1 deleted the ladder; the diagnosis was right and the remedy expired with it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 144 | `e2e-multi-select`'s focus assertion failed under sweep load                                        | 2026-08-30 | `focusListboxAfterModal` self-verifies; `e2e-overview`'s `createPlan` waits for the pen. Filed under #184.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 146 | The `chrome` surface scope had no measured current-page state                                       | 2026-08-30 | ADR-0109 D2 restored the header, so `e2e-designed-ui` D3 measures two scopes again.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 147 | The merged command strip stopped fitting below ~900 px                                              | 2026-08-30 | ADR-0109 D1 — the surface wraps; the ladder, the `⋯` and the floor are gone.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 148 | Canvas date pills were painted on top of the first two lanes                                        | 2026-08-22 | ADR-0106.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 157 | Every colour gate was a floor and none a ceiling                                                    | 2026-08-21 | ADR-0102 — ANSWERED, deliberately no gate: the window is two points wide and tuned to two samples.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 158 | The printed and exported diagram was painted on a near-black ground                                 | 2026-08-21 | ADR-0102.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 159 | `--color-*` aliases were frozen at `:root`                                                          | 2026-08-21 | ADR-0102 — the canvas painter had never once used the canvas surface scope.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 163 | The print palette was a surface family truncated to three members                                   | 2026-08-22 | ADR-0103 — `[data-surface="print"]` is all 31 members.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 164 | The exported diagram silently dropped seven default-on view layers                                  | 2026-08-22 | ADR-0103. One half remains open as **#166**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 168 | Below `lg`, Escape closed and announced a drawer the reader could not see                           | 2026-08-22 | ADR-0104.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 201 | Two independent mode toggles read as one four-way group                                             | 2026-08-30 | ADR-0119; released in `web-v0.115.3`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 213 | Two controls painted and not clickable at 390, and a 20 px breadcrumb                               | 2026-08-29 | ADR-0118 M3 — the first was off-screen; the second is a named exception.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 115 | The pen sentence named a button the reader could not see                                            | 2026-08-09 | ADR-0083 M7 — one refusal sentence chosen from the live role and pen state.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 124 | The selection bar's `<Toolbar>` had no fit coverage                                                 | 2026-08-27 | ADR-0114 M1 — and the row's own reasoning was wrong: the bar could overflow, by 408 px.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 219 | The register's rows went stale and nothing measured how much                                        | 2026-08-30 | ADR-0120 — `check:debt-status`; every row now carries a machine-readable status.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 220 | The reconciliation trigger's input was unsorted prose, and a reader misread it                      | 2026-08-30 | ADR-0120 — `check:reconcile-due`, advisory at T = 8 ADRs; the pass table is sorted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 98  | The guest share view scrolled sideways at 320 px (WCAG 1.4.10)                                      | 2026-08-08 | ADR-0051 F-M4 era; closed by the guest-share responsive fix.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 29  | Released images not pulled — "shipped but not live"                                                 | 2026-07-30 | ADR-0047; `docs/DEPLOYMENT.md`. Superseded by #5.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 59  | The device-authoritative draw measurement was never made                                            | 2026-08-03 | Folded into **#75**, which waits on the same single run.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 77  | The demo Unit 300 file was a lossy rendering of the fixture                                         | 2026-08-01 | ADR-0066; `docs/TEST_PLAYBOOK.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 78  | Public activity/dependency API was day-denominated                                                  | 2026-08-02 | ADR-0070. `durationMinutes` / `lagMinutes` are on both DTOs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 79  | A window-only calendar was rejected by the API                                                      | 2026-08-01 | ADR-0067. Pinned by `calendars.e2e-spec.ts` "window-only".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 80  | Intraday shift patterns had no write path                                                           | 2026-08-01 | ADR-0067. `shifts` on the calendar create/update DTOs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 82  | Shift-editor epic — the non-blocking half of five gates                                             | 2026-08-01 | ADR-0067 M4; all seven sub-items landed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 87  | Import rejected a file with two activities of the same name                                         | 2026-08-03 | Fixed in `validate.ts` (`repairDuplicateCodesAndNames`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 90  | `idx_audit_events_actor_occurred` was never measured                                                | 2026-08-03 | Measured at 1M rows; ADR-0072 "Storage measured (2026-08-03)".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 91  | A failed sign-in was recorded and readable by nobody                                                | 2026-08-04 | ADR-0073 C2. Attributed at write time; `/me?include=attempts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 30  | Canvas-first workspace fast-follows (ADR-0030 M1–M5)                                                | 2026-08-08 | Verified done: `components/ui/segmented-control.tsx` + four `usePlanWorkspaceModel` hook suites.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 85  | Two `react-hooks/refs` suppressions in the toolbar-context memo                                     | 2026-08-07 | ADR-0078 S11 split the commands out; zero suppressions remain.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 94  | A verification email that never sends is invisible to everyone                                      | 2026-08-08 | Every remediation paid; ADR-0075 records the decision. Live gap is **#100**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 111 | The row menu hid pen-gated actions instead of shading them                                          | 2026-08-08 | ADR-0082, merged `d8d8c34`. `itemsOf` keeps disabled items; `disabledReason`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 103 | ADR-0064's recalculation hold was not wired on the shipped host                                     | 2026-08-08 | Debt-paydown M1-T1; pinned in `plan-workspace-toolbar.test.tsx`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 107 | ADR-0080 shipped without the specialist-agent review pass                                           | 2026-08-08 | ADR-0080 §9 — the pass ran and folded five blocking defects.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 113 | Redo unavailable after undoing a band copy                                                          | 2026-08-08 | `DELETE …/activities/:id` answers `200 { deleteBatchId }`; `docs/API.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 119 | The API e2e suite "fails intermittently"                                                            | 2026-08-10 | Order-dependent, not flaky. The live residue is **#119a**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 125 | `View ▾` held one toggle that ejects you from it                                                    | 2026-08-12 | ADR-0090 M5 — a standing note, `aria-describedby`-linked, with a neighbour test.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 83¹ | A typed duration overwritten by the calendar factor landing                                         | 2026-08-02 | ADR-0070 M6. `useDurationSeed` reads the field, not a flag.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 135 | The Gantt drew a VISUAL plan's bars from the early-date columns                                     | 2026-08-17 | ADR-0095. `barGeometry` takes a `source`; `date-source-consistency.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 136 | The Gantt's M5 remainder — T1, T4, T5, T6                                                           | 2026-08-18 | ADR-0095 M5, released `web-v0.92.0`. `e2e-gantt-editing/view-state.spec.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 137 | The shortcuts sheet was inert while the Gantt was on screen                                         | 2026-08-18 | ADR-0095. `PlanShortcutsHelp` mounts at the workspace, above both views.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 126 | The two segmented pairs had no icons, so they could not go icon-only                                | 2026-08-20 | ADR-0099 M5 chose all four and moved them to the rail, where they render icon-only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 129 | The 56 px app header row was the last recoverable band above the canvas                             | 2026-08-20 | ADR-0099 M3 deleted it at `lg`+ (`chrome-band.tsx` — `lg:hidden`). `aboveCanvas` 249 → 135.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

¹ **The collision.** This 83 is _not_ the 83 in the table above, which is open (ADR-0068 §6's missing
usage count). Two pieces of work took the same number. The live row keeps it; this one is recorded
here by title so neither reference is ambiguous.

**DECIDED 2026-09-02 (product owner), spec at `docs/specs/wbs-bucket-a11y/`.** The equivalent is a
non-focusable `sr-only` list beside the activity listbox, covering the **whole band** (every drawn
grouping, not the bucket alone), announcing a **subtree** count for a real phase, and **not** painting
a count on the canvas.

**One thing the decision exposed, recorded because it corrects the question rather than the answer:**
the subtree reading was put to the product owner with the cost "it would disagree with the Gantt".
Checked afterwards, that is false — `GanttActivityRow` has no `count` field, only `GanttBucketRow`
does, so **no count for a real phase exists anywhere in the product**. There is nothing to disagree
with. The shared composer therefore takes a count it is _given_, and the two call sites pass
different derivations of different subjects; its docblock has to say so, or the next reader will
"fix" one to match the other.

### 249. Four hand-copied dock-geometry blocks in the plan workspace

**Status:** open · **Verified:** 2026-09-10 · **Raised:** 2026-09-06 (the revision-compare M4 gate pass) · **Size:** S · **Owner:** repo

`plan-workspace-toolbar.tsx` now carries **four** near-identical dock-resize blocks — notes,
floatPaths, health and revisions — each about fifteen lines of `Prefs` / `EffectiveMax` / `Width` /
`PointerToSize` / `onResize` wiring, copied by hand. The revision comparison's block is a faithful
copy of the pattern rather than a new defect, and the M4 component review flagged the count rather
than the copy.

**Re-verified 2026-09-10**: still exactly four, by distinct identifier rather than by eye —
`notesEffectiveMax`, `floatPathsEffectiveMax`, `healthEffectiveMax`, `revisionEffectiveMax`.

Four is the point at which `right-docks.ts`'s own lesson starts applying to this geometry too: that
file exists because _"the way [pair statements] fail is that five get written"_, and it replaced them
with one derivation over the member list. The dock SET is derived; the dock GEOMETRY is not.

Remedy: a `useRightDockGeometry(prefs, minWidth)` helper, taken the next time this file is touched
for another reason — not as a standalone refactor of a file three epics have moved through.

**The deferral trigger was CHECKED on 2026-09-10 and has not fired.** Picked up during a pass over
the no-approval register work and deliberately put back: nothing in that pass touched
`plan-workspace-toolbar.tsx`, and the stated reason — a large file three epics have moved through,
where a standalone refactor is high risk for no delivered behaviour — is unchanged. Recorded rather
than silently skipped, because ADR-0114 found that _a deferral whose reason has lapsed reads exactly
like one whose reason still holds_; this one still holds, and the next reader should not have to
re-derive that.

### 251. The `aria-disabled` shading recipe is hand-rolled in thirteen places

**Status:** open · **Verified:** 2026-09-09 · **Raised:** 2026-09-06 (the revision-compare M4 gate pass) · **Size:** M · **Owner:** repo

The M4 component review counted **thirteen** independent implementations of one recipe —
`aria-disabled` + a click guard + an `sr-only` reason linked by `aria-describedby` — across
`window-list-editor`, `field-gate`, `scope-save-bar`, `Deck`, `ToolbarSplitButton`, `ToolbarPopover`,
`menu`, `plan-facts`, `GanttCell`, `BulkSelectionBar`, `CreateActivityPopover`, `tsld-toolbar-items`
and now `RevisionComparePanel`, with no shared hook.

> **Re-derived 2026-09-09, and three of the thirteen are not instances — each for a different and
> individually good reason, which changes the row's premise and not only its count.** The recipe's
> first element is `aria-disabled`, and these three carry **none**:
>
> - **`window-list-editor.tsx`** takes `readOnly` + a visible `readOnlyReason` linked to the group
>   (`:47-48`, `:58-59`). That is **ADR-0083's rule**, deliberately not this one: a control with
>   operations beyond changing its value gets `readOnly`, and shading it would be the defect.
> - **`field-gate.tsx`** renders the reason as **real visible text and says so** — _"not `sr-only`
>   … because a sighted keyboard user needs it"_ (`:31-32`). Also deliberate, also a different rule.
> - **`Deck.tsx`** passes `disabled` + `disabledReason` down (`:275-276`, `:299-300`) and does not
>   implement anything. It is a **consumer** of the shared implementation, not a copy of it.
>
> **So "with no shared hook" is not true as stated.** `ToolbarButton.tsx` already holds the whole
> recipe centrally — `aria-disabled` over native `disabled` to keep the control focusable (`:151-152`),
> the `sr-only` reason (`:179-180`), and the name/description composition (`:101-103`) — and every
> toolbar consumer reaches it through props. `field-gate` is the equivalent for the form family.
> The honest finding is narrower and more useful: the recipe is hand-rolled in the sites that are
> **neither a toolbar item nor a form field**, which is where no shared home exists yet.
>
> **The pass was done (2026-09-10), and the method matters more than the number.** A file is an
> **implementation** if it writes the `aria-disabled` attribute onto an element it renders **and**
> owns an `sr-only` reason node linked by `aria-describedby` — that is the recipe this row names,
> all three parts. A **consumer** forwards `disabledReason` to a primitive and implements nothing.
> Comments are stripped before classifying, or a file explaining the recipe counts as using it (five
> gates in this repository have shipped that way).
>
> | class                                           | count  |
> | ----------------------------------------------- | ------ |
> | implementations (attribute + own linked reason) | **10** |
> | partial (attribute, **no reason of its own**)   | **32** |
> | consumers (forward `disabledReason`)            | 7      |
> | mentions only                                   | 1      |
>
> **Ten is not the row's thirteen minus the three corrected above, and saying so would be a tidy
> lie.** It is a different ten. Seven overlap (`menu`, `plan-facts`, `ToolbarPopover`,
> `ToolbarSplitButton`, `tsld-toolbar-items`, `RevisionComparePanel`, and — see below —
> `ToolbarButton`, which the row never named); four of the row's thirteen (`scope-save-bar`,
> `GanttCell`, `BulkSelectionBar`, `CreateActivityPopover`) turn out to be **partial** rather than
> implementations; and three the row never mentions are (`RevisionChangesView`,
> `ScheduleHealthPanel`, `TsldPanel`). The arithmetic coinciding at ten is a coincidence.
>
> **The 32 is the number worth looking at, and it is not 32 defects.** These write the attribute and
> supply no reason at all — which is ADR-0082's actual subject, one tier below this row's. Some are
> plainly fine: a submit button shaded while its own save is in flight needs no sentence, because the
> state is temporal and the reader caused it. ADR-0082's rule bites where the state is one the reader
> **can change** or one their **role** imposes, and separating those two populations is a judgement
> per call site, not a predicate. **So it is reported as a population and not as a finding** — the
> same discipline that stopped a number being invented here in the first place.
>
> **`Size: M` still rests on nothing.** The extraction this row asks for is 10 files, not 13, and the
> larger question the pass uncovered (which of the 32 owe a reason) is a different piece of work that
> should be filed on its own terms rather than folded in here.

The count is **the reviewer's and has not been re-derived here**, which is why this row is
`unverified` rather than `open` — a count nobody re-ran is exactly the claim ADR-0076 Class 1 is
about, and filing it as established would be committing that inside the row recording it.

It is pre-existing debt this epic adds one unit to rather than causes. What makes it worth a row is
that the recipe has already been got wrong twice in this codebase's record (once by omitting the
reason, once by using native `disabled` and losing the reason with the tab stop), and thirteen copies
is thirteen chances to get it wrong again. The remedy is a `useShadedControl` hook; the trigger is
the next epic that touches three or more of them.

### 256. Every e2e reset hand-orders the whole schema, and five had it wrong

**Status:** open · **Verified:** 2026-09-10 · **Raised:** 2026-09-07 (closing #253) · **Size:** M · **Owner:** repo

**Re-verified 2026-09-10 by counting**: **41** e2e specs still call `deleteMany` directly, while
**17** files use the `clearBaselineTree` helper #253 created — so the shared helper covers its one
parent and the hand-written topological sort of everything else survives in the rest, exactly as
this row describes.

#253 removed the duplication for **one** parent (`baseline`) by asking `Prisma.dmmf` for its
children. The rest of each reset is still a hand-written topological sort of the whole schema, one
copy per spec, and closing #253 found five of them wrong about a different table:
`cross_plan_dependencies` holds RESTRICT foreign keys to **both** endpoint activities (ADR-0045),
and two specs deleted `activity` before it while three never deleted it at all.

**Reproduced once, with a log, and it did not reproduce on the next two runs** — because whether a
cross-plan row survives into a given reset depends on what ran before it in the shared database.
That is the `#119a` shape and it is why this went unnoticed: the failure names a constraint in a
spec that has never heard of programme scheduling, and a re-run sweeps it clean.

The five orderings are fixed. What is **not** fixed is the class: there is no reason to think
`cross_plan_dependencies` is the last table this happens to, and the next one will be found the same
way — by an unrelated spec failing on a constraint it does not recognise, on the runs where the
contamination happens to line up.

**Remedy — and it is a design question rather than a helper, which is why it is filed rather than
done here.** A `clearAll(prisma)` that deletes every table in an order **derived** from the DMMF's
foreign-key graph (a topological sort, with `onDelete: Cascade` edges skipped and self-references
handled the way ADR-0096 D7 records) would make all of this structural. The parts needing thought:
the specs' resets are not all whole-schema — several deliberately keep organisations or calendars
between cases, so a single `clearAll` would change what they test; and a cycle in the FK graph needs
an answer rather than a crash. Worth doing when a sixth table joins the pattern, or sooner if
another unexplained cross-spec FK failure appears.

### 257. ADR-0086 D6 records a staff write that was never built

**Status:** open · **Verified:** 2026-09-10 · **Raised:** 2026-09-07 (staff-performance-probe M0-T4) · **Size:** S · **Owner:** repo

`docs/adr/0086-staff-principal.md:143-145` states, in an **Accepted** ADR:

> One write exists in v1: "send a test message", addressed only to the requesting staff member's own
> verified address. The recipient is **not a parameter**, so it cannot be used as a relay — a
> structural property rather than a validation rule.

There is no `@Post`, `@Put`, `@Patch` or `@Delete` anywhere in `apps/api/src/modules/staff/`. The
controller has six `@Get` routes and nothing else. Verified by grep, 2026-09-07.

**That paragraph went stale the same week and the row's claim did not — 2026-09-10.** The staff
module now has a write: `staff.controller.ts:252`, `@Post('probe-results')`, shipped by ADR-0128 as
the console's canvas benchmark. So "no `@Post` anywhere" is false, while **the row's actual subject
— the "send a test message" route ADR-0086 D6 describes as existing — is still not built**. The
distinction matters because the stale sentence is the one a reader would run, and finding a `@Post`
would read as the row being closable.

ADR-0128's own register entry records the same finding from the other side ("ADR-0086 D6's claim
that one already exists is **false** — the shape landed and the route never did"), so the epic that
added the first real write knew D6 was wrong about a different one. **This row stays open**: an
Accepted ADR still describes a capability that does not exist, and no amount of unrelated writes
changes that.

**The shape landed and the route never did.** `mail_events.kind`'s CHECK permits `test`, and
`staff-health.dto.ts:12` enumerates it — so the design is half-present, which is what made the claim
easy to write and hard to notice. The reasoning quoted above is sound; it simply describes something
that does not exist.

**Why this is worth a row rather than a quiet correction.** ADRs are never rewritten (CLAUDE.md §6),
so the sentence stands as written and a reader has no way to tell it from the true ones around it.
More concretely, it costs the next author real work: the staff-performance-probe epic set out
believing it was adding the **second** write to that surface and could inherit a precedent for what a
staff write may do. It is adding the **first**, so every property a write must not break has to be
argued from scratch — which that epic's spec §4.10 now does.

**Remediation:** either build the test-send route the ADR describes (a real capability: an operator
with `MAIL_SMTP_URL` set has no way to confirm delivery works without waiting for a real event), or
supersede the claim in a later ADR. **Do not do it opportunistically inside another epic** — it is a
different capability with its own security argument, and bundling it is how a surface acquires a
write nobody reviewed on its own terms.

### 255. Six non-blocking findings from the revision-compare gate pass

**Status:** open · **Verified:** 2026-09-10 · **Raised:** 2026-09-06 (revision-compare M8) · **Size:** S · **Owner:** repo

**Depth of the 2026-09-10 re-verification, stated because the date alone would overclaim:** this is
a list of deferred findings, and it was checked as a LIST — that the epic which filed it has had no
follow-up landing its items — not item by item. Any single entry below may have been fixed
incidentally by neighbouring work without anyone striking it. Treat each as unverified until the
person picking it up checks that one, which is cheap because every entry names its file.

Each was judged real and not worth holding the release for.

1. **`?include=ghosts` also returns `links`**, and neither the query DTO's description nor the enum
   says so — a reader learns it only from `@repo/types`. There is no separate `links` value, so
   this is naming rather than behaviour, but it is a sentence's worth of fix.
2. **`?include=progress` alone is a silent no-op**: it only has an effect alongside `changes`,
   because the classifier is only called when the change list is requested. The DTO implies it
   stands on its own.
3. **`TsldPanel` gained five props for one feature**, all plucked from one DTO at the call site.
   The sibling lens threads raw data and derives inside; these could be one `compareChanges`
   object, cutting the surface and removing the risk of the four being passed out of sync.
4. **The compare overlay's ADDED/CHANGED link treatment is pixel-identical to the incident-highlight
   pass** for a selected driving edge — same weight, same dash, same `palette.selection`. WCAG 1.4.1
   is satisfied (weight and dash differ from colour alone), but a planner with an activity selected
   while the overlay is on cannot tell "incident to my selection" from "changed in the comparison".
5. **The overlay survives closing the comparison dock** with nothing on screen naming the pair —
   `revisionFrom`/`revisionTo` are never cleared on close, so the ghosts remain with no caption.
6. **`compareOverlaySummary`'s removed list keys on the NAME**, so two removed activities sharing a
   name produce a duplicate React key. Carrying the id alongside would remove it cheaply.

Findings 4 and 5 are the two worth doing first: both are about a picture that is honest in its
words and ambiguous on screen, which is the failure mode this epic spent its whole gate pass on.

---

**2026-09-11 — every entry checked INDIVIDUALLY for the first time. Three are done; three are open
with a reason each.**

This row's own caveat said its entries were checked as a list and any one might have been fixed
incidentally. One had been, halfway, which is the case that caveat exists for.

- **1 — DONE, and it was half fixed already.** The _response_ DTO already said it
  (`revision-compare.dto.ts:414`, "which also returns `links`"); the **query** DTO's description —
  the one a caller reads in the OpenAPI spec — did not. Now says so, and says there is no separate
  `links` include value, so asking for `ghosts` is how a caller gets both. Had this been struck on
  the first grep it would have been struck wrongly.
- **2 — DONE.** The query DTO now states plainly that `?include=progress` **alone is a silent
  no-op**, because the classifier only runs when `changes` is also requested. It previously said
  "`progress` _additionally_ assesses…", which hints at the dependency and does not state it.
- **6 — DONE, and it was a real defect rather than tidiness.** `compareOverlaySummary` returned
  `readonly string[]` of names and the consumer rendered `key={name}`, so two removed activities
  sharing a name were one React key — React renders them as one row, and the **second simply never
  reaches the reader**, in the `sr-only` list that is the only account a screen-reader user gets of
  removed work. Reachable, not theoretical: nothing makes an activity name unique here, only `code`
  carries a per-plan unique index, and two removed "Excavate" rows are what a re-sequenced
  programme produces. Now `{ activityId, name }`; verified RED first; the compiler caught the
  consumer, which is the mechanism working. The name is still what a reader hears — the id is a key
  and never copy.

**Still open, each verified against the code today:**

- **3** stands (`TsldPanel.tsx:260-271` — the five props are still separate). **Not done here
  because it is a component's public contract**, which ADR-0105 makes a spec-and-approval change
  whatever its size.
- **4** stands. It is a **visual design decision** — choosing a treatment that separates
  "incident to my selection" from "changed in the comparison" without reaching for colour alone —
  and not a defect with one right answer.
- **5** stands, and the verification is exact: `setRevisionFrom` has **one** caller in the whole
  file, the picker's `onFromChange` (`plan-workspace-toolbar.tsx:1510`). Nothing clears the pair on
  close. **Not done because the remedy is a product decision**: clear the pair on close, which
  removes an overlay a planner may have opened deliberately, or keep it and caption it. ADR-0127
  D8b made the overlay default-on, which makes that choice sharper rather than easier.

### 258. The pacing arithmetic is written three times, and the shared copy was the dead one

**Status:** open · **Verified:** 2026-09-10 · **Raised:** 2026-09-07 (staff-performance-probe M5) · **Size:** M · **Owner:** repo

`model/pacing.ts` exported a `panPhase` built, in its own words, "so the panel and the CLI pace runs
identically", and it had **zero callers**. Both scenes reimplemented the same gap / percentile /
dropped-frame / fps arithmetic from scratch instead: `scenes/canvas-draw.ts`'s `runDrawPhase` and
`scenes/revision-diff.ts`'s `panRun`, the latter also carrying its own `percentile` and its own
`measureIdleInterval`. Three copies, and the one that looked like the shared home was the one
nothing used.

**Half of this is now CLOSED and the title is therefore wrong — 2026-09-10.** The dead copy is gone:
`model/pacing.ts:41` reads _"There was a `panPhase` here, and it was dead"_, and what survives in that
file — `measureIdleInterval` — has a real caller (`runner/run-probe.ts:250`). So it is no longer
true that the shared home is the unused one, which was the row's sharpest observation.

**What survives is the duplication itself**, and it is still two independent implementations rather
than one: `scenes/canvas-draw.ts:170` and `scenes/revision-diff.ts:79` each declare their own
`percentile`, and each recomputes gaps, dropped-frame count and fps beside it. Three copies became
two, by deletion rather than by consolidation — which removes the confusing part and leaves the
drift risk exactly where it was.

That is the exact drift ADR-0128 D2 exists to prevent, stated in this epic's own docblocks: two
implementations drift and the drift is invisible, because each looks right alone. The concrete
failure is cheap to describe — someone fixes an off-by-one in the "dropped frame" threshold or the
percentile interpolation in one copy and `canvas-draw` and `revision-diff` stop being comparable to
each other, which is the one property the whole table exists to preserve.

`panPhase` was **deleted** in M5 rather than left, because dead code that looks like the canonical
home is worse than none: the next person to fix that off-by-one fixes it there and neither scene
changes. `measureIdleInterval` genuinely is shared and stays.

The remedy is to give both scenes one pacing loop, and it is filed rather than done because it is a
refactor of the two modules that actually produce the numbers, in the middle of a gate pass, with no
behavioural change to show for it — the shape this repository has repeatedly recorded going wrong
when hurried. The trigger is the third scenario, or the first bug found in either copy.

### 259. Twelve non-blocking findings from the staff performance-probe gate pass

**Status:** open · **Verified:** 2026-09-10 · **Raised:** 2026-09-07 (staff-performance-probe M5) · **Size:** S · **Owner:** repo

**Depth of the 2026-09-10 re-verification, stated because the date alone would overclaim:** this is
a list of deferred findings, and it was checked as a LIST — that the epic which filed it has had no
follow-up landing its items — not item by item. Any single entry below may have been fixed
incidentally by neighbouring work without anyone striking it. Treat each as unverified until the
person picking it up checks that one, which is cheap because every entry names its file.

Six specialists over the combined diff. Security and backend-performance passed with nothing
blocking, both having re-derived the epic's own measurements from the shipped code rather than
trusting them — the read is a sub-millisecond backward index scan at 60,000 rows, the sweep reuses
the already-safe `ctid` batch rather than an unchunked `IN` list, and the DTO's bounds are a strict
subset of the database's CHECK constraints, so no DTO-valid payload can reach a 500 where a 422 was
promised. What follows was judged real and not worth holding the release for.

1. ~~**`recordedByLabel` is declared `@ApiPropertyOptional`**~~ — **closed** (probe-sweep M4). It now
   uses `@ApiProperty({ nullable: true })`, matching its five siblings, and both new columns were
   declared the same way rather than repeating the mistake.
2. ~~**`counts` and `thresholds` are typed as opaque objects on the response**~~ — **closed**
   (probe-sweep M7). The response now declares `ProbeCountsDto` / `ProbeThresholdsDto`, the same two
   classes the request names one file over. The **TypeScript** type stays `Record<string, unknown>`
   deliberately: the value is JSON read back from the database and is not re-validated on read, so a
   narrower TS type would assert a guarantee the read path does not make. `samples` beside them
   stays opaque, legitimately — its members differ by `limbKind`.
3. ~~**`GET /staff/probe-results` does not declare its 422**~~ — **closed** (probe-sweep M7), and as
   the **sweep this item asked for** rather than a spot fix: `GET /staff/accounts` carries the
   declaration too. Fixing one and not its neighbour is this register's most-repeated shape, and the
   row had already named the neighbour.

**Items 1–3 were claimed closed by the probe-sweep plan before they were.** Its Done checklist said
"#259 items 1–3 closed" while items 2 and 3 were untouched, and item 1 — which genuinely had been
fixed, in M4 — left this row still printing it as an open finding. Two failures stacked: a plan
asserting work it had not done, and a register describing a defect that no longer existed. Found by
the M7 api review, not by anything failing. The plan is corrected in place; this is the register
catching up. ADR-0071's rule needs its second half — noticing drift and stepping over it leaves the
register exactly as wrong as not noticing. 4. **No `hasMore` signal on the history read.** The "no cursor" decision is argued and right for a
table only a human can write to, but a caller asking for 50 against 200 rows can only infer
there is more by comparing lengths. 5. **`GET /staff/probe-results` shares every staff member's machine fingerprint with every other
staff member.** Intended, and appropriate for a small allowlisted population; worth revisiting
if `STAFF_EMAILS` ever grows. 6. **The erasure affordance is structural only.** `recorded_by_label` and `gpu_renderer` are
nullable so a reading can be scrubbed; no scrub path exists anywhere in the product yet, which
matches ADR-0085's "decision only, nothing built" status rather than being a gap this epic added. 7. ~~**`scenes/revision-diff.ts`'s pure helpers (`changedSet`, `countVisible`) have no unit
test**~~ — **closed 2026-09-11.** `revision-diff.test.ts` now exists beside its sibling, with
eleven cases. Both helpers are load-bearing for whether a _reading_ means anything — `changedSet`
decides what the overlay draws and the probe's non-vacuity floors are checked against
`countVisible`'s output — so a defect in either produces a confident number about a picture that
was never painted, which is precisely the ADR-0066 failure the floors exist to prevent. **The
tests were verified to discriminate rather than merely to pass**: mutating the source to drop the
undated-activity skip and to shift the ghost later turned exactly the two cases written for those
behaviours red. The stride case asserts **determinism across two calls** rather than a particular
stride — pinning the constant would make it a copy of the source rather than a test of it — and a
second case bounds the changed set below half, because a stride selecting most activities would
quietly reinstate the whole-old-plan overlay ADR-0127 CQ-2 rejected. 8. **`RecordingState` takes three booleans for one mutation status.** TanStack Query already
exposes it as a single `status`, and the three-boolean signature admits combinations the call
site happens never to produce. 9. **The spec's "visible caption naming it a test picture"** on the measuring canvas was never
built. Not a WCAG failure — the canvas is `aria-hidden` and the progress sentence is the
accessible channel — but a documented sighted-user affordance that does not exist. 10. **Several `Alert`s mount in the same commit as the panel's own live region.** `Alert` carries an
implicit live-region role, so the "one accessible channel" claim in the panel's docblock stops
holding at the moment a run ends. The content is redundant rather than contradictory.

    **Sharpened 2026-09-09 (probe-sweep M3).** The cancelled pair is now **byte-identical** in both
    channels, which is a strict improvement in truthfulness — before M3 one said "nothing was
    recorded" while the other could say two readings were kept, and a live region making a false
    statement is worse than one making a redundant one — and it makes the duplication easier to
    hear rather than harder. `summarise()` and the visible `Alert` both render
    `cancelledSentence()`. A refusal already had the same shape in two wordings.

    **What would close it is a decision about which channel owns the outcome, not a wording
    change.** Three candidates, none free: drop `summarise`'s outcome branches and let the `Alert`
    announce (loses the status line for a sighted reader not looking at the result region); render
    the visible result `role="presentation"` and keep the live region (loses the `Alert`'s tone
    semantics); or give `Panel` a way to suppress its status when its body already announces. All
    three touch a shared primitive.

    _This was filed again as **#267** on 2026-09-09 by somebody who had noticed it in the code and
    not looked for it in the register. That row is deleted and ledgered; the analysis is here,
    where the defect already lived. Two rows for one defect is the failure the Closed-numbers
    ledger exists to prevent — the register disagreeing with itself about what a number means._

11. **`revision-diff` narrates progress once for a whole multi-pair run** where `canvas-draw`
narrates per repeat, so a screen-reader user hears nothing for up to twenty-five seconds. 12. ~~**The on-screen "cannot be judged" alert prints only the first line**~~ — **closed
2026-09-11.** It rendered `message.split('\n')[0]`, so everything after the first line was dropped
on screen while the paste-ready report carried it whole. The dropped part is the part that matters:
`NothingToJudgeError`'s non-vacuity message ends _"This is NOT a pass. A number measured on an
almost-empty canvas is a number about the cull"_ — the one sentence whose job is to stop a refusal
being read as a clean run, which is the mistake ADR-0066 records **actually happening**. Now renders
the whole message with `whitespace-pre-line` rather than re-flowing it into paragraphs: the judge
composes these as text with deliberate breaks and an indented detail line, and re-laying them out
here would be a second opinion about a layout the judge already has. Verified RED first, and the
case asserts the **first** line still shows as well as the two that were dropped — without that it
would pass equally against a panel that printed only the last line.

Numbers 1, 2 and 8 are the cheapest; 10 and 11 are the two a real screen-reader user would notice
first.

**And one thing the reviews did not find, because it is only visible in a log.** The API e2e run
prints, twice per run and reproducibly, `a retention sweep failed; the next run will retry it` for
`perf_probe_results` — the alarming half of exactly the quiet-failure shape #253 warns about. It is
**not** a defect in the sweep's new arm, and that was established rather than assumed: the statement
runs clean against a real database standalone, a two-file e2e run sweeps the table in 2 ms, and the
line immediately preceding every failure in the full run is `Database connection closed`. The suite
boots and closes fifty applications, the sweep runs at boot, and `perf_probe_results` is last in
`RETENTION_TABLES` — so it is the one still in flight when the client disconnects, which is why it
is deterministic rather than flaky and why it is always that table.

No guard was added, deliberately: suppressing a sweep failure during shutdown would also suppress a
real one, and the remedy — not starting a sweep the process cannot finish — is a lifecycle change to
`RetentionSweepService`, not a `catch`. The cost today is a scary line in a test log. The trigger to
do it is a fourth table, or anyone mistaking this for a production failure.

Reading that same log **did** find a real one, which is fixed rather than filed: the
`retention.configured` boot line named two tables and not the third, so the one place an operator is
told the effective periods was silently short by one — for a number ADR-0087 records as
irreversible. Its existing test used `objectContaining`, which cannot catch an omission; the
replacement counts `*Days` keys against `RETENTION_TABLES.length` and was verified red.

### 261. ADR-0026 §9's frame-rate gate does not say at what canvas size it applies

**Status:** deferred (on a trigger) · **Raised:** 2026-09-08 (#75's viewport discriminator) ·
**Size:** S · **Owner:** repo

> **PARKED 2026-09-10 with the rest of the canvas-performance programme.** The exhibit that made
> this urgent is contaminated (see below) and size flips no verdict anywhere measured. **Trigger:**
> anyone proposing to change ADR-0026 §9, or a display materially larger than 1920×1080 entering
> use — the trend puts one below the floor and the gate still names no display.

§9 states the gate as **≥ 45 fps @ 500 and ≥ 30 fps @ 2,000** under sustained pan, and fixes the
hardware it applies to — "a mid-tier laptop **and** an iPad-class tablet (Safari), light and dark".
It names **no canvas or viewport size**, and #75 item 5 shows that omission decides the verdict: the
same 2,000-activity plan, on the same machine, in the same browser, minutes apart, measures
**23.3 fps at a 1912×1068 viewport and 39.5 fps at 1016×636** — a fail and a pass against the same
floor. The measured cost is ~4.26 ms per megapixel, so the parameter is not a rounding term.

Every reading this repository holds was taken at an unstated and varying size: the 2026-08-03 set at
a ~1036×600 canvas, the 2026-09-08 set at two different viewports, and the headless harness at
whatever its container defaults to. None of them is wrong; none of them is comparable to another
without a figure nobody was recording.

**What would close it** is a decision, not a measurement: name the canvas size the gate is judged at,
in ADR-0026, and state it in the same breath as the fps figures so a reading cannot be taken without
it. The obvious candidate is a full-screen window on the §16 envelope, because that is what a planner
has — which would mean §9's floor is currently **missed** at the 2,000 ceiling, and that consequence
should be faced deliberately rather than arrived at by whoever next resizes a window.

**Not decided here.** It changes the meaning of an accepted gate and belongs to whoever picks up the
Fit-zoom work, alongside #75's unattributed time. Recording it is the point: the parameter has been
absent since 2026 and was invisible until two runs disagreed.

**THE EXHIBIT ABOVE IS CONTAMINATED, 2026-09-10 — the concern stands, the evidence does not.** This
row's whole case was the pair **23.3 fps at 1912×1068 against 39.5 fps at 1016×636**: a fail and a
pass against one floor, attributed to canvas size. #75 item 6(e) reproduced the larger geometry on
the same machine two days later at **1920×1080 — 1.5 % MORE pixels — and measured 32.2 fps**. The
23.3 fps reading does not reproduce, so the pair was never a clean size comparison; it was one
sitting against another, with an unrecorded variable between them (#283).

**What survives, measured within a single sitting so no state confound is possible:** at 1912×948,
**35.2 fps**; at 1920×1080, **32.2 fps**. So canvas size does cost real frames — about **3 fps for
14 % more area** — and it does **not** flip the verdict anywhere that has been measured, because
every judgeable point clears 30 fps. The extrapolation is what keeps this row open: the trend puts a
larger display below the floor, and nothing in ADR-0026 §9 says which display the gate is judged on.

**So the remedy is unchanged and its urgency is lower.** Name the canvas size in ADR-0026 §9 —
because a gate whose verdict is a function of an unstated parameter is underspecified whether or
not that parameter has yet been shown to flip it. What is **withdrawn** is this row's previous
claim that naming it "would mean §9's floor is currently missed at the 2,000 ceiling": on the
readings that reproduce, it is met.

**Strengthened 2026-09-10 by a third reading, and the margin is much smaller than this row assumed.**
#75 item 6 measures the same plan, same painter, same scene, same machine at **1912×948**:
**35.2 fps, above the same 30 fps floor** that 1912×1068 missed at 23.3 fps. So the verdict does not
merely turn on a 2:1 viewport difference — it turns on **120 px of window height, an 11 % area
change**, which is well inside the range two operators would differ by without either of them
resizing anything deliberately. A reader could dismiss the original exhibit as an extreme
comparison; this one cannot be dismissed that way.

It also removes the reason to wait. This row said the decision "belongs to whoever picks up the
Fit-zoom work" — but with the verdict flipping across an ordinary window difference, **there is no
stable answer to "does the painter pass §9 at 2,000?" for anyone to pick that work up against**, and
#75 item 6(c) now records the honest state as _unanswerable until the size is named_ rather than
missed. Naming it is a prerequisite for the Fit work, not a companion to it.

The consequence the original text asked to be faced deliberately is unchanged in kind and softer in
degree: at a full-screen window on the §16 envelope the floor was missed at 23.3 fps and is now
cleared at 35.2 fps at a slightly shorter one, so the candidate size decides whether §9 currently
passes. That is precisely why it must be a decision and not a reading.

### 262. A dependency bump changed documented library behaviour, and only a citation gate noticed

**Status:** open · **Verified:** 2026-09-10 · **Raised:** 2026-09-08 (the cited-package bump) · **Size:** S · **Owner:** repo

`@tanstack/history` 1.162.2 changed `win.history.go(1)` to **`win.history.go(-delta)`** when rolling
back a blocked Back. The old code always stepped forward one, which is wrong for a multi-step Back;
the new code reverses the actual delta. It is a **fix**, and it silently falsified nine statements
across `docs/specs/unsaved-work-guard/` — including verification **V12**, edge case **E7**, a mermaid
diagram and a coverage table — all of which said a blocked Back is undone with `go(1)`.

**Nothing except `pnpm check:claims` could have caught it.** The product's behaviour is unchanged:
the reader still lands where they were and the stack length is still unchanged, so E7's _conclusion_
survives and every test stays green. What changed is a sentence in a spec, and the only reason
anybody read that sentence is that ADR-0076's gate refused the bump and said "re-READ each cited
location". The gate proved the line had moved; a person had to see that the words beside it had
stopped being true.

**Two smaller findings from the same pass, both fixed here.**

1. **`link.js`'s anchor was the bare identifier `ignoreBlocker`**, which occurs three times in that
   file — a shift computed from the first match landed 229 lines from the cited construct. The
   citation now covers the whole `router.navigate({ … })` call it is about, which is both a stronger
   anchor and a better description of what the prose claims.
2. **`@tanstack/history` needed a `resolveVia`.** The bump puts two copies in the store and it is
   linked into no workspace, so which copy a claim concerns is not a fact about the tree. It resolves
   via `@tanstack/react-router`, whose 1.170.33 links 1.162.2 — the `axe-core` precedent exactly.

**What this row is for.** It is not a defect to fix; it is evidence for a question the register has
not answered: **how many other citations describe behaviour that has since changed, in packages
nobody has bumped recently?** The gate fires per-package on a version change, so a dependency that
has not moved since its citations were written is never re-read — and this pass shows that a single
patch release can falsify nine statements at once. `#181`'s "cite by symbol rather than line" note
is adjacent but different: symbols would have survived the line shift here and would **not** have
caught `go(1)` → `go(-delta)`, because the symbol is the same.

---

**2026-09-11 — the question is MEASURED, and the exposure is small today for a reason that will not
last.** Derived by walking `git log -p` over `scripts/dependency-claims.json` and taking, per
package, the date its `verifiedAgainst` entry last **changed** — which is precisely "when were this
package's citations last forced to be re-read", because that is the only event the gate creates.
For a package never bumped since registration, it is the registration date.

| package                | version  | claims | last forced re-read | age   |
| ---------------------- | -------- | -----: | ------------------- | ----- |
| better-auth            | 1.7.1    |     42 | 2026-09-10          | 1d    |
| @tanstack/react-router | 1.170.33 |     15 | 2026-09-08          | 3d    |
| @tanstack/history      | 1.162.2  |     13 | 2026-09-08          | 3d    |
| @tanstack/router-core  | 1.171.28 |     12 | 2026-09-08          | 3d    |
| lucide-react           | 1.33.0   |      5 | 2026-09-02          | 9d    |
| react-hook-form        | 7.86.0   |      4 | 2026-08-22          | 20d   |
| better-call            | 1.4.0    |      1 | 2026-08-22          | 20d   |
| zod                    | 4.4.3    |      1 | 2026-08-22          | 20d   |
| _seven others_         | —        |      6 | 2026-09-01 / 09-02  | 9–10d |

**83 of 100 citations were re-read within the last three days; 17 are older, and the oldest cohort
is 20 days — six claims across three packages.** So the specific worry this row raises has a small
present value: there is no large body of citations quietly describing a library that moved under
them.

**The caveat is the whole finding, and it points the other way.** These ages are low largely because
**the mechanism is young** — ADR-0076 registered the first claims about five weeks ago, and the
number that dominates the table is `better-auth`'s 42, re-read yesterday only because ADR-0107 had
to bump it. Nothing here shows that re-reads happen often; it shows that the register has not
existed long enough for a package to go stale in it. The exposure grows by one day per day on every
package nobody touches, and there is no gate for age — only for change.

**So the row stays open, with its question answered and a sharper one in its place**: is a
time-based re-read worth having (a periodic prompt, or the reconciliation pass taking the oldest
cohort), or is bump-triggered re-reading enough given that a library which never changes cannot
falsify a claim about it? The second is a real argument and not obviously wrong — the falsifier here
was a **release**, not the passage of time. That is a decision rather than work, which is why this
records the number and stops.

### 263. Twelve non-blocking findings from the cross-plan revision-comparison gate pass

**Status:** open · **Verified:** 2026-09-10 · **Raised:** 2026-09-08 (ADR-0129 M4) · **Size:** M · **Owner:** repo

**Depth of the 2026-09-10 re-verification, stated because the date alone would overclaim:** this is
a list of deferred findings, and it was checked as a LIST — that the epic which filed it has had no
follow-up landing its items — not item by item. Any single entry below may have been fixed
incidentally by neighbouring work without anyone striking it. Treat each as unverified until the
person picking it up checks that one, which is cheap because every entry names its file.

Six specialists ran over the epic's combined diff. Seven findings blocked and were folded with
red-first regression tests (see the M4 commit). These twelve did not, each with the reason it was
left rather than rushed.

**Two are measurement, and they are the ones worth reading.**

**(a) The P2 figure did not reproduce.** `m0-condition.md` records p95 208.2 ms (harness) and
215.2 ms (end-to-end) against a 250 ms bar, and the backend-performance review re-ran the same
harness twice on a contended host and got **299.9 / 346.1 ms** and **383.9 / 521.3 ms** — both
FAIL, on the same code, back to back. The reviewer's own reading is the right one: neither figure is
"the true cost", and the point is that **a 16 % headroom established from a single unrepeated run
is not evidence of stability**. The blocking duplicate read (folded) accounts for part of it; the
rest is host contention. What is owed is a repeated-invocation P2 with cross-run variance reported,
on a host class comparable to the other committed bars — not another single number.

**(b) The P2 bar is conditioned on a plan-size envelope nothing enforces.** 2,000 activities per
side is the benchmark; the loaders read the whole plan unconditionally and only the OUTPUT is capped
at 200. This route does that read twice. A customer with materially larger plans leaves the measured
envelope with no gate saying so. Bounded by the route being fully authenticated and dual-permission
gated, and it mirrors the sibling's already-accepted posture.

**Four are the API contract's own claims.**

**(c)** The excess-property check does **not** fire inside `...(cond ? { … } : {})`, demonstrated by
compilation — so the seven optional projection fields are not covered by the mechanism both DTOs'
docblocks cite. Corrected in the cross-plan docblock rather than left; the shipped route's identical
claim is untouched and inherits the gap. The concrete harm is independently covered by the G4 text
scan. A `satisfies` on the three spread blocks would make the claim literally true.

**(d)** `RevisionLinkChange['state']`'s `ADDED | REMOVED | CHANGED` is still a hand-copied `enum:`
literal with no backing tuple, in a file whose header says every enum is derived.
`REVISION_NOT_ASSESSABLE_REASONS` was added in M4 and closed the other two; this one is named rather
than silently excepted.

**(e)** `docs/API.md`'s **existing, untouched** description of the plan-nested route's
`ghosts`/`links` says "Neither is capped", which `revision-ghosts.ts`'s own docblock contradicts
("It shipped UNCAPPED for one review cycle and two independent reviews caught it"). Predates this
epic; found while reading the same file.

**(f)** `correlation.uncodedRows` shares ONE cap across both sides, so a from-side with more than
200 uncoded rows shows a sample containing zero to-side rows while `toUncoded` reports a non-zero
count. Both totals stay correct, so nothing is misreported — but the sample a reader is told to use
to "see what was left out" can be entirely one-sided. The M4 fix split the _lists_ by side; the
_cap_ is still shared.

**Three are semantics worth a reader knowing.**

**(g)** Anchor ids resolve against the anchor plan's **live** rows rather than the `to` revision, so
a from-only row can resolve to an activity created after the `to` baseline was captured that happens
to share a code. Documented intent (ADR-0126 D9), not a defect — but `activityId` does not mean
"this same row, now" in that case.

**(h)** Coverage-block rows are inert even for the anchor plan's own activities, while the same rows
are activatable in the Changes view. Deliberate (verification versus action) and documented in the
component, but a planner may expect to click through from the list they were told to read first.

**(i)** The overlay's refusal "Choose two revisions in Compare revisions… first" speaks in same-plan
terms even when reached through the cross-plan picker, where the planner chose a _plan_.

**Three are placement and style.**

**(j)** On screen the re-code caveat and the measurement frame sit after the whole delta, just above
the footer; on paper they sit immediately after the correlation lists. Paper has it right — a reader
told to check the coverage first may scroll past a long change list before meeting the caveat that
qualifies it.

**(k)** `RevisionComparePrintDocument.css` (and `HealthPrintDocument.css`) still carry hard-coded
hex on a docblock claiming a `@media print` sheet cannot read a runtime token — which
`print-document.css`, ADR-0103 and `docs/TECH_DEBT.md` #158 disproved, and which
`PrintSurface.css`/`GanttPrintSurface.css` already migrated to the `--print*` family the container
scopes. Shared debt with the health report; this epic touched the file without migrating it.

**(l)** `revision-compare-imported-p2.e2e-spec.ts` still carries an O(n·m) `some()`-inside-`filter()`
in its own stand-in correlation — a leftover from before M1 shipped the real one, which the file's
docblock names. Harness only, never shipped, and it inflates the very figure (a) is about.

### 264. A contended sweep produced four false failures, and then a contended re-run confirmed three of them

**Status:** open · **Verified:** 2026-09-10 · **Raised:** 2026-09-09 (ADR-0129 M4) · **Size:** S · **Owner:** repo

The ADR-0129 gate pass ran `scripts/e2e-sweep.sh` and got four failures: `account`, `audit`,
`designed-chrome`, `narrow-shell`. Every one was an artefact of contention, and the way that was
established is the point.

**The first mistake is already documented.** ADR-0099 records that "a sweep measures the tree it
runs against", and the sweep was started and then left running while the M4 fixes were edited into
the very files it was testing. That alone invalidates the run.

**The second mistake is the one worth a row.** To decide whether the four were regressions, three
were re-run at the pre-epic commit `1809d83c~1` and reported FAIL, and one PASS — so three were
written up as pre-existing and one as a real regression. **All four of those re-runs were themselves
contended**, because the sweep was still running: it was not stopped until later. The "real
regression" then passed on a settled tree, and `account` and `audit` passed in the clean sweep that
followed. So a contended instrument was used to check a contended instrument's answer, and produced
a confident wrong conclusion in both directions at once — one suite wrongly blamed on the epic, three
wrongly excused as long-standing.

**Nothing in the tooling stops this.** `scripts/e2e-local.sh` refuses to start while anything answers
on ports 3000 or 5173 — a guard added after three consecutive false diagnoses in one session — and
that guard did not fire, because the sweep starts and stops its own servers between suites, so a
re-run launched in a gap finds the ports free and proceeds into the next suite's contention. The
shared Postgres is the resource actually in conflict and nothing checks it.

**A fifth instance landed while this row was being written.** The clean sweep that established the
four were artefacts itself reported one failure — `e2e-undo`'s WBS-restore case, expecting 6
activities and finding 1 after a `Ctrl+Z`, timing out a 20-second poll. It passes in isolation. The
register already names the mechanism (ADR-0080: one undo is a restore, a recalculation and a
refetch, and that chain outruns Playwright's default poll), so a slow host lengthens a chain that is
already the longest in the suite. **43 of 44 green with one non-reproducing failure is the shape a
contended sweep has**, and it is why the answer here has to be a lock rather than a longer timeout:
raising the poll makes the symptom rarer and the diagnosis harder.

**What would fix it:** a lock on the database rather than on the ports — a sentinel row, an advisory
lock taken by `e2e-local.sh` for the life of a run, or simply a check for a running `e2e-sweep.sh`.
Filed rather than built because the correct remedy is a small design decision (which resource is the
lock on, and what does a caller see when it is held) and this row exists so the next person does not
re-derive the diagnosis from four confusing failures.

### 265. Two measurement harnesses write a fixed filename into the OS temp directory

**Status:** open · **Verified:** 2026-09-10 · **Raised:** 2026-09-09 (ADR-0129, PR #491 CI) · **Size:** S · **Owner:** api

CodeQL failed PR #491 on one high-severity `js/insecure-temporary-file` alert (CWE-377):
`revision-compare-imported-p2.e2e-spec.ts` wrote its report to `join(tmpdir(),
'm0-p2-result.txt')` — a name anybody on the host can guess and pre-create as a symlink, which the
harness would then follow. That instance is fixed in the same PR: the report goes into the run's
own `mkdtempSync` directory, the path is printed beside it, and the write is best-effort.

**Two siblings carry the same shape and were deliberately not swept.**
`revision-delta-m0.e2e-spec.ts:32` and `m0-attribution.e2e-spec.ts:58` both build
`join(tmpdir(), '<fixed name>.txt')`. They are not new in that PR, so CodeQL does not report them
as new alerts, and one of them **records the fixed path as a decision**: its docblock explains that
an `M0_REPORT` environment override was removed after CodeQL flagged it as `js/path-injection`,
because the configurability bought nothing. Overturning a recorded decision blind, inside a release
PR, to change where a throwaway log lands is exactly the drive-by churn §2 warns about — so it is
filed instead.

**What is worth knowing before picking it up.** The P2 probe had copied that sibling and got the
reasoning backwards: it kept the fixed temp name _and_ reintroduced the environment override the
sibling had deleted, so it carried both defects at once and CodeQL happened to report the newer of
the two. The fix that closes all three is the same three lines — `mkdtempSync`, print the path,
swallow the write — and the only real question is whether losing a guessable path costs anybody
anything, which it does not once the report is on stdout as well. Check whether the two siblings
appear as pre-existing open alerts in the branch's code-scanning view first: this session could not,
because the token in use gets `403 Resource not accessible by integration` on
`/code-scanning/alerts`.

### 266. A measurement probe still runs its full 900-second measurement in the blocking e2e job

**Status:** open · **Raised:** 2026-09-09 (ADR-0129, PRs #491/#493) · **Verified:** 2026-09-09 ·
**Size:** S · **Owner:** api

**The two defects this row was raised for are fixed** (product-owner decisions, 2026-09-09). It is
kept open on what those decisions deliberately did not settle, recorded below.

**What was found.** Two wall-clock assertions sat in gates every pull request must pass, on machines
nobody controls, and one release run falsified the reasoning behind each.

`revision-compare-imported-p2.e2e-spec.ts` was the only M0 probe **asserting** a bar (250 ms p95)
inside the blocking e2e job; its siblings report instead (`revision-delta-m0.e2e-spec.ts`: "This is
REPORTED, not asserted equal") and ADR-0128 had already decided the question — a performance
judgement belongs on hardware that can take it, never in a container whose own baseline moves by
more than the bar. Measured on one container within an hour: in the suite, harness 211.0 ms PASS /
end-to-end **255.2 ms FAIL**; run alone, harness **5954.2 ms FAIL** / end-to-end 191.2 ms PASS —
each configuration passing one half and failing the other, against 208.2 / 215.2 recorded in
ADR-0129. Then CI failed it at **5050.6 ms on a pull request that changed two markdown files**.
**Resolved by reporting rather than asserting**: both figures and every sample are still printed, the
non-vacuity assertions stay, and neither the bar nor the cold samples were touched.

`level.spec.ts`'s levelling ratio guard failed the same docs-only pull request at **4.88x
(362ms -> 1764ms)** against a 4.0x bound, with 1,927 of 1,933 api tests passing. That guard is the
considered replacement for an absolute bound #241 removed from the same file for flaking on a pull
request that likewise touched no API code, and its docblock argues it is safe because _"the noise is
in the numerator and the denominator, and divides out"_. **It does not.** A ratio cancels a constant
**speed** factor; it does not cancel an **independent per-run perturbation**, and the two timings run
sequentially in one process, so a GC pause or a slice of CPU steal landing in the second and not the
first is additive. With the smaller run at ~360 ms, one ~400 ms hiccup moves the ratio by more than a
whole point, against a bound holding 1.5x of headroom over the ~2.4x its docblock records measuring.
**Resolved by taking the median of three doublings** — a perturbation must land the same way in two
of three to move the verdict. **The 4.0x bound is unchanged**: the defect was the estimator's, not
the threshold's, and a bar set to whatever stops a test flaking measures nothing.

**That fix then failed CI itself, on the claim this row is about.** It shipped saying the cost was
"~3x this one test's runtime, paid knowingly", and never asked what the runtime was _permitted_ to
be: `vitest.config.mts` sets no `testTimeout`, so the default is 5,000 ms, and three pairs plus the
warm-up measured **5,258 ms on a GitHub runner** — failing on the clock rather than on the ratio,
while passing locally throughout because this container runs the whole file in 3.5 s. An unchecked
cost claim (ADR-0076 Class 3) committed inside the fix for a row about unchecked measurement claims.
Closed by an explicit 30 s timeout on that test, the `vitest.e2e.config.mts` convention, which
bounds the harness rather than the thing being measured — the verdict is still the ratio.

**What stays open, and it is not either of those.** The P2 probe still runs its whole measurement —
two 2,000-activity imports, 25 harness iterations and 21 HTTP round trips, minutes of wall clock,
a 900-second timeout — inside the default e2e include set, on **every** pull request, and now
asserts nothing at all. It produces a report nobody reads on a run nobody triggered. The option
costed and not taken was to give it its own script and CI step the way the ADR-0066 pairwise
differential has one, so it runs deliberately and its wall-clock is attributed to a step a reader can
see. That is the remaining work; it is small, and it is worth doing before the next probe copies this
one's shape.

**Also worth carrying: `ROUTE_ITERATIONS` is 21, so the p95 index is 19 — the second-worst sample.**
The file's own docblock explains the count was raised from 7 so that "one cold sample cannot become
the verdict", which was the right fix for the estimator being a literal maximum and still leaves the
figure very close to one. That matters less now nothing is asserted, and it would matter again the
moment anybody re-armed a gate on it.

### 271. The probe history is one capped page and says so only in words, because the read returns no total

**Status:** open · **Verified:** 2026-09-10 · **Raised:** 2026-09-09 (probe-sweep M6) · **Size:** S · **Owner:** api

`staff-probe.service.ts:136-141` reads the newest 50 rows — `take: DEFAULT_LIMIT`, `DEFAULT_LIMIT`
being 50 at `:14` — with **no total, no cursor and no more-pages flag**. So a client cannot tell
"fifty is everything" from "fifty is a page", and on an installation that has taken more than fifty
readings the oldest sittings simply stop being listed.

**It was reached, in this epic, by two different instruments on the same afternoon, which is why it
is a row rather than a note.**

First it silently disarmed a gate. The staff journey's M3 assertion counted every row in the history
before and after a stopped press and required the number to **rise** — and once the local database
held fifty readings the count could not move, because a new reading displaces the oldest. It had
passed for months on a fresh database, and it failed at 75 rows with the product behaving perfectly.
A gate that stops being able to report is this epic's own subject one tier out. It is now replaced
by a claim about the **shape of the newest sitting** — a stopped single press stores exactly one
reading, its completed limb — which is sharper as well as immune to the cap.

Then it made a screen say something false. M6-T3 added "This sitting has 2 of 4 readings. 2 were
refused or never taken — nothing is stored for those", which is sound reasoning from an absence
**only if the absence is real**. At the page boundary it is not: those readings are stored and
merely unreturned. The oldest block on screen therefore no longer says why a reading is missing, and
the list carries "Showing the most recent readings. Older sittings are not listed."

**Both are honest patches around a missing fact, and the fact is what to build.** Deliberately
**not** done here: it is an API contract change (DTO, OpenAPI, the api-reviewer step), which
ADR-0105 says stops a tech-debt-sized change and wants a spec.

**Which fix, settled by the M7 api review rather than left open.** This row first offered "a total,
or a cursor with a `hasMore`" as equally weighted. They are not. A bare `total` makes the state
**nameable** — the panel could say "showing 50 of 312" — and leaves it **unreachable**: `sweep_id` is
deliberately unindexed and there is no `?sweepId=` filter, so a reader who is told there are older
sittings still has no way to open one, and **Run the missing measurements** still cannot tell
"genuinely never recorded" from "recorded, and past page one". Cursor pagination
(`meta.nextCursor`/`meta.hasMore`, `docs/API.md`'s own standard, and the shape
`list-audit-events-query.dto.ts` already uses on the closest structural sibling) is the only one of
the two that lets somebody walk back into their own history — which is what the sittings screen
exists for. This table is an append-only trail with no ceiling but the 365-day sweep, not a bounded
computed report, so the `plan-health-check` / `revision-compare` "capped list, true total" precedent
does not transfer.

**And the budget is shared, which changes the urgency rather than the description.** The read is not
scoped per staff member — deliberately, per #259 item 5 — so two or three people each pressing **Run
all measurements** can consume the page in an afternoon, rather than "an installation that has taken
more than fifty readings" over time.

The client-side number is deliberately absent from the copy: the browser is not told the cap, and
writing "50" into a sentence in `apps/web` would be a constant that goes stale the day the server's
does — the kind of second statement of one fact this register keeps recording.

### 272. A step can be stored having measured half of itself, and nothing in the vocabulary can say so

**Status:** open · **Verified:** 2026-09-10 · **Raised:** 2026-09-09 (probe-sweep M7) · **Size:** M · **Owner:** web

`canvas-draw` measures two scales in one step. `runAbsoluteLimbs` can complete the first and be
stopped inside the second, and ADR-0130 D2 says the completed limb is kept — correctly, that is the
whole of M3. But `SweepStepStatus` has four values (`recorded` / `not recorded` / `refused` /
`not taken`) and none of them means **"recorded, and short a limb"**, so that step is `recorded`.

Three consequences follow, and the third is the one that matters. `missingSteps` does not offer it
(its status is not `refused` or `not taken`), so **Run the missing measurements** cannot take the
scale that was lost. The live sitting summary counts it as a step that landed. And once the tab is
closed there is nothing anywhere — no row, no badge, no alert — distinguishing "canvas-draw at Week,
both scales" from "canvas-draw at Week, missing its 2,000-activity scale". That undercuts US-2's own
promise ("'I ran it' and 'it is in the history' stop being different things") one level below where
the epic addressed it. Found by the M7 ux review.

**M7's reading-count fix makes it visible without making it actionable, and the two interlock.**
Counting a reading as a **row** rather than a step (ADR-0130's own correction) means such a sitting
now reads "5 of 6 readings" instead of a confident "4 of 4" — so the loss is on screen. What is
still missing is the remedy: the step is `recorded`, so nothing offers to take the scale again.

**Not built here because it is a decision, not an implementation detail.** A fifth status has to
answer what a re-run of a partially-recorded step does with the limb that already succeeded: store a
second row for it (two rows for one scale in one sitting, and the reading count then over-reports),
skip it (a press that measures less than it says), or replace it (an update on an append-shaped
table). ADR-0105 says that stops a tech-debt-sized change. `run-sweep.test.ts`'s fixtures are all
single-limb, so this case is untested as well as unsurfaced — a two-limb partial fixture is the
first thing whatever spec picks this up should write.

### 273. The oldest-block truncation rule rests on a premise the resume feature removed

**Status:** open · **Verified:** 2026-09-10 · **Raised:** 2026-09-09 (probe-sweep M7) · **Size:** S · **Owner:** web

`probe-sittings.tsx` withholds the "N were refused or never taken" claim from the **oldest** block
on screen, because that is the one the 50-row page boundary can cut (`docs/TECH_DEBT.md` #271). The
rule was written with the reason "a sitting's readings are adjacent in time", and M6-T4 made that
untrue in the same file: a resumed sitting's newest reading sorts near the top of a newest-first
list while its original readings, written hours or days earlier, can fall past the cap. A
**non-oldest** block could then be truncated and would print, with total confidence, that readings
were refused when they are stored and merely unfetched — the exact defect the alert exists to
prevent, one page along.

Raised independently by the M7 ux and database reviews, and **it is not reachable today**: the
resume reads its sitting id from the panel's in-memory outcome, so it is session-scoped, and a
sitting's readings are minutes apart within one session. The premise therefore holds — by a property
of React state lifetime, not by the reason the comment gave. The comment now says so.

**It becomes reachable the moment a resume can be started from the stored history**, which is a
natural companion to #271's cursor. Whatever picks that up owns this: the honest fix is to know
whether a page was cut rather than to infer it from position, which is what #271 builds.

### 276. A failing gate's log is tailed to 12 lines, and three test files now share one gate

**Status:** open · **Verified:** 2026-09-10 · **Raised:** 2026-09-09 (devops review, ADR-0131 M3-T1) · **Size:** S · **Owner:** repo

`scripts/prepush.sh:108,112` truncates a failing gate's captured output to `tail -12`.
**Re-verified 2026-09-10 at both lines, unchanged.**
`check:doc-register` now chains **three** independent test files with `&&` —
`doc-register.test.mjs`, `check-reconcile-due.test.mjs` and `check-spec-status.test.mjs`. Each keeps
running past a failing case (`process.exitCode = 1` rather than throwing) and prints its own named
summary, so **CI is unaffected**: the full log carries every `✗ <case>` line and every summary line,
and which file failed is unambiguous.

**Locally it can go ambiguous in one direction only.** If the first or second file fails, `&&`
short-circuits and the third never runs — its absence from the log is itself informative, and
nothing claims it passed. If the **third** file fails with more than about five cases red, its own
`✗` lines push the two earlier scripts' one-line successes out of the 12-line tail, so a reader
cannot tell from `prepush` output alone which stage even ran.

**Not changed here, deliberately.** `scripts/prepush.sh` is a shared gate, so altering what
"prepush green" means fires ADR-0105's trigger and wants its own spec — the same reason `#191` was
filed rather than fixed. The property is also **pre-existing**: `check:doc-register` already chained
two files before ADR-0131 added the third, which compounds it without introducing it.

**The remedy when it is picked up** is one of two, and the choice is the decision: widen the tail on
failure (or print the whole log, which is what a reader wants at the moment a gate fails), or give
the new suite its own `check:*` key — which costs a second CI step, the trade M3-T1 deliberately
declined. Do not do both.

### 277. A citation of a symbol nobody remembers existed is invisible to a grep for deleted names

**Status:** open · **Verified:** 2026-09-10 · **Raised:** 2026-09-09 (verification sweep, batch 3) · **Size:** S · **Owner:** web

`#193` swept the toolbar for citations of machinery ADR-0109 D1 deleted, and closed every item it
named. **Nine citations of `autoLabelsFit` survived it, across three files, and the symbol has no
definition anywhere** — every hit is inside a comment, proved by excluding comment lines and getting
nothing back. Beside them sat a `{@link measureLabelWidth}` resolving to nothing, a
`ToolbarOverflow.test.tsx` pointer to a file that no longer exists, and a `computeLadder` citation
**fourteen lines above** the correction in the same file that was written to catch its sibling.

**Re-verified 2026-09-10, and it has GROWN: ten citations, not nine**, across the same three files
(`toolbar-registry.ts`, `tsld-toolbar-items.tsx`, `tsld-toolbar-quick-wins.test.tsx`), with every
hit still inside a comment and still no definition anywhere in `apps/web/src`. So a dead name is
not merely surviving, it is **propagating** — somebody wrote a new comment citing it in the day
since this row was filed, which is precisely the mechanism the row describes: a citation of a
symbol nobody remembers reads as documentation of something real, so the next author repeats it.

**Why `#193`'s sweep could not have found them, and this is the transferable part.** That sweep
grepped for the names it remembered deleting — `ToolbarOverflow`, `toolbar-ladder.ts`,
`companionsOf`, the demotion pass. `autoLabelsFit` was an internal of the ladder, so nobody
remembered it existed, so nobody searched for it. **A grep for remembered names is bounded by
memory; the tree is not.** These were found instead by resolving every backticked identifier in a
comment against the definitions in the tree — the instrument `#193` proposes and defers.

**The citations were not decoration: four of them justified live registry decisions**
(`tsld-toolbar-items.tsx` at the three band-rule sites and the promoted lens toggles), and two
defined the semantics of a shipped prop (`toolbar-registry.ts`). So the stale text was doing work —
a reader deciding whether to change `showLabel` was being handed a mechanism that has not existed
since ADR-0109 D1.

**Corrected 2026-09-09, and the corrections are the substance rather than the tidy-up.** `'auto'`
now means _always label_ (`Toolbar.tsx`), because a row that wraps can always afford one. So the
band-rule choices **survive with their reasons inverted**: they were chosen to escape `'auto'`'s
all-or-nothing collective fate, and they are now the only way left to go icon-only on a narrow
window. And `next-conflict-status`'s refusal to fold its count into a label **lost half its
argument** — the width measurement it rested on is void, and what survives is ADR-0094's other
half, that a live count in a label reduces the accessible name to a status.

**What is still open.** No instrument exists to catch the next one. The candidate is the one `#193`
names: resolve backticked identifiers in comments against the tree and report those with no
definition. It is not free — the false-positive rate over prose is the whole question, and a gate
that fires on every `` `some-file.md` `` gets deleted rather than fixed (ADR-0058). Measure the
finding count on a candidate predicate **before** building it, exactly as ADR-0081 did before
rejecting its own proposed gate on 129 findings.

### 278. `SheetHeader`'s close button defaults to the dense-row exception, and four panels are not dense rows

**Status:** open · **Verified:** 2026-09-10 · **Raised:** 2026-09-09 (register sweep) · **Size:** S · **Owner:** a panel-chrome pass

**ADR-0118 D1's second named exception is applied by CONTAINER in `#215` and by DEFAULT in
`sheet.tsx`, and those are not the same rule.** `SheetHeader`'s signature is
`closeButtonSize = 'icon-sm'` (`sheet.tsx:94`), with a docblock reading "`icon-sm` (default) or
`icon` (the navigator rail)" (`:106`). That default was chosen when the rail was the exception. It
is now the majority: **four consumers take the 28 px default and none of them is a dense list row** —
Plan notes (`plan-workspace-toolbar.tsx:1385`), Float paths (`FloatPathsPanel.tsx:134`), Schedule
health (`ScheduleHealthPanel.tsx:170`) and Revision compare (`RevisionComparePanel.tsx:226`) — while
the one consumer that overrides (`navigator-rail.tsx:139`) is the one the docblock calls the
exception.

**This is #153's own remedy applied to a control and not its neighbour.** ADR-0118 M3 closed #153 by
unifying the floating-canvas panel's three control sizes on `icon`, and `TsldLegendPanel.tsx:163-171`
carries the reasoning in place: _"the ONE size every floating-canvas-panel control now takes"_. Four
sibling panels reach their close through a shared header that never got the same treatment. Under a
coarse pointer those four are **28 × 28 against a 44 px house rule** — and unlike a tree row, a
`px-4 py-2` header is content-sized, so nothing would overflow.

**Why it is filed rather than fixed, and the reason is the fine pointer.** `icon` is
`size-10 pointer-coarse:size-(--control-h)` (`button.tsx:40`), so switching these four grows each
header by **12 px on a mouse as well as 4 px more on touch** — a visible desktop change to four
workspace panels, which is a design decision and not a defect fix. Three candidates, none costed:

1. **Pass `closeButtonSize="icon"` at the four sites.** Smallest, and leaves the trap armed for the
   fifth panel.
2. **Flip the default and delete the prop.** If all five consumers want `icon`, the prop has no
   remaining caller — the `icon-lg` disposal (ADR-0118 M3) and #149's `MenuItem.itemId` are both
   precedents for deleting rather than debating. Worth a `grep` before it is worth an argument.
3. **Split the variant.** `icon-sm` today conflates "a control inside a container whose height is
   fixed elsewhere" with "a small control", and only the first earns D1's exception. A
   coarse-floored small variant would serve panel chrome without touching a tree row — which is the
   honest shape of the rule, and the largest of the three.

**What no gate can currently see.** The coarse projection in
`e2e-workspace-fit/command-surface.spec.ts` sweeps the command surface; these closes are inside
panels that must be opened first, so they are outside its reach — not exempted, just unvisited. The
`control-height.structural.test.ts` exemption for `button.tsx::size-7` is written in terms of dense
rows and therefore does not describe this consumer either. Neither instrument is wrong; both are
scoped to a population this consumer is not in.

---

**2026-09-11 — the three candidates are costed, and one of them has an empty population.** This row
said "three candidates, none costed", and its own text said the first step was "worth a `grep`
before it is worth an argument". Taken.

**Established by reading, not asserted:**

- **`closeButtonSize` has exactly ONE caller in the whole tree** — `navigator-rail.tsx:139`, passing
  `'icon'`. Every other consumer takes the default.
- **The four default-takers ARE the four right docks.** `right-docks.ts:14` declares
  `RIGHT_DOCKS = ['notes', 'floatPaths', 'health', 'revisions']`, which is the row's list exactly,
  and `docksToClose` enforces **one open at a time**. So the "four panels" is four code sites and
  never four simultaneous headers.
- **The sizes**: `icon-sm` is `size-7` (28 px); `icon` is `size-10` with
  `pointer-coarse:size-(--control-h)` — 40 px fine, 44 px coarse. The row's "+12 px on a mouse"
  arithmetic is right.

**So candidate 3 — split the variant — has NO population and should be struck rather than weighed.**
Its case was that `icon-sm` conflates "a control inside a container whose height is fixed elsewhere"
with "a small control", and only the first earns ADR-0118 D1's exception. That is a true observation
about the _variant_, and `SheetHeader` is not where it bites: all five of its consumers are **panel
chrome**, and not one is a dense list row. A coarse-floored small variant would be built for nobody.

**That collapses the choice to 1 versus 2, and 2 is now the cheaper of the two.** If every consumer
wants `icon`, the prop's single caller becomes redundant and the prop has none — the `icon-lg`
disposal (ADR-0118 M3) and #149's `MenuItem.itemId` are both precedents for deleting rather than
debating. Candidate 1 keeps a prop whose only purpose would be to hold the default that caused this.

**What is NOT costed, and is the one thing left.** Where the 12 px lands is **reasoned and not
measured**: a right dock is a column beside the diagram, so a taller header inside it should cost
that panel's own content and never the canvas. If that holds, the whole decision is 12 px of panel
content on whichever single panel is open — materially cheaper than "a visible desktop change to
four workspace panels" reads. **One browser run settles it**: canvas height with a right dock open,
`icon-sm` against `icon`, at 1440/1646/1920 — the shape
`apps/web/measure-toolbar/tech-debt-287-pen-foot-row.spec.ts` already uses. It is not taken here
because the remedy remains a design decision either way, and ADR-0092's dock guarantee was asserted
in a browser for precisely this class of "obviously it cannot move" reasoning.

### 279. The reset that closes the split-pair defect has no CSS rule, no caller, and would paint the wrong thing

**Status:** open · **Verified:** 2026-09-10 · **Raised:** 2026-09-10 (specced for #118 item 4, then measured) · **Size:** M · **Owner:** a surface pass

**#118 item 4 asked for a per-pair scope filter. Specced properly, the answer is that the mechanism
this repository already decided on was never built** — and the filter is a way of writing down a hole
rather than closing it.

**Verified by running, because the spec that found it had no shell and said so.** Every figure below
was re-derived here, and one of its claims did not survive that:

- **`<Surface tone="card">` renders `data-surface="card"` and there is no `[data-surface='card']`
  rule in `globals.css`** — nor `popover`. The attribute matches nothing.
- **`RESET_TONES` has zero production callers.** Its only occurrence is its own declaration
  (`surface.tsx:67`).
- **What it does render is `bg-background text-foreground`** (`surface.tsx`, the `className`
  default). Inside a `chrome` scope both names are rebound, so a component asking for a card would
  get the **chrome** fill and ink — the opposite of the docblock's promise that a reset "RESTORES
  the page family for their subtree and then change one thing: their own fill". A mechanism with no
  callers, which would be wrong if it had one.
- **Two documents instruct authors to use it** — `surface.tsx` and `reset-fills.structural.test.ts`
  — so the instruction is live and unfollowable. ADR-0097 **D6.3** says the reset _closes_ the split
  pair; it was decided as a runtime restoration and shipped as an exemption list in a test file.

**The measured numbers, taken with the real gate** by adding the pairs and reading the failures:

| pair                            | ratio  | fails in          |
| ------------------------------- | ------ | ----------------- |
| `--card` / `--foreground`       | 1.04:1 | `chrome`, `brand` |
| `--card` / `--muted-foreground` | 2.00:1 | `chrome`, `brand` |
| `--popover` / `--foreground`    | 1.04:1 | `chrome`, `brand` |

**The population is 34, not one.** `TEXT_PAIRS` + `NON_TEXT_PAIRS` hold **32** pairs and **17** of
them anchor on `--background` (6 text, 11 non-text) — counted, not estimated. Inside a reset,
`--background` _is_ the reset fill, so each of the two resets contributes 17 ungated split pairs.
That is why #118 item 4 reads as one missing row and is not.

**One claim in the spec is OVERSTATED and is corrected here rather than inherited.** It calls the
1.04:1 pair "not hypothetical" on the strength of `tabs.tsx:169` writing `bg-card text-foreground`.
That line is real; the containment is not. **There is exactly one `<Tabs` consumer in the product** —
`ActivityEditorDialog.tsx:650` — and it is a modal `<Dialog>`, which sits in the browser's top layer
and is inside no surface scope at all. So every one of the 34 is **latent**, which is what #118 item
4 concluded and what `surface.tsx:62-65` already says in its own words ("latent rather than live
only because no `<Card>` currently renders inside a `<Surface>`"). The correction strengthens that
row rather than replacing it — and it is ADR-0076 Class 3 inside a document that flagged its own
inability to run anything.

> **My own version of that was overstated too, and this is the corrected method** (self-audit,
> 2026-09-10). This paragraph first read _"No `bg-card` occurs anywhere in a `chrome` or `brand`
> subtree"_, and what had been checked was the **three files that OPEN those scopes** — not what
> renders inside them. That is not the same claim: `ChromeBandRow` takes slot **refs**, so its
> contents arrive by portal, and the subtree is the app header plus everything the plan toolbar
> renders into the three chrome slots.
>
> Re-run properly — 68 files across `components/layout`, `components/ui/toolbar`,
> `components/layout/status`, `features/tsld/toolbar` and `brand-panel.tsx`, with block, JSX and
> line comments stripped first — the scan finds **two** reset fills, and both are already in
> `reset-fills.structural.test.ts`'s allow-list with reasons that hold:
> `resource-strip-panel.tsx` (which sits **beside** the band, not in it) and
> `use-popover-panel.tsx` (which genuinely portals — verified, unlike the three neighbours corrected
> above). **So the conclusion is unchanged and now rests on a method that supports it.** Recorded
> rather than quietly widened, because the first version was a stronger sentence than its evidence,
> which is the whole subject of the row it sits in.
>
> **What this method still cannot do** is prove containment across arbitrary composition — a future
> component rendered into a chrome slot from a directory outside that candidate set is invisible to
> it. That is the same limit the spec gives as its reason for refusing to gate the latency claim,
> and it is why "latent" is a measurement of today rather than a property.

**What IS live, and passes by luck:** `CreateActivityPopover` paints `bg-card` (`:73`) with
`text-muted-foreground` (`:109`) and renders at `TsldPanel.tsx:2946`, **inside** the
`<Surface tone="canvas">` opened at `:2864`. It measures 6.00:1 and is asserted nowhere.

**The allow-list's stated reason was wrong for three of its entries, and is corrected.**
`reset-fills.structural.test.ts` grouped `combobox`, `TsldLegendPanel` and `CreateActivityPopover`
under _"Portalled or top-layer: outside every scope by construction"_. **None of the three portals by
any mechanism** — no `createPortal`, no `portalTarget()`, no `usePopoverPanel`, no `useTooltip`;
checked by grep, all three. One of them is the live in-scope instance above. They remain allowed,
because none is a contrast failure and a gate turned red over a passing combination gets deleted
rather than fixed (ADR-0058); what changed is the reason, because a wrong reason in an allow-list is
how the next entry is added for the same wrong reason.

_The spec also called `tabs.tsx`'s classification wrong and that part does **not** hold: the gate's
own comment already says it is "NOT portalled" and correct only because nothing renders it inside a
`<Surface>` — the same conclusion reached here independently. Recorded so the correction is not
inherited wholesale._

A hand-maintained containment list is still the argument against building a filter on top of one.

**Why a per-pair scope filter is refused rather than deferred.** It cannot distinguish "this pair
cannot occur here" from "this pair fails here and we would rather not know" — both are the same edit
and both leave a green suite. A required written reason does not discriminate either: the
`adr-coverage.json` and `flag-retirement.json` precedents work because their populations are
re-derived and a stale entry **fails**, not because anybody reads the prose. And there is no cheap
sound gate for the containment claim a filter would rest on — it is DOM containment across portals,
slots and composition, and the approximation already in the tree is wrong three times out of
thirteen.

**What to build instead**, per `docs/specs/contrast-pair-scopes/`: the two CSS blocks that rebind the
closure names back onto the page family, `Card` and the five `bg-popover` sites rendering through
`Surface`, and then `SCOPES` gains `card` and `popover` — at which point all 34 pairs fall out of the
sweep that already exists, with no new field and no exclusion list. **Deliberately not started
here**: it touches `globals.css`, `Card`, `Menu`, `Combobox` and `Tooltip`'s containers, and needs
accessibility, component and ux review plus a pixel-identical screenshot set as its falsification
condition. That is an epic, not a follow-up, and its M0 must re-derive these numbers by running
before anything is edited.

### 280. A gate piped into `tail` reports the pipe's exit status, and a push went out on a red one

**Status:** open · **Verified:** 2026-09-10 · **Raised:** 2026-09-10 (observed, on this branch) · **Size:** S · **Owner:** repo

**This is not hypothetical and it is not old: it happened while writing #279's neighbours.** The
command was

```
timeout 2400 pnpm prepush 2>&1 | tail -5 && git add -A && git commit … && git push …
```

`prepush` **failed** — `check:claims` refused four citations that had just been corrected, which is
the gate working exactly as designed. The `&&` then read **`tail`'s** exit status, which is 0
whatever the left-hand side did, and the commit and the push both went out. `f1b6d426` reached the
remote on a red gate.

**The repository already knows this.** `scripts/e2e-local.sh` carries a `PIPESTATUS` guard with a
comment saying in as many words that "without it a piped run always exits 0 and this script would
silently stop being able to fail", and **#276** records a failing gate's log being tailed to twelve
lines and losing the diagnosis. Both are about the same operator habit; neither prevents it, because
both live inside a script and the habit is at the call site.

**What makes it worth a row rather than a note to be more careful:** the failure is **silent and
inverted**. A piped gate that passes and a piped gate that fails produce the same exit status, so
the protection is not weakened, it is **absent**, and nothing downstream says so. `prepush` prints a
red `FAILED:` line — which `tail -5` had scrolled away, because the gate roster is longer than five
lines and the failure is announced at the end.

**Candidate mechanisms, none built** (this is a shared gate's invocation, so ADR-0105 fires and it
wants a spec rather than a quiet edit):

1. **`prepush.sh` writes a sentinel** — a file, or a line on stderr that a wrapper checks — so a
   piped run has something a later command can test that a pipe cannot swallow.
2. **A `pnpm prepush:push` target** that runs the gate and the push in one process, making the
   `&&` unnecessary. Cheapest, and it removes the call site rather than guarding it.
3. **Nothing, and rely on CI.** Honest, and it costs a round trip and a red build on the branch —
   which is what would have happened here.

Option 2 is the one worth costing: this register's own rule is that when you find yourself writing
"remember not to pipe it", you write a mechanism instead (#194, ADR-0058).

**The immediate damage was nil** — the four citations were registered and the gate is green again in
the following commit — but "nil this time" is the reason a silent failure survives.

### 281. A long-lived branch with no open pull request gets no CI at all, and `prepush` reads as though it were CI

**Status:** open · **Verified:** 2026-09-10 · **Raised:** 2026-09-10 (observed, on this branch) · **Size:** S · **Owner:** repo

**Measured tonight: fourteen commits reached `origin` and CI ran on none of them.**
`.github/workflows/ci.yml:3-7` triggers on `push` to **`main`** and on `pull_request` targeting
**`main`** — nothing else. This repository's one long-lived agent branch is neither, so between the
merge of a pull request and the opening of the next one it accumulates pushes that no workflow ever
sees. The most recent run on the branch was `6c79e737` at 21:34; the head is fourteen commits past
it. That is not a misconfiguration — a branch nobody is reviewing is a reasonable thing not to spend
minutes on — and it is invisible, which is the part worth a row.

**What makes it more than a note is that `docs/TESTING.md`'s "Before you push" reads as sufficient.**
`pnpm prepush` runs format, lint, typecheck, the unit suites and sixteen `check:*` gates. CI's
`quality` job runs those **plus a build**, and its `e2e` job then runs a real Postgres, the API
Supertest suite, the pairwise differential against the seed catalogue, a schema-drift check and
**forty-four** Playwright journey steps; a third job builds and smoke-boots both container images.
So a green `prepush` is a strict subset, and nothing anywhere says by how much. Tonight's own
evidence: `prepush` was green while three journeys touching the changed surface had not been run at
all, and they had to be run by hand (`e2e-public`, `e2e-staff`, `e2e-account` — all three passed,
which is luck confirming a judgement rather than a process).

**The two failure modes are different and only one is loud.** A branch that breaks something CI would
catch reveals it at the next pull request, in a batch, with fourteen commits to bisect — annoying but
self-correcting. The quiet one is a session that runs `prepush`, sees "All green", and reports the
work as verified: the sentence is true and means less than the reader takes it to mean.

**Candidates, none built** (`ci.yml` and `prepush.sh` are both shared gates, so ADR-0105 fires and
this wants a spec rather than an edit):

1. **Say what `prepush` is not.** One line in its own final output naming what CI adds — the cheapest
   by far, and it fixes the sentence rather than the coverage.
2. **Trigger CI on push to the agent branch.** Honest coverage, and it spends minutes on every
   intermediate commit of a branch that is force-pushed and reset regularly (§8).
3. **Open the pull request early**, which is what `CLAUDE.md` §8 already says — _"Open a PR early;
   keep it small"_ — and which this branch's shape works against, since it is reset from `main`
   after each squash-merge and carries work for a whole session before there is anything to review.

Option 1 is the one worth costing. Option 3 is already the written rule and has the shape #194
records: an instruction that is correct, is not followed, and has no mechanism behind it.

### 282. P3's reason for never grading Fit rests on a figure no reading since has come near

**Status:** deferred (on a trigger) · **Raised:** 2026-09-10 (the third real-hardware reading set,
#75 item 6) · **Size:** S · **Owner:** repo

> **PARKED 2026-09-10. Its two documentation halves are DONE** — P3's stale 10.2 pp premise is
> corrected in `docs/specs/revision-compare-changes/m0-condition.md` and ADR-0127 D8's "unknown at
> Fit" is replaced with the four readings, both on 2026-09-10, so no document now carries a figure
> this row disproved. **What remains is item 3 alone**, a decision: whether P3's "never grade Fit"
> still earns its keep now that `judgeRun` detects saturation explicitly rather than assuming it.
> **Trigger:** the next time somebody wants a graded verdict at Fit, or #261 is picked up — it is
> downstream of naming a canvas size.

`docs/specs/revision-compare-changes/m0-condition.md:87-90` states P3 — the rule that the whole-plan
framing is measured, reported and **never graded** — and gives its reason in one clause: _"The
baseline at Fit already drops **10.2 %** of frames — a pre-existing overage #75 records and nobody
has attributed."_

**No Fit baseline this repository has recorded since is anywhere near 10.2 pp.** That figure is
#75's 2026-08-03 reading at a ~1036×600 canvas. Every Fit baseline measured after it:

| when       | canvas    | scenario      | baseline dropped |
| ---------- | --------- | ------------- | ---------------- |
| 2026-08-03 | ~1036×600 | imported XER  | 10.2 pp          |
| 2026-09-08 | 1912×1068 | `scale-scene` | 97.22 pp         |
| 2026-09-08 | 1016×636  | `scale-scene` | 47.78 pp         |
| 2026-09-10 | 1912×948  | `scale-scene` | 69.63 / 70.37 pp |

**P3's conclusion is not weakened by this — it is strengthened**, which is why this is a wrong number
rather than a wrong rule. Its argument is ADR-0058's "a gate that fails on day one gets deleted
rather than fixed", and a baseline at 69.63 pp fails harder than one at 10.2. The defect is that a
reader who checks the premise — which is what this register keeps asking people to do — finds a
figure matching nothing, and has no way to tell a stale citation from a typo.

**The 2026-09-10 sittings also give P3 its first internal consistency check, and it passes twice.**
The `revision-diff` Fit baseline and the `canvas-draw` Fit figure are the same painter on the same
scene at the same canvas, taken from two different scenarios minutes apart — 69.63 vs 70.37 pp in the
06:49 sitting (**0.74 pp** apart) and 70.93 vs 72.04 pp in the 07:44 sitting (**1.11 pp**), both well
inside those sittings' own 3.89 and 5.00 pp run-to-run spreads. Two scenarios that share nothing but
the painter landing that close, twice, is the strongest evidence the panel has produced that its Fit
numbers mean something.

**And there is now a measured answer being withheld — twice.** ADR-0127 D8 turned the revision
overlay default-on with its Fit cost recorded as _unknown_; D8b says so in as many words. It is no
longer unknown. Two sittings at 1912×948, 55 minutes apart:

| sitting | viewport  | baseline | treatment | delta        | stated spread |
| ------- | --------- | -------- | --------- | ------------ | ------------- |
| 06:49   | 1912×948  | 69.63 pp | 75.19 pp  | **+5.56 pp** | 3.89 pp       |
| 07:44   | 1912×948  | 70.93 pp | 75.56 pp  | **+4.63 pp** | 5.00 pp       |
| 07:54   | 1920×1080 | 86.11 pp | 89.26 pp  | **+3.15 pp** | 2.78 pp       |
| 07:56   | 968×493   | 0.00 pp  | 0.19 pp   | **+0.19 pp** | 0.00 pp       |

All four are ungraded, so no verdict was issued, and the first three clear ADR-0127's own 2.00 pp
bar. **The four together show #260's compression happening in front of the reader, which is worth
more than any one of them**: as the baseline climbs 69.63 → 70.93 → 86.11 pp the delta falls
5.56 → 4.63 → 3.15 pp, monotonically, because a metric bounded at 100 has less room to express a
difference the closer it starts to the ceiling. So the overlay's cost is **not** smaller on a bigger
canvas; the instrument's ability to report it is. The fourth row is the same effect at the other
end — at 968×493 the painter drops nothing to begin with, so the overlay's cost is expressed almost
undistorted at **+0.19 pp**, which matches ADR-0129's Week reading and is the best estimate of what
the overlay actually costs when the painter is not already saturated.

**The honest reading is therefore that the overlay costs a real but small amount, and that the
larger Fit deltas are partly an artefact of where the baseline sits.** #75 item 6(f) measures this
machine's Fit/2,000 repeat spread at 0.4 fps, so the deltas are not scatter; the compression is.

**What would close it** is two edits and one decision, and only the third is work:

1. **Correct P3's premise** to name a measured baseline and the canvas it was taken at, or to state
   a range — the honest form, since #261 is unresolved and the figure varies from 47.78 to 97.22 pp
   across canvas sizes alone.
2. **Record the overlay's Fit cost in ADR-0127 D8**, replacing "unknown" with the number and its
   standing. Leaving "unknown" in place once it has been measured is the drift class this register
   exists for.
3. **Decide whether P3 still holds** now that headroom at Fit is demonstrably ~30 pp rather than
   ~0 pp. P3 was written against a baseline that would make a difference gate meaningless; that is
   #260's condition, and the panel now computes `saturated` explicitly and returns INDETERMINATE for
   it. If saturation is detected rather than assumed, "never grade Fit" may be doing work
   `judgeRun` already does better. **Not decided here** — it changes an accepted condition, and it
   is downstream of #261 naming a canvas size.

Related: #75 (the readings), #261 (the unstated canvas size, which makes every figure above
incomparable to the others), #260 (closed — the saturation detection that may supersede P3's
mechanism).

### 283. The performance probe does not record power state, and on an integrated GPU that decides readings

**Status:** deferred (on a trigger) · **Raised:** 2026-09-10 (#75 item 6(e)) · **Size:** S ·
**Owner:** repo

> **Not scheduled — product-owner decision, 2026-09-10.** This row explains something real and
> nothing currently depends on the explanation. #75's question is answered: §9's gate is **met** at
> every judgeable point that reproduces, so there is no failing verdict waiting on this and no work
> blocked behind it. What the gap costs today is the ability to compare a reading against one taken
> on another day — which matters when somebody next needs that comparison, and not before.
>
> **The trigger** — pick this up when any of these happens, rather than on a date:
>
> 1. A probe reading is taken that **disagrees with a previous one** at the same viewport, as
>    2026-09-08 and 2026-09-10 did. That is precisely when the missing field is the one you want.
> 2. Someone proposes work against the Fit-zoom cost (#75's unattributed ~8 ms, decimation, dirty
>    regions) — because that work would be justified by cross-sitting numbers this cannot yet make
>    comparable.
> 3. The probe is next opened for any other reason. It is a small addition to `readDevice()` and is
>    much cheaper done alongside something else than as its own errand.
>
> Recording the trigger is the point: ADR-0085's rule is that an unconditioned item stays exactly one
> priority below whatever is being done, forever.

`apps/web/src/features/perf-probe/model/device.ts:61-71` captures viewport, DPR, GPU renderer, thread
count, device memory, display interval, attention and motion preference. It does not capture whether
the machine is on mains, and there is no `getBattery()` call anywhere under `features/perf-probe/`.

Every reading this repository holds was taken on a **laptop with an integrated adapter** — the row
that matters says so in terms: _"the **integrated** adapter, which is what the browser chose on a
machine that also has a discrete one. That is what a planner gets"_ (#75). On that hardware a power
profile change throttles the GPU directly, and a 30 % frame-time difference from mains-to-battery
alone is unremarkable. It is not a rounding term; it is the same size as the largest unexplained
quantity in #75.

**The instrument already knows this matters and delegates it to memory.** The panel's free-text note
carries the placeholder _"the Dell, docked, on mains"_ (`ui/performance-probe-panel.tsx:644`), so
the field exists to hold the fact and nothing requires or captures it. The 2026-08-03 set records
"mains" because a person typed it. The 2026-09-08 and 2026-09-10 sets do not record it at all — and
#75 item 6 turns on a 10.81 ms residual between two of those sittings that this variable could
account for on its own. **A reading whose largest confound is unrecorded cannot be compared to
another**, which is #261's complaint about canvas size arriving a second time by a different door.

**What would close it**: call `navigator.getBattery()` in `readDevice()` and store `charging` plus
`level`, alongside the existing facts, rendered on the paste-ready block and the history row like the
canvas size that #261 forced onto them. It is a Chromium-only API and absent in Firefox and Safari,
so the honest shape is the one this panel already uses for a fact it cannot obtain — record it as
**unknown** and say so, never as a default a reader would assume. That distinction is the whole
lesson of ADR-0130's presentation model.

Related: #75 (the reading whose residual this could explain), #261 (the other unrecorded parameter
that makes readings incomparable).

### 284. `on screen` means two different things depending on which scenario printed it

**Status:** deferred (on a trigger) · **Raised:** 2026-09-10 (the five-sitting probe set) ·
**Size:** S · **Owner:** repo

> **PARKED 2026-09-10 with the probe.** It misleads a reader of probe output and nothing else — the
> judging is unaffected and conservative. **Trigger:** the probe is next opened for any reason, or
> somebody compares `revision-diff` limbs across viewports and reaches the wrong conclusion about
> bars drawn. Bundle it with #283, which is the same file and the same errand.

Every probe limb prints `on screen  N bars at X px/day`, and #75 item 5(d) records **why** that line
exists: ADR-0128's central finding is that painter cost tracks **bars drawn**, not plan size, and the
2026-08-03 set could not be compared against anything because it never recorded that quantity. It is
the load-bearing statistic of the whole panel.

**The two scenarios derive it differently and the report does not say so.**

- `scenes/canvas-draw.ts:138` — `cull(scene.scene.activities, view, size, EPOCH_ISO).length`, i.e.
  exactly what the painter draws.
- `scenes/revision-diff.ts:212-215` — `onScreenX(a.earlyStart) || onScreenX(a.earlyFinish)`, an
  **x-axis test with no lane culling at all**.

At any Fit framing the whole time span is on screen by construction, so the second form matches every
activity in the plan. Measured across three viewports in one sitting:

| viewport  | `canvas-draw` says | `revision-diff` says |
| --------- | ------------------ | -------------------- |
| 1920×1080 | 1,825 bars         | 2,160 bars           |
| 1912×948  | 1,658 bars         | 2,160 bars           |
| 968×493   | 965 bars           | 2,160 bars           |

So a reader comparing `revision-diff` limbs sees the same 2,160 at every canvas size and concludes
that bars drawn is **invariant to the viewport** — the exact opposite of the finding the column
exists to support, and stated in the panel's own words rather than inferred.

**The judging is not wrong, and that matters for the fix.** `revision-diff`'s value is a
**denominator for a non-vacuity share** (`judge.ts:181`, `enough(visibleChangedBars, visibleBars)`),
and its own comment says so: _"The denominators, over the WHOLE scene rather than the changed
subset."_ A whole-scene denominator makes the share **smaller**, so that gate is stricter than a
culled denominator would make it — conservative, never permissive. Nothing measured here is
invalidated; what is wrong is that one label carries two quantities.

**What would close it**: give the report two named fields rather than one overloaded one — the culled
count for every scenario (which `revision-diff` does not currently compute at all) and, where a
scenario uses a different denominator for its own vacuity test, print that separately and say what it
is. **Do not simply switch `revision-diff` to `cull()`**: that would silently tighten the non-vacuity
gate that ADR-0127 P3's "N" clause depends on, which is a behaviour change wearing a rename.

Related: #75 (whose item 5(b)/(d) argument rests on this column), #261 (the other parameter that made
readings incomparable), ADR-0128 (the decision the column serves).

### 285. The command deck wears cards inside a band the foot wears bare

**Status:** deferred (on a trigger) · **Raised:** 2026-09-10 (the deck surface studies) · **Size:** S ·
**Owner:** web

> **Decided and NOT built — product-owner decision, 2026-09-10: bare, captions kept, a hairline
> between groups.** Captured here on the standing instruction that proposed work is never lost.
> **Trigger:** `Deck.tsx` or `toolbar-styles.ts` is next touched for any reason, or the product owner
> asks. It is one variant switch and one class, so it is cheaper alongside something else than as
> its own errand.

**The complaint** was that the top of the plan workspace "doesn't quite belong" while the foot bar
does. **The first diagnosis put to the product owner was wrong, and is recorded before the right
one.** It framed the choice as _dark band vs light deck_ — and the deck is already navy, inside the
same `<Surface tone="chrome">` as the header and the foot (`chrome-band.tsx:74`; the deck portals
into that band's `rows` slot). I misread the product owner's screenshot, then two of my own
photographs, in the same direction; four DOM and CSS reads disagreed with my eyes and I trusted my
eyes. **Bytes settled it**: in the harness's own `plan-workspace.png` the gap between the deck's cards
is RGB (20, 33, 61), identical to the foot bar, and a card interior is (31, 44, 70) — the 5 % tint.
That is ADR-0076 Class 3 inside a choice put to somebody else, the #204 shape, and the rule it leaves
is short: **a colour read off a downscaled full-page render is not evidence; sample the pixel.**

**What actually differs, measured.** The deck's four groups are tinted (`bg-foreground/5`),
1 px-bordered (`border-border/60`), rounded (`rounded-md`) boxes with `px-2 py-1.5` — the
`toolbarCardVariants` **`boxed`** variant (`toolbar-styles.ts:119-150`). The foot's selection bar uses
the same CVA's **`bare`** variant — no box at all — and the foot's facts sit bare on the band. So the
deck is the only chrome surface in the shell wearing boxes, and header + deck form a **180 px navy
slab** at both 1920 and 1646 (header 40 + deck 108) against a ~50 px strip below. Boxes inside a
band, and a lot of band: that is the mismatch.

**Four studies, rendered over the harness's own programme with CSS injected after paint — the tree
was never touched — and measured rather than described:**

| variant                 | band height | canvas returned | what the picture shows                                           |
| ----------------------- | ----------- | --------------- | ---------------------------------------------------------------- |
| baseline (shipped)      | 180 px      | —               | four tinted, bordered cards on navy                              |
| **bare, captions kept** | **152 px**  | **+28 px**      | one continuous band; `FIND` / `PLAN` lose their leading boundary |
| bare, no captions       | 152 px      | +28 px          | **reflows** — `Add·Link·Select·Arrange` jump up beside search    |
| cards, no captions      | 180 px      | 0 px            | the same reflow, inside boxes                                    |

Identical at 1920 and 1646. The 28 px is the cards' padding and borders across two rows, verified
in bytes (card interior 31,44,70 → 20,33,61 in the bare study).

**The caption finding is the one the heights table cannot show.** Removing the captions returns
0 px — they sit beside their controls, not above them — but their **width** is what holds two
groups per row: without it `flex-wrap` re-pairs "look" (`VIEW`+`FIND`) with "do"
(`AUTHOR`+`PLAN`), authoring commands migrate onto the search line, and `PLAN` sits alone on row
two. So "decide captions from the studies" resolved to **keep them**, and the bare study's one
weakness — `FIND` and `PLAN` butting against the previous group with nothing but the caption to mark
the seam — is answered by a hairline, not by boxes.

**The change, when built.**

1. `apps/web/src/components/ui/toolbar/Deck.tsx` — the group wrapper's
   `className={toolbarCardVariants()}` becomes `toolbarCardVariants({ chrome: 'bare' })`. The
   variant, its docblock and its second consumer already exist; nothing is added to the primitive.
2. A hairline between consecutive groups, in the section idiom the deck already uses
   (`Deck.tsx:268`, `border-border/50 ml-1 border-l pl-2`), applied to each group after the first.
   Decorative — WCAG 1.4.11-exempt — so no contrast pair moves.
3. Re-run: `e2e-workspace-fit` (the §2.5.8 sweep; controls keep `min-h-(--control-h)` because the
   padding removed is the card's, outside them — verify, do not assume), `dock.spec.ts` (the foot's
   41 px equality is untouched by construction and should stay so), **the base journey** (the ADR-0096
   rule: change a screen, run it), and `shoot.mjs --only plan-workspace` for parity. Run the
   accessibility reviewer over the deck render: no keyboard or ARIA contract changes, so §19.13 does
   not fire, but it is a shared primitive's rendering and the review is cheap.
4. A dated `docs/DECISIONS.md` entry, because ADR-0114 M6's measurement table recorded the _card_
   choice (the selection bar declining the deck's geometry); this is the same argument run the other
   way — the deck adopting the bar's bareness — and it should be findable from there.

**ADR-0105:** no new user-facing entry point, no Playwright config or CI step, no change to a
component's public contract (an existing variant is selected), no shared gate, no schema. A register
row is the right instrument; the decision entry in step 4 is the record.

**To re-render the studies** (no script is committed — the seed lives in `shoot.mjs` and a copy would
drift): run `node apps/web/scripts/shoot.mjs --only plan-workspace`, then apply these to the page
(DevTools or an `after` hook), where `D` is `[role="toolbar"][aria-label="Plan commands"]`:

```css
/* bare */
D > [role='group'] {
  background: transparent;
  border: 0;
  border-radius: 0;
  padding: 0;
}
/* no captions */
D > [role='group'] > span[aria-hidden='true'] {
  display: none;
}
/* group hairline */
D > [role='group'] + [role='group'] {
  border-left: 1px solid var(--border);
  padding-left: 0.5rem;
}
```

Related: ADR-0109 D1 (the cards were inherited from the old Flask app with the wrap), ADR-0114 M6
(the measurement that made the selection bar bare), ADR-0115 (the foot row joining the chrome scope
— this is the same argument one row up), `toolbar-styles.ts` (`toolbarCardVariants`, both variants).

### 286. No journey drives a peer take-over or an admin override

**Status:** open · **Verified:** 2026-09-10 · **Raised:** 2026-09-10 (workspace-console M7, the security review) · **Size:** M ·
**Owner:** web

**THE TWO SENTENCES BELOW ARE FALSE, AND THE WAY THEY WERE PRODUCED IS THIS ROW'S REAL SUBJECT.**
Corrected 2026-09-10 while specifying the fix (`docs/specs/pen-handoff-journey/`). **Two of the five
transitions ARE driven end to end**: `apps/web/e2e-edit/pen-handoff.spec.ts` drives **request**
(`:95`) and **hand over** (`:156-167`) across two `browser.newContext()`s (`:55`, `:79`), under
`playwright.edit.config.ts`, which pins `PLAN_EDIT_LOCK_ENFORCED: 'true'` (`:56`). So a suite does
open two sessions against a real API with the pen enforced and move the lock between them.

**The cause is the search, and it is this register's favourite shape.** The row searched for
`take over|override`. The button is labelled **`Hand over`** (`lock-copy.ts:87`), which contains
neither string — so the one suite that already did the work was invisible to the query written to
find it, and its absence read as proof.

**It was then marked `Verified: 2026-09-10` earlier the same night, by me, on the reasoning that a
row raised today is verified by whoever raised it.** That reasoning is wrong and this row is the
proof: a same-day row carries exactly one verification, by the person who was already looking at it
with one method. Re-running that method reproduces its blind spot rather than testing it. What
caught this was specifying the fix — reading the suite the row said did not exist.

**What survives is the row's strongest paragraph, and it is still worth building.** Three
transitions have no client coverage — `override`, `takeover` after grace, and the `waiting`/`lost`
states a planner sees when the pen moves under them — which is "the pen changing hands under a
planner who did not ask", the case ADR-0028 exists for. The API side is NOT the gap:
`apps/api/test/plan-lock.e2e-spec.ts` proves all five (`:198`, `:227`, `:245`, `:274`, `:152`), so
the work is entirely client-side, which is what keeps it one spec rather than an epic.

~~ADR-0028's pen has five ways to change hands — a peer requests and waits out grace, a peer takes
over after it, an Org Admin overrides immediately, the holder hands over, the holder keeps editing —
and **not one of them is driven end to end by any Playwright suite in this repository**. Verified by
searching every `e2e-*` directory: the three files that match `take over` or `override` match on a
progress-tab phrase and two CSS comments. No suite opens two sessions against a real API with
`PLAN_EDIT_LOCK_ENFORCED=true` and moves the lock between them.~~

**It was found because a document claimed the opposite.** `docs/specs/workspace-console/feature-spec.md`
§"No permission changes" ended _"and the journey proves that against a real API with
`PLAN_EDIT_LOCK_ENFORCED=true`"_ — written from the shape of every other epic's enablement journey
rather than from this one's. The security review went looking for the suite and reported it absent;
the claim is corrected in place there rather than deleted, with the reasoning that survives it.

**It is not an exposure and this row does not claim to be one.** Enforcement is server-side
(`assertHoldsPen`, 423 `LockedError`) whatever the client renders, and three things independently
bound what the relocated controls can do: `resolveLockView` is untouched, `EditLockControls`' `only`
prop is a `filter` of the server-derived action list and can only narrow it, and
`action-partition.structural.test.ts` pins the pen's two verbs and the seven hand-off actions as
disjoint — so the deck's control has no path to `onOverride` or `onTakeOver` at all.

**What the gap actually costs** is that the one interaction ADR-0028 exists for — the pen changing
hands under a planner who did not ask — has never been exercised against a real lock lease by
anything. Every unit case mocks the status; a mocked status cannot express grace expiry, a heartbeat
lapsing, or two clients racing. That is the class of defect this repository's journeys keep catching
and its unit suites keep missing.

**Sized M, not S:** it needs a two-context Playwright fixture, two seeded members with different
roles, and control over the grace window — none of which any existing harness provides.

### 289. NestJS 12 breaks the API e2e bootstrap, and Dependabot titles it as routine

**Status:** open · **Verified:** 2026-09-10 · **Raised:** 2026-09-10 (driving dependabot #482) ·
**Size:** L · **Owner:** api

`CLAUDE.md` §3 records the stack as **NestJS 11**. Dependabot #482 moves `@nestjs/common`, `core`,
`platform-express`, `swagger`, `terminus` and `config` from 11 to **12** under the title
_"chore(deps): bump the nestjs group across 1 directory with 6 updates"_ — a **major framework
upgrade wearing a routine dependency title**, which is how one gets merged by habit. It is not
mergeable today and it is not a one-line fix.

**Reproduced rather than inferred**, in a worktree at the PR's merged head `5aebb06c` with 12.0.1
installed, so this is not staleness — the branch had already been updated from `main`:

1. `TypeError: Reflect.getOwnMetadata is not a function`, thrown from `@nestjs/common` 12.0.1's
   own optional-parameter decorator while importing its console-logger service. NestJS 12
   evaluates an `@Optional()` decorator **at import of its own module**, before anything loads
   `reflect-metadata`. Vitest reports `setup 0ms` and collects **0 tests**. (The two file-and-line
   positions are in the PR comment on #482 rather than here — see the note below on why.)
2. Adding `setupFiles: ['reflect-metadata']` to `apps/api/vitest.e2e.config.mts` clears that — 45
   tests then enumerate — and reveals `TypeError: ExpressAdapter is not a constructor`.
   **`ExpressAdapter` appears nowhere in `apps/api/src`**, so this is NestJS 12's own module graph
   failing to construct under Vitest, not our call site.

**Why only one job fails, and why that is the misleading part.** `Build & smoke-boot images` and
`Format, lint, typecheck & unit tests` both PASS on this head — the application compiles and the
container boots, because `main.ts` and the image import `reflect-metadata` first. So the surface
reading is "one flaky e2e job on a dependency bump", and the truth is that the framework's
test-time bootstrap no longer works.

**The Postgres log is a trap and cost a false diagnosis here.** It carries
`column "issuer" of relation "accounts" contains null values` and a duplicate-key error on
`accounts_issuer_account_id_key`, which read exactly like a broken migration. They are
`account-issuer-migration.e2e-spec.ts`'s own **deliberate negative-case fixtures** (ADR-0107) — the
output of a _passing_ test. I reported them as the root cause before opening that spec. Anybody
diagnosing a CI failure from a service-container log will meet the same shape, because Postgres
logs a test's intentional errors identically to a real one.

**Not fixed, and not to be fixed as a dependency chore.** Moving to 12 changes a recorded
architectural choice (§3) and needs the product owner's decision plus, on this register's own
rules, an ADR — §2's "every dependency is a liability" cuts both ways, since staying on 11 has a
cost too. What is owed first is the size of the migration, which nobody has measured: the two
failures above are what one spec file reached, not a survey.

**A second, smaller finding worth keeping.** The step log for a failing CI job is unreadable with
this session's token (`403` on step content; only the service-container log returns), which is what
forced the local reproduction. That is not a defect to fix, but it is why "re-run it and see"
is the tempting move and why the register should record the diagnosis when somebody does the work.

**And a third, which is a real limit of `check:claims` rather than a mistake in this row.** The
first draft cited both failures as `<file>.js:<line>` and **`pnpm check:claims` refused the push** —
correctly, by its own rule (ADR-0076): a dependency-internal citation must be registered in
`scripts/dependency-claims.json` with a verified anchor. It cannot be, here. That register holds
**one version per package** (#178) and this repository runs NestJS **11**, so a citation into 12.0.1
names lines in a tree nothing installs — the gate would either fail forever or force
`verifiedAgainst` to claim a version the application does not run, which is #178's structural
problem exactly. So the positions live in the PR comment, where they are evidence for a decision,
and this row describes them in prose. **The gate is built for citations into code that ships**, and
a citation into a version evaluated and rejected is outside what it can police — worth knowing
before the next person tries to register one.

### 291. `check:adr-coverage` cannot see CLAUDE.md, which is the register a reader actually opens

**Status:** open · **Verified:** 2026-09-10 · **Raised:** 2026-09-10 (found writing the delivery-gates spec) · **Size:** S · **Owner:** repo

**ADR-0132 was Accepted on 2026-09-09, filed in `docs/adr/`, listed in `docs/adr/README.md`, and
cited by `docs/ROADMAP.md`, `docs/TECH_DEBT.md`, `docs/DESIGN_SYSTEM.md` and five spec directories
— and appeared ZERO times in `CLAUDE.md` §16.** Nothing failed, because
`scripts/check-adr-coverage.mjs` gates the ADR index and `ROADMAP.md` and never reads `CLAUDE.md`.

This is the **ADR-0071 failure one document along**, and the third recorded instance of the class:
ADR-0071 itself was cited by shipped code while absent from the register; ADR-0078 S1 found **seven**
ADRs missing from `docs/adr/README.md` and repaired them by hand; ADR-0110 D6 then gated that index
in both directions — and the gate it wrote covers the index a reader rarely opens and not the
section they are briefed from. §16 is the register in the operating manual: it is what every human
and every agent reads to learn what has been decided, and an ADR absent from it is invisible to the
one audience that matters most.

**The repair is done; the gate is not.** ADR-0132 now has its entry, and a full comparison of all
**133** ADR files against §16 found **exactly one** missing, so the estate is clean today. It will
not stay clean: the previous two instances of this class were also repaired by hand, and both
recurred.

**Found incidentally, which is the part worth keeping.** Nobody was auditing the register — an agent
writing an unrelated spec (`docs/specs/delivery-gates/`) noticed the citation while reading
`DESIGN_SYSTEM.md`. That is luck, and luck is what ADR-0058 replaces with a computed gate. The
previous instance was found the same way (ADR-0078 S1, while filing a different ADR).

**Why it is filed rather than fixed.** Widening `check:adr-coverage` to a third document is a
**shared-gate change**, which CLAUDE.md §19.1 makes an ADR-0105 trigger: the spec and plan are
mandatory whatever the size. Two things want settling in it rather than being decided by whoever
edits the script:

1. **What counts as covered.** `docs/adr/README.md` is an index — one line per ADR — and §16 is a
   prose register whose entries run to paragraphs. A presence check on `ADR-NNNN` is trivially
   satisfiable by a citation inside a _different_ ADR's entry, which several entries contain
   (ADR-0132's own text cites ADR-0117, ADR-0088 and ADR-0034). So the assertion has to anchor on
   the entry's own bullet form, and a naive `includes` would have passed over exactly the gap it was
   written to catch — the scan-matching-prose trap this register has recorded four times.
2. **Whether §16 should be generated rather than checked.** A derived section cannot drift at all,
   but it would lose the thing that makes §16 useful: the entries are written, not templated, and
   several are the best account of a decision that exists anywhere.

Until then the check is one command, and it belongs in the reconciliation pass
(`docs/RECONCILE.md`) rather than in anybody's memory:

```
python3 -c "import os,re; nums=sorted({m.group(1) for f in os.listdir('docs/adr') if (m:=re.match(r'(\d{4})-',f))}); c=open('CLAUDE.md').read(); print([n for n in nums if f'ADR-{n}' not in c])"
```

### 292. The web entry chunk is 372 kB gzip, and every authenticated route is in it

**Status:** open · **Verified:** 2026-09-10 · **Raised:** 2026-09-10 (measured while checking a claim in `docs/FRONTEND_QUALITY.md`) · **Size:** M · **Owner:** web

**Measured, not estimated.** `pnpm --filter @repo/web build`, 2026-09-10:

| chunk                                    | raw         | gzip       |
| ---------------------------------------- | ----------- | ---------- |
| `index` (entry)                          | 1,274.17 kB | **372.42** |
| `jspdf.es.min`                           | 399.10 kB   | 129.66     |
| `html2canvas`                            | 199.54 kB   | 46.82      |
| `index.es`                               | 151.34 kB   | 48.91      |
| `paint`                                  | 113.93 kB   | 33.71      |
| `staff`                                  | 75.69 kB    | 23.84      |
| `purify.es`                              | 27.17 kB    | 10.57      |
| `index.css`                              | 84.02 kB    | 15.21      |
| `share`, `rolldown-runtime`, `run-probe` | < 1 kB each | < 1        |

Ten JS chunks. `docs/FRONTEND_QUALITY.md`'s advisory budget is **≤ ~200 kB gzip** for the initial
critical path, so the entry chunk is **1.86×** it.

**The cause is not bloat, it is that the splitting the documentation describes does not exist.**
That file said "route-based splitting by default — each route is its own chunk"; `app/router.tsx`
declares 26 routes and has **two** `lazy()` boundaries (`/share`, `/staff`), and `vite.config.ts`
sets no `manualChunks`. The other eight chunks are library splits Rolldown derived from those two
dynamic imports plus the export path's. **Every authenticated route — the entire plan workspace,
the Gantt, the canvas painter's host, every dialog — is in the entry chunk**, so a planner signing
in downloads the whole application before the sign-in form paints. The sentence is corrected in
place.

**The heavy things are already lazy and are NOT the problem.** `jspdf` (129.66 kB gzip) and
`html2canvas` (46.82 kB) sit behind the export path exactly as ADR's export stage intended, and
`paint` is its own chunk. Removing them from the entry is done. What is in the entry is the
application.

**Do not read 372 against 200 as a regression.** The ~200 kB figure is not a measurement and never
was — it predates anybody looking at a build, which is why `FRONTEND_QUALITY.md` labelled the
budgets "advisory and unmeasured" in the same breath. This row records **the first measurement**,
so there is no earlier number to have regressed from, and no claim here that 372 is too big — only
that the two figures have never been compared and now have been.

**What NOT to do with it.** Setting the budget is `docs/specs/delivery-gates/` M3, which is written
and awaiting approval, and ADR-0058's rule is that a bar goes at the measured floor rather than at
an aspiration — so this number is an input to that decision, not a target to code against. Splitting
the authenticated routes is the obvious remedy and is **not** obviously right: TanStack Router
prefetches on intent, the app is a persistent shell (ADR-0029) whose routes share most of their
code, and a split that moves 300 kB out of the entry and then fetches it on the first navigation may
buy a faster sign-in and a slower first plan open. **Measure the LCP effect before splitting**, on
the product owner's own hardware, the way every other performance question in this repository has
been settled.

**Why it was never noticed.** Nothing in CI checks a bundle size (`#48(b)`, `docs/BACKLOG.md`), and
the one document that would have told a reader the splitting story asserted a strategy the code does
not implement — so a reader auditing bundle health would have found a plausible answer and stopped.

### 293. The probe's ceiling rule has no margin, so a floor at the display's ceiling is a coin toss

**Status:** open · **Verified:** 2026-09-10 · **Raised:** 2026-09-10 (the residual of #275) · **Size:** S · **Owner:** web

`#275` is closed: `judgeAbsolute` now returns INDETERMINATE when the display's arithmetic ceiling
(`1000 / idleInterval`) is **at or below** the floor. That is the remedy `#275` prescribed, and it
leaves the case that row itself called **the sharper one**.

On the same 30 Hz display (ceiling **30.3 fps**), the 2,000-activity floor is **30 fps**. The
ceiling is above the floor, so the new rule correctly does not fire — and the headroom is about
**1 %**. The observed run measured `30.0` and failed on a value fractionally below thirty that the
report rounds up: **the verdict was decided by the third decimal place of the display's refresh
rate.** A painter would have to be free to pass, so what is being tested is no longer the painter.

**Why it was not fixed with #275, stated rather than deferred silently.** Catching it means
choosing a margin — some ratio of ceiling to floor below which the question is unanswerable — and
**no margin has ever been measured here.** Picking one now to make this run come out differently is
the number-tuned-to-the-answer this register keeps refusing (ADR-0097 Landing C, ADR-0121's cap, and
`#260` one route along). The two cases are not the same shape: `#275`'s is arithmetic and needs no
judgement, this one is a judgement and needs evidence.

**What would settle it.** A margin derived from something measured rather than chosen — for
instance, the run-to-run spread the probe already computes: if the spread on a machine is wider than
the gap between the floor and the ceiling, the reading cannot resolve the question, which is the
same argument `judgeAbsolute` already makes for the straddle case and would need no new constant at
all. That is worth testing before any ratio is invented.

**It is not urgent and it is not nothing.** SchedulePoint is a desktop application, and the reading
that exposed the class was taken on a phone for curiosity. But the rule this leaves is that a
throttled display can still be handed a confident FAIL about a painter it never measured — the class
ADR-0130's epic exists to remove, narrowed rather than closed.

### 294. A peer's pen request costs the diagram 76–80 px of height

**Status:** open · **Verified:** 2026-09-11 · **Raised:** 2026-09-11 (measuring #287) · **Size:** S · **Owner:** web

**Measured, on the reading #287 asked for** (`apps/web/measure-toolbar/tech-debt-287-pen-foot-row.spec.ts`),
with an activity selected and a peer's request outstanding:

| width   | foot row, no request | foot row, request outstanding | cost to the diagram |
| ------- | -------------------- | ----------------------------- | ------------------- |
| 1440 px | 87 px                | **167 px**                    | **80 px**           |
| 1646 px | 51 px                | **127 px**                    | **76 px**           |
| 1920 px | 51 px                | 87 px                         | 36 px               |

1646 is the product owner's own screen. The diagram goes 702 → 626 px there, and 666 → 586 px at 1440.

**This is not the defect #287 feared and it is not nothing.** That row expected clipping, and there
is none — the row wraps rather than overflowing, which is ADR-0114 M1's `min-w-0` working exactly as
intended. What it buys instead is height, and nobody had priced it: ADR-0115 asserts the dock costs
**41 px in both states** and pins that as an equality, but its fixture is **pen held with no request
outstanding**, which is the branch offering no hand-off controls at all. The equality is true of the
state it measures and says nothing about this one.

**Why it matters more than the pixels suggest.** The state is not rare or transient: a request stands
until the holder answers it or the grace window elapses (`LOCK_HANDOFF_GRACE_MS` is 45 s), and the
person losing 80 px of diagram is the one being asked to make a decision about the plan they are
looking at. The narrowest width is also the worst, which is the wrong way round.

**Not fixed here, and the reason is that the remedy is a design decision rather than a defect fix.**
Four options, none costed: shorten the two labels; move the sentence and keep only the two buttons in
the row; put the hand-off in the pen's own popover rather than inline; or accept it. ADR-0114 D4
already withheld a mode statement per kind for exactly this reason, so there is precedent for
trimming — but this cluster is the one place the product names _who_ holds the pen, and ADR-0112
records that being load-bearing in eight of ten lock states.

**What the reading does NOT cover**, stated rather than implied: the Org Admin **override** branch,
which offers a different control set and may be wider or narrower; one machine, one browser, one
plan; and only the three widths probed.

### 295. A peer's plan-governance change does not reach another reader's open workspace

**Status:** open · **Verified:** 2026-09-11 · **Raised:** 2026-09-11 (measuring #204(c)) · **Size:** S · **Owner:** web

**Observed, not inferred** (`apps/web/measure-toolbar/tech-debt-204c-mode-flip-focus.spec.ts`). Two
Planner sessions on one plan. A has it open in **Visual** mode with an activity selected. B changes
the plan to **Early** through `PATCH …/plans/:planId`, which succeeds — it is "Planner or Org Admin;
optimistic locking" and `assertHoldsPen` appears nowhere in `apps/api/src/modules/plans/`, so B
needs no pen and A keeps hers.

A then waits past the client's 30 s `staleTime` and makes a **real** background→foreground
transition, which is what `refetchOnWindowFocus: true` exists for. The server reports `EARLY`. A's
screen still shows `Clear visual start` — a control whose entire visibility rule is
`schedulingMode === 'VISUAL'` (`conflict-remedy.ts:111-115`).

**So the screen and the record disagree, and nothing on screen says so.** A is working in a mode the
plan is no longer in, and the first thing she will notice is a recalculation that does not do what
Visual mode does.

**The consequence is mild today and the shape is not.** `visualStart` is advisory and ignored in
Early mode, so pressing the stale control writes a field the engine will not read rather than
corrupting anything. What is wrong is the class: this register treats a screen disagreeing with the
record as worse than either being wrong on its own (ADR-0089's summary-parent case, in those words),
because the reader has no way to tell.

**Why it was not diagnosed here.** Establishing _why_ the refetch does not land — whether the
workspace reads `schedulingMode` from a query that is not invalidated, from route-loader data, or
from a cache key the focus refetch does not cover — is a different piece of work from establishing
_that_ it does not, and guessing between those three in a register row would be exactly the
unverified claim this file exists to remove. The probe is committed and re-runnable, so whoever
picks this up starts from a reproduction rather than a description.

**It generalises past this one field.** `plan-governance-fields.ts` lists `schedulingMode` among a
set of plan-level settings that change how everyone's numbers are computed — ADR-0073 C3.2 audits
them precisely because they are "the rules other people's work is judged by". If one of them does
not propagate, the others are worth checking with it; nothing here establishes that they behave the
same, and nothing establishes that they differ.
