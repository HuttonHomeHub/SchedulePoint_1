import type { CanonicalNote } from './canonical.js';
import { importNoteText, MAX_NOTES, type NoteSource } from './note-text.js';
import type { ReportFinding } from './report.js';

/**
 * Collects the notes one adapter reads and the account of what the text step changed or left out, so
 * both adapters report in the same words (spec §4.7). Every finding is aggregate — one per reason, with
 * a count — never one per note, which is what #543 established.
 */
export class NoteCollector {
  readonly notes: CanonicalNote[] = [];
  private formatted = 0;
  private longNotes = 0;
  private longPieces = 0;
  private tooLarge = 0;
  private richText = 0;
  private noActivity = 0;
  private overLimit = 0;

  /** Read one source remark onto an activity. */
  add(activityId: string, raw: string, source: NoteSource, topic?: string): void {
    const result = importNoteText(raw, source, topic);
    if (!result.ok) {
      if (result.reason === 'TOO_LARGE') this.tooLarge += 1;
      else this.richText += 1;
      return;
    }
    if (result.formatted) this.formatted += 1;
    this.longNotes += result.longNotes;
    this.longPieces += result.longPieces;
    for (const body of result.bodies) {
      if (this.notes.length >= MAX_NOTES) this.overLimit += 1;
      else this.notes.push({ activityId, body });
    }
  }

  /** A memo whose task this import did not take. */
  orphan(): void {
    this.noActivity += 1;
  }

  findings(): ReportFinding[] {
    const out: ReportFinding[] = [];
    if (this.formatted > 0) {
      out.push({
        kind: 'approximation',
        entity: 'note',
        sourceRef: null,
        detail: `formatting was removed from ${plural(this.formatted, 'note')}`,
        reason: 'activity notes are plain text (ADR-0046)',
      });
    }
    if (this.longNotes > 0) {
      out.push({
        kind: 'approximation',
        entity: 'note',
        sourceRef: null,
        detail: `${plural(this.longNotes, 'long note')} ${this.longNotes === 1 ? 'was' : 'were'} split into ${this.longPieces} notes`,
        reason: 'a note holds at most 5,000 characters (ADR-0046)',
      });
    }
    const dropped = (count: number, reason: string): void => {
      if (count === 0) return;
      out.push({
        kind: 'drop',
        entity: 'note',
        sourceRef: null,
        detail: `${plural(count, 'note')} ${count === 1 ? 'was' : 'were'} not imported`,
        reason,
      });
    };
    dropped(this.noActivity, 'the note belongs to an activity this import did not take');
    dropped(this.richText, 'rich-text notes cannot be read');
    dropped(this.tooLarge, 'the note is larger than 1,000,000 characters');
    dropped(this.overLimit, `an import carries at most ${MAX_NOTES} notes`);
    return out;
  }
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
