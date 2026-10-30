import { ApiFetchError } from '@/lib/api/client';

/** The machine-readable reason on an error envelope, or its code, when it carries either. */
function reasonOf(error: ApiFetchError): string {
  const details = error.error.details as { reason?: string } | undefined;
  return `${details?.reason ?? ''} ${error.error.code}`;
}

/**
 * A refused swimlane write in plain words, **naming the action** ("Could not move Mechanical: …"),
 * because a bare server sentence ("Version conflict.") says neither what was attempted nor what to
 * do. `action` completes "Could not …". Anything unrecognised keeps the server's own sentence after
 * the action, so nothing is lost and nothing is invented.
 */
export function swimlaneErrorText(action: string, error: unknown): string {
  if (error instanceof ApiFetchError) {
    const reason = reasonOf(error);
    if (error.status === 423) {
      return `Could not ${action}: you no longer hold the plan’s edit lock. Start editing, then try again.`;
    }
    if (/SWIMLANE_NAME_TAKEN/.test(reason)) {
      return `Could not ${action}: another swimlane already has that name (names are compared ignoring case).`;
    }
    if (/SWIMLANE_LIMIT/.test(reason)) {
      return `Could not ${action}: a plan holds at most 100 swimlanes.`;
    }
    // The plan write's own words for a code that is unusable, classified by its reason; the unknown-code
    // 404 carries no reason, only its sentence ("That code no longer exists. Choose another."). A bare 404
    // elsewhere still reads as a colleague's change.
    if (
      /SWIMLANE_CODE_TYPE_/.test(reason) ||
      (error.status === 404 && /^That code /.test(error.message))
    ) {
      return `Could not ${action}: ${error.message}`;
    }
    if (error.status === 409 || error.status === 404) {
      return `Could not ${action}: the swimlanes were changed by someone else. The list has been refreshed, so check it and try again.`;
    }
    if (error.status === 422) return `Could not ${action}: ${error.message}`;
  }
  const message = error instanceof Error ? error.message : 'something went wrong.';
  return `Could not ${action}: ${message}`;
}
