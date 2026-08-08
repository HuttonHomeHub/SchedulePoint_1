import { Link2, Trash2 } from 'lucide-react';
import { useId } from 'react';

import { Button } from '@/components/ui/button';
import { NoticeStrip } from '@/components/ui/notice-strip';

/**
 * What a plural selection can do, and why it cannot (`docs/specs/canvas-multi-select/` M4-T7).
 *
 * **Where it lives is the first decision.** In the reserved chrome band beside `CanvasModeBand`,
 * never floating over the scene — the canvas already carries the ADR-0054 cursor chip, the ADR-0056
 * Today pill and the ADR-0031 floating selection bar, and a fifth overlay eventually comes to rest
 * on the bar a planner is trying to click. That is not hypothetical; it is how this epic's own
 * predecessor's harness failed once (ADR-0064 T4).
 *
 * **It replaces the floating per-object bar rather than joining it.** At one selected activity the
 * floating bar is right: the actions are about *that* bar and it points at it. At two or more there
 * is no bar to point at, and per-object actions (Edit, Open logic) have no meaning — so they are
 * **absent**, not shaded, and this bar names the primary instead. Shading an action that could
 * never apply is the "lit but inert" shape inverted: a control that exists to say no.
 *
 * **`aria-disabled`, never the native attribute.** This is the `ScopeSaveBar` / `WbsBulkAssignBar`
 * lesson, and the repo has now re-learnt it three times (ADR-0060 M6, ADR-0063 M6, ADR-0064 §7): a
 * natively disabled button blurs to `<body>` the instant it flips, and these flip twice per action —
 * once when the write starts under the user's own focus, once when it lands. `pointer-events-none`
 * stops the mouse, the click guard stops the keyboard, and the control never leaves the tab order.
 *
 * **One status line, `aria-describedby`-linked** to whichever action it explains — not merely
 * adjacent to it. Proximity is association for a sighted reader and nothing at all in the
 * accessibility tree; the ADR-0073 C2.5 review caught exactly this, in a fix written for it.
 */

/** May an action be used, and — when not — why, in words a planner can act on. */
export interface BulkActionGate {
  readonly enabled: boolean;
  /** Present exactly when `enabled` is false. The bar renders it; it never invents one. */
  readonly reason: string | null;
}

export interface BulkSelectionBarProps {
  /** How many activities are selected. The bar renders nothing below two. */
  count: number;
  /** The primary's name — what the singular affordances elsewhere still act on. */
  primaryName: string | null;
  link: BulkActionGate;
  remove: BulkActionGate;
  onLink: () => void;
  onDelete: () => void;
  /** Clear the selection — always available, because it is the way out. */
  onClear: () => void;
  /** A bulk write is in flight. Both actions go inert; neither leaves the tab order. */
  busy?: boolean;
}

function BulkAction({
  gate,
  busy,
  onActivate,
  icon,
  label,
  reasonId,
  tone,
}: {
  gate: BulkActionGate;
  busy: boolean;
  onActivate: () => void;
  icon: React.ReactNode;
  label: string;
  /**
   * The id of the ONE status line, or undefined when nothing is on screen to point at.
   *
   * Undefined rather than a per-button id, because a per-button id is only valid if that button's
   * own reason is the one being rendered — and with a single status line at most one of them ever
   * is. The UX review over this epic's diff found the earlier version pointing the Link button (the
   * first control in tab order) at an id that was not in the DOM, so the first control a
   * screen-reader user reached was shaded with **no** exposed reason: exactly the defect this
   * component's docblock claims to fix. `WbsBulkAssignBar` had it right — one shared status id.
   */
  reasonId: string | undefined;
  tone?: 'destructive';
}): React.ReactElement {
  const blocked = !gate.enabled || busy;
  return (
    <Button
      type="button"
      size="sm"
      variant={tone === 'destructive' ? 'destructive' : 'secondary'}
      aria-disabled={blocked}
      aria-busy={busy}
      {...(blocked && reasonId ? { 'aria-describedby': reasonId } : {})}
      onClick={(event) => {
        if (blocked) {
          event.preventDefault();
          return;
        }
        onActivate();
      }}
      className="aria-disabled:pointer-events-none aria-disabled:opacity-60"
    >
      {icon}
      {label}
    </Button>
  );
}

export function BulkSelectionBar({
  count,
  primaryName,
  link,
  remove,
  onLink,
  onDelete,
  onClear,
  busy = false,
}: BulkSelectionBarProps): React.ReactElement | null {
  const statusId = useId();
  // Below two this is not a plural selection and the floating per-object bar is the right surface.
  // Rendering nothing (rather than an empty strip) is what keeps the flag-off parity claim simple:
  // at one selected, the canvas is exactly what it was.
  if (count < 2) return null;

  // ONE line, and it prefers the sentence that stops an action over the one that merely warns.
  //
  // It used to fall through to a third sentence — "moving these will pin a start-no-earlier-than
  // date on all N" — which was **removed rather than kept**: the plural drag that would pin them
  // was never wired (its model, its command and its endpoint all landed; the gesture did not), so
  // the bar was telling a planner what a gesture they cannot perform would do. That is worse than
  // the "lit but inert" class this repo keeps finding — an inert control does nothing, a false
  // sentence asserts something.
  //
  // **The gesture is now wired (`docs/TECH_DEBT.md` #108), so a sentence comes back — but not that
  // sentence.** The original was only true in EARLY mode: a plural move pins an SNET there and
  // writes `visualStart` in VISUAL (ADR-0033), so restoring it verbatim would re-introduce a false
  // statement for half the plans in the product, which is the defect it was removed for wearing a
  // different hat. What replaces it is true in both modes and is the fact a planner actually needs
  // before they drag — that the gesture is plural at all.
  const status = !remove.enabled ? remove.reason : !link.enabled ? link.reason : null;
  // A **separate** line from `status`, and deliberately so. `status` is the reason a control is
  // SHUT, and it is what `aria-describedby` points the shut buttons at; folding the drag caveat
  // into it made every action's description read "Dragging any of these moves all 3", which is
  // unrelated to why the button is off. 101 unit tests said so immediately. The caveat is a fact
  // about the selection, not about a control, so it gets its own element and no describedby.
  const dragHint = `Dragging any of these moves all ${String(count)}.`;
  // One id, shared by whichever controls are shut — see `BulkAction`'s `reasonId` docblock.
  const describedBy = status === null ? undefined : statusId;

  return (
    <NoticeStrip
      data-testid="bulk-selection-bar"
      tone="accent"
      message={
        primaryName
          ? `${count} activities selected — “${primaryName}” is the subject of single-activity actions.`
          : `${count} activities selected.`
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {status ? (
          <p
            id={statusId}
            className="text-muted-foreground text-sm"
            // Announced as it changes: the gates move with the pen, and a planner who has just lost
            // the lock is told once, here, rather than discovering it by pressing a shaded button.
            role="status"
          >
            {status}
          </p>
        ) : null}
        <p className="text-muted-foreground text-sm">{dragHint}</p>
        <BulkAction
          gate={link}
          busy={busy}
          onActivate={onLink}
          reasonId={describedBy}
          icon={<Link2 aria-hidden="true" className="size-4" />}
          label="Link in sequence…"
        />
        <BulkAction
          gate={remove}
          busy={busy}
          onActivate={onDelete}
          reasonId={describedBy}
          tone="destructive"
          icon={<Trash2 aria-hidden="true" className="size-4" />}
          label="Delete"
        />
        <Button type="button" size="sm" variant="ghost" onClick={onClear}>
          Clear selection
        </Button>
      </div>
    </NoticeStrip>
  );
}
