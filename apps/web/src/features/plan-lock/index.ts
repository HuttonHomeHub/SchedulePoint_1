/**
 * The plan edit-lock ("pen") feature public surface (ADR-0028, edit-lock M2). The
 * route consumes `usePlanPen` once and mounts `EditLockBanner`; everything else is
 * internal. Gated by `VITE_PLAN_EDIT_LOCK` — inert (no polling/heartbeat/banner)
 * when off.
 */
export { EditLockBanner } from './components/EditLockBanner';
export {
  usePlanPen,
  usePlanEditLock,
  planEditLockQueryOptions,
  planLockKeys,
  type PlanPen,
  type WriteRejection,
} from './api/use-plan-edit-lock';
export { classifyLockError, isLockError } from './lib/lock-error';
