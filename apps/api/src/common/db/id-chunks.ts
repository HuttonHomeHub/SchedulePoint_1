/**
 * **How many ids one Prisma `{ in: [...] }` may carry** (`docs/TECH_DEBT.md` #238, #96-adjacent).
 *
 * Prisma does not chunk an `in` list — it sends one bind parameter per element, and Postgres'
 * extended protocol refuses more than 32,767 in a prepared statement. Measured against this
 * repository's own generated client by the ADR-0096 backend-performance review, **by running the
 * real client rather than reading the driver**: 32,767 succeeds, 32,768 fails with `P2035` ("too
 * many bind variables in prepared statement").
 *
 * **8,000, not 32,767**, and the margin is deliberate. A predicate that mentions the same list
 * twice exhausts the budget at half the ceiling — the cross-plan-edge delete in
 * `hierarchy-expiry.runner.ts` was measured failing at 16,384 ids for exactly that reason — and
 * every statement also carries the plan ids and literals sharing it. The consequence of getting it
 * wrong is not a slow query but a throw, and in the expiry runner's case a subtree that becomes
 * **permanently unexpirable**, retried hourly forever.
 *
 * **This lives here because it is now the second caller.** It was a private constant and helper in
 * `hierarchy-expiry.runner.ts`; `restoreDeleteBatch` hit the same ceiling from a different module
 * (`docs/TECH_DEBT.md` #238, reproduced live against a real database rather than inferred). Two
 * copies of a limit measured once would drift, and the drift would be invisible — each looks right
 * alone, and only someone comparing them at the boundary would ever see it. That is the ADR-0065
 * `routeOrthogonal` argument applied to a number.
 */
export const MAX_IDS_PER_STATEMENT = 8_000;

/** Split a list into {@link MAX_IDS_PER_STATEMENT}-sized chunks; an empty list yields no chunks. */
export function chunkIds(ids: readonly string[]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += MAX_IDS_PER_STATEMENT) {
    out.push(ids.slice(i, i + MAX_IDS_PER_STATEMENT));
  }
  return out;
}
