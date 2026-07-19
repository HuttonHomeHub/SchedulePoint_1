import { z } from 'zod';

/** The note body length bounds — the client mirror of the server DTO / DB CHECK (ADR-0046). */
export const NOTE_BODY_MIN = 1;
export const NOTE_BODY_MAX = 5000;

/**
 * The note composer/edit form schema (RHF + Zod). The body is trimmed before validation so a
 * whitespace-only entry collapses to `''` and fails the min — matching the server DTO (which trims,
 * then `@MinLength(1)` → 422) and the DB `ck_notes_body_length` CHECK. Plain text only (Q1 default,
 * ADR-0046); no markdown. The over-limit bound is checked against the RAW length (see the composer's
 * live char cue), so the message reads before the trim ever runs.
 */
export const noteFormSchema = z.object({
  body: z
    .string()
    .trim()
    .min(NOTE_BODY_MIN, 'Enter a note.')
    .max(NOTE_BODY_MAX, `Keep the note under ${NOTE_BODY_MAX.toLocaleString()} characters.`),
});

export type NoteFormValues = z.infer<typeof noteFormSchema>;

/**
 * Where a note thread hangs — a plan note (`activityId` null) or an activity note. Threaded through
 * the hooks + components so one composer/thread/mutation set serves both surfaces (ADR-0046 Option B).
 * `planId` is always present (an activity note carries its activity's plan id — the counts key).
 */
export interface NoteTarget {
  planId: string;
  activityId: string | null;
}
