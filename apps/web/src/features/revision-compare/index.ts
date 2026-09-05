export {
  useRevisionCompare,
  revisionCompareQueryOptions,
  LIVE_REVISION,
} from './api/use-revision-compare';
export {
  carrierChangedSentence,
  completionSentence,
  comparisonAnnouncement,
  HONESTY_FOOTER,
  LEVELLING_CAVEAT,
  settingsCaveat,
  sideLabel,
  sideTitle,
  truncationNote,
} from './model/revision-sentences';
export { RevisionComparePanel } from './components/RevisionComparePanel';
export {
  useRevisionComparePanelPrefs,
  REVISION_PANEL_MIN_WIDTH,
  REVISION_PANEL_MAX_WIDTH,
} from './use-revision-compare-panel-prefs';
