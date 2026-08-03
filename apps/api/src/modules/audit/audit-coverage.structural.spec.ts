import type { Type } from '@nestjs/common';
import type { AuditAction } from '@repo/types';
import { describe, expect, it } from 'vitest';

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
 * **The five authentication events are NOT in this census** and cannot be: Better Auth is mounted
 * as a raw Node handler outside Nest (ADR-0003), so its endpoints have no controller metadata to
 * reflect over. Their coverage is proven by `auth-audit.spec.ts` and the e2e suite instead.
 */

/** Every route that records at least one event, and which events it records. */
const AUDITED_ROUTES: Record<string, readonly AuditAction[]> = {
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
  'POST /api/v1/organizations/:orgSlug/projects/:projectId/restore': ['project.restored'],
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
   * Editing an activity, dependency, calendar, resource, note, step or assignment. M1 deliberately
   * covers permission changes, identity, and destructive hierarchy changes only; content edits are
   * a far larger surface whose volume has to be measured before it is written (the M3 decision in
   * ADR-0072). Recording them now would be the cheapest way to make the log unreadable.
   */
  CONTENT_EDIT: 'content-edit-deferred-to-m3',
  /** Taking, holding or handing over the pen. A lease, not a change to the plan (ADR-0028). */
  EDIT_LOCK: 'edit-lock-lease',
  /**
   * A recalculation is engine-owned and deterministic from inputs that are themselves auditable.
   * A row saying "the schedule was recomputed" adds noise, not evidence.
   */
  ENGINE_DERIVED: 'engine-derived',
  /**
   * Minting or revoking a share link IS a permission change and belongs in the log. It is out of
   * M1 only because the guest role is its own auth boundary (ADR-0051) with its own actor kind,
   * and giving it one honestly needs the GUEST actor type wired end to end.
   */
  SHARE_GRANT: 'share-grant-m2-candidate',
  /** An import creates a plan; `plan.created` is not in the M1 vocabulary. */
  IMPORT: 'import-creates-plan',
  /** A session-less guest read (ADR-0051). No member principal, and nothing is changed. */
  GUEST_READ: 'guest-read',
  /** Health, readiness and version. Not organisation data. */
  INFRASTRUCTURE: 'infrastructure',
} as const;

type Reason = (typeof REASONS)[keyof typeof REASONS];

/** Every route that records nothing, and why. */
const UNAUDITED_ROUTES: Record<string, Reason> = {
  'DELETE /api/v1/organizations/:orgSlug/activities/:activityId': REASONS.CONTENT_EDIT,
  'DELETE /api/v1/organizations/:orgSlug/assignments/:id': REASONS.CONTENT_EDIT,
  'DELETE /api/v1/organizations/:orgSlug/calendars/:calendarId': REASONS.CONTENT_EDIT,
  'DELETE /api/v1/organizations/:orgSlug/calendars/:calendarId/exceptions/:exceptionId':
    REASONS.CONTENT_EDIT,
  'DELETE /api/v1/organizations/:orgSlug/cross-plan-dependencies/:id': REASONS.CONTENT_EDIT,
  'DELETE /api/v1/organizations/:orgSlug/dependencies/:dependencyId': REASONS.CONTENT_EDIT,
  'DELETE /api/v1/organizations/:orgSlug/notes/:noteId': REASONS.CONTENT_EDIT,
  'DELETE /api/v1/organizations/:orgSlug/plans/:planId/baselines/:baselineId': REASONS.CONTENT_EDIT,
  'DELETE /api/v1/organizations/:orgSlug/plans/:planId/edit-lock': REASONS.EDIT_LOCK,
  'DELETE /api/v1/organizations/:orgSlug/plans/:planId/shares/:shareId': REASONS.SHARE_GRANT,
  'DELETE /api/v1/organizations/:orgSlug/resources/:resourceId': REASONS.CONTENT_EDIT,
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
  'PATCH /api/v1/organizations/:orgSlug/activities/:activityId': REASONS.CONTENT_EDIT,
  'PATCH /api/v1/organizations/:orgSlug/activities/:activityId/progress': REASONS.CONTENT_EDIT,
  'PATCH /api/v1/organizations/:orgSlug/assignments/:id': REASONS.CONTENT_EDIT,
  'PATCH /api/v1/organizations/:orgSlug/calendars/:calendarId': REASONS.CONTENT_EDIT,
  'PATCH /api/v1/organizations/:orgSlug/calendars/:calendarId/exceptions/:exceptionId':
    REASONS.CONTENT_EDIT,
  'PATCH /api/v1/organizations/:orgSlug/clients/:clientId': REASONS.CONTENT_EDIT,
  'PATCH /api/v1/organizations/:orgSlug/dependencies/:dependencyId': REASONS.CONTENT_EDIT,
  'PATCH /api/v1/organizations/:orgSlug/notes/:noteId': REASONS.CONTENT_EDIT,
  'PATCH /api/v1/organizations/:orgSlug/plans/:planId': REASONS.CONTENT_EDIT,
  'PATCH /api/v1/organizations/:orgSlug/plans/:planId/activities/parents': REASONS.CONTENT_EDIT,
  'PATCH /api/v1/organizations/:orgSlug/plans/:planId/activities/positions': REASONS.CONTENT_EDIT,
  'PATCH /api/v1/organizations/:orgSlug/projects/:projectId': REASONS.CONTENT_EDIT,
  'PATCH /api/v1/organizations/:orgSlug/resources/:resourceId': REASONS.CONTENT_EDIT,
  'POST /api/v1/invitations/preview': REASONS.READ,
  'POST /api/v1/organizations/:orgSlug/activities/:activityId/assignments': REASONS.CONTENT_EDIT,
  'POST /api/v1/organizations/:orgSlug/activities/:activityId/dissolve': REASONS.CONTENT_EDIT,
  'POST /api/v1/organizations/:orgSlug/activities/:activityId/notes': REASONS.CONTENT_EDIT,
  'POST /api/v1/organizations/:orgSlug/activities/:activityId/restore': REASONS.CONTENT_EDIT,
  'POST /api/v1/organizations/:orgSlug/calendars': REASONS.CONTENT_EDIT,
  'POST /api/v1/organizations/:orgSlug/calendars/:calendarId/archive': REASONS.CONTENT_EDIT,
  'POST /api/v1/organizations/:orgSlug/calendars/:calendarId/exceptions': REASONS.CONTENT_EDIT,
  'POST /api/v1/organizations/:orgSlug/calendars/:calendarId/unarchive': REASONS.CONTENT_EDIT,
  'POST /api/v1/organizations/:orgSlug/clients': REASONS.CONTENT_EDIT,
  'POST /api/v1/organizations/:orgSlug/clients/:clientId/projects': REASONS.CONTENT_EDIT,
  'POST /api/v1/organizations/:orgSlug/cross-plan-dependencies': REASONS.CONTENT_EDIT,
  'POST /api/v1/organizations/:orgSlug/plans/:planId/activities': REASONS.CONTENT_EDIT,
  'POST /api/v1/organizations/:orgSlug/plans/:planId/baselines': REASONS.CONTENT_EDIT,
  'POST /api/v1/organizations/:orgSlug/plans/:planId/baselines/:baselineId/activate':
    REASONS.CONTENT_EDIT,
  'POST /api/v1/organizations/:orgSlug/plans/:planId/dependencies': REASONS.CONTENT_EDIT,
  'POST /api/v1/organizations/:orgSlug/plans/:planId/edit-lock': REASONS.EDIT_LOCK,
  'POST /api/v1/organizations/:orgSlug/plans/:planId/edit-lock/handoff': REASONS.EDIT_LOCK,
  'POST /api/v1/organizations/:orgSlug/plans/:planId/edit-lock/heartbeat': REASONS.EDIT_LOCK,
  'POST /api/v1/organizations/:orgSlug/plans/:planId/edit-lock/request': REASONS.EDIT_LOCK,
  'POST /api/v1/organizations/:orgSlug/plans/:planId/notes': REASONS.CONTENT_EDIT,
  'POST /api/v1/organizations/:orgSlug/plans/:planId/schedule/recalculate': REASONS.ENGINE_DERIVED,
  'POST /api/v1/organizations/:orgSlug/plans/:planId/schedule/recalculate-programme':
    REASONS.ENGINE_DERIVED,
  'POST /api/v1/organizations/:orgSlug/plans/:planId/shares': REASONS.SHARE_GRANT,
  'POST /api/v1/organizations/:orgSlug/projects/:projectId/interchange/commit': REASONS.IMPORT,
  'POST /api/v1/organizations/:orgSlug/projects/:projectId/interchange/dry-run': REASONS.IMPORT,
  'POST /api/v1/organizations/:orgSlug/projects/:projectId/plans': REASONS.CONTENT_EDIT,
  'POST /api/v1/organizations/:orgSlug/resources': REASONS.CONTENT_EDIT,
  'POST /api/v1/organizations/:orgSlug/resources/:resourceId/archive': REASONS.CONTENT_EDIT,
  'POST /api/v1/organizations/:orgSlug/resources/:resourceId/unarchive': REASONS.CONTENT_EDIT,
  'PUT /api/v1/organizations/:orgSlug/activities/:activityId/steps': REASONS.CONTENT_EDIT,
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
});
