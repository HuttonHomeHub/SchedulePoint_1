import { Link2, Trash2 } from 'lucide-react';
import { useId } from 'react';

import { pluralMoveHint } from '../model/reposition-announcement';
import type { SwimlaneAssignment } from '../model/swimlane-assignment';

import { MoveToSwimlaneButton } from './MoveToSwimlaneButton';

import { Button } from '@/components/ui/button';
import { NoticeStrip } from '@/components/ui/notice-strip';
import { useTooltip } from '@/components/ui/tooltip';

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
 * once when the write starts under the user's own focus, once when it lands. The click guard stops
 * the pointer and the keyboard, `aria-busy:pointer-events-none` adds pointer inertness while the
 * write is in flight only (a refused action must stay hoverable for its reason), and the control
 * never leaves the tab order.
 *
 * **One status line, `aria-describedby`-linked** to whichever action it explains — not merely
 * adjacent to it. Proximity is association for a sighted reader and nothing at all in the
 * accessibility tree; the ADR-0073 C2.5 review caught exactly this, in a fix written for it.
 *
 * **One short line** (diagram-keys-and-selection M7, `docs/specs/diagram-keys-and-selection/m5-measurement.md`
 * "The plural bar"). It used to be a sentence, a drag hint and the actions, 122 px at 1024 × 600 —
 * dearer than the single-activity bar it replaces. Now a caption ("3 selected"), the actions and
 * Clear selection; the one visible sentence is a refusal, when there is one. What was dropped from
 * the screen was not dropped from the reader: the subject sentence is the bar's accessible
 * description, and the move hint is spoken by the panel when the selection turns plural and echoed
 * as a tooltip on the caption. **No overflow menu at any size** — the strip wraps rather than clips,
 * which is the whole reason there is room to leave every action in view.
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
  /**
   * May the caller move the selection (role + pen). Defaults to `false`: the move hint is a claim
   * about what the keys do, and a viewer or a planner without the pen must not be told it works.
   */
  canMove?: boolean;
  /**
   * **Move to swimlane…** for the whole selection (swimlanes M2-T10, ADR-0080). Absent when the plan
   * has no swimlanes to move to, which omits the button rather than leaving it lit and inert; shaded
   * with a reason while they are not drawn. Its gate rides the same write right as the other two
   * actions.
   */
  moveToSwimlane?: {
    assignment: SwimlaneAssignment;
    ids: readonly string[];
    names: readonly string[];
    gate: { writable: boolean; reason: string | null };
  } | null;
  /**
   * **Set code…** for the whole selection (P6 activity codes, M3-T4). The host renders it — a button
   * with a popover over `features/codes`' control — because this feature must not import that one
   * (`docs/TECH_DEBT.md` #548). Absent where the plan has no code types, which omits it. It sits
   * after Move to swimlane… and before Delete, and carries its own shading and reason.
   */
  codeAction?: React.ReactNode;
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
      className="aria-busy:pointer-events-none"
    >
      {icon}
      {label}
    </Button>
  );
}

/**
 * The caption, and the move hint it carries as a tooltip. A component of its own because
 * `useTooltip` is a hook and the bar returns early below two.
 *
 * `'name-echo'`: the panel already speaks the hint when the selection turns plural (and when the pen
 * arrives, TECH_DEBT #529), from the same `pluralMoveHint`, so a tooltip a screen reader also read
 * would say it a second time. The caption is not focusable, so this is a hover and long-press
 * affordance for a sighted reader; the keyboard reader has the spoken one and the shortcuts sheet.
 */
function Caption({ count, hint }: { count: number; hint: string | null }): React.ReactElement {
  const tip = useTooltip({ content: hint ?? undefined, purpose: 'name-echo' });
  return (
    <>
      <span {...tip.triggerProps} className="font-medium whitespace-nowrap">
        {`${String(count)} selected`}
      </span>
      {tip.tooltip}
    </>
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
  canMove = false,
  moveToSwimlane = null,
  codeAction = null,
}: BulkSelectionBarProps): React.ReactElement | null {
  const statusId = useId();
  const subjectId = useId();
  // Below two this is not a plural selection and the floating per-object bar is the right surface.
  // Rendering nothing (rather than an empty strip) is what keeps the flag-off parity claim simple:
  // at one selected, the canvas is exactly what it was.
  if (count < 2) return null;

  // ONE line, and it prefers the sentence that stops an action over the one that merely warns. It is
  // the only sentence on screen, and only while something is refused: it is also what `aria-describedby`
  // points the shut buttons at, so it cannot be dropped to save room.
  //
  // The drag hint is not here. It was folded into this strip as a second visible line until M7 and
  // is now the caption's tooltip, spoken by the panel from the same function when the selection turns
  // plural, so the two cannot drift. It was never part of `status`: folding a fact about the
  // selection into the reason a control is shut made every action's description read "Dragging any
  // of these moves all 3" (the 101-tests lesson), and that separation is kept.
  //
  // (The strip once carried a "moving these will pin a start-no-earlier-than date" sentence for a
  // plural drag that was not yet wired, removed as false, and a replacement true in both modes was
  // the hint. Neither belongs on the line.)
  const status = !remove.enabled ? remove.reason : !link.enabled ? link.reason : null;
  const moveHint = canMove ? pluralMoveHint(count) : null;
  // One id, shared by whichever controls are shut — see `BulkAction`'s `reasonId` docblock.
  const describedBy = status === null ? undefined : statusId;

  return (
    <>
      <NoticeStrip
        data-testid="bulk-selection-bar"
        tone="accent"
        // A group, so the sentence that used to be on screen has something to describe: a bare div
        // with `aria-describedby` exposes no description to anything.
        role="group"
        aria-label="Selected activities"
        aria-describedby={subjectId}
        // Asks the dock for a line of its own where it does not fit beside the plan facts (the
        // outlet's `data-dock-row` floor): the caption and five actions are about 650 px, against the
        // 350 px the facts leave at 1024. It wraps rather than clips (`flex-wrap`), so a refusal beside
        // all five costs one more line and never a lost control.
        data-dock-row=""
        // `grow`, not the default `truncate`: the caption is two words and must never take an ellipsis.
        messageFit="grow"
        className="flex-wrap gap-2"
        message={<Caption count={count} hint={moveHint} />}
      >
        {/* `contents`: the actions are the strip's own flex items, so the caption and the actions wrap
          as one run instead of the caption being left alone on a line above a group. */}
        <div className="contents">
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
          <BulkAction
            gate={link}
            busy={busy}
            onActivate={onLink}
            reasonId={describedBy}
            icon={<Link2 aria-hidden="true" className="size-4" />}
            label="Link in sequence…"
          />
          {moveToSwimlane ? (
            <MoveToSwimlaneButton
              assignment={moveToSwimlane.assignment}
              ids={moveToSwimlane.ids}
              names={moveToSwimlane.names}
              gate={moveToSwimlane.gate}
            />
          ) : null}
          {codeAction}
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
      {/* A sibling, not a child: the strip's own text is what a reader and a test see as "the bar", and
        the sentence must be in the accessibility tree without being in it (the `TsldMinimap`
        `sr-only` + `aria-describedby` pattern). */}
      <span id={subjectId} className="sr-only">
        {primaryName
          ? `${String(count)} activities selected — “${primaryName}” is the subject of single-activity actions.`
          : `${String(count)} activities selected.`}
      </span>
    </>
  );
}
