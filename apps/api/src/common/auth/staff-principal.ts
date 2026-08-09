/**
 * The SchedulePoint-staff request identity (ADR-0086 D1).
 *
 * A staff member operates the **installation** — mail health, CSP reports, version and
 * configuration state, account counts. They are not a member of anything, and this type is
 * **deliberately, structurally distinct** from {@link Principal}: it has no `memberships`, no
 * `can()`, no `organizationId` and no `role`.
 *
 * That is copied from {@link GuestPrincipal} for the property its own docblock states — every
 * member service method takes a `Principal`, so a `StaffPrincipal` can never flow into one. **Staff
 * reaching customer data is a compile error, not a runtime check we could forget.** The alternative
 * considered and rejected was a `STAFF` role or an `isStaff` flag on `Principal`, which would put a
 * new branch into twenty modules' org-scope assertions — the highest-consequence code in the
 * product, where every branch is a potential IDOR and the guarantee becomes vigilance across a
 * hundred call sites instead of a fact about a type.
 *
 * Consequently `AuthContextService` is **not modified**, there is no `STAFF` in `OrganizationRole`,
 * and there is no staff branch in `permissionsForRole`. The member authorisation path is
 * byte-identical to before this type existed, which is what makes the review surface small.
 *
 * **A dual-hatted person is expected** (ADR-0086 D4): the same human may be allowlisted here and
 * hold an `ORG_ADMIN` membership elsewhere. The two never coexist on one request — they are
 * resolved by different guards on disjoint route sets — so being staff widens nothing inside any
 * organisation. What it changes is that the audit row says `actor_type = 'STAFF'`, which is more
 * than a `psql` shell offers.
 */
export class StaffPrincipal {
  constructor(
    /** The Better Auth user id, for the audit actor. */
    readonly userId: string,
    /**
     * The normalised address that matched the allowlist — the audit actor label.
     *
     * Normalised with `toLowerCase()` and nothing else, through the shared `normalizeEmail`. See
     * that function for why trimming would be a defect rather than a courtesy.
     */
    readonly email: string,
  ) {}
}
