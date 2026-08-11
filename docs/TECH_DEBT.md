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

| #   | Item                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Why it exists                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Risk                                                                                                                                                                                                                                                                                                                                                            | Remediation intent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Web e2e is Chromium-first, and now at scale** — _re-counted 2026-08-08: **30** suite directories, not 24_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Rewritten 2026-08-04: the old text described the foundation stage ("the web entry point has landed… a Playwright journey"), which stopped being the situation about twenty suites ago. There are now **24** Playwright suites — one base journey plus 23 flag-scoped ones, each with its own config — and `playwright.config.ts` still declares firefox/webkit projects that essentially nothing routinely runs. The gap therefore grew with every epic rather than staying still, and it is widest exactly where the product is most browser-dependent: the Canvas-2D TSLD, the `<dialog>` top layer (which the ADR-0067 journey proved unit tests cannot see), and the print/PDF paths.                                 | Firefox/WebKit regressions ship unseen. The brief names iPad-class Safari in the performance envelope, and no journey has ever run there.                                                                                                                                                                                                                       | Pick the two or three journeys whose failure would be worst on another engine (base, canvas authoring, calendar shifts) and run those projects in CI; do not try to run all 24 cross-browser. Sequence with #75, which needs real-hardware Safari measurement anyway.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2   | **Swagger CLI plugin disabled**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | The `@nestjs/swagger` CLI plugin generated a `metadata.ts` that tripped `noUnusedLocals`. OpenAPI is currently produced via explicit `@Api*` decorators (which works), so the plugin is optional.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Without the plugin, DTO schemas must be annotated by hand.                                                                                                                                                                                                                                                                                                      | Optionally re-enable `plugins: ["@nestjs/swagger"]` in `nest-cli.json` to auto-enrich schemas; verify the build stays green.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 3   | **Observability wiring is partial**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Structured logging + correlation IDs are implemented; OpenTelemetry metrics/traces (ADR-0013) and a backend are not yet wired.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Limited metrics/traces until wired.                                                                                                                                                                                                                                                                                                                             | Add the OTel SDK + exporter and a collector per environment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 4   | **Async/cache/storage not wired**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | BullMQ (ADR-0009), Redis cache (ADR-0010), and object storage (ADR-0011) are designed but not yet added to the stack (no jobs/hot paths/files exist yet).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Patterns exist on paper only.                                                                                                                                                                                                                                                                                                                                   | Add Redis/MinIO to compose and the modules when the first job/cached read/file lands.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 5   | **Hosting: the current setup IS the decision (settled 2026-08-01)**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Recorded as "undecided" since the foundation stage, which read as work owed. It is not. The product owner runs the Docker Compose stack with the ADR-0047 Watchtower profile **enabled**, so a merged release is pulled and recreated on that host and every release is reviewed by a person. That is a deployment model, not the absence of one.                                                                                                                                                                                                                                                                                                                                                                         | None today. The cost of the deferral is bounded because the container/registry foundation is deliberately platform-neutral (ADR-0018 self-migrating image, ADR-0027 per-package tags, GHCR), so moving is a decision rather than a rewrite. Costing managed-host against Kubernetes now would mean costing them against a load profile that does not exist yet. | **Revisit when one of these becomes true**, and write the ADR then: a second operator needs to run their own instance; a tenant needs an availability guarantee a single host cannot make; or the release cadence outgrows one person reviewing each one. Until then this row is a record, not a task.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 7   | **Performance targets are still estimates — but the excuse expired**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | The `CLAUDE.md` §15 targets (LCP < 2.5 s, API p95 < 200 ms) were set before any workload existed, and the row said so. That premise is gone: the product is deployed and in daily use (#5), and several sub-systems have since been measured properly — the painter (ADR-0065), audit storage and index behaviour at 1M rows (ADR-0072/0073), the levelling pass (#84), the library search (ADR-0053 §4). What has **never** been measured is the thing the targets actually name: LCP and API p95 on the running deployment under real use. So this is no longer "too early to tell", it is "nobody has looked".                                                                                                         | The numbers are quoted in reviews and PRs as though they were a bar the system meets. They are a guess, and a guess that has now survived long enough to read as a measurement.                                                                                                                                                                                 | One session with the browser's own performance panel against the live instance, and one p95 read from the API logs (correlation IDs are already there — ADR-0013's wired half). Then either confirm §15's numbers or replace them, and say which. Blocked on nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 8   | **A Content-Security-Policy now ships, in report-only** — _2026-08-09: the flip procedure and its route-walk are now written down (`docs/DEPLOYMENT.md` "Turning the CSP from report-only to enforce"), including what `e2e-csp` does **not** cover. **Remaining: one host variable**, `CSP_HEADER_NAME`_ — _corrected 2026-08-08: this row's risk column called `style-src` "an inference, not a browser-verified fact", which its own remediation column and `apps/web/e2e-csp/` contradict — that suite serves the real policy over the production build in a real browser. **All that remains is the operator flip** of `CSP_HEADER_NAME` (programme M3-T1)_ | **Largely paid 2026-08-05 (ADR-0074 M1).** `apps/web/nginx.conf` is now an envsubst template serving a policy derived from what the code actually loads — everything `'self'` except `blob:` on `img-src`, which the print surface needs. The inline theme-boot script moved to `public/theme-boot.js` so `script-src` needs no relaxation at all. COOP, CORP and an **enumerated** Permissions-Policy ship alongside; HSTS is deliberately excluded (see #89).                                                                                                                                                                                                                                                           | The remaining risk is the one the observation window exists to find: `style-src 'self'` is an inference from source, not a browser-verified fact.                                                                                                                                                                                                               | **The observation window ran on the deployed origin 2026-08-05 and found two things, both now fixed** (and this is the argument for having had a window rather than enforcing on day one). **(a) Zod 4 probes for eval.** `allowsEval()` runs `new Function('')` in a `try`/`catch` to decide whether to JIT-compile validators; the throw is swallowed, so validation always worked — but the browser still reports the attempt, so the console showed a `script-src` violation pointing at `auth-schemas.ts`. Zod's own source comments on this and ships a `jitless` flag; `config/zod-jitless.ts` now sets it, so the probe never runs. Adding `'unsafe-eval'` was rejected: it would re-open string-to-code execution across the origin to buy JIT speed on a few login forms. **(b) `upgrade-insecure-requests` is ignored under report-only** — informational, per spec, and it means that one directive is genuinely untested until the flip. Everything else on the walked routes was clean; **`style-src 'self'` held**, which was the inference this row flagged as unverified. **The vigilance is now a gate.** Both findings shared one cause: the policy was _derived_ by reading `apps/web/src` and _validated_ by a person watching a console, and neither method sees what a **dependency** does at runtime — Zod's probe is not in our source at all. `apps/web/e2e-csp/` (`pnpm --filter @repo/web test:e2e:csp`, its own CI step) serves the **real** policy, parsed out of `docker-compose.yml` rather than restated, over the **production build** — `pnpm build` + `vite preview`, not the dev server, whose inline react-refresh preamble would report a violation production can never have — and fails on any `securitypolicyviolation`. It was verified red first: removing the `zod-jitless` import reproduces `{"directive":"script-src","blockedURI":"eval"}`. It covers the signed-out surfaces and the authenticated shell, and **states what it does not cover** — canvas export, the printed programme, and `upgrade-insecure-requests`, which report-only ignores by specification. **What is left is the flip to enforce**, a separately-approved step (ADR-0074 M5-T2). The operator sets `CSP_HEADER_NAME=Content-Security-Policy`; no release is needed either way. Before flipping, walk every route with the console open — sign-in/up, accept-invite, the share guest view, the plan workspace, the Gantt, canvas PNG/PDF export, the printed programme, the library screens and the audit log — and both Copy buttons. If styles do need it, relax `style-src` ONLY. **And since the staff console shipped (2026-08-09), the walk is no longer the only evidence available.** The policy now carries `report-uri`/`report-to` pointing at `/api/v1/csp-report`, so violations from **every** visitor — not just the routes one person remembered to walk, and not just the browser they used — accumulate in `csp_reports` and are readable at `/staff`. That is strictly better than a console walk for the case this row's own history proves is the dangerous one: the Zod finding came from a **dependency**, was invisible to the source derivation, and would have been invisible to any route list drawn up from `apps/web/src`. Flip, then read the Security panel for a few days. One caveat, and it is why the walk is not simply deleted: delivery from a real browser to that sink is itself unverified end to end (#117), so an empty panel means "nothing arrived", not "nothing happened". |
| 9   | **Auth library relatively young**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Better Auth is now wired into the `AuthContextService` seam (email + password, cookie sessions; ADR-0003, A1). Ecosystem maturity remains a watch item.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Ecosystem maturity risk.                                                                                                                                                                                                                                                                                                                                        | Monitor releases/advisories; keep the boundary swappable behind the seam.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 10  | **ESLint pinned to v9**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | ESLint 10 is available, but `eslint-plugin-import`, `eslint-plugin-jsx-a11y`, and `eslint-plugin-react` still cap their peer range at ESLint 9. Dependabot's major bump is ignored (see `.github/dependabot.yml`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Missing ESLint 10 features/fixes until the plugins catch up.                                                                                                                                                                                                                                                                                                    | Remove the `eslint` major-ignore and bump the ESLint group once the plugins publish v10-compatible releases.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 11  | **Prisma pinned to v6**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Prisma 7 removes `url` from the datasource block and requires a driver adapter + `prisma.config.ts` — a deliberate migration, not a routine bump. The major is ignored in Dependabot.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Missing Prisma 7 improvements until migrated.                                                                                                                                                                                                                                                                                                                   | Do the Prisma 7 migration deliberately (driver adapter, `prisma.config.ts`, `PrismaService` wiring) — worth an ADR — then un-ignore.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 12  | **CodeQL is scanning, but one `if:` away from silently stopping**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Rewritten by the 2026-08-04 reconciliation pass, which found this row describing a risk the repository does not carry, framed for "apps generated from this template" — `HuttonHomeHub/SchedulePoint_1` is **public** and `is_template: false`, so the `if: github.event.repository.visibility == 'public'` guard in `.github/workflows/codeql.yml` is inert and CodeQL runs on every push (row #81 is one of its findings, which is the proof). What is left is the guard itself: making the repo private would **skip** the job rather than fail it, so code scanning would stop with a green tick and nothing to notice. Uploads need GitHub Advanced Security (paid) on private repos, which is why the guard exists. | Silent, not loud. The day the repo goes private, static analysis stops and CI stays green — the failure mode this register exists to catch. Today: none, the scan runs.                                                                                                                                                                                         | If the repo is ever made private, either buy Advanced Security and delete the guard, or replace the skip with a job that fails loudly so the loss is visible. Do not leave a silent skip.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

| 13 | **TypeScript pinned to v5** | TypeScript 7 (the native compiler) removed `baseUrl` and `moduleResolution: node10` from tsconfig, which the shared presets rely on for the `@/` and `@repo/*` path aliases. The major is ignored in Dependabot. | Missing TypeScript 7 speed/features until migrated. | Migrate the tsconfig presets (drop `baseUrl`, move to `paths`/`bundler` resolution), verify nest/vite resolution, then un-ignore. |

| 14 | **Audit log: the two remaining halves** | (a) and (a2) are **closed** by ADR-0072 — authentication events and membership/invitation/organisation changes are recorded before→after in an append-only table, with hierarchy deletes/restores added beyond the original scope and a route census gating every future endpoint on an audit decision. What remains: **(b)** Better Auth's rate-limit store is in-process memory — per-replica once scaled (sibling of #49); **(c)** the `accounts` OAuth token columns are unencrypted at rest (harmless today — only email+password is enabled). | (b) a scraper gets N× the intended budget on scale-out; (c) a database read would expose OAuth tokens the day a social provider is enabled. | (b) back both throttler stores with the ADR-0010 Redis, with #49, before the API runs more than one replica; (c) encrypt the columns before enabling any OAuth provider. |

| 15 | **OpenAPI accuracy gaps** | Repo-wide, from the B2 API review: (a) `201 Create` responses don't set a `Location` header (`docs/API.md` asks for one) — present in the reference template too; (b) the `@Api*Response` decorators declare the bare DTO, not the `{ data }`/`{ data, meta }` envelope the `TransformInterceptor` actually returns. | Generated OpenAPI is slightly inaccurate about response shape and `Location`. | Add a shared `@ApiDataResponse()`/`@ApiPaginatedResponse()` swagger helper and a `Location` header on creates; backport to the reference template so the two stay in step (ADR-0015). |

| 16 | **Email verification is built but not switched on** | The verification-email loop now exists (Theme B2: `emailVerification` in `better-auth.ts` → the `MailService` port → the SMTP adapter), so `AUTH_REQUIRE_EMAIL_VERIFICATION=true` is a switch an operator can turn on rather than one that would strand every new account. It is still `false` on the running deployment. Until it is on, invitation acceptance grants org membership on an email-**match** that only proves mailbox ownership when verification is enforced (ADR-0016 §5). | An adversary who registers an account for a matching address **and** holds the one-time invite token could accept; account-squatting can also block the real invitee's sign-up. Alpha-only, deliberately accepted. **Mail is confirmed working on the deployed host (product owner, 2026-08-05)**, so the first half of this row is paid. What is left is one **ordering** condition, and it is a hard one: the switch must not be turned on until a **web bundle carrying ADR-0074 M2 is live**. M2's three fixes are unflagged runtime branches — a `VITE_` constant cannot gate a server switch (the ADR-0060 M0 rule) — so enforcing verification against an older bundle re-arms exactly the three dead ends M2 closed. That bundle also needs the M5 fixes, without which a verification link that _works_ still lands the reader on the pending screen. Then set `AUTH_REQUIRE_EMAIL_VERIFICATION=true` (docs/DEPLOYMENT.md "Turning verification on"), after counting existing unverified accounts and backfilling the ones already holding a membership (ADR-0074 M5-T6/T7 — enforcement's value is prospective, and the membership predicate structurally excludes a squatted address holding a _pending_ invitation). No code change is needed. Consider a stricter per-route throttle on `POST /invitations/preview` \| `/accept` at the same time. |

| 17 | **Members UI a11y polish (non-blocking)** — _corrected 2026-08-08: **(b) is done** — `components/ui/dialog.tsx:97` links its description via `aria-describedby`. (a) native `disabled` on `MembersTable.tsx:32`, (c) no initial-focus target, (d) no `useAnnounce`, (e) `h-9` = 36 px all stand. **(a) is now governed by the shaded-field ruling** (draft ADR), so take it with programme M6 rather than alone_ | From the C3 accessibility review, after the blocking contrast/focus/live-region fixes: (a) controls use the native `disabled` attribute while a mutation is pending, so keyboard focus drops to `<body>`; (b) the `Dialog` `description` isn't linked via `aria-describedby`; (c) modal initial focus lands on the ✕ close button rather than the first field; (d) no `aria-live` success confirmation for role change / removal / link-copy; (e) light `muted-foreground` (4.73:1) and the sm remove button (36px vs. preferred 44px touch target) are within-spec but tight. | Minor friction for keyboard/AT users; all currently meet AA. | Prefer `aria-disabled` + pointer-events guard over native `disabled` on pending controls; add `aria-describedby` to `Dialog`; set an explicit initial-focus target; add a shared polite toast for success; revisit the tight tokens/targets when the notifications component lands. |

| 18 | **CI image job has no layer cache** | The `image` job (`.github/workflows/ci.yml`, ADR-0020) builds both container images from scratch on every run: the Dockerfiles' `--mount=type=cache,id=pnpm` BuildKit cache is local to an ephemeral runner and isn't persisted across CI runs, and the job invokes `docker compose … --build` directly without a GHA-backed buildx cache. | Slower CI (full `pnpm install` + `prisma generate` + `tsc` + `vite build` each run); more Action minutes. | Wire `docker/setup-buildx-action` + `cache-from`/`cache-to: type=gha` (or `docker buildx bake`) so image layers persist across runs. |

| 20 | **Keyset cursor is resolved before the scope filter** — _re-measured 2026-08-08: **14 call sites across 13 repositories**, not the three named; and its remediation ("in the shared list-repository helper") is conditional on an extraction that does not exist, which is the actual work_ | From the C1 security review (pre-existing shared behaviour, also in `client.repository.ts`/`org-member.repository.ts`): the list repositories pass `cursor: { id }` to Prisma, which resolves that row by global `id` uniqueness before the org/client `WHERE` filter is applied. A cursor value copied from another org's row is therefore accepted as a valid pagination anchor. | None exploitable — the returned page is still filtered by `organizationId`/`clientId`, so no cross-scope rows leak; only the anchor position is honoured. Cosmetic/robustness. | Validate the cursor belongs to the resolved scope (or use an opaque signed cursor) in the shared list-repository helper when one is extracted; capture the standard in an ADR/`docs/API.md` pagination note. |

| 21 | **Systemic web-a11y & polish follow-ups (E1 reviews)** — _corrected 2026-08-08: **(b) is half done** — `hooks/use-document-title.ts` exists but only the six public routes call it, and no focus-to-heading manager exists anywhere; it pairs with **#102(6)**, and one manager in the router closes both. (a) required-indicator, (d) `EmptyState`, (e) `DateField` are all still absent — and (d)/(e) are **new primitives with no consumers to migrate**, so they are separate work from (a) despite sharing a file_ | Non-blocking items from the E1 component/UX/accessibility reviews that are pre-existing or systemic, so best fixed once at the primitive/shell level rather than per-feature: (a) no required-field indicator in the shared `Form`/`TextField` primitive (affects every form — sign-in/up/invite/create-org too); (b) no focus-to-heading / `document.title` update on client-side route navigation (router/`AuthedLayout` level); (c) `sm` ghost row-action buttons are 36px (below the 44px touch-target preference), shared with `MembersTable`; (d) no shared `EmptyState` primitive (icon + copy + action) — empty states are text-only; (e) from the E2 review: no shared `DateField` form primitive — a `TextField type="date"` is hand-composed where the CPM/GPM feature set needs it repeatedly (baseline/actual/constraint dates). **The `SelectField` half of this item is DONE** (2026-07-27, #42): the primitive exists and `InviteMemberDialog` + the plan status select are on it. | Minor friction for keyboard/AT and touch users; all current states still meet WCAG 2.2 AA. | Add a required-indicator to the `Form` primitive; add a route-change focus/title manager once in `AuthedLayout`; introduce `EmptyState`, `SelectField`, and `DateField` primitives (folding the calendar-date wire↔display contract into `DateField`) and bump the row-action target size when the design system is next revised. |

| 23 | **Header org-nav was never folded into the rail** — _the responsive-collapse half is addressed (ADR-0029, `VITE_NAV_TREE` default-on); the fold-in is not: `app-header.tsx` still renders Overview / Clients / Members / Recently deleted as its own row_ | From the E3 UX review: the org nav (`apps/web/src/components/layout/app-header.tsx`) is a single flex row that grew to four items (Overview / Clients / Members / Recently deleted). `docs/FRONTEND_ARCHITECTURE.md` documents the intended shell as "nav collapses to a drawer/sheet below `lg`", which isn't built. E3 mitigated the immediate overflow by making the nav shrink and scroll horizontally (`min-w-0 flex-1 overflow-x-auto`, links `whitespace-nowrap`) so it never pushes the page into horizontal overflow, but a horizontally-scrolling nav strip is a stopgap, not the intended mobile pattern. **The persistent app-shell (ADR-0029) is landing this:** M1 added the shell — a Project Explorer rail pinned on `lg`+ and an off-canvas drawer (with a header menu button) below `lg` — behind `VITE_NAV_TREE` (default off). The primary navigation moves into the rail/drawer once the flag flips on at M2. | On narrow viewports the primary nav becomes a scroll strip rather than a proper menu; discoverability of later items is weaker. Every new nav item makes the row tighter. | Complete the navigator (M2), flip `VITE_NAV_TREE` on, and fold the header org-nav items into the rail; move low-frequency maintenance items (e.g. "Recently deleted") into an org-settings/admin area once one exists. |

| 28 | **TSLD canvas ring/stroke colour treatment** | From the D5 link-legality UX + a11y reviews. **(a)** The **legal** drop-target ring during a link-draw is visually identical to the ordinary **selection** ring (`paint.ts` — both `palette.selection`, solid, 2px), so two rings with different meanings can appear in the same style at once (predates D5). **(b)** The **illegal** ring reuses `palette.critical` (`--color-destructive`), the same token as the CPM critical-path **bar fill** (`paint.ts`), so an illegal drop hovered over a critical-path activity draws red-on-red — weaker contrast exactly where the signal matters, and overloads one colour for two meanings. **(c)** `--color-destructive` is documented (`globals.css`) as tuned for button surfaces; its use as a **state-border/stroke** on the canvas (the critical-bar outline too) wants a contrast check vs `--color-destructive-text` in both themes. | Cosmetic/robustness; the illegal ring is still distinguishable by its dash (colour + pattern, WCAG 1.4.1 holds), so not an AA failure. | Give the legal drop-target ring a distinct treatment from selection; pick a canvas "danger stroke" token distinct from the critical-bar fill; verify destructive-token stroke contrast in both themes when the canvas palette is next revised. |

| 31 | **`VITE_CANVAS_TOOLBAR` ships dark during build + M5 fast-follows (ADR-0031)** — _corrected 2026-08-08: **(b) is done** and this row still describes the dialogs as duplicated. `components/layout/workspace/plan-chrome-dialogs.tsx:71` is real and **both** layouts consume it. **(c) is one line**, not a hook rework — `use-resizable-panel-prefs.ts:22,45` already persists `collapsed`; `plan-workspace-toolbar.tsx:245` simply uses a local `useState(true)` instead_ — _(a) `SelectionActionsBar` mounted + (b) plan-chrome dialogs deduped into a shared `PlanChromeDialogs` 2026-07-13_ | The canvas-maximal chrome reclaim + future-proof Toolbar architecture (ADR-0031, spec `docs/specs/canvas-toolbar-architecture.md`) is built behind `VITE_CANVAS_TOOLBAR` (default-off, `apps/web/src/config/env.ts`), layered on ADR-0030's `VITE_CANVAS_WORKSPACE`. M0–M5 have landed (flag/ADR, `<Toolbar>` primitive, TSLD registry, pen-gating + floating selection bar, the toolbar-hosted layout, the flag-on Playwright journey, and the M4/M5 review remediation — recalc-command regression, context/UI-state memoisation, toolbar-control CVA, the below-`md` pane switch, and the three a11y blockers); only the **default-on flip awaits product sign-off**. **Deferred fast-follows:** (a) **resolved 2026-07-13** — the floating `SelectionActionsBar` (M3) is now **mounted**: the canvas writes the selected activity's viewport anchor to a `selectionAnchorRef` each frame (ADR-0026 D3, only on moved frames), the bar reads it on its own rAF (transform-positioned, change-detected) to follow pan/zoom, clamps itself inside the viewport edges, hands focus back to the listbox when it hides/unmounts while focused, and Edit/Delete open host-owned dialogs via a shared `ActivityCrudDialogs` (the "Set constraint" action was dropped as redundant with Edit). **Accepted trade-off (new fast-follow):** floating just above the selection overlays the region directly above it, so on a dense diagram it can cover the activity in the lane above for as long as the selection is active — accepted as a contextual, transient overlay; a future lane-aware / side placement is the fast-follow. (b) the three plan-chrome dialogs (Plan details / Baselines / Calendar) are **duplicated** between `plan-actions-menu.tsx` (flag-off) and `plan-workspace-toolbar.tsx` (flag-on) — extract a shared `PlanChromeDialogs`; (c) the toolbar layout's **collapsed** state is session-local (not persisted; height still persists) — thread a `defaultCollapsed`/separate key through `useResizablePanelPrefs`; (d) on an **empty/uncalculated** plan the frame/lens/help commands are **hidden** (`isVisible: hasDiagram`) rather than shown-disabled-with-reason as the spec's edge-case prefers — accepted for now since the empty plan still surfaces its only relevant actions (Add activity + Recalculate), but reconcile spec↔code (either disable-with-reason, or update the spec) when the empty-state copy is next revised; (e) non-blocking a11y recommendations from the M5 audit — the toolbar doesn't `.focus()` the new roving stop when a `ResizeObserver` demote unmounts the focused button mid-session (rare; falls back to `<body>`); `aria-orientation="horizontal"` while Up/Down are also wired (harmless superset); the segmented zoom presets are `aria-pressed` buttons rather than a `radiogroup`; and a manual NVDA/VoiceOver pass on the `CompactPenStatus` live-region + Start/Stop/Take-over sequence is still owed. | Divergent code paths coexist behind the flag until the flip; three layered flags (`VITE_CANVAS_WORKSPACE` → `VITE_CANVAS_TOOLBAR`); the dialog duplication can drift. | Flip `VITE_CANVAS_TOOLBAR` default-on once signed off (**done**); mount the selection bar (**done**), dedup the dialogs (**done**); still to do: a lane-aware / side placement for the floating bar so it never covers the lane above, persist the collapsed state, reconcile the empty-state hide-vs-disable, and clear the non-blocking a11y recommendations as fast-follows once the layout has soaked. Rollout tracked in the flag comment (`env.ts`). |

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
| 57 | **Recycle-bin list has no index for its filter or its sort, and the screen pages it to exhaustion** | The `deleted_at IS NOT NULL` filter and the `ORDER BY deleted_at DESC, id ASC` on all three `UNION ALL` branches are unindexed: `clients`/`projects`/`plans` each index `(organization_id, created_at, id)`, none carry `deleted_at`. So Postgres filters and top-N sorts over **every** row for the org in that table, live rows included. That predates TECH_DEBT #22 and was deliberately deferred there as measure-first. What #22 did not weigh: the screen fetches via `apiFetchAllPages` (`use-deleted-items.ts`), which walks `?limit=100` to exhaustion — so the scan is re-run **per page**, making one screen-open cost `O(pages x org rows)` rather than `O(org rows)`. #22's own commit used that same pagination-amplification argument to justify fixing the row over-fetch immediately; it applies with more force here, and I did not apply it consistently. | Grows with an org's total row count, not its deleted-row count, and multiplies by page count. Harmless on a small org; an org that has ever created and deleted a lot of plans pays it on every visit to Recently deleted. | **Measure first — this is still unmeasured** (the reviewing agent had no database either). Get an `EXPLAIN ANALYZE` at realistic row counts; if it confirms the scan, add the partial index already named in `recycle-bin.repository.ts` — `(organization_id, deleted_at DESC, id) WHERE deleted_at IS NOT NULL` per table. Also worth asking whether the screen should page to exhaustion at all. Raised by the backend-performance-reviewer agent, 2026-07-27. |
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
the measured numbers. Raised by the ADR-0063 M6 backend-performance gate as an open risk, not a
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
   The layout now runs a phase's bands concurrently (`scripts/scale-scene.ts`), which puts the plan
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

| #   | What it was                                                     | Closed     | Where the record is                                                                              |
| --- | --------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------ |
| 29  | Released images not pulled — "shipped but not live"             | 2026-07-30 | ADR-0047; `docs/DEPLOYMENT.md`. Superseded by #5.                                                |
| 59  | The device-authoritative draw measurement was never made        | 2026-08-03 | Folded into **#75**, which waits on the same single run.                                         |
| 77  | The demo Unit 300 file was a lossy rendering of the fixture     | 2026-08-01 | ADR-0066; `docs/TEST_PLAYBOOK.md`.                                                               |
| 78  | Public activity/dependency API was day-denominated              | 2026-08-02 | ADR-0070. `durationMinutes` / `lagMinutes` are on both DTOs.                                     |
| 79  | A window-only calendar was rejected by the API                  | 2026-08-01 | ADR-0067. Pinned by `calendars.e2e-spec.ts` "window-only".                                       |
| 80  | Intraday shift patterns had no write path                       | 2026-08-01 | ADR-0067. `shifts` on the calendar create/update DTOs.                                           |
| 82  | Shift-editor epic — the non-blocking half of five gates         | 2026-08-01 | ADR-0067 M4; all seven sub-items landed.                                                         |
| 87  | Import rejected a file with two activities of the same name     | 2026-08-03 | Fixed in `validate.ts` (`repairDuplicateCodesAndNames`).                                         |
| 90  | `idx_audit_events_actor_occurred` was never measured            | 2026-08-03 | Measured at 1M rows; ADR-0072 "Storage measured (2026-08-03)".                                   |
| 91  | A failed sign-in was recorded and readable by nobody            | 2026-08-04 | ADR-0073 C2. Attributed at write time; `/me?include=attempts`.                                   |
| 30  | Canvas-first workspace fast-follows (ADR-0030 M1–M5)            | 2026-08-08 | Verified done: `components/ui/segmented-control.tsx` + four `usePlanWorkspaceModel` hook suites. |
| 85  | Two `react-hooks/refs` suppressions in the toolbar-context memo | 2026-08-07 | ADR-0078 S11 split the commands out; zero suppressions remain.                                   |
| 94  | A verification email that never sends is invisible to everyone  | 2026-08-08 | Every remediation paid; ADR-0075 records the decision. Live gap is **#100**.                     |
| 111 | The row menu hid pen-gated actions instead of shading them      | 2026-08-08 | ADR-0082, merged `d8d8c34`. `itemsOf` keeps disabled items; `disabledReason`.                    |
| 83¹ | A typed duration overwritten by the calendar factor landing     | 2026-08-02 | ADR-0070 M6. `useDurationSeed` reads the field, not a flag.                                      |

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
(`email-verification.mjs:104-117`) — the machinery exists in the library, and this route does not
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
   `/sign-in`/`/sign-up`/`/change-password` (`index.mjs:370-383`) — and it is
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

**Status:** open, narrowed · **Owner:** repo · **Raised:** 2026-08-06 (ADR-0077 M0-T2) ·
**Narrowed:** 2026-08-08 (W5 M2-T4)

`pnpm check:claims` (ADR-0076) shipped matching one citation form, `<base>.mjs:<line>`, and passed
green on the day it was written **because it could not see half its input**. ADR-0077's M0-T2 widened
it — both `.js` and `.mjs`, the prose form ("`dist/api/routes/sign-in.mjs`, lines **234**"), and an
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
   root-level markdown, which is left out on purpose: it would demand `sign-up.mjs:162` (a real
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

## 103. ADR-0064's recalculation hold is not wired on the surface it ships on **(CLOSED 2026-08-08)**

**Status:** closed · **Owner:** web · **Raised:** 2026-08-07 (canvas status & feedback, M5)

**Closed by the debt-paydown programme M1-T1**, and it was worse than this row recorded. The task
diffs both hosts' whole `TsldPanel` prop lists rather than fixing the two named here — and found a
**third**: `onUndoLastEdit`. `CanvasModeBand.tsx:98` renders the link confirmation's Undo only
`{confirmation && onUndo ? …}`, so on the shipped host that button had **never** appeared, including
through the ADR-0064 §7 gate pass that found and fixed a defect in it. All three now match the
legacy layout, pinned by an assertion in `plan-workspace-toolbar.test.tsx` verified red first.

The lesson is the diff, not the props: when a host divergence turns up, compare the whole surface.
A register row lists what somebody noticed.

ADR-0064 T7 added **token-based recalculation holds** so the bars cannot move between a planner's two
clicks during a link pick — the epic's own founding defect. The hold is real and its unit suite
passes. It is passed into `TsldPanel` from **one** host:

- `components/layout/workspace/plan-workspace.tsx:150-151` — `recalcHold={model.autoRecalcHold}` and
  `dropLinkPickSignal={model.dropLinkPickSignal}`. This is the **ADR-0030 host**, reached only with
  `VITE_CANVAS_TOOLBAR` **off**.
- `components/layout/workspace/plan-workspace-toolbar.tsx` — passes **neither**. This is the default
  surface (`VITE_CANVAS_TOOLBAR` has been default-on since ADR-0031's enablement).

> _Both citations above are historical as of 2026-08-10._ ADR-0088 D3 retired `VITE_CANVAS_TOOLBAR`
> and **deleted** the ADR-0030 host, so `plan-workspace.tsx` is now a 24-line re-export and the
> toolbar host is the only one. The row is kept as written because it records how the defect was
> found; what it describes as "the surface every planner actually uses" is now the only surface.

So on the surface every planner actually uses, `recalcHold` is `undefined`, `TsldPanel`'s
`recalcHoldRef.current?.hold(...)` is a no-op, and a two-click link pick takes no hold at all. The
feature is not broken in the sense of throwing — it is inert, which is the shape ADR-0064 §7 itself
names (lit-but-inert) and the reason that epic exists.

Found while wiring M5's settle announcer through the same host, by reading which props each workspace
supplies; **not** introduced by this epic, and deliberately not fixed inside it — the fix is one line
per prop plus a test that the hold is actually taken on the default surface, and it belongs with
somebody re-reading ADR-0064 T7's contract rather than bolted onto a feedback milestone.

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

---

## #106 — `render-model.ts` cannot become "barrel + core model": the core must be its own module

**Found:** 2026-08-07, doing ADR-0078 S8's first extraction.
**Blocks:** the `link-routing`, `viewport` and `hit-test` extractions (ADR-0078 S8's remainder).

The decomposition plan (`docs/specs/canvas-decomposition/plan.md` §3.2) describes the end state as
`render-model.ts` = **barrel + what is genuinely the model** — the types, `activityRect`, the glyph
geometry — with `link-routing.ts` and friends beside it. That shape does not work, and the reason is
countable rather than a matter of taste: the link-routing region uses `activityRect` **eight times**
plus `screenXOfDay`, `BAR_HEIGHT`, `RectCache` and the core types, so `link-routing.ts` must import
from `render-model.ts`, which re-exports `link-routing.ts`. A genuine import cycle.

ES modules tolerate cycles, so this would have compiled and passed — which is exactly why it is
worth recording rather than discovering later. A cycle at the foundation of a decomposition is the
wrong thing for four more modules to be built on.

**The fix** is that the core model becomes a module of its own (`geometry.ts` or similar), leaving
`render-model.ts` a **pure** barrel over `geometry` / `working-time` / `link-routing` / `viewport` /
`hit-test` — a barrel that re-exports and holds nothing. Then every module depends only on
`geometry`, and nothing depends on the barrel.

**Why it is not done here.** It is a bigger move than one step, and ADR-0078's own rule is that a
step which needs more than a move is wrong and must be split. `working-time.ts` was extractable
today precisely because its whole surface needs only `DependencyType`; it went first for that
reason, and the ordering rule it demonstrates — _lift only what depends on nothing that will be
re-exported around it_ — is the thing the next step needs to follow.

**Not urgent.** Nothing is broken: `render-model.ts` is 1,500 lines rather than 1,660 and every
consumer is unchanged. This is the shape of the remaining work, written down while it is fresh.

## #107 — ADR-0080 shipped without the specialist-agent review pass **(CLOSED same day)**

**Closed 2026-08-08**: the pass ran once subagents were approved, and found five blocking defects
plus one status-code mismatch — all folded with regression tests before the merge (ADR-0080 §9).
The entry is kept rather than deleted, because the interesting part is not that the gap existed but
what it would have cost: the pass caught a sentence asserting a gesture nobody wired, a button that
disabled itself for the case its own dialog explains, and an `aria-activedescendant` naming a
different row from the one `Enter` acted on. The original text follows.

---

**Found:** 2026-08-08, closing the canvas multi-select epic (ADR-0080 M5).

Every enablement milestone since ADR-0060 has run four to six specialist reviewers
(`accessibility`, `ux`, `component`, `api`, `security`, `performance`) over the combined epic diff
before the flag flip, and each one found blocking defects that had already passed a human read —
ADR-0064 §7 records five, ADR-0067 M4 ten, ADR-0073 C4 six. **This epic did not run them**, because
the session it was built in was instructed not to invoke subagents. That is a real gap, and it is
recorded rather than glossed: the flip went ahead on the strength of the flag-on journey
(`apps/web/e2e-multi-select/`), the flag-off parity suites, the counting-stub draw-budget gate and
the full pre-push gate, all green.

**What that does and does not cover.** The journey drives the whole gesture against a real API with
the pen enforced, which is where the four defects §9 of the ADR records were found — so the
"lit but inert / one host and not its neighbour" class was exercised. What no gate here covers is
the reviewers' own lens: the accessibility pass over the bulk bar's shading and reason wiring beyond
the `aria-describedby` link asserted in `BulkSelectionBar.test.tsx`, the UX pass over the two
dialogs' copy and state coverage, and the component pass over `BulkSelectionBar` / `LinkChainDialog`
as reusable surfaces.

**The fix** is one review pass over the ADR-0080 diff (`10ceb5d..618563b` plus its predecessors) with
those four reviewers, folding blocking findings as its own slice. Rollback is available meanwhile:
`VITE_CANVAS_MULTI_SELECT=false` restores the singular selection byte-for-byte.

## #108 — The plural drag: model, command and endpoint landed; the gesture did not

**Found:** 2026-08-08, by the component review over the ADR-0080 diff.

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

**Status: open, narrowed.** The functional half is done and proven end to end. Dragging one of a
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

## #109 — `bulkDelete` cascades one activity at a time under the plan-wide advisory lock

**Found:** 2026-08-08, by the security review over the ADR-0080 diff (non-blocking, hardening).

`ActivitiesService.bulkDelete` loops `cascadeSoftDelete` once per id, each doing several
`updateMany`/`findMany` calls, **while holding `acquirePlanWriteLock`**. The sibling batch writes
(`updatePlacements`, `updateLanePositions`, `updateParents`) are single set-based `unnest`
statements. At the DTO's `@ArrayMaxSize(2000)` that is on the order of 10,000 queries with the
plan-wide lock held, so any Planner can lock out every other structural writer on that plan for the
duration. Not an authorisation defect — a self-service availability one.

This is the shape ADR-0053 M6 already fixed once, measuring **~830 ms → ~13 ms** for a 2,000-row
GROUP delete by batching the per-descendant advisory-lock loop into one `unnest`. Reintroduced here
because the cascade helper is per-entity by design.

**The fix** is either to batch the cascade's sweeps set-wise (the ADR-0053 M6 move, applied to
`HierarchyLifecycleService`), or to lower `bulk-delete`'s cap well below 2,000 — with the choice
made on a **measurement** at 500 / 2,000 rows rather than on instinct, since the catalogue's scale
plans make that cheap to take.

---

## 110. Milestone B (server-side duplicate endpoint) deferred, with the measurement attached

**Status:** open, deferred on a measured trigger · **Owner:** api · **Raised:** 2026-08-08 (W5 M2-T4)

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

## 113. Redo is unavailable after undoing a band copy **(CLOSED 2026-08-08)**

**Status:** open · **Owner:** api + web · **Raised:** 2026-08-08 (W5 M5, found by the flag-on journey)

Undoing a **band** copy deletes the cloned summary and lets the ADR-0038 cascade take its subtree,
because `bulkDelete` refuses any batch containing a `WBS_SUMMARY` by design (422
`SUMMARY_NOT_BULK_ELIGIBLE`) — a bulk delete is always leaf-only, "which is what makes its undo
honest". That is correct, and it works.

**Redo does not.** A cascade delete does assign a `delete_batch_id` server-side, so the rows are
restorable in principle — but `DELETE …/activities/:id` answers **204 with no body**, so the client
never learns the id and has nothing to hand `restoreDeleteBatch`. The command therefore leaves its
batch id null and `redo` is a no-op: the Redo affordance has nothing to offer, which is the honest
shape and better than a call that would fail. A flat copy is unaffected — it still undoes and redoes
through the batch as before.

**The fix is small and it is on the API side:** return the `deleteBatchId` in the delete response
(or a `204` → `200 { data: { deleteBatchId } }` change), and the existing client restore path works
unchanged. It is out of scope for a frontend-only epic.

**How it was found is the point.** The journey drove a real band copy against a real API with the
pen enforced, pressed Ctrl+Z, and read the product's own words back: "Couldn't undo just now. Please
try again." Every unit test passed throughout — a mocked delete accepts any batch, so nothing below
the network could see the refusal. It is the ADR-0060 M6 rule in a new costume: the guard that
matters is only testable against the thing that enforces it.

**Risk:** low. The undo works; only the reversal of the undo is missing, and the planner can copy
the band again.

### Closed 2026-08-08 — the route returns the id

`DELETE …/activities/:activityId` now answers **200 `{ deleteBatchId }`** instead of `204`. Nothing
about the delete itself changed: the cascade already assigned that id, and the only defect was that
the response threw it away. `pasteActivitiesCommand` keeps it and hands it to `restoreDeleteBatch`,
so a band copy's undo is reversible like every other command's.

Additive rather than breaking — existing callers ignore the body — but it **is** a public contract
change, so `docs/API.md` records it and says why this `DELETE` is not `204`: the caller genuinely
cannot derive the value, which is the test that section already applies.

The API e2e asserts the id is a real uuid **and then uses it** to restore what it deleted. A field
that is only asserted present is a field that can quietly stop being right.

---

## 114. Two menus still hide rather than shade, for want of a reason to show

**Status:** **114.1/114.2 closed 2026-08-09** (ADR-0083 M7 — `scheduleRefusal`); 114.3 open ·
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

---

## 115. The pen sentence names a button the reader cannot see when a peer holds the lock

> **Closed 2026-08-09** (ADR-0083 M7). `penReason(action, holder)` landed first for the activity
> editor; M7 routed the remaining eleven sites — nine on the TSLD toolbar, five on the selection
> bar (sharing one phrase) — through `scheduleRefusal`, which wraps it and adds the **role** branch
> this entry did not cover. The verb stayed per-site, because the nine never said the same thing:
> a shared constant could not have fixed it and a shared builder could.

**Status:** open · **Owner:** web · **Raised:** 2026-08-08 (found by the ADR-0082 journey step)

`deriveActivityEditorGating`'s `NO_PEN` sentence is **"Start editing to change this activity."**, and
the TSLD toolbar shades its pen-gated commands with the same form in eight places
(`tsld-toolbar-items.tsx:248,435,1824,1840,2197,2247,2281,2326`). That sentence is right in the
common case — the plan is open, nobody holds the pen, and **Start editing** is on screen.

It is **wrong when a peer holds the pen**, and the ADR-0082 journey step demonstrates it in one run
rather than by argument: in `e2e-edit/pen-handoff.spec.ts` the same page asserts, within a few lines
of each other, that B sees a **Request control** button (`New activity` is absent) and that B's row
menu explains the refusal with _"Start editing to change this activity."_ There is no **Start
editing** button on that screen. The reader is told to press something that is not there, and the
control that would actually help them — Request control — is not named.

**Why it was not fixed with ADR-0082.** The sentence is a year old and shared by nine call sites; the
row menu is the tenth consumer, not the origin. Fixing it means threading the held-by-other state
into the gate so it can pick between two sentences, then re-wording eight toolbar reasons in step —
which changes shipped copy across the whole canvas toolbar and deserves its own slice rather than
riding a primitive's accessibility fix. ADR-0060's own record warns against the other failure mode
here: an earlier draft invented _"Someone else is editing this plan. Take over the edit lock…"_,
which was **false** in the common case, so this must be a branch on real state and not a re-wording.

**The point ADR-0082 does close** is that both surfaces now say the _same_ thing, so this is one
sentence to correct rather than two mental models to reconcile.

**Risk:** low. A planner in this state has a lit **Request control** button in the chrome; the
sentence sends them looking for the wrong one first. Worth a slice, not urgent.

---

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
honest reason it is not fixed is that there is **no Tooltip primitive** in `components/ui/`, adding
one is an ADR-level decision (CLAUDE.md §5), and a one-off `title` is what ADR-0082 just removed.

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

**Half closed 2026-08-11**: `VITE_ACTIVITY_EDITOR_TABS` retired with ADR-0089; `VITE_CANVAS_WORKSPACE`
remains open with five harnesses left rather than seven.

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

## 119. The API e2e suite fails intermittently **(DIAGNOSED AND CLOSED 2026-08-10)**

> **It was never intermittent. It was order-dependent, and the order changed whenever a new e2e file
> was added.**
>
> Nine specs — `calendars`, `clients`, `invitations`, `me`, `members`, `organizations`, `plans`,
> `projects`, `recycle-bin` — began their `beforeEach` with `prisma.plan.deleteMany()` **without
> first deleting the activities and link rows that reference a plan**. Each therefore passed only
> when whichever spec ran before it happened to have left the tables empty. `vitest.e2e.config.ts`
> sets `fileParallelism: false` and every spec shares one database, so "whichever ran before" is
> decided by the file list — and adding `retention-sweep.e2e-spec.ts` was enough to reshuffle it.
>
> The failure then names a table the failing spec never touches
> (`Foreign key constraint violated on the constraint: activities_plan_id_fkey`), which is why it
> read as noise: the spec that breaks is not the spec that is wrong. Whole files fail at once —
> the shape this entry recorded as "a `beforeAll` failure" — because a broken `beforeEach` takes
> every test in the file with it.
>
> **What closed it was capturing the log instead of retrying**, which is the one instruction this
> entry asked for. The three earlier occurrences were each met with a re-run that passed and
> destroyed the evidence; the fourth was written to a file first and diagnosed in one read.
>
> The correct sweep order was already documented — in `activities.e2e-spec.ts`, whose comment
> claimed "the sibling specs already sweep in this order". Nine of them did not. That sentence is
> corrected in the same commit, because a comment asserting an invariant nine files violate is worse
> than no comment: it is the reason nobody checked.

### Original entry (2026-08-10, before the diagnosis)

## 119a. The API e2e suite fails intermittently, and the failure has never been captured

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

---

## 124. The selection bar's `<Toolbar>` has no fit coverage, and its failure mode is a different one

**Status:** open. Opened by ADR-0090 M1.

`apps/web/e2e-toolbar-fit/` gates the two persistent command rows: at every targeted width, every
control is a ≥ 24 px target that a pointer can actually land on. `selection-actions.tsx:395` mounts a
**third** `<Toolbar>` on the identical `measure()` / `computeOverflow` path, so M1's repair reaches it
by construction — there is one primitive and this consumer instantiates it, which is why this is a
coverage gap rather than a correctness one.

**But the gate's assertions would be meaningless about it.** The floating bar shrink-wraps to its
content and is clamped to the **viewport** (`:358-361`), not to a container it can overflow. It
cannot fail S1/S2/S4 because there is nothing for it to overflow; what it _can_ do is run off a
viewport edge, which none of those assertions describe. Post-M2 it may carry 8–9
`showLabel: 'always'` items with entry-route + WBS + copy-paste flags on, so the question is real.

**A test for it was written during M1 and removed.** It located the bar by a guessed accessible name
(`/selection|selected/i`), matched nothing, and `test.skip`ped — reporting success for never having
run, which is worse than no coverage because it looks like coverage. The bar's real name is built
from its target (`Actions for <activity>`), and it mounts from a canvas selection rather than a table
click, so exercising it needs a canvas gesture the fit gate has no other reason to perform.

**What to do:** cover it when M3 does the responsive/touch work, where viewport-edge behaviour is the
subject anyway, and assert the thing that can actually go wrong — that the bar stays fully inside the
viewport at 960 and 768 with its widest plausible item set. Raised by `component-reviewer` during the
ADR-0090 pre-approval pass as a suggestion, and recorded rather than silently left out of scope.

## 125. `View ▾` holds one toggle that ejects you from it

**Raised:** 2026-08-11 (ADR-0090 M2-T2) · **Size:** S · **Owner:** the M5 gate pass

`resource-view` moved from Row 1 into the `View ▾` popover. Revealing the resource strip moves
focus into the strip (ADR-0049, deliberate — a revealed panel should receive focus), which from a
Row-1 button was unremarkable and from inside an open popover means the planner is ejected from the
surface they were still using. Every other member of `View ▾` leaves the popover open, so this one
behaves unlike its neighbours in a list that invites toggling several things at once.

Recorded rather than fixed mid-relocation, because the fix is a judgement between two defensible
behaviours (keep the popover open and lose the panel's focus move, or keep the focus move and
accept the eject) and it belongs with the specialist reviews at M5. Observed, not inferred:
`e2e-resource-view/resource-view.spec.ts` asserts the focus move immediately after the toggle, and
its comment records why the assertion sits exactly there.
