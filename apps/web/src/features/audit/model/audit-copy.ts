import type { AuditAction, AuditChanges, AuditEvent } from '@repo/types';

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
  'auth.signed_up': 'Account created',
  'auth.signed_in': 'Signed in',
  'auth.sign_in_failed': 'Sign-in failed',
  'auth.signed_out': 'Signed out',
  'auth.email_verified': 'Email verified',
  'client.deleted': 'Client deleted',
  'client.restored': 'Client restored',
  'project.deleted': 'Project deleted',
  'project.restored': 'Project restored',
  'plan.deleted': 'Plan deleted',
  'plan.restored': 'Plan restored',
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
    case 'plan.deleted':
    case 'plan.restored': {
      const status = field(changes?.before, 'status') ?? field(changes?.after, 'status');
      return status === null ? null : `Status ${status.toLowerCase()}`;
    }
    case 'client.deleted':
    case 'client.restored':
    case 'project.deleted':
    case 'project.restored':
      return null;
    case 'auth.signed_up':
    case 'auth.signed_in':
    case 'auth.sign_in_failed':
    case 'auth.signed_out':
    case 'auth.email_verified':
      // The auth actions record no fields at all by design (the API's allow-list is empty for
      // them): who, from where and whether it worked are first-class columns.
      return null;
  }
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
