/**
 * A note's card, shared by `NoteItem` and `NoteItemSkeleton` so the placeholder and the settled
 * note cannot drift apart (a skeleton that is 4 px off reflows the thread when it settles).
 */
export const NOTE_CARD_CLASS = 'border-border flex flex-col gap-1.5 rounded-lg border p-3';
export const NOTE_HEADER_CLASS = 'flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5';
