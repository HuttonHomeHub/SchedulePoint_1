# M2 measurement: the plan-loading probe, verified against the defect it names

- **Task:** M2-T3 of [`implementation-plan.md`](./implementation-plan.md) (the plan names this file
  `m2-verification.md`; the brief that dispatched the work named it `m2-measurement.md`, and this is the one that exists).
- **Subject:** `docs/TECH_DEBT.md` #433 and the **Measure plan loading** control (`/staff` → Performance).
- **Date:** 2026-10-06.
- **What this is not:** the live reading. That is M3-T1, taken by the product owner on the deployed host. Nothing
  below says anything about Cloudflare, Nginx Proxy Manager or HTTP/2.

## Method

One browser, one machine, the same probe, two servers over the same `dist/`.

- **Machine:** Linux 6.18.44 x86_64, 4 vCPU container; Node v22.22.0.
- **Browser:** the container's Chromium **141.0.7390.37**, driven by Playwright. Playwright's `Desktop Chrome`
  descriptor overrides the user agent, so the probe's own header line reads `Chrome 153`; that is the string the
  browser sent, not its engine. Both are recorded because a reading's browser line is read from the user agent.
- **Build:** `pnpm exec vite build` in `apps/web` (web 0.170.4, production, API 0.87.1 from `nest start`).
- **Server A, the defect present:** `pnpm exec vite preview --port 4173`. `curl -I` on a hashed chunk:
  `Cache-Control: no-cache`, `ETag: W/"…"`, and `If-None-Match` with that tag answers `304 Not Modified`
  (checked with `curl -sI -H "If-None-Match: …"`).
- **Server B, the defect absent:** nginx **1.24.0** (Ubuntu package, not the image's `nginx:1.31-alpine`), serving a copy
  of the same `dist/` through `apps/web/nginx.conf` rendered as the image renders it (the three `CSP_*` values
  substituted, `listen` moved to 4174, the `api:3000` upstream pointed at the local API, `user root` so the worker could
  read the scratch directory). `curl -I` on a hashed chunk: `Cache-Control: max-age=31536000` then
  `Cache-Control: public, immutable` (two header lines; the browser joins them).
  **The Docker image itself was not run:** the container has no Docker daemon. The template was run; the image's
  nginx build and base were not.
- **Press:** a signed-in staff account (`ops@schedulepoint.test`, allowlisted through `STAFF_EMAILS`) pressed
  **Measure plan loading**, confirmed, and waited for the result. Each run is one press on an origin whose plan chunks had
  already been fetched by the sign-in flow's idle warm-up.
- **Scripts:** throw-away Playwright specs in an untracked directory (a sign-in, one press, `clipboard.readText()`).
  They are not part of the change. The committed journey is `e2e-staff/staff.spec.ts` ("a staff member measures plan
  loading in one press"), which runs on the development server and asserts consistency, not content.

## Readings

Both servers, Chromium 141, same origin-warm state. "To network" is revalidated plus downloaded.

| Limb                           | A: `vite preview` (`no-cache`) | B: nginx template (`public, immutable`)                |
| ------------------------------ | ------------------------------ | ------------------------------------------------------ |
| Reload: files observed         | 11                             | 11                                                     |
| Reload: to network             | **11** (11 revalidated)        | **0** (11 from cache)                                  |
| Revisit: files observed        | 11                             | 11                                                     |
| Revisit: to network            | **11** (11 revalidated)        | **0** (11 from cache)                                  |
| From the network: downloaded   | 11 of 11                       | 11 of 11                                               |
| Protocol of those that went    | `http/1.1`                     | `http/1.1` (network limb only)                         |
| `Cache-Control` read by `HEAD` | `no-cache (immutable: no)`     | `max-age=31536000, public, immutable (immutable: yes)` |

So the probe discriminates both ways: where the defect is present every plan chunk goes to the network on a reload and on
a revisit, and where it is absent none does. The `from the network` limb is the same on both, as it should be: it is
`no-store`, so it says what the files cost with nothing cached, not anything about the server's caching.

Files observed on B's revisit page, from `performance.getEntriesByType('resource')`: `theme-boot.js`, `index-*.js`,
`rolldown-runtime-*.js`, `staff-*.js`, `ui-shared-*.js`, `device-*.js`, `paint-*.js`, `run-loading-probe-*.js`,
`authed-layout-*.js`, `plan-detail-*.js`, `share-*.js`. The count therefore includes the staff chunk's own files and the
probe's runner, not only the plan screen's. That is the spec's "plan-screen and entry code files", and it means the
deciding number is "how many of N went to the network" rather than a bare count.

## What verification found: the first classifier was wrong

The first version of `classifyEntry` followed the spec's order: `transferSize === 0` is cache; `responseStatus === 304` is
revalidated; otherwise, with a transfer, **downloaded**. Against server A it reported **11 downloaded, 0 revalidated** on
both limbs, which reads as "this server re-downloads every file" for a server that revalidates every file.

The raw entries show why (Chromium 141, `vite preview`, `performance.getEntriesByType('resource')`, columns
`transferSize | encodedBodySize | decodedBodySize | responseStatus`):

| Load                                   | `staff-*.js`                    | `index-*.js`                                              |
| -------------------------------------- | ------------------------------- | --------------------------------------------------------- |
| First load, file not yet cached        | 31572 \| 31272 \| 100002 \| 200 | 300 \| 0 \| 0 \| 200 (already cached by the sign-in page) |
| Reload and revisit, server answers 304 | **300 \| 0 \| 0 \| 200**        | **300 \| 0 \| 0 \| 200**                                  |

A revalidated file is reported with the headers' ~300 bytes as `transferSize`, **no body at all**, and **`responseStatus` 200**
(the merged response), never 304. So a probe that trusts an exposed status calls it downloaded. The fix reads "network bytes
and no body" as a revalidation, labelled as inferred from sizes, and keeps `responseStatus === 304` as sufficient evidence
for the browsers that do report it. A downloaded file has a body, so the two cannot be confused except by an empty file.

**Red first.** `classify.test.ts` "reads Chromium's revalidation (headers only, no body, status 200) as revalidated" fails
against the first version (it returns `downloaded`) and passes against the second. The unit tier could not have found it:
the spec's synthetic timings encoded the same belief about what a 304 looks like.

**The spec's §2 classification table is therefore wrong in one row** and should be corrected when M3-T1 records the live
reading: a 304 is not recognised by `responseStatus === 304` in Chromium.

## A second finding: the reload limb needs a primed browser

A browser that has never opened the plan screen has nothing cached to reload. The probe fetches the plan chunks itself after the
reload, so on a cold origin the first fetch of those chunks is the reload limb's and it reads "downloaded" whatever the server's
headers say. In these runs the plan chunks were warm because signing in runs `warmHierarchyScreens`. The section and the
copied block now say: open a plan in this browser before measuring. The revisit limb always has the files to reuse. M3-T1's
ask to the product owner should carry the same sentence.

## Not established

- **HTTP/2 and HTTP/3.** Both servers here speak `http/1.1`, so the protocol line is exercised but only ever reads `http/1.1`.
  Whether the live chain negotiates `h2` is exactly M3-T1's reading.
- **Other browsers.** Firefox and Safari expose `responseStatus` and `transferSize` differently. The classifier's no-status branch
  and the "not exposed" outputs are unit-tested against synthetic entries and have not met a real Firefox or WebKit.
- **The image's nginx and the live proxies.** The template was verified on nginx 1.24.0, not on `nginx:1.31-alpine`, and not behind
  Cloudflare or Nginx Proxy Manager, either of which could rewrite `Cache-Control`. The probe reads the header **after** every hop,
  which is the point; this run could not put those hops in front of it.
- **The development-server journey** (`e2e-staff`) asserts that all three limbs are taken and that the four counts add up to the
  files observed. It says nothing about what the development server's caching returns.

## Found on the way: the `/assets/` header inheritance (#457)

With the template running, `curl -I` on a hashed chunk, `/theme-boot.js` and `/favicon.svg` returned `Cache-Control` and **none** of
the server-level headers (`X-Content-Type-Options`, `Cross-Origin-Resource-Policy`, `Cross-Origin-Opener-Policy`, `X-Frame-Options`,
`Referrer-Policy`, `Permissions-Policy`, the CSP header, `Reporting-Endpoints`), while `/` and `/index.html` carried all of them. That is the
`add_header` inheritance rule the file's own comment records, applied to the three locations that use `add_header`. Filed as
`docs/TECH_DEBT.md` #457; not fixed here.
