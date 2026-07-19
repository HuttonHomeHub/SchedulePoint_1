import { MessageSquare } from 'lucide-react';

import { Badge } from '@/components/ui/badge';

/**
 * A compact per-row note-count indicator for the activities table (ADR-0046), fed by the batch
 * `activity-counts` query (ONE query for the whole table — never per-row). Zero renders nothing (a
 * bare row shouldn't carry an empty badge); a positive count shows the icon + number with a spelled-
 * out accessible label ("3 notes"), so the meaning is in text, not the icon/colour alone (WCAG 1.4.1).
 */
export function NoteCountBadge({ count }: { count: number }): React.ReactElement | null {
  if (count <= 0) return null;
  return (
    <Badge variant="neutral" size="sm" title={`${count} ${count === 1 ? 'note' : 'notes'}`}>
      <MessageSquare aria-hidden="true" className="mr-1 size-3" />
      <span aria-hidden="true">{count}</span>
      <span className="sr-only">
        {count} {count === 1 ? 'note' : 'notes'}
      </span>
    </Badge>
  );
}
