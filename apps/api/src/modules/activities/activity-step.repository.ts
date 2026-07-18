import { Injectable } from '@nestjs/common';
import { Prisma, type ActivityStep } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

/** The scalar inputs a step create needs (org id copied from the parent activity, never input). */
export interface CreateStepInput {
  organizationId: string;
  activityId: string;
  seq: number;
  name: string;
  weight: number;
  percentComplete: number;
  createdBy: string;
  updatedBy: string;
}

/** Fields a step reconcile may write onto a retained row. */
export interface StepPatch {
  seq: number;
  name: string;
  weight: number;
  percentComplete: number;
}

/**
 * Data-access for activity steps (M7 rung 5, ADR-0044 §2) — the weighted progress checklist that
 * hangs off an activity. A reference-template child following the house standards: soft-delete filter
 * centralised, write methods accept an optional transaction client, item lookups org-scoped for
 * anti-IDOR. The `(activity_id, seq)` partial unique among active rows is never tripped by the
 * bulk-replace reconcile: it updates retained rows in place (seq unchanged), appends new rows past the
 * old max seq, and soft-deletes the tail — so no two active rows ever momentarily share a seq.
 */
@Injectable()
export class ActivityStepRepository {
  constructor(private readonly prisma: PrismaService) {}

  private active(where: Prisma.ActivityStepWhereInput = {}): Prisma.ActivityStepWhereInput {
    return { ...where, deletedAt: null };
  }

  /** All active steps of an activity, seq-ordered — the list read shape and the reconcile snapshot. */
  findManyActiveByActivity(
    activityId: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<ActivityStep[]> {
    return db.activityStep.findMany({
      where: this.active({ activityId, organizationId }),
      orderBy: [{ seq: 'asc' }],
    });
  }

  create(
    input: CreateStepInput,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<ActivityStep> {
    return db.activityStep.create({
      data: {
        organizationId: input.organizationId,
        activityId: input.activityId,
        seq: input.seq,
        name: input.name,
        weight: input.weight,
        percentComplete: input.percentComplete,
        createdBy: input.createdBy,
        updatedBy: input.updatedBy,
      },
    });
  }

  /** Overwrite a retained step's mutable fields in place (the reconcile "upsert the rest" path). */
  async updateFields(
    id: string,
    patch: StepPatch,
    updatedBy: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await db.activityStep.updateMany({
      where: this.active({ id }),
      data: {
        seq: patch.seq,
        name: patch.name,
        weight: patch.weight,
        percentComplete: patch.percentComplete,
        updatedBy,
        version: { increment: 1 },
      },
    });
  }

  /**
   * Soft-delete a set of steps (the reconcile's removed tail) under one shared `delete_batch_id`, so a
   * later restore of the batch reactivates them together — the assignment / incident-edge precedent.
   */
  async softDeleteMany(
    ids: string[],
    batchId: string,
    actorId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    if (ids.length === 0) return;
    await db.activityStep.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date(), deleteBatchId: batchId, updatedBy: actorId },
    });
  }
}
