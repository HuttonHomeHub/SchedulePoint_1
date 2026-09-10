import { PenLine, PenOff } from 'lucide-react';

import type { EditLockControlsProps } from './EditLockControls';

import type { ToolbarItemRenderApi } from '@/components/ui/toolbar/toolbar-registry';
import { ToolbarButton } from '@/components/ui/toolbar/ToolbarButton';
import { lockCopy } from '@/features/plan-lock/lib/lock-copy';

/**
 * **The pen, at the head of the row it unlocks** (console epic M5).
 *
 * `Start editing` / `Stop editing` was three sections away from the eleven authoring commands whose
 * state it decides — on the plan's identity line, where ADR-0090 M4 put it. `UX_STANDARDS.md`'s own
 * rule is that a control belongs beside the condition it answers, and the condition this one answers
 * is "may I author?", which is exactly what the AUTHOR group shades on.
 *
 * ## What stays behind, and why that is not a compromise
 *
 * Only the **verb** moves. The badge, the `role="status"` sentence and the seven hand-off actions
 * (request, waiting, take over, override, hand over, keep, dismiss) remain in the plan's foot row —
 * ADR-0112 D1 put the sentence there and this keeps its neighbours with it, which is the product
 * owner's answer to CQ-4. The split is ADR-0093's discriminator applied to a model rather than a
 * command: an **action** belongs on its object, a **fact** belongs where facts are read.
 *
 * Its accepted cost is stated rather than glossed: for the branches that offer a hand-off, the
 * condition and its explanation are now at the bottom of the screen while the verb is at the top.
 * The seven common branches gain what those lose.
 *
 * ## One `usePenLockView` call
 *
 * This component takes its view as **props** and never calls the hook. The hook holds local state —
 * a dismissed request id, a countdown tick, a just-acted ref — so a second call would let the deck's
 * half and the foot's half disagree about the same lock, each looking correct alone.
 *
 * ## `penGated: false`, and a test says so
 *
 * The pen is the control that *grants* the pen. Gating it on holding one would shade it in precisely
 * the state it exists for.
 */
export function PlanPenControl({
  isPending,
  onStart,
  onStop,
  api,
}: Pick<EditLockControlsProps, 'isPending' | 'onStart' | 'onStop'> & {
  api: ToolbarItemRenderApi;
}): React.ReactElement {
  // **Which verb** follows the resolved pressed state, not the action list. The registry derives
  // "I hold the pen" from the view's tone — see `penVerbs` for the branch where the two disagree
  // and why reading the list here put a false sentence on screen. Reading `api.active` keeps this
  // component with no opinion of its own about the lock.
  const canStop = api.active;

  // **Whether the control is live, and whether it is pressed, are read from the RESOLVED item and
  // never re-derived here.** They were computed locally in M5's first version, from the same
  // `actions` array the registry's `isEnabled`/`isActive` read — two hand-written copies of one
  // rule, agreeing only because both were typed on the same afternoon. Editing either alone (a
  // later `penGated`, a busy gate, anything added to `isEnabled`) would leave the registry saying
  // the control is shut while this rendered it live with no reason attached: a shaded control that
  // is not shaded, invisible to a suite that drives the real lock states because both halves would
  // still agree about those. The comment appears verbatim on this file's three sibling `render`
  // items, which is where the component review found the same defect and fixed it once already.
  return (
    <ToolbarButton
      itemId={api.itemProps['data-toolbar-item']}
      label={canStop ? lockCopy.stopEditing : lockCopy.startEditing}
      icon={canStop ? <PenOff className="size-4" /> : <PenLine className="size-4" />}
      showLabel
      // Never absent while the lock status is resolving or shut — an item that disappears takes a
      // roving stop with it and shifts every command on the DO row sideways, which is worse than a
      // shaded control and a shape ADR-0064 records shipping once. So it renders in all thirteen
      // branches and shades in the eleven offering neither verb (CQ-3's default, ADR-0082's
      // discriminator: shut by a state the reader can change, or by their role, is a shading).
      pressed={api.active}
      activeKind={api.activeKind}
      // **`disabled` carries the in-flight mutation as well as the gate**, which its seven foot-row
      // siblings have always done (`EditLockControls` sets `disabled={isPending}` on every one) and
      // this control did not. `busy` alone is `aria-busy` and nothing else: `ToolbarButton` does not
      // block activation on it, so the pen stayed pressable while an acquire or release was in the
      // air. The accessibility review found it as an inconsistency inside one feature; it is listed
      // here as a decision rather than left as an accident.
      //
      // **A busy pen carries no reason, and that is right rather than an omission.** ADR-0082's
      // "shade with a reason" covers a control shut by a state the reader can change or by their
      // role; a mutation in flight is neither, it is transient, and `aria-busy` names it on the
      // same element. `api.disabledReason` is `undefined` whenever the item itself is enabled, so
      // this composes without a branch.
      disabled={api.disabled || isPending}
      disabledReason={api.disabledReason}
      srDescription={undefined}
      busy={isPending}
      onActivate={canStop ? onStop : onStart}
      // **Spread, and the two keys it really contributes are named here rather than implied.**
      // `ToolbarButton` takes `tabIndex` and `onFocus` as ordinary props — those are the roving
      // model — and stamps `data-toolbar-item`/`data-toolbar-focusable` **itself** from `itemId`,
      // so those two members of the spread are inert. The first version of this comment claimed the
      // spread carried the marker attributes; it does not, and the control was correct only because
      // the component derives the same values independently.
      //
      // It is still a spread rather than two named props, so a key added to `itemProps` later
      // reaches this control instead of being silently dropped — which is the failure the named
      // form would have. `itemId` is read from the spread's own value for the same reason: a
      // hand-typed `"pen"` here is a third copy of the registry's id, and a rename would leave the
      // toolbar unable to focus this stop with nothing failing.
      {...api.itemProps}
    />
  );
}
