/**
 * The organisation-landing fixture, and the control that refuses to let it be measured empty.
 *
 * **Why this is a module and not a function inside `shoot.mjs`.** Two harnesses need this fixture —
 * the screenshot harness, so a reviewer looks at a page that has something to say, and
 * `measure-overview.mjs`, so FC-1 and FC-4 are graded on one. Every measurement harness in this
 * repository seeds its own fixture through the public REST API, so the obvious move is to write the
 * seed twice. That is the failure ADR-0065 and ADR-0121 both record: two implementations of one
 * rule drift, and **the drift is invisible**, because each looks right alone and only somebody
 * comparing a photograph against a measurement taken the same week would ever see that they were
 * of different plans. One seed, two callers.
 *
 * **What it bypasses** (ADR-0081): everything here is created through the public REST API from
 * inside the page — the same writes a planner makes — with ONE departure, called out at its own
 * call site: ageing an invitation past `expiresAt` is done with a direct `UPDATE`, because
 * `INVITATION_TTL_MS` is seven days (`invitations.service.ts:27`) and the API has no way to mint an
 * expired one. A harness that cannot produce a state cannot measure it, and the alternative —
 * leaving the expired case out — is how the fixture ends up unable to exhibit the very distinction
 * CQ-2 asked for.
 */
import { psql } from './local-psql.mjs';

/**
 * A UUID, or this throws before anything reaches a command line.
 *
 * `psql -c` takes no bind parameters, so the id below is interpolated — and an id that is not a
 * UUID has no business being interpolated into SQL whatever its provenance. The ids here come from
 * the harness's own REST calls, so this is not expected to fire; it is here because "the caller
 * would never" is the assumption every injection is built on, and because the alternative is a
 * string of unknown shape reaching `psql`.
 */
function assertUuid(value, what) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value))) {
    throw new Error(`${what} is not a UUID: ${JSON.stringify(value)}`);
  }
  return String(value);
}
/**
 * The states the organisation landing can report — one plan in each.
 *
 * **Separate from `seed()` on purpose, and the separation is the point.** That function builds the
 * canvas fixture a dozen diagram shots are taken of, sized activity by activity for criticality
 * bands, float tails and lane packing; its docblock records two occasions where changing it
 * photographed something other than what the shot was named for. Nothing here touches it. This adds
 * plans **beside** it, in their own project, so a landing-page fixture cannot silently re-frame a
 * diagram.
 *
 * **Why a fixture at all** (spec §0.7): the shipped `org-home` seed (`shoot.mjs:199-228`) is one
 * client, one project and THREE plans of one activity each, **none of them recalculated** — so it
 * cannot exhibit a single state this epic adds, and the one state it does hold ("never calculated")
 * it holds for every plan it has. That last part is why the control below names specific ids: a
 * predicate like "some plan has never been calculated" is true of the OLD fixture. So a
 * verdict taken on it would be a verdict about a page with nothing to say — which this repository
 * has recorded producing three times (ADR-0097 Landing C's `PROCEED` from an `undefined`, ADR-0066's
 * 4.6 ms that measured the cull, `measure-staff.mjs` reporting `FC-1: 0 of 5` from the sign-in
 * page).
 *
 * **The states are enumerated from the spec's own table (§5.2), not from what photographs well.**
 * Each plan's comment says which row of that table it is, because a fixture nobody can map back to
 * its requirement becomes the design target within a milestone.
 *
 * Returns the ids the non-vacuity control needs to assert each state **positively** — the
 * ADR-0143 §11 lesson, where a control written to stop an assertion being judged over an empty set
 * was itself satisfiable by conditions carrying no information.
 */
export async function seedLandingStates(page, slug) {
  return page.evaluate(async (org) => {
    const call = async (method, path, body) => {
      const response = await fetch(`/api/v1/organizations/${org}${path}`, {
        method,
        credentials: 'include',
        ...(body === undefined
          ? {}
          : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      });
      if (!response.ok)
        throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
      return response.status === 204 ? null : (await response.json()).data;
    };
    const post = (path, body) => call('POST', path, body ?? {});
    const patch = (path, body) => call('PATCH', path, body);

    const client = await post('/clients', { name: 'Harbourside Estates' });
    const project = await post(`/clients/${client.id}/projects`, { name: 'Dockside Regeneration' });

    /** A plan with `count` chained activities, recalculated unless `calculate` is false. */
    const makePlan = async (
      name,
      { activities = 3, calculate = true, plannedStart = '2026-02-02' } = {},
    ) => {
      const plan = await post(`/projects/${project.id}/plans`, { name, plannedStart });
      await post(`/plans/${plan.id}/edit-lock`, {});
      const made = [];
      for (let i = 0; i < activities; i += 1) {
        made.push(
          await post(`/plans/${plan.id}/activities`, {
            name: `Work package ${String(i + 1)}`,
            code: `W${String(1000 + i * 10)}`,
            durationDays: 5,
          }),
        );
      }
      for (let i = 1; i < made.length; i += 1) {
        await post(`/plans/${plan.id}/dependencies`, {
          predecessorId: made[i - 1].id,
          successorId: made[i].id,
        });
      }
      if (calculate) await post(`/plans/${plan.id}/schedule/recalculate`, {});
      return { plan, activities: made };
    };

    // §5.2 row 1 — calculated, current, active baseline, FINISHING LATER than it. The baseline is
    // captured first and the plan lengthened afterwards, so the movement is real rather than
    // written into the snapshot.
    const late = await makePlan('Dockside — Quay Wall Reconstruction');
    await post(`/plans/${late.plan.id}/baselines`, { name: 'Contract award' });
    await patch(`/activities/${late.activities[0].id}`, {
      durationDays: 25,
      version: late.activities[0].version,
    });
    await post(`/plans/${late.plan.id}/schedule/recalculate`, {});

    // §5.2 row 5 — calculated, baseline, UNCHANGED against it. The pair to row 1: without it the
    // section could report every baselined plan as moved and still look right.
    const onPlan = await makePlan('Dockside — Lock Gate Refurbishment');
    await post(`/plans/${onPlan.plan.id}/baselines`, { name: 'Contract award' });

    // §5.2 row 2 — calculated, then EDITED SINCE, and no baseline. The edit lands after the
    // recalculation, which is what makes `updated_at > schedule_computed_at` true.
    const stale = await makePlan('Dockside — Pontoon Replacement');
    await patch(`/activities/${stale.activities[0].id}`, {
      durationDays: 9,
      version: stale.activities[0].version,
    });

    // §5.2 row 3 — NEVER calculated. `schedule_computed_at IS NULL` is a different fact from
    // "calculated and then edited", and the two are easy to render identically.
    const never = await makePlan('Dockside — Dry Dock Enabling Works', { calculate: false });

    // §5.2 row 4 — carries a CONSTRAINT VIOLATION. A mandatory start before the network's own
    // earliest breaks logic by design (ADR-0035 §7), which is exactly the flag the section reports.
    const violating = await makePlan('Dockside — Berth 4 Deepening');
    await patch(`/activities/${violating.activities[2].id}`, {
      constraintType: 'MANDATORY_START',
      constraintDate: '2026-02-02',
      version: violating.activities[2].version,
    });
    await post(`/plans/${violating.plan.id}/schedule/recalculate`, {});

    // §5.2 row 6 — NO ACTIVITIES. Distinct from "never calculated": there is nothing to calculate.
    const empty = await post(`/projects/${project.id}/plans`, {
      name: 'Dockside — Phase 2 (not started)',
      plannedStart: '2026-09-01',
    });

    // Filler, so the section's cap is exceeded and its "showing N of M" line renders at all. Plans
    // rather than activities: the cap is on plans, and activities would cost seeding time for a
    // number nothing reads.
    const filler = [];
    for (let i = 0; i < 6; i += 1) {
      filler.push(
        await post(`/projects/${project.id}/plans`, {
          name: `Dockside — Ancillary works ${String(i + 1)}`,
          plannedStart: '2026-03-02',
        }),
      );
    }

    // Two invitations, because the count the product owner queried ("1 invitation pending", and
    // the Members page showing only themselves) cannot be reasoned about from one. They carry
    // DIFFERENT addresses of necessity: `uq_invitations_org_email_pending` is unique on
    // (organisation, email) where the status is PENDING, so a second invitation to one address is
    // a 409 rather than a second row.
    //
    // Both are created live. The second is aged below, OUTSIDE the browser — see the caller.
    const liveInvite = await post('/invitations', {
      email: 'priya.raman@harbourside.example',
      role: 'PLANNER',
    });
    const expiringInvite = await post('/invitations', {
      email: 'tom.oyelaran@harbourside.example',
      role: 'CONTRIBUTOR',
    });

    return {
      projectId: project.id,
      late: late.plan.id,
      onPlan: onPlan.plan.id,
      stale: stale.plan.id,
      never: never.plan.id,
      violating: violating.plan.id,
      empty: empty.id,
      filler: filler.map((p) => p.id),
      liveInvite: liveInvite.id,
      expiredInvite: expiringInvite.id,
    };
  }, slug);
}

/**
 * Ages one invitation past `expiresAt`, and this is the fixture's ONE departure from the public API.
 *
 * `INVITATION_TTL_MS` is seven days (`apps/api/src/modules/invitations/invitations.service.ts:27`)
 * and nothing in the request body can move it, so an expired invitation is unreachable through the
 * product. It is written directly instead, and the row is left `PENDING` — which is not a
 * contrivance but **the state the defect lives in**: `findManyPendingByOrg`
 * (`invitation.repository.ts:48-54`) filters on `status: 'PENDING'` and never reads `expires_at`,
 * so an invitation that `accept()` will refuse with "This invitation has expired."
 * (`invitations.service.ts:217-219`) is still counted and still listed. Producing it by setting
 * `status` to something else would give the fixture a state the product cannot reach and would
 * measure the wrong thing.
 *
 * It fails loudly. A harness whose fixture half-applied is worse than one that did not run, because
 * the measurement still prints a number.
 */
export function expireInvitation(invitationId) {
  const id = assertUuid(invitationId, 'expireInvitation: invitationId');
  const sql = `UPDATE invitations SET expires_at = now() - interval '2 days' WHERE id = '${id}'`;
  const out = psql(sql, { flag: '-c' });
  // `psql` exits 0 for an UPDATE that matched nothing, so the row count is read rather than the
  // status. A fixture that silently aged no invitation is exactly the empty measurement this
  // module's control exists to refuse.
  if (!/UPDATE 1/.test(out)) {
    throw new Error(`expireInvitation: expected "UPDATE 1", got ${JSON.stringify(out.trim())}`);
  }
}

/**
 * The non-vacuity control (M0-T2): every state in spec §5.2 is present, or this throws naming the
 * ones that are not.
 *
 * **Why it asks the database and not the product.** Its subject is the FIXTURE, not the page — it
 * runs *before* any measurement precisely so a verdict cannot be taken on a page with nothing to
 * say. Asking the API would make the control depend on the very endpoints M2–M4 add, so it would
 * fail for the whole epic and then start passing for reasons that have nothing to do with whether
 * the fixture holds the state. Two of these states are not observable through any endpoint today at
 * all: `plans.schedule_computed_at` reaches no DTO (checked — it appears nowhere in
 * `overview-response.dto.ts` or `plan-response.dto.ts`), which is exactly why M2 has a field to
 * add.
 *
 * **Every assertion names a SPECIFIC seeded id.** ADR-0143 §11 recorded a control written to stop
 * an assertion being judged over an empty set, which was itself satisfiable by conditions carrying
 * no information; a predicate like "some plan has no activities" is true of almost any database,
 * and would report a healthy fixture while the six states it exists to guarantee were absent.
 *
 * It reports EVERY absence rather than the first, because a control that stops at one turns a
 * single run into six.
 */
export function assertLandingStates(ids) {
  const q = (sql) => psql(sql).trim();
  const one = (sql) => q(sql) === 't';

  const checks = [
    [
      '§5.2 row 1 — a calculated plan whose finish moved LATER than its active baseline',
      () =>
        one(`SELECT EXISTS (
          SELECT 1 FROM baselines b
          WHERE b.plan_id = '${ids.late}' AND b.is_active AND b.deleted_at IS NULL
            AND (SELECT max(a.early_finish) FROM activities a
                 WHERE a.plan_id = b.plan_id AND a.deleted_at IS NULL)
              > (SELECT max(ba.baseline_finish) FROM baseline_activities ba
                 WHERE ba.baseline_id = b.id AND ba.deleted_at IS NULL))`),
    ],
    [
      '§5.2 row 5 — a calculated plan with an active baseline it has NOT moved against',
      () =>
        one(`SELECT EXISTS (
          SELECT 1 FROM baselines b
          WHERE b.plan_id = '${ids.onPlan}' AND b.is_active AND b.deleted_at IS NULL
            AND (SELECT max(a.early_finish) FROM activities a
                 WHERE a.plan_id = b.plan_id AND a.deleted_at IS NULL)
              = (SELECT max(ba.baseline_finish) FROM baseline_activities ba
                 WHERE ba.baseline_id = b.id AND ba.deleted_at IS NULL))`),
    ],
    [
      '§5.2 row 2 — a plan EDITED SINCE it was calculated',
      () =>
        one(`SELECT EXISTS (
          SELECT 1 FROM plans p
          WHERE p.id = '${ids.stale}' AND p.deleted_at IS NULL
            AND p.schedule_computed_at IS NOT NULL
            AND (SELECT max(a.updated_at) FROM activities a
                 WHERE a.plan_id = p.id AND a.deleted_at IS NULL) > p.schedule_computed_at)`),
    ],
    [
      '§5.2 row 3 — a plan with activities that has NEVER been calculated',
      () =>
        one(`SELECT EXISTS (
          SELECT 1 FROM plans p
          WHERE p.id = '${ids.never}' AND p.deleted_at IS NULL
            AND p.schedule_computed_at IS NULL
            AND EXISTS (SELECT 1 FROM activities a
                        WHERE a.plan_id = p.id AND a.deleted_at IS NULL))`),
    ],
    [
      '§5.2 row 4 — a plan carrying a CONSTRAINT VIOLATION the engine flagged',
      () =>
        one(`SELECT EXISTS (
          SELECT 1 FROM activities a
          WHERE a.plan_id = '${ids.violating}' AND a.deleted_at IS NULL AND a.constraint_violated)`),
    ],
    [
      '§5.2 row 6 — a plan with NO ACTIVITIES',
      () =>
        one(`SELECT NOT EXISTS (
          SELECT 1 FROM activities a
          WHERE a.plan_id = '${ids.empty}' AND a.deleted_at IS NULL)`),
    ],
    [
      'one LIVE invitation (pending, not yet expired)',
      () =>
        one(`SELECT EXISTS (
          SELECT 1 FROM invitations i
          WHERE i.id = '${ids.liveInvite}' AND i.deleted_at IS NULL
            AND i.status = 'PENDING' AND i.expires_at > now())`),
    ],
    [
      'one EXPIRED invitation — still PENDING, which is the defect CQ-2 is about',
      () =>
        one(`SELECT EXISTS (
          SELECT 1 FROM invitations i
          WHERE i.id = '${ids.expiredInvite}' AND i.deleted_at IS NULL
            AND i.status = 'PENDING' AND i.expires_at < now())`),
    ],
    [
      'more plans in the project than the section cap of 8, so "showing N of M" renders at all',
      () =>
        Number(
          q(`SELECT count(*) FROM plans p
             WHERE p.project_id = '${ids.projectId}' AND p.deleted_at IS NULL`),
        ) > 8,
    ],
  ];

  const missing = [];
  for (const [what, holds] of checks) {
    let ok = false;
    try {
      ok = holds();
    } catch (error) {
      missing.push(`${what} — the check itself failed: ${String(error)}`);
      continue;
    }
    if (!ok) missing.push(what);
  }

  if (missing.length > 0) {
    throw new Error(
      `The landing fixture cannot exhibit ${String(missing.length)} of ${String(checks.length)} states, so nothing measured against it means anything:\n` +
        missing.map((m) => `  - ABSENT: ${m}`).join('\n'),
    );
  }
  return { checked: checks.length };
}
