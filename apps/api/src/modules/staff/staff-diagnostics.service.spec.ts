import { describe, expect, it, vi } from 'vitest';

import { DIAGNOSTICS, type DiagnosticEntry } from './staff-diagnostics.registry';
import { StaffDiagnosticsRepository } from './staff-diagnostics.repository';
import { StaffDiagnosticsService } from './staff-diagnostics.service';

/**
 * The service's own behaviour, with the database stubbed.
 *
 * **What these cannot tell you is stated first, because ADR-0086's M2 shipped a route unable to
 * serve a single request with 1,589 unit tests green** — every one of them mocking Prisma. Nothing
 * here proves the SQL parses, that the columns exist, that `count(*)` returns what the repository
 * expects, or that the response survives the real interceptor. That is `test/staff-diagnostics.e2e-spec.ts`,
 * which lands in the same milestone for exactly that reason.
 */

function stubRepository(
  overrides: Partial<Record<string, unknown>> = {},
): StaffDiagnosticsRepository {
  return {
    // Hands the reader a handle, as the real transaction does; the handle is opaque to the service.
    reading: vi.fn((read: (db: unknown) => unknown) => read({})),
    examined: vi.fn().mockResolvedValue(1284),
    affected: vi.fn().mockResolvedValue({
      affected: 17,
      affectedPlans: 3,
      affectedOrganizations: 1,
    }),
    ...overrides,
  } as unknown as StaffDiagnosticsRepository;
}

const version = { getVersion: () => '0.63.0' } as never;
const logger = { error: vi.fn() } as never;

describe('StaffDiagnosticsService', () => {
  it('runs every registry entry and returns one row each', async () => {
    const service = new StaffDiagnosticsService(stubRepository(), version, logger);

    const result = await service.run();

    expect(result.diagnostics).toHaveLength(DIAGNOSTICS.length);
    expect(result.diagnostics.map((d) => d.id)).toEqual(DIAGNOSTICS.map((d) => d.id));
    expect(result.apiVersion).toBe('0.63.0');
  });

  it('reports the numbers beside the denominator they are a fraction of', async () => {
    const service = new StaffDiagnosticsService(stubRepository(), version, logger);

    const [first] = await service.run().then((r) => r.diagnostics);

    // `examined` is not decoration. A count with no denominator lets a reader conclude a defect is
    // large when it is a rounding error, which is the failure this console exists to remove.
    expect(first).toMatchObject({
      examined: 1284,
      affected: 17,
      affectedPlans: 3,
      affectedOrganizations: 1,
    });
    expect(typeof first!.elapsedMs).toBe('number');
  });

  it('carries a zero through as a result rather than as an absence', async () => {
    const service = new StaffDiagnosticsService(
      stubRepository({
        examined: vi.fn().mockResolvedValue(0),
        affected: vi
          .fn()
          .mockResolvedValue({ affected: 0, affectedPlans: 0, affectedOrganizations: 0 }),
      }),
      version,
      logger,
    );

    const [first] = await service.run().then((r) => r.diagnostics);

    // A zero is the strongest possible answer to #86's M0-T3 and must not be left unstated — the
    // plan task says so in as many words. The row is present, not omitted.
    expect(first).toMatchObject({ examined: 0, affected: 0 });
  });

  it('takes ONE server timestamp for the whole run, not one per entry', async () => {
    const service = new StaffDiagnosticsService(stubRepository(), version, logger);

    const result = await service.run();

    // The block a staff member pastes into a measurement record needs one time for the reading.
    // Per-entry timestamps would invite somebody to treat entries taken 40 ms apart as separate
    // observations of a moving system.
    expect(result.takenAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Object.keys(result.diagnostics[0]!)).not.toContain('takenAt');
  });

  it('runs the whole press inside ONE repository reading, handing every entry the same handle', async () => {
    const repository = stubRepository();
    const service = new StaffDiagnosticsService(repository, version, logger);

    await service.run();

    // One snapshot is the point of #456: a second `reading` would be a second observation.
    expect(repository.reading).toHaveBeenCalledTimes(1);
    const handles = new Set(
      [...(repository.examined as ReturnType<typeof vi.fn>).mock.calls].map((call) => call[1]),
    );
    expect(handles.size).toBe(1);
  });

  it('logs the entry that failed by id and rethrows, so the route answers its existing 500', async () => {
    const boom = Object.assign(new Error('canceling statement due to statement timeout'), {
      code: '57014',
    });
    const error = vi.fn();
    const service = new StaffDiagnosticsService(
      stubRepository({ examined: vi.fn().mockRejectedValue(boom) }),
      version,
      { error } as never,
    );

    await expect(service.run()).rejects.toBe(boom);
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ diagnosticId: DIAGNOSTICS[0]?.id, err: boom }),
      expect.any(String),
    );
  });

  it('takes no argument — the absence of an input is the decision (ADR-0140 D2, clause 2)', () => {
    // A signature test rather than a behaviour one, deliberately: the guarantee is that a caller
    // CANNOT vary the question, and a behaviour test would only notice once somebody tried.
    expect(StaffDiagnosticsService.prototype.run).toHaveLength(0);
  });
});

describe('the registry', () => {
  it('gives every entry a distinct id and a label that describes the question', () => {
    const ids = DIAGNOSTICS.map((d: DiagnosticEntry) => d.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of DIAGNOSTICS) {
      expect(entry.label.length).toBeGreaterThan(0);
      // A label describes the QUESTION and never an answer, so it carries nothing about this
      // installation — which is what lets it be a registry literal rather than data.
      expect(entry.label).not.toMatch(/\d/);
    }
  });
});
