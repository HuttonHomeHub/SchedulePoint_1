/**
 * The staff console's route module (ADR-0086).
 *
 * The screen lives in `features/staff/ui/staff-console-screen.tsx`; this file is only the name the
 * router lazy-imports (`app/router.tsx`), so the route's chunk is unchanged by the move.
 */
export { StaffConsoleScreen } from '@/features/staff/ui/staff-console-screen';
