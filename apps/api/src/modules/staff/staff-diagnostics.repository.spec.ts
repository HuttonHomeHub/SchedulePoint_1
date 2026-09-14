import { describe, expect, it, vi } from 'vitest';

import { DIAGNOSTICS } from './staff-diagnostics.registry';
import { StaffDiagnosticsRepository } from './staff-diagnostics.repository';

/**
 * The `bigint` boundary, which is the one thing a unit test can prove here that matters.
 *
 * `count(*)` returns a **`bigint`**, and `JSON.stringify` throws on one — so without the conversion
 * this route would return 500 for every call, and no test that mocks Prisma with a plain number
 * would ever see it. That is ADR-0086's M2 failure in miniature, which is why these cases hand the
 * stub what Postgres actually hands the driver.
 */

const entry = DIAGNOSTICS[0];

function repositoryReturning(...results: unknown[]): StaffDiagnosticsRepository {
  const $queryRaw = vi.fn();
  for (const result of results) $queryRaw.mockResolvedValueOnce(result);
  return new StaffDiagnosticsRepository({ $queryRaw } as never);
}

describe('StaffDiagnosticsRepository', () => {
  it('converts the bigint Postgres actually returns into a number', async () => {
    const repository = repositoryReturning([{ examined: 1284n }]);

    await expect(repository.examined(entry)).resolves.toBe(1284);
  });

  it('converts every count on the numerator row', async () => {
    const repository = repositoryReturning([
      { affected: 17n, affected_plans: 3n, affected_organizations: 1n },
    ]);

    await expect(repository.affected(entry)).resolves.toEqual({
      affected: 17,
      affectedPlans: 3,
      affectedOrganizations: 1,
    });
  });

  it('accepts a plain integer, because a driver change is a change of representation', async () => {
    const repository = repositoryReturning([{ examined: 7 }]);

    await expect(repository.examined(entry)).resolves.toBe(7);
  });

  it('refuses a count too large to represent exactly, rather than rounding it silently', async () => {
    const repository = repositoryReturning([{ examined: BigInt(Number.MAX_SAFE_INTEGER) + 2n }]);

    // A silently rounded population figure in a document somebody pastes into a measurement record
    // is worse than a failure: the whole point of this console is that its numbers can be trusted
    // without a shell.
    await expect(repository.examined(entry)).rejects.toThrow(/safe integer range/);
  });

  it('refuses a row whose shape is not what the declared type ASSERTS', async () => {
    // The declared `$queryRaw<T>` type is an unchecked cast — TypeScript validates what the file
    // declares and never what Postgres returns (ADR-0140 D3 point 2). This is the runtime half of
    // that repair; gate S-4 over the projection list is the other.
    const repository = repositoryReturning([{ wrong_column: 1n }]);

    await expect(repository.examined(entry)).rejects.toThrow(/was not a count/);
  });

  it('refuses anything but exactly one aggregate row', async () => {
    // An aggregate over zero rows still returns one row. No row at all, or two, means the SQL
    // stopped being an aggregate — which would otherwise surface as `undefined` reaching the DTO.
    await expect(repositoryReturning([]).examined(entry)).rejects.toThrow(/exactly one aggregate/);
    await expect(
      repositoryReturning([{ examined: 1n }, { examined: 2n }]).examined(entry),
    ).rejects.toThrow(/exactly one aggregate/);
  });
});
