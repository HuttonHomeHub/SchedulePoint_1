import type { AuditAction, AuditChanges } from '@repo/types';

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
  // — Authentication. Deliberately empty: the interesting facts (who, from where, did it work)
  //   are first-class columns, and ANY field payload here would be attacker-influenced input
  //   from a sign-in form. There is no `changes` shape that improves an auth row and several
  //   that would leak.
  'auth.signed_up': [],
  'auth.signed_in': [],
  'auth.sign_in_failed': [],
  'auth.signed_out': [],
  'auth.email_verified': [],
  // — Hierarchy soft deletes/restores. `deleteBatchId` is the thread that ties a cascade
  //   together, so a reader can see one action removed forty things rather than forty actions.
  'client.deleted': ['name', 'deleteBatchId'],
  'client.restored': ['name', 'deleteBatchId'],
  'project.deleted': ['name', 'deleteBatchId'],
  'project.restored': ['name', 'deleteBatchId'],
  'plan.deleted': ['name', 'status', 'deleteBatchId'],
  'plan.restored': ['name', 'status', 'deleteBatchId'],
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
  // FIELD_CHAR_CAP and no action allows more than three fields, so the largest payload this can
  // build is roughly 2 KB against a 7 KB budget. It is kept rather than deleted because the
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
