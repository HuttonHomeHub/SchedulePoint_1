import type { ActivityHistoryEntry } from '@repo/types';

import { formatHistoryEntry, type HistoryFormatContext } from '../lib/format-history-item';

import { formatTimestamp } from '@/lib/format-date';

export interface ActivityHistoryItemProps {
  entry: ActivityHistoryEntry;
  context: HistoryFormatContext;
}

/** A separator that is for the eye only: a screen reader reads the facts, not the punctuation. */
function Dot(): React.ReactElement {
  return <span aria-hidden="true">·</span>;
}

/**
 * One entry of an activity's history: who, when, and one line per thing they changed. A merged entry
 * says how many saves it absorbed (`3 edits`), and a group move says it was saved together with others
 * (ADR-0174 D2) — the batch does not say which action it was, so the wording does not either. A
 * knock-on entry (it has an origin) says what happened in its lines instead.
 */
export function ActivityHistoryItem({
  entry,
  context,
}: ActivityHistoryItemProps): React.ReactElement {
  const lines = formatHistoryEntry(entry.changes, context, entry.origin);
  // An entry with an origin is a consequence of somebody else's action on another activity (a delete,
  // a restore, a dissolve), and its lines say so; "saved together" would describe a group move.
  const others = entry.batch && entry.origin === null ? entry.batch.size - 1 : 0;
  return (
    <li className="border-border flex flex-col gap-1 rounded-lg border p-3 text-sm">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">{entry.actor.name}</span>
        <time dateTime={entry.firstRecordedAt} className="text-muted-foreground">
          {formatTimestamp(entry.firstRecordedAt)}
        </time>
        {entry.editCount > 1 ? (
          <span className="text-muted-foreground">
            <Dot /> {entry.editCount} edits
          </span>
        ) : null}
        {others > 0 ? (
          <span className="text-muted-foreground">
            <Dot /> saved together with {others} other {others === 1 ? 'activity' : 'activities'}
          </span>
        ) : null}
      </p>
      <ul className="list-disc pl-5">
        {lines.map((line) => (
          <li key={line.key} className="break-words">
            {line.text}
          </li>
        ))}
      </ul>
    </li>
  );
}
