import { useId, useRef, useState } from 'react';

import { useAnnounce } from '@/components/ui/announcer';
import { Input } from '@/components/ui/input';
import { useCommittedDraft } from '@/components/ui/use-committed-draft';
import { clampSize } from '@/components/ui/use-resizable-panel-prefs';
import { cn } from '@/lib/utils';

/**
 * What to say when the size applied is not the size typed — **a typed value is never changed
 * silently** (ADR-0173). Three ways it can differ: nothing usable was typed, the number was outside
 * the field's bounds, or the bounds were fine and something else limited it (`limitReason`). Said in
 * words, once, in a polite status — a clamp is not an error, so nothing is marked invalid.
 */
function limitedNotice(
  subject: string,
  min: number,
  max: number,
  asked: number | null,
  applied: number,
  limitReason: string | undefined,
): string | null {
  if (asked === null) return `${subject} not changed. Enter ${min} to ${max} pixels.`;
  if (applied === asked) return null;
  return asked < min || asked > max || limitReason === undefined
    ? `${subject} limited to ${applied} px. Allowed range is ${min} to ${max} pixels.`
    : `${subject} limited to ${applied} px ${limitReason}.`;
}

/**
 * **One typed size, in pixels** (ADR-0173; ADR-0188 D2) — a native spinbutton, because a typed number
 * is the keyboard, screen-reader and single-pointer route to what a drag reaches (WCAG 2.1.1, 2.5.7).
 * Extracted from the Gantt's Columns group, where it was a private `WidthField`, so a divider's size
 * box and `View ▾` are one implementation rather than two that drift.
 *
 * **A field of its own, on a shared hook**: its inline row, `px` suffix and `limitedNotice` are not
 * `TextField`'s layout, but the draft/commit/Escape keyboard contract is `useCommittedDraft`'s, so a
 * fix to it lands once rather than here and again in whatever types next (`docs/TECH_DEBT.md` #495).
 *
 * **Applies on Enter, blur or an arrow step — never per keystroke**, and Escape discards the draft
 * even when the container closes on the same key; the hook's docblock carries the reasoning. The
 * toolbar's key veto already yields ArrowUp/Down to a number input (`OWNS_ALL_KEYS`), so the step
 * does not fight it.
 */
export function SizeField({
  subject,
  value,
  min,
  max,
  step,
  hintId,
  apply,
  onNotice,
  limitReason,
  className,
  inputRef,
}: {
  /** What is being sized and in which axis, e.g. "Project Explorer width". It is the visible label. */
  subject: string;
  value: number;
  min: number;
  max: number;
  /** The arrow-key step (px); a divider passes its own `KEY_STEP` so field and keys agree. */
  step: number;
  /** The id of the element that states the range, wired as the field's description. */
  hintId: string;
  /** Apply a size; returns the size actually applied. */
  apply: (size: number) => number;
  onNotice: (message: string | null) => void;
  /** Completes "limited to N px …" when the bounds were fine and something else limited the value. */
  limitReason?: string;
  /** Merged onto the row (an indent, say). */
  className?: string;
  /** For a host that must move focus onto the field when its container opens. */
  inputRef?: React.RefObject<HTMLInputElement | null>;
}): React.ReactElement {
  const id = useId();
  const ownInputRef = useRef<HTMLInputElement>(null);
  const input = inputRef ?? ownInputRef;
  const announce = useAnnounce();

  const commit = (raw: string): void => {
    const n = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(n)) {
      onNotice(limitedNotice(subject, min, max, null, value, limitReason));
      return;
    }
    const asked = Math.round(n);
    onNotice(
      limitedNotice(subject, min, max, asked, apply(clampSize(asked, min, max)), limitReason),
    );
  };
  const draft = useCommittedDraft({
    value: String(value),
    onCommit: commit,
    step,
    type: 'number',
    // A typed value is never lost silently (ADR-0173): the hook reports it, the sentence is ours.
    onDraftLost: () => announce(`${subject}: the typed size was not applied.`),
    inputRef: input,
  });

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <label htmlFor={id} className="text-muted-foreground min-w-0 flex-1 text-sm">
        {subject}
      </label>
      <Input
        ref={input}
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        aria-describedby={hintId}
        className="w-24"
        {...draft}
      />
      <span aria-hidden="true" className="text-muted-foreground text-sm">
        px
      </span>
    </div>
  );
}

/**
 * **The polite status a size field speaks through**, shared by every host of one (the Gantt's Columns
 * group, a divider's size box) so a clamp, an unusable entry and a reset are all said the same way.
 * `status` is always mounted, because a live region has to exist before its content changes to be
 * announced, and its message `id` changes on every notice so an identical message is a new node and
 * is announced again — a live region only speaks when its content changes.
 */
export function useSizeNotice(): {
  setNotice: (text: string | null) => void;
  status: React.ReactElement;
} {
  const [notice, setNoticeState] = useState<{ id: number; text: string } | null>(null);
  const count = useRef(0);
  const setNotice = (text: string | null): void => {
    if (text === null) {
      setNoticeState(null);
      return;
    }
    count.current += 1;
    setNoticeState({ id: count.current, text });
  };
  return {
    setNotice,
    status: (
      <p role="status" className="text-muted-foreground text-xs">
        {notice === null ? null : <span key={notice.id}>{notice.text}</span>}
      </p>
    ),
  };
}
