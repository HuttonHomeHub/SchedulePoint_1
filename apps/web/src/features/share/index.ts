/** Public surface of the External-Guest share-links feature (ADR-0051 F-M4). */

/** The member management dialog (create / list / revoke a plan's guest share links). */
export { ShareLinksDialog } from './components/ShareLinksDialog';

/** The public, session-less read-only guest plan view + its no-token fallback. */
export { GuestPlanView, GuestUnavailable, UNAVAILABLE_MESSAGE } from './components/GuestPlanView';

/** Management API hooks + wire types (list / create / revoke). */
export {
  useShares,
  useCreateShare,
  useRevokeShare,
  sharesQueryOptions,
  shareKeys,
  type ShareLink,
  type CreatedShare,
  type CreateShareInput,
} from './api/use-shares';
