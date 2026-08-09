import type {
  AuditAction,
  AuditCategory,
  AuditChanges,
  AuditEvent,
  AuditOutcome,
} from '@repo/types';

/**
 * Turning a recorded event into a sentence a person can read.
 *
 * **Pure, and keyed exhaustively by {@link AuditAction}** — the same discipline as the API's
 * redactor. Adding an action without deciding how it reads is a compile error rather than a row
 * that renders as its own machine name, which is what an audit log looks like when nobody owns
 * the copy.
 *
 * The sentences deliberately name the SUBJECT and leave the actor to its own column: "changed a
 * member's role" beside "admin@example.com" reads once, whereas "admin@example.com changed
 * admin@example.com's role" reads twice and is wrong as often as it is right.
 */

/** How an event reads: a short label, and the fuller sentence beneath it. */
export interface AuditEventCopy {
  /** The headline, e.g. "Role changed". Sentence case, no trailing full stop. */
  title: string;
  /** What changed, in words, or null when the columns already say everything. */
  detail: string | null;
}

const TITLES: Record<AuditAction, string> = {
  'member.joined': 'Member joined',
  'member.removed': 'Member removed',
  'member.role_changed': 'Role changed',
  'invitation.created': 'Invitation sent',
  'invitation.revoked': 'Invitation revoked',
  'invitation.accepted': 'Invitation accepted',
  'organization.created': 'Organisation created',
  'share.created': 'Share link created',
  'share.revoked': 'Share link revoked',
  'auth.signed_up': 'Account created',
  'auth.signed_in': 'Signed in',
  'auth.sign_in_failed': 'Sign-in failed',
  'auth.signed_out': 'Signed out',
  'auth.email_verified': 'Email verified',
  // Credential changes (ADR-0074). "Password reset requested" is deliberately not "Password
  // reset" — nothing changed yet, and conflating the two would make the row that says somebody
  // is probing your address read as one saying they got in.
  'auth.password_changed': 'Password changed',
  'auth.password_reset_requested': 'Password reset requested',
  'auth.password_reset_completed': 'Password reset completed',
  'client.deleted': 'Client deleted',
  'client.restored': 'Client restored',
  'project.deleted': 'Project deleted',
  'project.restored': 'Project restored',
  'plan.deleted': 'Plan deleted',
  'plan.restored': 'Plan restored',
  'activity.deleted': 'Activity deleted',
  'activity.restored': 'Activity restored',
  // "Summary dissolved", not "Summary deleted": the grouping went, the work stayed. A reader
  // scanning for lost work must not stop on this row.
  'activity.dissolved': 'Summary dissolved',
  'activity.reparented': 'Activities regrouped',
  'dependency.created': 'Link added',
  'dependency.deleted': 'Link removed',
  // "Scheduling settings", not "Plan updated": the row exists precisely because these fields are
  // not an ordinary edit, and a title that sounds like one invites a reader to skip it.
  'plan.settings_changed': 'Scheduling settings changed',
  'calendar.working_time_changed': 'Working time changed',
  'baseline.captured': 'Baseline captured',
  'baseline.activated': 'Baseline activated',
  'baseline.deleted': 'Baseline deleted',
  'calendar.deleted': 'Calendar deleted',
  // "Retired", not "Archived": the word has to carry that the calendar still works for everything
  // already using it and is only withheld from new choices. "Archived" reads as put away.
  'calendar.archived': 'Calendar retired',
  'calendar.unarchived': 'Calendar back in use',
  'calendar.scope_changed': 'Calendar sharing changed',
  'resource.deleted': 'Resource deleted',
  'resource.archived': 'Resource retired',
  'resource.unarchived': 'Resource back in use',
  // "Imported", not "Plan created": a reader scanning this feed needs to see at a glance that this
  // plan did not come from anybody typing, which is the entire reason the row is recorded.
  'interchange.imported': 'Programme imported',
  // SchedulePoint staff reaching the installation console (ADR-0086). Deliberately worded as an
  // ARRIVAL rather than an action: the row records that a staff member reached the surface, and its
  // redactor allow-list is empty on purpose, so there is nothing further to say and the copy must
  // not imply there is.
  'staff.session_started': 'Staff console opened',
  'staff.panel_read': 'Staff console panel read',
  // Not "access denied to the staff console" — the reader of an organisation log should not learn
  // from a label that a staff console exists. "Refused" is what happened; the surface is the
  // subject, and the subject is not spelt out here.
  'staff.access_denied': 'Staff surface refused',
};

function field(side: Record<string, unknown> | undefined, key: string): string | null {
  const value = side?.[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * The detail line. Built from the redacted `changes` payload only — never from anything the
 * client infers, because the payload is the record and a rendered guess is not.
 */
function detailFor(action: AuditAction, changes: AuditChanges | null): string | null {
  switch (action) {
    case 'member.role_changed': {
      const before = field(changes?.before, 'role');
      const after = field(changes?.after, 'role');
      // Both sides or neither: "changed to Planner" without saying from what invites the reader
      // to assume it was the role they remember, which is the question they came here to answer.
      return before !== null && after !== null ? `${roleName(before)} → ${roleName(after)}` : null;
    }
    case 'member.joined':
    case 'member.removed': {
      const role = field(changes?.after, 'role') ?? field(changes?.before, 'role');
      return role === null ? null : `As ${roleName(role)}`;
    }
    case 'invitation.created': {
      const role = field(changes?.after, 'role');
      return role === null ? null : `Invited as ${roleName(role)}`;
    }
    case 'invitation.revoked':
    case 'invitation.accepted':
      return null;
    case 'organization.created':
      return field(changes?.after, 'slug');
    case 'share.created': {
      // The expiry is the fact a reader is looking for: a guest link with no expiry is a standing
      // grant to anyone who ever held the URL, and "no expiry" is a louder sentence than an absent
      // line. `expiresAt` is always in the payload — the allow-list names it and the redactor
      // normalises null — so an ABSENT key means an old row, which is different from "never".
      if (changes?.after === undefined || !('expiresAt' in changes.after)) return null;
      const expiresAt = field(changes.after, 'expiresAt');
      return expiresAt === null
        ? 'No expiry'
        : `Expires ${EXPIRY_FORMAT.format(new Date(expiresAt))}`;
    }
    case 'share.revoked':
      // Nothing to add: the subject column carries the operator's label, and a revocation has no
      // before/after worth a sentence — it happened, and the link is dead.
      return null;
    case 'plan.deleted':
    case 'plan.restored': {
      const status = field(changes?.before, 'status') ?? field(changes?.after, 'status');
      return status === null ? null : `Status ${status.toLowerCase()}`;
    }
    case 'client.deleted':
    case 'client.restored':
    case 'project.deleted':
    case 'project.restored':
      return cascadeDetail(changes);
    case 'activity.deleted':
    case 'activity.restored': {
      // The cascade size FIRST, because that is the fact a reader is checking: deleting a WBS
      // summary takes its whole subtree, and "1 activity" versus "41 activities, 63 links" is the
      // difference between a tidy-up and an incident.
      const cascade = cascadeDetail(changes);
      const plan = field(changes?.before, 'planName');
      const parts = [cascade, plan === null ? null : `in ${plan}`].filter((p) => p !== null);
      return parts.length === 0 ? null : parts.join(' · ');
    }
    case 'activity.dissolved': {
      const promoted = count(changes?.before, 'promotedChildCount');
      // Named as a promotion rather than a count of children, because "kept" is the whole point of
      // the action and the reason it is not a deletion.
      return promoted === null ? null : `${plural(promoted, 'activity', 'activities')} kept`;
    }
    case 'activity.reparented': {
      const moved = count(changes?.after, 'movedCount');
      if (moved === null) return null;
      const where = reparentDestination(changes);
      return `${plural(moved, 'activity', 'activities')} ${where}`;
    }
    case 'dependency.created':
    case 'dependency.deleted': {
      // The direction, spelled out. It is the fact planners most often get wrong (ADR-0064), and
      // the row exists to settle exactly that argument.
      const from =
        field(changes?.after, 'predecessorName') ?? field(changes?.before, 'predecessorName');
      const to = field(changes?.after, 'successorName') ?? field(changes?.before, 'successorName');
      if (from === null || to === null) return null;
      const type = field(changes?.after, 'type') ?? field(changes?.before, 'type');
      return type === null ? `${from} → ${to}` : `${from} → ${to} (${type})`;
    }
    case 'plan.settings_changed': {
      // The FIELDS, named. A reader arriving here is asking "what changed about how this plan
      // computes?", and the row already answers it — listing the names is the whole value, and
      // `updated_by` on the plan row is what they would otherwise be left with.
      const fields = Object.keys(changes?.after ?? {}).filter((key) => key !== 'planName');
      if (fields.length === 0) return null;
      return fields.map(settingName).join(', ');
    }
    case 'calendar.working_time_changed': {
      const what = field(changes?.after, 'changedWhat');
      return what === null ? null : (WORKING_TIME_KINDS[what] ?? what);
    }
    case 'baseline.captured':
    case 'baseline.activated':
    case 'baseline.deleted': {
      const plan = field(changes?.after, 'planName') ?? field(changes?.before, 'planName');
      return plan === null ? null : `On ${plan}`;
    }
    case 'calendar.deleted':
    case 'calendar.archived':
    case 'calendar.unarchived': {
      const scope = field(changes?.after, 'scope') ?? field(changes?.before, 'scope');
      // Which library it was in. A shared calendar going away affects every project in the
      // organisation; a project one affects the project. The row is the only place that survives
      // a deletion, so it is the only place a reader can find out which happened.
      return scope === null ? null : (CALENDAR_SCOPES[scope] ?? scope);
    }
    case 'calendar.scope_changed': {
      const from = field(changes?.before, 'scope');
      const to = field(changes?.after, 'scope');
      if (from === null || to === null) return null;
      return `${CALENDAR_SCOPES[from] ?? from} → ${CALENDAR_SCOPES[to] ?? to}`;
    }
    case 'resource.deleted': {
      const swept = count(changes?.before, 'resourceCount');
      const kind = field(changes?.before, 'kind');
      // The subtree size FIRST, because deleting a group takes everything under it and "1" versus
      // "14 resources" is the difference between a tidy-up and an incident.
      const parts = [
        swept !== null && swept > 1 ? plural(swept, 'resource', 'resources') : null,
        kind === null ? null : resourceKindName(kind),
      ].filter((part) => part !== null);
      return parts.length === 0 ? null : parts.join(' · ');
    }
    case 'resource.archived':
    case 'resource.unarchived': {
      const kind = field(changes?.after, 'kind');
      return kind === null ? null : resourceKindName(kind);
    }
    // No detail line: `staff.session_started`'s allow-list is EMPTY by design — the row records
    // that a surface was reached, never what was on it, because the console reads customer
    // addresses and `audit_events` refuses DELETE. Falls through to the `default` null.
    //
    // `staff.access_denied` is empty for a second reason: WHICH of the three conditions failed is
    // exactly what the uniform 404 withholds, so a detail line here would be the oracle the guard
    // spends its whole design avoiding.
    case 'staff.session_started':
    case 'staff.panel_read':
    case 'staff.access_denied':
      return null;
    case 'interchange.imported': {
      // The filename first — it is the only surviving link to the source, and the upload itself is
      // not kept. The finding count is included ONLY when it is non-zero: "0 findings" on a clean
      // import is noise on every row, while its presence is the cue to go and read the report.
      const filename = field(changes?.after, 'sourceFilename');
      const format = field(changes?.after, 'format');
      const activities = count(changes?.after, 'activityCount');
      const findings = count(changes?.after, 'findingCount');
      const parts = [
        filename ?? format,
        activities === null ? null : plural(activities, 'activity', 'activities'),
        findings !== null && findings > 0 ? plural(findings, 'finding', 'findings') : null,
      ].filter((part) => part !== null);
      return parts.length === 0 ? null : parts.join(' · ');
    }
    case 'auth.signed_up':
    case 'auth.signed_in':
    case 'auth.sign_in_failed':
    case 'auth.signed_out':
    case 'auth.email_verified':
    case 'auth.password_changed':
    case 'auth.password_reset_requested':
    case 'auth.password_reset_completed':
      // The auth actions record no fields at all by design (the API's allow-list is empty for
      // them): who, from where and whether it worked are first-class columns. For the three
      // credential actions it is load-bearing rather than incidental — everything they could
      // carry is a secret.
      return null;
  }
}

/** A numeric field from one side of the payload. Separate from {@link field} because a count of
 *  zero is a real answer and `field`'s string test would drop it. */
function count(side: Record<string, unknown> | undefined, key: string): number | null {
  const value = side?.[key];
  return typeof value === 'number' ? value : null;
}

function plural(n: number, one: string, many: string): string {
  return `${String(n)} ${n === 1 ? one : many}`;
}

/**
 * What a cascade swept, in words — shared by the four hierarchy actions and the two activity ones,
 * because they carry the same flattened count fields and two renderings of the same numbers would
 * eventually disagree.
 *
 * Zero counts are omitted rather than printed: "0 links" is noise on the common case of deleting a
 * single unlinked activity. An action that swept nothing but itself renders no detail at all, which
 * is correct — the columns already say what it was.
 */
function cascadeDetail(changes: AuditChanges | null): string | null {
  const side = changes?.before ?? changes?.after;
  const parts = [
    ['activityCount', 'activity', 'activities'],
    ['dependencyCount', 'link', 'links'],
    ['planCount', 'plan', 'plans'],
    ['projectCount', 'project', 'projects'],
  ]
    .map(([key, one, many]) => {
      const n = count(side, key as string);
      return n === null || n === 0 ? null : plural(n, one as string, many as string);
    })
    .filter((part) => part !== null);
  return parts.length === 0 ? null : parts.join(', ');
}

/** Where a reparent batch sent its activities — three distinct readings, never a guess. */
function reparentDestination(changes: AuditChanges | null): string {
  const parent = field(changes?.after, 'parentName');
  if (parent !== null) return `moved under ${parent}`;
  const parents = count(changes?.after, 'parentCount');
  // More than one destination in the batch: saying "moved to the top level" would be false, and
  // saying nothing would leave the sentence unfinished.
  if (parents !== null && parents > 1) return `moved to ${String(parents)} different groups`;
  return 'moved to the top level';
}

/** The expiry date in the reader's own locale. Date only — the hour a link dies is not a fact
 *  anyone acts on, and a full timestamp crowds the row. */
const EXPIRY_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

/** What a governance field is called on screen. An unlisted name passes through rather than
 *  becoming an em dash — a field added to the set is legible before anyone writes copy for it. */
const SETTING_NAMES: Record<string, string> = {
  plannedStart: 'data date',
  schedulingMode: 'scheduling mode',
  calendarId: 'calendar',
  status: 'status',
  progressRecalcMode: 'progress recalculation',
  criticalPathDefinition: 'critical path definition',
  criticalFloatThresholdMinutes: 'critical float threshold',
  totalFloatMode: 'total float mode',
  makeOpenEndsCritical: 'open ends critical',
  useExpectedFinishDates: 'expected finish dates',
  levelResources: 'resource levelling',
  levelWithinFloatOnly: 'level within float only',
  ignoreExternalRelationships: 'ignore external links',
  eacMethod: 'estimate-at-completion method',
  currencyCode: 'currency',
};

function settingName(field: string): string {
  return SETTING_NAMES[field] ?? field;
}

/** The three kinds of working-time edit the API records. */
const WORKING_TIME_KINDS: Record<string, string> = {
  shifts: 'Working week',
  hoursPerDay: 'Hours per day',
  exception: 'Dated exception',
};

/** Which library a calendar sits in. Named because "ORG" tells a reader nothing. */
const CALENDAR_SCOPES: Record<string, string> = {
  ORG: 'Shared library',
  PROJECT: 'Project calendar',
};

/** A resource's kind, sentence-cased. `GROUP` is worth naming: it is why a delete swept a subtree. */
const RESOURCE_KINDS: Record<string, string> = {
  LABOUR: 'Labour',
  EQUIPMENT: 'Equipment',
  MATERIAL: 'Material',
  GROUP: 'Group',
};

function resourceKindName(kind: string): string {
  return RESOURCE_KINDS[kind] ?? kind;
}

const ROLE_NAMES: Record<string, string> = {
  ORG_ADMIN: 'Org Admin',
  PLANNER: 'Planner',
  CONTRIBUTOR: 'Contributor',
  VIEWER: 'Viewer',
};

/** A stored role rendered for a reader. Unknown values pass through rather than becoming "—". */
function roleName(role: string): string {
  return ROLE_NAMES[role] ?? role;
}

export function auditEventCopy(event: Pick<AuditEvent, 'action' | 'changes'>): AuditEventCopy {
  return { title: TITLES[event.action], detail: detailFor(event.action, event.changes) };
}

/** What the event happened TO, for the subject column. */
export function auditSubject(event: Pick<AuditEvent, 'subjectLabel' | 'subjectType'>): string {
  // A label is the name/email as it was; without one the type is still worth showing, because
  // "PLAN" tells a reader more than an em dash does.
  return event.subjectLabel ?? humaniseType(event.subjectType);
}

function humaniseType(subjectType: string): string {
  const words = subjectType.toLowerCase().split('_');
  const [first, ...rest] = words;
  if (first === undefined) return subjectType;
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(' ');
}

/** Who did it. An anonymous event says so rather than showing a blank. */
export function auditActorName(event: Pick<AuditEvent, 'actorLabel' | 'actorType'>): string {
  if (event.actorLabel !== null && event.actorLabel !== '') return event.actorLabel;
  return event.actorType === 'ANONYMOUS' ? 'Not signed in' : 'Unknown';
}

/**
 * What each filter category is called on screen.
 *
 * The labels name a **question a reader arrives with** — "Deletions", not "Hierarchy lifecycle
 * events" — because a filter whose options need translating before they can be picked charges the
 * same tax as the unfiltered stream. Exhaustively keyed, so a category added for ADR-0073's coming
 * actions cannot reach the UI without someone deciding what to call it.
 */
export const AUDIT_CATEGORY_LABELS: Record<AuditCategory, string> = {
  access: 'Access',
  deletions: 'Deletions',
  'plan-structure': 'Plan structure',
  settings: 'Settings & calendars',
  'sign-ins': 'Sign-ins',
};

/** How each outcome reads in the filter. `DENIED` is a refusal; `FAILURE` is an error. */
export const AUDIT_OUTCOME_LABELS: Record<AuditOutcome, string> = {
  SUCCESS: 'Succeeded',
  // "Denied", not "Refused" — matching the word the row badge has always used
  // (`AuditEventList`). The first draft said "Refused", which is arguably the better word for a
  // permission check but disagreed with the rows the control filters: a reader who picked
  // "Refused" and scanned the results for confirmation would find a word the control never used.
  // One word, and the incumbent wins, because changing it would rewrite copy people already read.
  DENIED: 'Denied',
  FAILURE: 'Failed',
};
