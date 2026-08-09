import type { AuditAction, AuditChanges } from '@repo/types';

import { PLAN_GOVERNANCE_FIELDS } from '../plans/plan-governance-fields';

/**
 * The 8 KB bound `ck_audit_events_changes_size` enforces. Kept a little under it so the JSON
 * envelope (`{"before":…,"after":…}`) plus the truncation marker cannot push a payload the
 * redactor just approved over the line — a check that fires is a 500, not a validation error.
 */
const CHANGES_BUDGET_BYTES = 7168;

/**
 * What each action is allowed to record, field by field.
 *
 * **An allow-list, not a deny-list, and that asymmetry is the whole design.** A deny-list of
 * "secrets" fails open: the day someone adds a column, it is recorded until a human notices, and
 * the failure is silent and retroactive — the rows are already written. An allow-list fails
 * closed: a new field is invisible to the audit log until a person names it here, which is a
 * decision someone makes rather than one they forget to make.
 *
 * Keyed by every {@link AuditAction} exhaustively, so adding an action without deciding what it
 * may record is a **compile error** rather than a row that quietly carries everything.
 */
const ALLOWED_FIELDS: Record<AuditAction, readonly string[]> = {
  // — Membership, invitations, organisation.
  'member.joined': ['role'],
  'member.removed': ['role'],
  'member.role_changed': ['role'],
  'invitation.created': ['email', 'role', 'expiresAt'],
  'invitation.revoked': ['email', 'role', 'status'],
  'invitation.accepted': ['email', 'role', 'status'],
  'organization.created': ['name', 'slug'],
  // — Guest share links. `planId` and `expiresAt` say what was exposed and for how long; `label`
  //   is the operator's own note. The TOKEN and its HASH are absent, and that is not a matter of
  //   taste: the raw token IS the credential, and the hash is what the guard compares against, so
  //   either one in this table turns a read surface into a key store. `NEVER_RECORD` catches both
  //   words independently, which is exactly the second chance it exists to give.
  'share.created': ['planId', 'label', 'expiresAt'],
  'share.revoked': ['planId', 'label'],
  // — Authentication. Deliberately empty: the interesting facts (who, from where, did it work)
  //   are first-class columns, and ANY field payload here would be attacker-influenced input
  //   from a sign-in form. There is no `changes` shape that improves an auth row and several
  //   that would leak.
  'auth.signed_up': [],
  'auth.signed_in': [],
  'auth.sign_in_failed': [],
  'auth.signed_out': [],
  'auth.email_verified': [],
  // Empty for the same reason as the five above, and here it is load-bearing rather than merely
  // consistent: everything these three could carry — a password, a token, a reset URL — is either
  // a credential or useless. The `NEVER_RECORD` substring ban would catch `token`/`hash` anyway;
  // an empty allow-list means nothing can reach the payload to be caught (ADR-0074).
  'auth.password_changed': [],
  'auth.password_reset_requested': [],
  'auth.password_reset_completed': [],
  // — Hierarchy soft deletes/restores. `deleteBatchId` is the thread that ties a cascade
  //   together, so a reader can see one action removed forty things rather than forty actions.
  //
  //   The counts are **flattened scalars**, one field per level, and that shape is forced rather
  //   than chosen. The M1 spec promised `counts: CascadeCounts`; a nested object cannot work here,
  //   because `normalise()` reduces any non-scalar to a type marker by design — the allow-list
  //   vets the top-level key and cannot vouch for a sub-tree. So the promised shape would have
  //   recorded `[object]` and the shipped producer passed no counts at all, which is why a delete
  //   of 412 activities recorded the batch id and not the size (spec §0.1(1), fixed here). Rows
  //   written before this are NOT backfilled and cannot be: the table refuses `UPDATE`.
  'client.deleted': [
    'name',
    'deleteBatchId',
    'projectCount',
    'planCount',
    'activityCount',
    'dependencyCount',
  ],
  'client.restored': [
    'name',
    'deleteBatchId',
    'projectCount',
    'planCount',
    'activityCount',
    'dependencyCount',
  ],
  'project.deleted': ['name', 'deleteBatchId', 'planCount', 'activityCount', 'dependencyCount'],
  'project.restored': ['name', 'deleteBatchId', 'planCount', 'activityCount', 'dependencyCount'],
  'plan.deleted': ['name', 'status', 'deleteBatchId', 'activityCount', 'dependencyCount'],
  'plan.restored': ['name', 'status', 'deleteBatchId', 'activityCount', 'dependencyCount'],
  // — Destructive and structural acts inside a plan (ADR-0073 family D). Same flattened-count
  //   shape as above, for the same reason.
  //
  //   `planName` is on the delete and not the restore deliberately: a reader looking at "who
  //   removed this" needs to know WHICH plan lost it, and by the time they read the row the
  //   activity may be gone from every list they could look it up in.
  'activity.deleted': [
    'name',
    'code',
    'type',
    'planName',
    'deleteBatchId',
    'activityCount',
    'dependencyCount',
  ],
  'activity.restored': ['name', 'code', 'deleteBatchId', 'activityCount'],
  'activity.dissolved': ['name', 'promotedChildCount'],
  // `parentCount` disambiguates a case the API permits and the feature spec's shape did not
  // cover: a batch may name a different destination per row, and `{ movedCount, parentName }`
  // alone would render that identically to "moved to top level". One destination named, one
  // destination unnamed (top level) and several destinations are now three distinct readings.
  'activity.reparented': ['movedCount', 'parentCount', 'parentName'],
  // The DIRECTION is the fact ADR-0064 found planners most often get wrong, so both endpoint
  // names are recorded rather than one id. `lagMinutes` over `lagDays`: after ADR-0068 a day is a
  // per-calendar quantity, and the audit row has no calendar to interpret one against.
  'dependency.created': ['predecessorName', 'successorName', 'type', 'lagMinutes'],
  'dependency.deleted': ['predecessorName', 'successorName', 'type', 'lagMinutes', 'deleteBatchId'],
  // — The rules other people's work is judged by (ADR-0073 family E).
  //
  //   `plan.settings_changed` is the ONE action whose allow-list is not a hand-written line: it is
  //   the governance field set itself, imported rather than restated, so a field added to that set
  //   is recordable without anyone editing this file — and, more importantly, a field REMOVED from
  //   it stops being recordable in the same commit. Two copies would drift silently: the producer
  //   would pass a value the allow-list quietly dropped, and the row would say the field did not
  //   change.
  'plan.settings_changed': ['planName', ...PLAN_GOVERNANCE_FIELDS],
  //   The shift rows themselves are deliberately absent. They are not scalar, so `normalise` would
  //   reduce them to a type marker anyway — but the reason to withhold them is the reader's, not
  //   the redactor's: "the working week changed" is the fact somebody needs when every date on a
  //   plan moved, and a JSON dump of seven days' windows buries it. `changedWhat` names the kind.
  'calendar.working_time_changed': ['name', 'changedWhat'],
  'baseline.captured': ['name', 'planName'],
  //   Both sides, because activation is a MOVE: exactly one baseline is active per plan
  //   (ADR-0025), so the row that stopped being the standard is half the story.
  'baseline.activated': ['name', 'planName'],
  'baseline.deleted': ['name', 'planName', 'deleteBatchId'],
  // — Library governance (ADR-0073 family F). `scope` is on the delete because a shared-library
  //   calendar going away is a different event from a project one, and the row is the only place
  //   that distinction survives the deletion.
  'calendar.deleted': ['name', 'scope', 'deleteBatchId'],
  'calendar.archived': ['name', 'scope'],
  'calendar.unarchived': ['name', 'scope'],
  'calendar.scope_changed': ['name', 'scope'],
  //   `resourceCount` is the subtree a GROUP delete swept (ADR-0053 §3) — one row for the branch,
  //   never one per descendant, the same rule family D applies to a WBS summary.
  'resource.deleted': ['name', 'kind', 'deleteBatchId', 'resourceCount'],
  'resource.archived': ['name', 'kind'],
  'resource.unarchived': ['name', 'kind'],
  // — Provenance (ADR-0073 family G). `sourceFilename` is the reader's whole route back to the
  //   file: an import is otherwise indistinguishable from somebody having typed 500 activities.
  //   The counts are the size of what arrived; `findingCount` says the report was not clean,
  //   without reproducing it — a report is a document, and the redactor would flatten it to a
  //   type marker anyway (the family C lesson).
  'interchange.imported': [
    'planName',
    'format',
    'sourceFilename',
    'activityCount',
    'dependencyCount',
    'calendarCount',
    'resourceCount',
    'findingCount',
  ],
  // — Staff (ADR-0086). Deliberately EMPTY, and that is the decision rather than an omission.
  //   A staff row records THAT a staff member reached a surface, never what was on it: the console
  //   reads customer addresses (CQ-1), and recording those here would put customer PII into the one
  //   table that refuses DELETE — recreating through the back door exactly what ADR-0085 D3 spent a
  //   decision avoiding, and what M1's deliberately-ordinary `mail_events` exists to keep erasable.
  //   The actor, the action and the instant are the evidence; the contents are not.
  'staff.session_started': [],
  'staff.panel_read': [],
};

/**
 * Field names that must never be recorded under ANY action, whatever an allow-list says.
 *
 * This is belt-and-braces over the allow-list rather than the primary control — nothing above
 * names these. It exists because the allow-list is edited by people, and `password` reaching the
 * audit table is the one mistake worth two independent chances to stop. Matched case-insensitively
 * on a substring, so `passwordHash` and `newPassword` are both caught.
 */
const NEVER_RECORD = [
  'password',
  'token',
  'secret',
  'hash',
  'credential',
  'authorization',
  'cookie',
  'apikey',
] as const;

function isForbidden(field: string): boolean {
  const lowered = field.toLowerCase();
  return NEVER_RECORD.some((banned) => lowered.includes(banned));
}

/** The per-field character cap. Applied to EVERY value that ends up a string, including the
 *  stringified fallback — capping only the `typeof value === 'string'` branch leaves the bound
 *  open to an array or a large object, which is how a "bounded" payload stops being bounded. */
const FIELD_CHAR_CAP = 512;

function cap(text: string): string {
  return text.length > FIELD_CHAR_CAP ? `${text.slice(0, FIELD_CHAR_CAP)}…` : text;
}

/** Coerce a value to something JSON-safe and bounded. Dates become ISO strings; everything the
 *  allow-list did not anticipate being a scalar becomes a capped string, so a nested blob cannot
 *  smuggle unlisted fields in as a sub-tree. */
function normalise(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return cap(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;

  // Anything else gets a TYPE MARKER, not its contents. Every allow-listed field is scalar-valued
  // by design, so an object or array arriving here is a producer bug — and the two obvious
  // alternatives are both wrong. `String(value)` yields the useless `[object Object]` (ESLint says
  // so, and a test asserting "is a string" passes while recording nothing). `JSON.stringify` is
  // worse: an allow-list that vets only the top-level KEY cannot vouch for the sub-tree under it,
  // so serialising the value would record fields nobody approved. The marker says what arrived
  // without disclosing it.
  return Array.isArray(value) ? `[array(${String(value.length)})]` : `[${typeof value}]`;
}

function pick(
  source: Record<string, unknown> | undefined,
  fields: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!source) return out;
  for (const field of fields) {
    if (!(field in source)) continue;
    out[field] = normalise(source[field]);
  }
  return out;
}

/**
 * Reduce a producer's before/after to what {@link ALLOWED_FIELDS} permits for this action, and
 * bring it inside the column bound.
 *
 * Returns `null` — not an empty object — when nothing survives, so the column stays NULL rather
 * than filling with `{"before":{},"after":{}}` on the five auth actions that record no fields.
 */
export function redactChanges(
  action: AuditAction,
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): AuditChanges | null {
  const allowed = ALLOWED_FIELDS[action].filter((field) => !isForbidden(field));
  if (allowed.length === 0) return null;

  const changes: AuditChanges = { before: pick(before, allowed), after: pick(after, allowed) };
  if (Object.keys(changes.before).length === 0 && Object.keys(changes.after).length === 0) {
    return null;
  }

  if (Buffer.byteLength(JSON.stringify(changes), 'utf8') <= CHANGES_BUDGET_BYTES) return changes;

  // Defensive, and honestly unreachable for today's vocabulary: every value is capped at
  // FIELD_CHAR_CAP, the widest action allows seven fields, and all but two of those seven are
  // integer counts — so the largest payload this can build is a few kB against a 7 kB budget. The
  // headroom is thinner than it was before C3.1 widened the lists, which is precisely why the
  // branch is worth keeping. It is kept rather than deleted because the
  // allow-lists grow on every coverage rung, and the alternative to this branch is not a smaller
  // payload — it is a 500 from `ck_audit_events_changes_size` at the moment someone performs the
  // action, i.e. a LOST audit row. `truncated` is set so a reader is told the record is partial
  // rather than concluding the missing fields were unchanged.
  //
  // The structural bound is asserted in the spec; this cannot be exercised without a synthetic
  // allow-list, and inventing one would test the fake rather than the rule.
  return { before: {}, after: {}, truncated: true };
}

/** Exposed for the structural spec: every action must have decided what it records. */
export const AUDITABLE_FIELDS = ALLOWED_FIELDS;
