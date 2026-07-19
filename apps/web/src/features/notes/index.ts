/**
 * Public surface of the Notes feature (Notes M3, ADR-0046) — attributed, time-ordered note threads on
 * plans and activities. Gated at the composition sites behind `VITE_NOTES` (the CRUD + batch-counts API
 * is already live). One thread/composer/item set (Option B) serves both the plan and activity surfaces.
 */
export { ActivityNotesSection } from './components/ActivityNotesSection';
export { PlanNotesSection } from './components/PlanNotesSection';
export { NoteThread } from './components/NoteThread';
export { NoteComposer } from './components/NoteComposer';
export { NoteItem } from './components/NoteItem';
export { NoteCountBadge } from './components/NoteCountBadge';
export {
  useNoteThread,
  useActivityNoteCounts,
  useCreateNote,
  useUpdateNote,
  useDeleteNote,
  noteKeys,
  type NotePage,
} from './api/use-notes';
export {
  noteFormSchema,
  NOTE_BODY_MIN,
  NOTE_BODY_MAX,
  type NoteFormValues,
  type NoteTarget,
} from './schemas/note-schemas';
