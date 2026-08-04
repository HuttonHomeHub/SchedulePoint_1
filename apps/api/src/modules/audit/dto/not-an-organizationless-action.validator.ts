import { ValidatorConstraint, type ValidatorConstraintInterface } from 'class-validator';

/**
 * The prefix whose rows carry no `organizationId`.
 *
 * Derived from the vocabulary's own naming rule (`subject.past_tense_verb`) rather than listed
 * action by action, so a sixth `auth.*` event added later is covered without anyone remembering
 * this file. If a future family also turns out to be organisation-less, it joins this array and
 * the reason belongs beside it.
 */
export const ORGANIZATIONLESS_ACTION_PREFIXES = ['auth.'] as const;

/** True when this action can never carry an organisation, and so can never match an org-scoped read. */
export function isOrganizationlessAction(action: string): boolean {
  return ORGANIZATIONLESS_ACTION_PREFIXES.some((prefix) => action.startsWith(prefix));
}

/**
 * Refuse an `auth.*` action on the organisation read (ADR-0073).
 *
 * Both halves of the reason are in `ListOrganizationAuditEventsQueryDto`'s docblock: the filter is
 * unanswerable, and — because a zero-match filter has to walk the whole organisation partition to
 * prove the absence — it is also the most expensive query the table accepts.
 */
@ValidatorConstraint({ name: 'notAnOrganizationlessAction', async: false })
export class NotAnOrganizationlessAction implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (!Array.isArray(value)) return true;
    return !value.some((action) => typeof action === 'string' && isOrganizationlessAction(action));
  }

  defaultMessage(): string {
    return (
      'auth.* actions carry no organisation and cannot appear in an organisation’s log. ' +
      'Read your own sign-in history on /me/audit-events.'
    );
  }
}
