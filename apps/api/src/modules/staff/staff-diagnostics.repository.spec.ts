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

/** A repository over a stub client, and the transaction handle its entries are read through. */
function repositoryReturning(...results: unknown[]) {
  const $queryRaw = vi.fn();
  for (const result of results) $queryRaw.mockResolvedValueOnce(result);
  const tx = { $queryRaw } as never;
  const repository = new StaffDiagnosticsRepository({ $queryRaw } as never);
  return {
    examined: (e: typeof entry) => repository.examined(e, tx),
    affected: (e: typeof entry) => repository.affected(e, tx),
  };
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

describe('StaffDiagnosticsRepository.reading', () => {
  function transactional() {
    const statements: string[] = [];
    const tx = {
      $queryRaw: vi.fn((strings: TemplateStringsArray) => {
        statements.push(strings.join('').trim());
        return Promise.resolve([]);
      }),
    };
    const $transaction = vi.fn((fn: (client: unknown) => unknown, ..._options: unknown[]) =>
      fn(tx),
    );
    const repository = new StaffDiagnosticsRepository({ $transaction } as never);
    return { repository, statements, $transaction, tx };
  }

  it('opens ONE repeatable-read transaction and makes it read-only and time-bounded first', async () => {
    const { repository, statements, $transaction, tx } = transactional();

    const result = await repository.reading((db) => {
      // The reader is handed the same handle, and the setup has already run when it starts.
      expect(db).toBe(tx);
      expect(statements).toEqual([
        'SET TRANSACTION READ ONLY',
        "SET LOCAL statement_timeout = '3s'",
      ]);
      return Promise.resolve('read');
    });

    expect(result).toBe('read');
    expect($transaction).toHaveBeenCalledTimes(1);
    expect($transaction.mock.calls[0]?.[1]).toMatchObject({
      isolationLevel: 'RepeatableRead',
      timeout: 60_000,
    });
  });

  it('does not run the reader when the setup fails, so nothing reads unbounded', async () => {
    const { repository, tx } = transactional();
    tx.$queryRaw.mockRejectedValueOnce(new Error('setup refused'));
    const reader = vi.fn();

    await expect(repository.reading(reader)).rejects.toThrow('setup refused');
    expect(reader).not.toHaveBeenCalled();
  });
});
