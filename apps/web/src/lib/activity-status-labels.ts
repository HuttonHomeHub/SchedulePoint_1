import type { ActivityStatus } from '@repo/types';

// In `lib/` so the TSLD's Schedule CSV can name a status without importing the activities feature
// (`docs/TECH_DEBT.md` #548); `features/activities` re-exports it.
/** Human labels for progress status (derived server-side from the numbers). */
export const ACTIVITY_STATUS_LABELS: Record<ActivityStatus, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  COMPLETE: 'Complete',
};
