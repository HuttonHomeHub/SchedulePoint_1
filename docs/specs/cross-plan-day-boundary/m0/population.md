# M0-T2: the population on the seed catalogue

- **Status:** Measured 2026-09-26 on a freshly seeded local database.
- **Finding: the seed catalogue holds no cross-plan links, and structurally cannot.** Every count the
  plan asked for is therefore zero. The deployed population arrives with M3's boot log
  (`schedule.xplan_rederived`, `pending`), which needs no new surface (plan M0-T2 risk note).

## The counts

| Count (plan M0-T2)                                                     | Value |
| ---------------------------------------------------------------------- | ----- |
| Cross-plan links, all rows (soft-deleted included)                     | 0     |
| Cross-plan links, active                                               | 0     |
| … by type, lag sign, lag calendar and resolved factor                  | none  |
| … touching a Level of Effort or a WBS summary                          | 0     |
| … in the "late"/"tight" cells of spec §4.2                             | 0     |
| Upstream activities (a cross-plan predecessor) with a sub-day duration | 0     |

Context, from the same database, so the zero is not mistaken for an empty seed:

| Quantity                                                               | Value |
| ---------------------------------------------------------------------- | ----- |
| Plans seeded                                                           | 22    |
| Live activities                                                        | 344   |
| Activities carrying a hand-entered M1 external date (ADR-0043)         | 14    |
| Activities whose duration is not a whole number of their calendar days | 12    |

So the catalogue does exercise the M1 external seam the derivation writes into (14 activities, the
`capability-external-*` plans), and it does hold sub-day durations (12) — just never at the end of a
cross-plan link.

## Why it is zero by construction, not by chance

- A `SeedSpec` is **one plan** (`packages/seed/src/spec.ts`), and its schema has no cross-plan field.
- The seeder is an ordinary REST client that never calls the cross-plan route:
  `grep -rn -i "cross.\?plan" packages/seed/src packages/seed-http/src apps/seed-cli/src` returns no
  lines.

So no tier (fixture, capability, reference, scale, negative) can create a cross-plan link, and the
§4.2 "rare cells" question ("Those cells are rare … M0-T2 counts them") cannot be answered from the
catalogue. `red-run.md` finding 1 records why that matters: on a working-week calendar with leads or
FF/SF links, today's code is pessimistic in many more cells than §4.2 names, so "rare" is a claim
about real programmes that only the deployed population can settle.

## How it was produced

An isolated database, so the shared `app_test` database the e2e suites use was not touched (it held
2 cross-plan links left by earlier e2e runs, which are test residue and not the catalogue). All from
the repository root unless noted.

```sh
# 1. Postgres up (the e2e script's --db-only path), then a separate database, migrated.
SP_E2E_LOG= scripts/e2e-local.sh --db-only
cd apps/api
DATABASE_URL="postgresql://app:app@localhost:5432/app_m0_xplan_seed?schema=public" \
  npx prisma migrate deploy            # 70 migrations; Prisma creates the database
npx nest build

# 2. The real API on its own port, against that database.
NODE_ENV=development PORT=3311 API_PORT=3311 \
  DATABASE_URL="postgresql://app:app@localhost:5432/app_m0_xplan_seed?schema=public" \
  BETTER_AUTH_SECRET=local-m0-seed-secret-at-least-32-characters-long \
  BETTER_AUTH_URL=http://localhost:3311 AUTH_REQUIRE_EMAIL_VERIFICATION=false \
  RETENTION_SWEEP_ENABLED=false RATE_LIMIT_LIMIT=1000000 LOG_LEVEL=warn node dist/main.js

# 3. A user, an organisation, a client and a project, through the public API (curl, Origin set):
#    POST /api/auth/sign-up/email, POST /api/v1/organizations,
#    POST /api/v1/organizations/m0-cross-plan-seed/clients,
#    POST /api/v1/organizations/m0-cross-plan-seed/clients/<client>/projects

# 4. The catalogue, over the public API (ADR-0066).
cd apps/seed-cli
./node_modules/.bin/tsx src/main.ts --url http://localhost:3311 --org m0-cross-plan-seed \
  --project <project-id> --email m0-seeder@example.com --password '…' --tier all

# 5. The counts.
PGPASSWORD=app psql -h localhost -U app -d app_m0_xplan_seed \
  -c "select count(*), count(*) filter (where deleted_at is null) from cross_plan_dependencies;" \
  -c "select type, sign(lag_minutes), lag_calendar, count(*) from cross_plan_dependencies group by 1,2,3;" \
  -c "select count(*) from activities where deleted_at is null
        and (external_early_start is not null or external_late_finish is not null);" \
  -c "select count(*) filter (where a.duration_minutes % coalesce(c.hours_per_day_minutes, 1440) <> 0),
             count(*)
        from activities a join plans p on p.id = a.plan_id
        left join calendars c on c.id = coalesce(a.calendar_id, p.calendar_id)
       where a.deleted_at is null and p.deleted_at is null;"
```

`--tier all` seeds the fixture, every capability plan and the reference plan. It deliberately omits
the **scale** tier ("thousands of requests and tens of minutes", `apps/seed-cli/src/specs.ts`), and
the **negative** tier creates throwaway host plans for hostile writes rather than a catalogue. Neither
was seeded: both are built from `SeedSpec`s or single writes that the grep above shows never touch
the cross-plan route, so seeding them could only add zeros.

The sub-day count resolves each activity's calendar as its own, else its plan's, else the 1440-minute
default; it does not follow a `RESOURCE_DEPENDENT` activity to its driving resource's calendar. It is
context, not one of the plan's counts, so the approximation is stated rather than refined.

**Two seeder findings were reported during the run and are out of scope here**, recorded so they are
not rediscovered as new: `UNKNOWN on resource — Cannot read properties of undefined (reading 'data')`
in `capability-resources`, and `409 DUPLICATE_CALENDAR` in `reference-netpoint-power-plant`, the
latter because `--tier all` seeds every tier into one project and two tiers name a calendar alike.
