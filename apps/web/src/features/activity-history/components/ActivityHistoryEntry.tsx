import type { ActivityHistoryEntry as Entry } from '@repo/types';

import { formatHistoryEntry, type HistoryFormatContext } from '../lib/format-history-item';

import { formatTimestamp } from '@/lib/format-date';

/**
 * One entry of an activity's history: who, when, and one line per thing they changed. A merged entry
 * says how many saves it absorbed (`3 edits`), and a group move says it was one (ADR-0174 D2).
 */
export function ActivityHistoryEntry({
  entry,
  context,
}: {
  entry: Entry;
  context: HistoryFormatContext;
}): React.ReactElement {
  const lines = formatHistoryEntry(entry.changes, context);
  const others = entry.batch ? entry.batch.size - 1 : 0;
  return (
    <li className="border-border flex flex-col gap-1 rounded-lg border p-3 text-sm">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-foreground">{entry.actor.name}</span>
        <time dateTime={entry.firstRecordedAt} className="text-muted-foreground">
          {formatTimestamp(entry.firstRecordedAt)}
        </time>
        {entry.editCount > 1 ? (
          <span className="text-muted-foreground">· {entry.editCount} edits</span>
        ) : null}
        {others > 0 ? (
          <span className="text-muted-foreground">
            · with {others} other {others === 1 ? 'activity' : 'activities'}
          </span>
        ) : null}
      </p>
      <ul className="list-disc pl-5">
        {lines.map((line) => (
          <li key={line.text}>{line.text}</li>
        ))}
      </ul>
    </li>
  );
}
