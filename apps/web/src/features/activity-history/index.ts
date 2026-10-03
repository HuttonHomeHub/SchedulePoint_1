/** Public surface of the activity-history feature (ADR-0174). */
export { ActivityHistoryPanel } from './components/ActivityHistoryPanel';
export { useActivityHistory, activityHistoryKeys } from './api/use-activity-history';
export { formatHistoryItem, formatHistoryEntry } from './lib/format-history-item';
