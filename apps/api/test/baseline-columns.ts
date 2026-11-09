import type { Prisma } from '@prisma/client';

/**
 * The columns a baseline row cannot be written without since 1.1.0 (ADR-0215 D6): the five
 * discriminators and the capture-time facts have no column default and are NOT NULL, because a row
 * with defaults would be one the capture can never write. Specs that create a baseline straight
 * through Prisma spread these, so each states a full capture and overrides only what it is about.
 */
export const FULL_BASELINE_COLUMNS = {
  dataDate: new Date('2026-01-01T00:00:00.000Z'),
  capturedProjectFinish: new Date('2026-01-31T00:00:00.000Z'),
  hoursPerDayMinutes: 1440,
  costSnapshotLevel: 'ASSIGNMENT',
  revisionSnapshotLevel: 'FULL',
  placementSnapshotLevel: 'FULL',
  swimlaneSnapshotLevel: 'FULL',
  swimlaneSource: 'NONE',
  codeSnapshotLevel: 'SWIMLANE_TYPE',
} as const satisfies Partial<Prisma.BaselineUncheckedCreateInput>;

/** The same for a snapshot row: its cost, lane and progress columns are NOT NULL. */
export const FULL_BASELINE_ACTIVITY_COLUMNS = {
  budgetedCost: 0n,
  budgetedExpense: 0n,
  laneIndex: 0,
  percentComplete: 0,
} as const satisfies Partial<Prisma.BaselineActivityUncheckedCreateInput>;
