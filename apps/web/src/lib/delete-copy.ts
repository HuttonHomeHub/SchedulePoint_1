/**
 * **The one sentence every delete confirmation ends with.**
 *
 * It lives here, alone, because it was written five times — once in the Project Explorer's tree
 * menu and once in each of the three hierarchy tables — and ADR-0096 M3 changed all five to
 * "…from Recently deleted **for a limited time**", which is **false on any host that has not armed
 * the retention sweep**. `RETENTION_HIERARCHY_ENABLED` defaults to `false`, so on a stock
 * installation nothing in Recently deleted has ever been permanently removed and there is no limit
 * to warn about. The claim was made at the one moment a planner is deciding whether deleting is
 * safe.
 *
 * That is the epic's own rule failing one screen along. ADR-0096 D4 says a countdown for a
 * deletion that will not happen states a consequence the system does not deliver, and the Recently
 * deleted screen withholds every expiry sentence unless the server says `retentionActive` — while
 * these five dialogs asserted it unconditionally, in the same commit.
 *
 * **The fix is to say only what is true everywhere, and more only when the server says so.**
 * Without a {@link DeleteRetention} the sentence makes no claim about a deadline. The organisation
 * list — authenticated, and already read by the shell — carries `retentionActive` and
 * `retentionDays`; when the server says the clear-out is on, the sentence names the SERVER's period
 * and says the removal is permanent (`docs/TECH_DEBT.md` #140). `/version` is `@Public()` and
 * putting installation configuration on an unauthenticated route to improve a sentence is the
 * wrong trade, so it is not there.
 */
export function deleteCascadeWarning(
  kind: 'client' | 'project' | 'plan',
  name: string,
  retention?: DeleteRetention,
): string {
  const subject = `“${name}”`;
  const cascade =
    kind === 'client'
      ? ` and all its projects and plans`
      : kind === 'project'
        ? ` and all its plans`
        : '';
  return `Delete ${subject}${cascade}? ${recoveryClause(retention)}`;
}

/**
 * The server's clear-out configuration as the organisation list carries it. Absent while that list
 * is loading or when the organisation is not in it — and absent means the unconditional sentence,
 * which is the one that is true on every host.
 */
export interface DeleteRetention {
  active: boolean;
  days: number;
}

function recoveryClause(retention: DeleteRetention | undefined): string {
  if (!retention?.active) return 'You can restore it from Recently deleted.';
  const period = `${retention.days} ${retention.days === 1 ? 'day' : 'days'}`;
  return `You can restore it from Recently deleted for ${period}; after that it is permanently removed.`;
}
