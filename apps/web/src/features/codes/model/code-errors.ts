import { ApiFetchError } from '@/lib/api/client';

/** The machine-readable reason on an error envelope, followed by its code, when it carries either. */
function reasonOf(error: ApiFetchError): string {
  const details = error.error.details as { reason?: string } | undefined;
  return `${details?.reason ?? ''} ${error.error.code}`;
}

/**
 * A refused code write in plain words, **naming the action** ("Could not delete L1: …"), because a
 * bare server sentence ("Version conflict.") says neither what was attempted nor what to do. `action`
 * completes "Could not …". Anything unrecognised keeps the server's own sentence after the action, so
 * nothing is lost and nothing is invented.
 *
 * `subject` is the name of the thing the write was about — the type for a type write, and the type
 * the value belongs to for a value write — and is only used where a sentence has to name it.
 */
export function codeErrorText(action: string, error: unknown, subject?: string): string {
  if (error instanceof ApiFetchError) {
    const reason = reasonOf(error);
    if (error.status === 423) {
      return `Could not ${action}: you no longer hold the plan’s edit lock. Start editing, then try again.`;
    }
    if (/CODE_TYPE_NAME_TAKEN/.test(reason)) {
      return `Could not ${action}: another code type already has that name (names are compared ignoring case).`;
    }
    if (/CODE_VALUE_TAKEN/.test(reason)) {
      return `Could not ${action}: ${subject ?? 'that code type'} already has a value with that short code (compared ignoring case).`;
    }
    if (/CODE_TYPE_LIMIT/.test(reason)) {
      return `Could not ${action}: a plan holds at most 100 code types. Delete one you no longer use first.`;
    }
    if (/CODE_VALUE_LIMIT/.test(reason)) {
      return `Could not ${action}: ${subject ?? 'a code type'} holds at most 1,000 values. Delete one you no longer use first.`;
    }
    if (/CODE_TYPE_IS_SWIMLANE_SOURCE/.test(reason)) {
      return `Could not ${action}: the swimlanes are made from ${subject ?? 'this code type'}. Choose another swimlane source first.`;
    }
    if (/PARENT_DELETED/.test(reason)) {
      return `Could not ${action}: restore ${subject ?? 'its code type'} first.`;
    }
    if (error.status === 409 || error.status === 404) {
      return `Could not ${action}: the codes were changed by someone else. The list has been refreshed, so check it and try again.`;
    }
    if (error.status === 422) return `Could not ${action}: ${error.message}`;
  }
  // Anything else (a 500, a 403, a dropped connection) has no sentence meant for a planner.
  return `Could not ${action}: something went wrong. Try again.`;
}
