import type { Type } from '@nestjs/common';
import type { AuditAction } from '@repo/types';
import { describe, expect, it, vi } from 'vitest';

// `vi.hoisted` runs BEFORE the imports below, which is the only place this can go: importing
// `AppModule` evaluates `ConfigModule.forRoot({ validate })`, and that validator throws on a
// missing `DATABASE_URL` at module-evaluation time — before any `beforeAll` could run.
//
// This spec reads decorator metadata and never opens a connection, so a placeholder is honest
// rather than a workaround. It is here because the omission cost a CI round: a developer machine
// has `apps/api/.env`, CI does not, so the suite passed locally and the run exited non-zero in CI
// on an unhandled rejection while reporting every test as passed. `??=` so a real environment
// (the e2e config, a developer running one file) still wins.
vi.hoisted(() => {
  process.env.DATABASE_URL ??= 'postgresql://census:census@localhost:5432/census?schema=public';
  process.env.BETTER_AUTH_SECRET ??= 'structural-census-secret-at-least-32-chars';
});

import { AppModule } from '../../app.module';

/**
 * The route census — every HTTP route in the API is either **audited** or **explicitly not**, with
 * a named reason, and the two sets must together be exactly the routes that exist.
 *
 * **Why this gate exists.** ADR-0072's failure mode is silence: a route that should record and
 * does not looks identical to a route where nothing happened. No test of any producer can catch
 * an action nobody wired, because there is nothing to assert against. The only thing that can is
 * a census that fails when a route appears in neither list — which makes "does this audit?" a
 * decision someone makes rather than one they forget to make. It is the same shape as the
 * ADR-0072 redactor's allow-list, applied to routes instead of fields.
 *
 * **The routes are read from the real module graph, not from a hand-written list.** It walks
 * `AppModule`'s `imports`/`controllers` metadata and reads Nest's own `path`/`method` decorators,
 * so it cannot drift from what the app actually serves. A hand-maintained list would be a second
 * copy of the truth, and the drift would be invisible in exactly the direction that matters.
 *
 * Walking the module graph rather than globbing `*.controller.ts` is deliberate: a controller file
 * that exists but is registered in no module serves nothing, and a glob would demand a decision
 * about a route that cannot be reached.
 *
 * **The plan for this epic said 67 routes. There are 116.** Recorded here rather than quietly
 * corrected, because it is the ADR-0058 rule landing on the work that cites it: verify the claim,
 * do not trust the document.
 *
 * **The eight authentication events are NOT in this census** and cannot be: Better Auth is mounted
 * as a raw Node handler outside Nest (ADR-0003), so its endpoints have no controller metadata to
 * reflect over. Their coverage is proven by `auth-audit.spec.ts` and the e2e suite instead.
 */

/** Every route that records at least one event, and which events it records. */
const AUDITED_ROUTES: Record<string, readonly AuditAction[]> = {
  // The staff console (ADR-0086 D5). A READ, and audited — which inverts the ordinary rule
  // deliberately: on this surface the read IS the privileged act, so applying the usual
  // "reads earn nothing" test would audit the entire console at nothing at all. Pinned by the
  // seventh assertion below, which derives from the path rather than from this list, so a staff
  // route added later is covered the day it is written.
  'GET /api/v1/staff/me': ['staff.session_started'],
  'GET /api/v1/staff/health': ['staff.panel_read'],
  'GET /api/v1/staff/csp-reports': ['staff.panel_read'],
  'GET /api/v1/staff/installation': ['staff.panel_read'],
  'GET /api/v1/staff/accounts': ['staff.panel_read'],
  'GET /api/v1/staff/activity': ['staff.panel_read'],
  'DELETE /api/v1/organizations/:orgSlug/clients/:clientId': ['client.deleted'],
  'DELETE /api/v1/organizations/:orgSlug/invitations/:invitationId': ['invitation.revoked'],
  'DELETE /api/v1/organizations/:orgSlug/members/:memberId': ['member.removed'],
  'DELETE /api/v1/organizations/:orgSlug/plans/:planId': ['plan.deleted'],
  'DELETE /api/v1/organizations/:orgSlug/projects/:projectId': ['project.deleted'],
  'PATCH /api/v1/organizations/:orgSlug/members/:memberId': ['member.role_changed'],
  'POST /api/v1/invitations/accept': ['invitation.accepted', 'member.joined'],
  'POST /api/v1/organizations': ['organization.created', 'member.joined'],
  'POST /api/v1/organizations/:orgSlug/clients/:clientId/restore': ['client.restored'],
  'POST /api/v1/organizations/:orgSlug/invitations': ['invitation.created'],
  'POST /api/v1/organizations/:orgSlug/plans/:planId/restore': ['plan.restored'],
  'POST /api/v1/organizations/:orgSlug/plans/:planId/shares': ['share.created'],
  'DELETE /api/v1/organizations/:orgSlug/plans/:planId/shares/:shareId': ['share.revoked'],
  'POST /api/v1/organizations/:orgSlug/projects/:projectId/restore': ['project.restored'],
  // — ADR-0073 C3.1, family D: every destructive or structural act inside a plan.
  'DELETE /api/v1/organizations/:orgSlug/activities/:activityId': ['activity.deleted'],
  'POST /api/v1/organizations/:orgSlug/activities/:activityId/restore': ['activity.restored'],
  'POST /api/v1/organizations/:orgSlug/activities/:activityId/dissolve': ['activity.dissolved'],
  'PATCH /api/v1/organizations/:orgSlug/plans/:planId/activities/parents': ['activity.reparented'],
  // A batch delete and its batch restore reuse the SINGLE-activity actions rather than adding two
  // to the vocabulary: `subjectType` already tells the two apart (`ACTIVITY` for one row, `PLAN`
  // for a batch, the `activity.reparented` precedent), and every new action widens the ADR-0073 C4
  // action-filter cap — which shipped as a literal `20` and was reached by two chips the day the
  // vocabulary grew.
  'POST /api/v1/organizations/:orgSlug/plans/:planId/activities/bulk-delete': ['activity.deleted'],
  'POST /api/v1/organizations/:orgSlug/plans/:planId/activities/restore-batch/:batchId': [
    'activity.restored',
  ],
  'POST /api/v1/organizations/:orgSlug/plans/:planId/dependencies': ['dependency.created'],
  'DELETE /api/v1/organizations/:orgSlug/dependencies/:dependencyId': ['dependency.deleted'],
  // — ADR-0073 C3.2, family E: the rules other people's work is judged by. The three exception
  //   routes fold into ONE action with the calendar PATCH — an exception IS working time, and a
  //   reader asking why every date moved does not care which control produced the edit.
  'PATCH /api/v1/organizations/:orgSlug/plans/:planId': ['plan.settings_changed'],
  // TWO actions, one request: a PATCH that edits the working week AND moves the tier records both,
  // sharing a correlation id (the `invitation.accepted` + `member.joined` precedent).
  'PATCH /api/v1/organizations/:orgSlug/calendars/:calendarId': [
    'calendar.working_time_changed',
    'calendar.scope_changed',
  ],
  'POST /api/v1/organizations/:orgSlug/calendars/:calendarId/exceptions': [
    'calendar.working_time_changed',
  ],
  'PATCH /api/v1/organizations/:orgSlug/calendars/:calendarId/exceptions/:exceptionId': [
    'calendar.working_time_changed',
  ],
  'DELETE /api/v1/organizations/:orgSlug/calendars/:calendarId/exceptions/:exceptionId': [
    'calendar.working_time_changed',
  ],
  'POST /api/v1/organizations/:orgSlug/plans/:planId/baselines': ['baseline.captured'],
  'POST /api/v1/organizations/:orgSlug/plans/:planId/baselines/:baselineId/activate': [
    'baseline.activated',
  ],
  'DELETE /api/v1/organizations/:orgSlug/plans/:planId/baselines/:baselineId': ['baseline.deleted'],
  // — ADR-0073 C3.3, family F: library governance (ADR-0053). Archiving is the sharp one — the row
  //   keeps scheduling identically and refuses only NEW usages, so nothing visibly breaks and
  //   nobody is told.
  'DELETE /api/v1/organizations/:orgSlug/calendars/:calendarId': ['calendar.deleted'],
  'POST /api/v1/organizations/:orgSlug/calendars/:calendarId/archive': ['calendar.archived'],
  'POST /api/v1/organizations/:orgSlug/calendars/:calendarId/unarchive': ['calendar.unarchived'],
  'DELETE /api/v1/organizations/:orgSlug/resources/:resourceId': ['resource.deleted'],
  'POST /api/v1/organizations/:orgSlug/resources/:resourceId/archive': ['resource.archived'],
  'POST /api/v1/organizations/:orgSlug/resources/:resourceId/unarchive': ['resource.unarchived'],
  // — ADR-0073 C3.4, family G: provenance. The dry-run stays unaudited beside it — it reads a file
  //   and writes nothing, so there is no act to record.
  'POST /api/v1/organizations/:orgSlug/projects/:projectId/interchange/commit': [
    'interchange.imported',
  ],
};

/**
 * Why a route records nothing. Each value is a decision, not a default — the point of naming them
 * is that "it is a read" and "we have not got to it yet" are different answers, and a reader can
 * tell which applies without going to the code.
 */
const REASONS = {
  /** A read changes nothing. M1 records writes. */
  READ: 'read',
  /**
   * Reading the audit log is itself worth recording — who looked, and at whose history. It is a
   * genuine M2 candidate rather than an oversight, and is separated from ordinary reads so that
   * distinction survives.
   */
  AUDIT_READ: 'audit-read-not-yet-recorded',
  /**
   * A create, or an ordinary update whose effect stops at the object being edited.
   * `created_by`/`created_at` and `updated_by`/`updated_at` are already a permanent record of who
   * and when (ADR-0073 Test 1), and nothing outside the row changes (Test 2 fails). **Permanent** —
   * this is a decision, not a queue.
   */
  DURABLY_ATTRIBUTED: 'durably-attributed-by-the-row',
  /**
   * Content of one plan object, changing nothing outside it: an activity's own fields, its
   * progress, its lane, its notes, its steps, its assignments. **Permanent**, and the reason the
   * whole coverage rung is affordable — this class scales with the number of INTERACTIONS (one
   * write per drag, resize or keystroke commit) while the recorded class scales with the size of
   * the programme. Recording it is the cheapest way to make the log unreadable.
   */
  PLAN_CONTENT: 'plan-content-permanently-excluded',
  /** Taking, holding or handing over the pen. A lease, not a change to the plan (ADR-0028). */
  EDIT_LOCK: 'edit-lock-lease',
  /**
   * A recalculation is engine-owned and deterministic from inputs that are themselves auditable.
   * A row saying "the schedule was recomputed" adds noise, not evidence.
   */
  ENGINE_DERIVED: 'engine-derived',
  /** A session-less guest read (ADR-0051). No member principal, and nothing is changed. */
  GUEST_READ: 'guest-read',
  /** Health, readiness and version. Not organisation data. */
  INFRASTRUCTURE: 'infrastructure',
  /**
   * An anonymous **machine** report about our own policy, not an act by a person (ADR-0086 M4).
   *
   * Both audit tests fail it. Durability: nothing durable changes for anybody — a counter moves on
   * a row about a CSS file. Blast radius: it alters nobody's rights and nobody's work. And an
   * audit row per report would be actively harmful, since the endpoint is unauthenticated and
   * anyone could then fill the one table in the system that refuses DELETE.
   */
  BROWSER_TELEMETRY: 'browser-telemetry',
} as const;

type Reason = (typeof REASONS)[keyof typeof REASONS];

/** Every route that records nothing, and why. */
const UNAUDITED_ROUTES: Record<string, Reason> = {
  'POST /api/v1/csp-report': REASONS.BROWSER_TELEMETRY,
  'DELETE /api/v1/organizations/:orgSlug/assignments/:id': REASONS.PLAN_CONTENT,
  'DELETE /api/v1/organizations/:orgSlug/cross-plan-dependencies/:id': REASONS.PLAN_CONTENT,
  'DELETE /api/v1/organizations/:orgSlug/notes/:noteId': REASONS.PLAN_CONTENT,
  'DELETE /api/v1/organizations/:orgSlug/plans/:planId/edit-lock': REASONS.EDIT_LOCK,
  'GET /api/health': REASONS.INFRASTRUCTURE,
  'GET /api/health/ready': REASONS.INFRASTRUCTURE,
  'GET /api/v1/me': REASONS.READ,
  'GET /api/v1/me/audit-events': REASONS.AUDIT_READ,
  'GET /api/v1/organizations': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/activities/:activityId': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/activities/:activityId/assignments': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/activities/:activityId/cross-plan-dependencies': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/activities/:activityId/notes': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/activities/:activityId/predecessors': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/activities/:activityId/steps': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/activities/:activityId/successors': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/audit-events': REASONS.AUDIT_READ,
  'GET /api/v1/organizations/:orgSlug/calendars': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/calendars/:calendarId': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/clients': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/clients/:clientId': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/clients/:clientId/projects': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/cross-plan-dependencies/:id': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/deleted': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/dependencies/:dependencyId': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/invitations': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/members': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/plans/:planId': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/plans/:planId/activities': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/plans/:planId/baselines': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/plans/:planId/baselines/:baselineId': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/plans/:planId/baselines/variance': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/plans/:planId/cross-plan-dependencies': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/plans/:planId/dependencies': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/plans/:planId/edit-lock': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/plans/:planId/interchange/export/:format': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/plans/:planId/notes': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/plans/:planId/notes/activity-counts': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/plans/:planId/schedule/earned-value': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/plans/:planId/schedule/float-paths': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/plans/:planId/schedule/resource-histogram': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/plans/:planId/schedule/summary': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/plans/:planId/shares': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/projects/:projectId': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/projects/:projectId/calendars': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/projects/:projectId/plans': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/resources': REASONS.READ,
  'GET /api/v1/organizations/:orgSlug/resources/:resourceId': REASONS.READ,
  'GET /api/v1/share/activities': REASONS.GUEST_READ,
  'GET /api/v1/share/dependencies': REASONS.GUEST_READ,
  'GET /api/v1/share/plan': REASONS.GUEST_READ,
  'GET /api/v1/version': REASONS.INFRASTRUCTURE,
  'PATCH /api/v1/organizations/:orgSlug/activities/:activityId': REASONS.PLAN_CONTENT,
  'PATCH /api/v1/organizations/:orgSlug/activities/:activityId/progress': REASONS.PLAN_CONTENT,
  'PATCH /api/v1/organizations/:orgSlug/assignments/:id': REASONS.PLAN_CONTENT,
  'PATCH /api/v1/organizations/:orgSlug/clients/:clientId': REASONS.DURABLY_ATTRIBUTED,
  'PATCH /api/v1/organizations/:orgSlug/dependencies/:dependencyId': REASONS.PLAN_CONTENT,
  'PATCH /api/v1/organizations/:orgSlug/notes/:noteId': REASONS.PLAN_CONTENT,
  'PATCH /api/v1/organizations/:orgSlug/plans/:planId/activities/placements': REASONS.PLAN_CONTENT,
  'PATCH /api/v1/organizations/:orgSlug/plans/:planId/activities/positions': REASONS.PLAN_CONTENT,
  'PATCH /api/v1/organizations/:orgSlug/projects/:projectId': REASONS.DURABLY_ATTRIBUTED,
  'PATCH /api/v1/organizations/:orgSlug/resources/:resourceId': REASONS.PLAN_CONTENT,
  'POST /api/v1/invitations/preview': REASONS.READ,
  'POST /api/v1/organizations/:orgSlug/activities/:activityId/assignments': REASONS.PLAN_CONTENT,
  'POST /api/v1/organizations/:orgSlug/activities/:activityId/notes': REASONS.PLAN_CONTENT,
  'POST /api/v1/organizations/:orgSlug/calendars': REASONS.DURABLY_ATTRIBUTED,
  'POST /api/v1/organizations/:orgSlug/clients': REASONS.DURABLY_ATTRIBUTED,
  'POST /api/v1/organizations/:orgSlug/clients/:clientId/projects': REASONS.DURABLY_ATTRIBUTED,
  'POST /api/v1/organizations/:orgSlug/cross-plan-dependencies': REASONS.PLAN_CONTENT,
  'POST /api/v1/organizations/:orgSlug/plans/:planId/activities': REASONS.DURABLY_ATTRIBUTED,
  'POST /api/v1/organizations/:orgSlug/plans/:planId/edit-lock': REASONS.EDIT_LOCK,
  'POST /api/v1/organizations/:orgSlug/plans/:planId/edit-lock/handoff': REASONS.EDIT_LOCK,
  'POST /api/v1/organizations/:orgSlug/plans/:planId/edit-lock/heartbeat': REASONS.EDIT_LOCK,
  'POST /api/v1/organizations/:orgSlug/plans/:planId/edit-lock/request': REASONS.EDIT_LOCK,
  'POST /api/v1/organizations/:orgSlug/plans/:planId/notes': REASONS.PLAN_CONTENT,
  'POST /api/v1/organizations/:orgSlug/plans/:planId/schedule/recalculate': REASONS.ENGINE_DERIVED,
  'POST /api/v1/organizations/:orgSlug/plans/:planId/schedule/recalculate-programme':
    REASONS.ENGINE_DERIVED,
  'POST /api/v1/organizations/:orgSlug/projects/:projectId/interchange/dry-run':
    REASONS.PLAN_CONTENT,
  'POST /api/v1/organizations/:orgSlug/projects/:projectId/plans': REASONS.DURABLY_ATTRIBUTED,
  'POST /api/v1/organizations/:orgSlug/resources': REASONS.DURABLY_ATTRIBUTED,
  'PUT /api/v1/organizations/:orgSlug/activities/:activityId/steps': REASONS.PLAN_CONTENT,
};

const METHOD_NAMES = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL', 'OPTIONS', 'HEAD', 'SEARCH'];

/** A Nest module reference: a class, or the `{ module }` wrapper a `DynamicModule` produces. */
type ModuleRef = Type<unknown> | { module: Type<unknown> };

function moduleClass(ref: ModuleRef): Type<unknown> | null {
  if (typeof ref === 'function') return ref;
  if (typeof ref === 'object' && typeof ref.module === 'function') return ref.module;
  return null;
}

/** Every controller reachable from `AppModule`, depth-first, each visited once. */
function registeredControllers(): Type<unknown>[] {
  const seen = new Set<Type<unknown>>();
  const controllers = new Set<Type<unknown>>();
  const queue: Type<unknown>[] = [AppModule];

  while (queue.length > 0) {
    const module = queue.pop();
    if (module === undefined || seen.has(module)) continue;
    seen.add(module);

    for (const controller of (Reflect.getMetadata('controllers', module) ??
      []) as Type<unknown>[]) {
      controllers.add(controller);
    }
    for (const imported of (Reflect.getMetadata('imports', module) ?? []) as ModuleRef[]) {
      const next = moduleClass(imported);
      if (next !== null) queue.push(next);
    }
  }
  return [...controllers];
}

/**
 * Rebuild the route table Nest will serve, from the same decorator metadata Nest reads.
 *
 * Booting the app would be more faithful still, but routes are only registered during
 * `app.init()`, which needs a database — and a coverage gate that silently skips when Postgres is
 * absent is worth nothing.
 */
function actualRoutes(): string[] {
  const routes: string[] = [];

  for (const controller of registeredControllers()) {
    const basePath = Reflect.getMetadata('path', controller) as string | undefined;
    if (basePath === undefined) continue;

    const version = Reflect.getMetadata('__version__', controller) as string | undefined;
    const prototype = (controller as unknown as { prototype: object }).prototype;

    for (const name of Object.getOwnPropertyNames(prototype)) {
      if (name === 'constructor') continue;
      const handler = (prototype as Record<string, unknown>)[name];
      if (typeof handler !== 'function') continue;

      const methodIndex = Reflect.getMetadata('method', handler) as number | undefined;
      if (methodIndex === undefined) continue;

      const subPath = (Reflect.getMetadata('path', handler) as string | undefined) ?? '/';
      const prefix = version === undefined ? '/api' : `/api/v${version}`;
      const path = `${prefix}/${basePath}${subPath === '/' ? '' : `/${subPath}`}`.replace(
        /\/+/gu,
        '/',
      );
      routes.push(`${METHOD_NAMES[methodIndex] ?? `METHOD_${String(methodIndex)}`} ${path}`);
    }
  }
  return routes.sort();
}

describe('audit coverage census (ADR-0072)', () => {
  const routes = actualRoutes();
  const declared = new Set([...Object.keys(AUDITED_ROUTES), ...Object.keys(UNAUDITED_ROUTES)]);

  it('has decided, for EVERY route that exists, whether it audits', () => {
    // The direction that catches a new endpoint nobody thought about.
    const undecided = routes.filter((route) => !declared.has(route));
    expect(undecided, 'new routes must be added to AUDITED_ROUTES or UNAUDITED_ROUTES').toEqual([]);
  });

  it('declares no route that does not exist', () => {
    // The other direction, and the one that keeps the lists honest as routes are renamed or
    // removed: a stale entry would otherwise sit here looking like coverage forever.
    const actual = new Set(routes);
    const phantom = [...declared].filter((route) => !actual.has(route));
    expect(phantom, 'these declared routes no longer exist').toEqual([]);
  });

  it('never classifies a route both ways', () => {
    const both = Object.keys(AUDITED_ROUTES).filter((route) => route in UNAUDITED_ROUTES);
    expect(both).toEqual([]);
  });

  it('covers every route exactly once', () => {
    expect(Object.keys(AUDITED_ROUTES).length + Object.keys(UNAUDITED_ROUTES).length).toBe(
      routes.length,
    );
  });

  it('audits every route that changes who can do what', () => {
    // Stated positively as well as by exhaustion: these are the routes the audit log exists FOR
    // (TECH_DEBT #14). A future refactor that moved one into UNAUDITED_ROUTES with a plausible
    // reason would pass every test above and defeat the whole feature.
    const permissionChanging = [
      'POST /api/v1/organizations',
      'PATCH /api/v1/organizations/:orgSlug/members/:memberId',
      'DELETE /api/v1/organizations/:orgSlug/members/:memberId',
      'POST /api/v1/organizations/:orgSlug/invitations',
      'DELETE /api/v1/organizations/:orgSlug/invitations/:invitationId',
      'POST /api/v1/invitations/accept',
      // Minting a guest link grants a read of plan data to somebody with no account at all, and
      // revoking it is the only way that grant ever ends. It is the widest permission change the
      // product offers and the one whose subject can never be asked what they saw.
      'POST /api/v1/organizations/:orgSlug/plans/:planId/shares',
      'DELETE /api/v1/organizations/:orgSlug/plans/:planId/shares/:shareId',
    ];
    for (const route of permissionChanging) {
      expect(AUDITED_ROUTES[route], `${route} must audit`).toBeDefined();
    }
  });

  it('audits every hierarchy delete and its restore', () => {
    for (const entity of ['clients/:clientId', 'projects/:projectId', 'plans/:planId']) {
      expect(AUDITED_ROUTES[`DELETE /api/v1/organizations/:orgSlug/${entity}`]).toBeDefined();
      expect(AUDITED_ROUTES[`POST /api/v1/organizations/:orgSlug/${entity}/restore`]).toBeDefined();
    }
  });

  it('audits every destructive act inside a plan', () => {
    // The third positive assertion (ADR-0073 C3.1), and it exists for the reason the first one
    // does: "who removed this?" is the question a planner actually asks, and a refactor that moved
    // one of these into `UNAUDITED_ROUTES` under `PLAN_CONTENT` would pass every test above while
    // silently removing the answer. Named by hand rather than derived, because the point is that
    // somebody decided these specific acts must always be recoverable from the log.
    const destructive = [
      'DELETE /api/v1/organizations/:orgSlug/activities/:activityId',
      'POST /api/v1/organizations/:orgSlug/activities/:activityId/restore',
      'POST /api/v1/organizations/:orgSlug/activities/:activityId/dissolve',
      'DELETE /api/v1/organizations/:orgSlug/dependencies/:dependencyId',
    ];
    for (const route of destructive) {
      expect(AUDITED_ROUTES[route], `${route} must audit`).toBeDefined();
    }
  });

  it('audits every change to the rules other work is judged by', () => {
    // The fourth positive assertion (ADR-0073 C3.2). These are UPDATES, which the durability test
    // says do NOT earn a row — so without this, a future reader applying Test 1 alone would move
    // them to `PLAN_CONTENT` with a plausible-sounding reason and remove the only explanation the
    // log offers for "everything moved overnight".
    const governance = [
      'PATCH /api/v1/organizations/:orgSlug/plans/:planId',
      'PATCH /api/v1/organizations/:orgSlug/calendars/:calendarId',
      'POST /api/v1/organizations/:orgSlug/calendars/:calendarId/exceptions',
      'PATCH /api/v1/organizations/:orgSlug/calendars/:calendarId/exceptions/:exceptionId',
      'DELETE /api/v1/organizations/:orgSlug/calendars/:calendarId/exceptions/:exceptionId',
      'POST /api/v1/organizations/:orgSlug/plans/:planId/baselines',
      'POST /api/v1/organizations/:orgSlug/plans/:planId/baselines/:baselineId/activate',
    ];
    for (const route of governance) {
      expect(AUDITED_ROUTES[route], `${route} must audit`).toBeDefined();
    }
  });

  it('audits every change to what the shared libraries offer', () => {
    // The fifth positive assertion (ADR-0073 C3.3). Archive is the one that most needs it: it is
    // not a delete, nothing breaks, and the only symptom is somebody asking days later why they
    // can no longer pick a calendar. A refactor filing it under `PLAN_CONTENT` would pass every
    // exhaustive test above.
    const governance = [
      'DELETE /api/v1/organizations/:orgSlug/calendars/:calendarId',
      'POST /api/v1/organizations/:orgSlug/calendars/:calendarId/archive',
      'POST /api/v1/organizations/:orgSlug/calendars/:calendarId/unarchive',
      'DELETE /api/v1/organizations/:orgSlug/resources/:resourceId',
      'POST /api/v1/organizations/:orgSlug/resources/:resourceId/archive',
      'POST /api/v1/organizations/:orgSlug/resources/:resourceId/unarchive',
    ];
    for (const route of governance) {
      expect(AUDITED_ROUTES[route], `${route} must audit`).toBeDefined();
    }
  });

  it('records where an imported programme came from', () => {
    // The sixth positive assertion (ADR-0073 C3.4). An import is the one way a plan arrives whole
    // rather than being built, and the file it came from is not retained — so this row is the only
    // surviving link between a programme and its source. Without it an imported plan and a
    // hand-typed one are indistinguishable a week later.
    expect(
      AUDITED_ROUTES['POST /api/v1/organizations/:orgSlug/projects/:projectId/interchange/commit'],
    ).toEqual(['interchange.imported']);
  });

  it('audits EVERY staff route, including reads', () => {
    // The seventh positive assertion (ADR-0086 D5), and the only one that inverts the durability
    // test rather than applying it. Normally a read earns no row; here the read is the privileged
    // act, so the ordinary rule would leave the most privileged surface in the product recording
    // nothing — which is the argument the whole epic rests on.
    //
    // Derived from the PATH, not from a list, so it covers a staff route somebody adds in M3/M4/M5
    // on the day they write it rather than when they remember this file exists. The brief assumed
    // the census FORBIDS auditing a read; it does not — all six assertions above force a route TO
    // BE audited and none forbids it, which is what makes this buildable as a gate at all.
    const staffRoutes = [...declared].filter((route) => route.includes(' /api/v1/staff/'));
    expect(staffRoutes.length, 'the staff console must have at least one route').toBeGreaterThan(0);
    for (const route of staffRoutes) {
      expect(AUDITED_ROUTES[route], `${route} must audit — every staff route does`).toBeDefined();
    }
  });

  it('leaves no route parked as "coverage decided later"', () => {
    // `PENDING_COVERAGE` was the one reason that was a queue rather than a decision, and C3.4
    // emptied it — so the constant is gone and every reason in the list is now a decision somebody
    // made. This assertion is what stops it being reintroduced by habit: a route added later must
    // be classified by the two tests (durability, blast radius), not deferred with a note.
    const reasons = new Set(Object.values(UNAUDITED_ROUTES));
    for (const reason of reasons) {
      expect(Object.values(REASONS), `${reason} must be a declared reason`).toContain(reason);
    }
    expect(Object.values(REASONS)).not.toContain('awaiting-a-later-c3-slice');
  });
});
