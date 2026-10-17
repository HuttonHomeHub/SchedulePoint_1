import { NOTE_CARD_CLASS, NOTE_HEADER_CLASS } from './note-layout';

import { Skeleton } from '@/components/ui/page';

/**
 * A note's loading shape: the card, a header line (`text-sm` author, `text-xs` time) and two body
 * lines (`text-sm`). The author's Edit/Delete row is not drawn — whether the reader wrote the note
 * is data the skeleton cannot know — so an authored note grows by that row when it settles.
 * Hidden from assistive technology by its enclosing `LoadingShape`.
 */
export function NoteItemSkeleton(): React.ReactElement {
  return (
    <li className={NOTE_CARD_CLASS}>
      <div className={NOTE_HEADER_CLASS}>
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-5 w-2/3" />
    </li>
  );
}
