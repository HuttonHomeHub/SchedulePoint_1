import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { StaffPrincipal } from '../../common/auth/staff-principal';
import type { RequestContext } from '../../common/decorators/request-context.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { VersionService } from '../../version/version.service';
import { AuditService } from '../audit/audit.service';

import type { CreateProbeResultDto, ProbeLimbDto } from './dto/create-probe-result.dto';
import type { ProbeResultRowDto } from './dto/probe-result.dto';

/** The history read's page size when the caller names none. */
const DEFAULT_LIMIT = 50;

/**
 * The staff console's one write, and the property it must not break.
 *
 * **It takes a {@link StaffPrincipal}, and the compile error is the guarantee** (ADR-0086 D1). A
 * `Principal` is not assignable to it and it is not assignable to a `Principal` — neither direction
 * — so this service cannot be handed a member's identity and cannot call a member service, because
 * every one of those takes a `Principal`. That is a stronger statement than "it does not today":
 * making it reach customer data is a type error rather than a review finding.
 *
 * There is also nothing here to scope. `perf_probe_results` has no `organization_id`, no foreign
 * key to any customer model, and no column that could hold a plan, activity or client id — so no
 * IDOR surface exists to get wrong, rather than one existing and being guarded.
 *
 * **The write and its audit row are one transaction, and the audit row is ONE row per press**, never
 * one per limb (ADR-0073 C3.1: one row per user action, never per swept row). `record()` rather than
 * `recordBestEffort()`, the `staff.controller.ts:88-95` argument unchanged: on this surface a staff
 * act that could not be recorded is exactly the thing the console replaces, so an unwritable
 * `audit_events` makes this a 500 and **nothing is stored** — a lost measurement rather than an
 * unrecorded one, which is the right way round.
 */
@Injectable()
export class StaffProbeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly version: VersionService,
  ) {}

  /**
   * Store one press: one row per limb, grouped by a **server-minted** `runId`.
   *
   * `runId`, `recordedAt` and `apiVersion` are all set here and never read from the body — the
   * three service-layer obligations `m4-schema-record.md` records, because no constraint can hold
   * them. A client-minted `runId` lets one machine's numbers be filed under another's grouping; a
   * browser clock is neither trustworthy nor monotonic against this database's, and it is the
   * retention predicate; and the API's version is a claim about a process the browser cannot
   * observe.
   */
  async record(
    staff: StaffPrincipal,
    dto: CreateProbeResultDto,
    context: RequestContext,
  ): Promise<ProbeResultRowDto[]> {
    const runId = crypto.randomUUID();
    const apiVersion = this.version.getVersion();

    return this.prisma.$transaction(async (tx) => {
      const created = [];
      for (const limb of dto.limbs) {
        created.push(
          await tx.perfProbeResult.create({
            data: {
              runId,
              // **Client-supplied, and deliberately so** — the one field here that is. `runId`,
              // `recordedAt` and `apiVersion` are server-set because the client cannot be trusted
              // with them; `sweepId` is the opposite case, because only the client knows that four
              // presses were one sitting and the server holds no state across them. `?? null`
              // rather than a default: absent means a single press, which is a fact, not a gap.
              sweepId: dto.sweepId ?? null,
              framesPerPhase: dto.framesPerPhase ?? null,
              recordedByUserId: staff.userId,
              recordedByLabel: staff.email,
              scenarioId: dto.scenarioId,
              scenarioVersion: dto.scenarioVersion,
              limbId: limb.limbId,
              limbKind: limb.limbKind,
              preset: dto.preset,
              pxPerDay: limb.pxPerDay,
              activityCount: limb.activityCount,
              edgeCount: limb.edgeCount,
              sceneSummary: limb.sceneSummary,
              samples: samplesOf(limb),
              counts: { ...limb.counts },
              thresholds: { ...limb.thresholds },
              viewportWidth: dto.viewportWidth,
              viewportHeight: dto.viewportHeight,
              devicePixelRatio: dto.devicePixelRatio,
              idleIntervalMs: dto.idleIntervalMs,
              hardwareConcurrency: dto.hardwareConcurrency ?? null,
              deviceMemoryGb: dto.deviceMemoryGb ?? null,
              gpuRenderer: dto.gpuRenderer ?? null,
              userAgent: dto.userAgent,
              reducedMotion: dto.reducedMotion,
              lostFocusDuringRun: dto.lostFocusDuringRun,
              machineLabel: dto.machineLabel ?? null,
              appVersion: dto.appVersion,
              apiVersion,
            },
          }),
        );
      }

      // ONE row for the press. Its allow-list is EMPTY, so no device characteristic reaches
      // `audit_events` — those name a staff member's own machine, and that table refuses DELETE.
      // The scenario travels in `subjectLabel`, which is a column rather than a payload, exactly as
      // the four panel reads carry theirs.
      await this.audit.record(
        {
          action: 'staff.probe_recorded',
          outcome: 'SUCCESS',
          actorType: 'STAFF',
          actorUserId: staff.userId,
          actorLabel: staff.email,
          subjectType: 'staff_probe',
          subjectId: runId,
          subjectLabel: dto.scenarioId,
          ...context,
        },
        tx,
      );

      return created.map(toRow);
    });
  }

  /**
   * The history, newest first.
   *
   * A plain backward scan of `(recorded_at, id)` — both keys descend together, so `ORDER BY
   * recorded_at DESC, id DESC` needs no second index and no DESC declaration.
   */
  async list(limit: number = DEFAULT_LIMIT): Promise<ProbeResultRowDto[]> {
    const rows = await this.prisma.perfProbeResult.findMany({
      orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return rows.map(toRow);
  }
}

/**
 * Which array the row stores, chosen by the limb's own discriminator rather than by whichever
 * property happens to be present.
 *
 * The DTO already refuses a mismatch (`SamplesMatchLimbKind`), so this cannot fall through in
 * practice — and it dispatches on `limbKind` anyway, because reading the shape off the data would
 * make the stored `limb_kind` and the stored `samples` capable of disagreeing.
 */
function samplesOf(limb: ProbeLimbDto): Prisma.InputJsonValue {
  const samples = limb.limbKind === 'difference' ? (limb.pairs ?? []) : (limb.runs ?? []);
  return samples as unknown as Prisma.InputJsonValue;
}

type PersistedRow = Awaited<ReturnType<PrismaService['perfProbeResult']['create']>>;

/**
 * The row as the panel reads it.
 *
 * `recordedByUserId` is deliberately **not** projected: the label answers "who" for a reader, and
 * the id answers nothing a console shows. Prisma's `Decimal`-free numeric columns come back as
 * numbers already; `samples`/`counts`/`thresholds` are JSONB and are handed through untouched,
 * because the verdict is derived on read and the server does not judge.
 */
function toRow(row: PersistedRow): ProbeResultRowDto {
  return {
    id: row.id,
    runId: row.runId,
    sweepId: row.sweepId,
    framesPerPhase: row.framesPerPhase,
    recordedAt: row.recordedAt.toISOString(),
    recordedByLabel: row.recordedByLabel,
    scenarioId: row.scenarioId,
    scenarioVersion: row.scenarioVersion,
    limbId: row.limbId,
    limbKind: row.limbKind,
    preset: row.preset,
    pxPerDay: row.pxPerDay,
    activityCount: row.activityCount,
    edgeCount: row.edgeCount,
    sceneSummary: row.sceneSummary,
    samples: row.samples as unknown[],
    counts: row.counts as Record<string, unknown>,
    thresholds: row.thresholds as Record<string, unknown>,
    viewportWidth: row.viewportWidth,
    viewportHeight: row.viewportHeight,
    devicePixelRatio: row.devicePixelRatio,
    idleIntervalMs: row.idleIntervalMs,
    hardwareConcurrency: row.hardwareConcurrency,
    deviceMemoryGb: row.deviceMemoryGb,
    gpuRenderer: row.gpuRenderer,
    userAgent: row.userAgent,
    reducedMotion: row.reducedMotion,
    lostFocusDuringRun: row.lostFocusDuringRun,
    machineLabel: row.machineLabel,
    appVersion: row.appVersion,
    apiVersion: row.apiVersion,
  };
}
