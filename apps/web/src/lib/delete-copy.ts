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
 * **The fix is to say only what is true everywhere**, not to guess. The limit is stated where it
 * can be stated honestly: on Recently deleted, which prints the rule with the SERVER's period and
 * counts each deletion down individually. The accepted cost is that on an armed host the delete
 * dialog no longer mentions the deadline — recorded rather than waved away. Gating this sentence
 * on the real fact needs an authenticated carrier for the retention configuration that these
 * screens already fetch; `/version` is `@Public()` and putting installation configuration on an
 * unauthenticated route to improve a sentence is the wrong trade (`docs/TECH_DEBT.md` #140).
 */
export function deleteCascadeWarning(kind: 'client' | 'project' | 'plan', name: string): string {
  const subject = `“${name}”`;
  const cascade =
    kind === 'client'
      ? ` and all its projects and plans`
      : kind === 'project'
        ? ` and all its plans`
        : '';
  return `Delete ${subject}${cascade}? You can restore it from Recently deleted.`;
}
