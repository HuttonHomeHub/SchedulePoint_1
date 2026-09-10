import type { PlanEditLockActor } from '@repo/types';
import { useState } from 'react';

import { lockCopy } from '../lib/lock-copy';
import type { LockAction } from '../lib/lock-view';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

export interface EditLockControlsProps {
  actions: readonly LockAction[];
  /**
   * Render only these actions, dropping the rest (console epic M5-T1). The pen's `start`/`stop`
   * moved to the command deck — it is the control that unlocks the eleven commands beside it — while
   * the badge, the live-region sentence and the seven hand-off actions stay in the plan's foot row.
   * Two surfaces, ONE `usePenLockView` call: the hook holds real local state (`dismissedRequestId`,
   * a countdown tick, a just-acted ref), so a second call would let the two halves disagree about
   * the same lock — the ADR-0062 drift, invisible because each looks right alone.
   *
   * Absent ⇒ every action in {@link actions}, which is what every pre-M5 caller means.
   */
  only?: readonly LockAction[];
  /** The current holder (for the admin take-over confirm copy). */
  holder: PlanEditLockActor | null;
  /** Any lock mutation is in flight — disables the action buttons. */
  isPending: boolean;
  onStart: () => void;
  onStop: () => void;
  onRequest: () => void;
  onTakeOver: () => void;
  onOverride: () => void;
  onHandover: () => void;
  onKeep: () => void;
  onDismiss: () => void;
}

/**
 * The button cluster the {@link EditLockBanner} renders, one button per
 * {@link LockAction} the view resolved. Every button is a design-system `Button`
 * (native `<button>`, token focus ring, keyboard-operable). The admin **override**
 * is consequential (it demotes the current holder), so it confirms through the
 * focus-trapped `ConfirmDialog` (`role="alertdialog"`) — a non-destructive confirm.
 */
export function EditLockControls({
  actions: allActions,
  only,
  holder,
  isPending,
  onStart,
  onStop,
  onRequest,
  onTakeOver,
  onOverride,
  onHandover,
  onKeep,
  onDismiss,
}: EditLockControlsProps): React.ReactElement | null {
  const [confirmOverride, setConfirmOverride] = useState(false);
  const actions = only ? allActions.filter((a) => only.includes(a)) : allActions;
  if (actions.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.includes('start') ? (
        <Button size="sm" onClick={onStart} disabled={isPending} aria-busy={isPending}>
          {lockCopy.startEditing}
        </Button>
      ) : null}
      {actions.includes('stop') ? (
        <Button
          size="sm"
          variant="outline"
          onClick={onStop}
          disabled={isPending}
          aria-busy={isPending}
        >
          {lockCopy.stopEditing}
        </Button>
      ) : null}
      {actions.includes('request') ? (
        <Button
          size="sm"
          variant="outline"
          onClick={onRequest}
          disabled={isPending}
          aria-busy={isPending}
        >
          {lockCopy.requestControl}
        </Button>
      ) : null}
      {actions.includes('waiting') ? (
        <Button size="sm" variant="outline" disabled>
          {lockCopy.takeOverNow}
        </Button>
      ) : null}
      {actions.includes('takeover') ? (
        <Button size="sm" onClick={onTakeOver} disabled={isPending} aria-busy={isPending}>
          {lockCopy.takeOverNow}
        </Button>
      ) : null}
      {actions.includes('override') ? (
        <>
          <Button
            size="sm"
            onClick={() => setConfirmOverride(true)}
            disabled={isPending}
            aria-busy={isPending}
          >
            {lockCopy.takeOver}
          </Button>
          <ConfirmDialog
            open={confirmOverride}
            onClose={() => setConfirmOverride(false)}
            onConfirm={() => {
              setConfirmOverride(false);
              onOverride();
            }}
            title={lockCopy.takeOverTitle}
            {...(holder ? { description: lockCopy.takeOverBody(holder) } : {})}
            confirmLabel={lockCopy.takeOver}
            pendingLabel="Taking over…"
            confirmVariant="default"
            pending={isPending}
          />
        </>
      ) : null}
      {actions.includes('handover') ? (
        <Button size="sm" onClick={onHandover} disabled={isPending} aria-busy={isPending}>
          {lockCopy.handOver}
        </Button>
      ) : null}
      {actions.includes('keep') ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={onKeep}
          disabled={isPending}
          aria-busy={isPending}
        >
          {lockCopy.keepEditing}
        </Button>
      ) : null}
      {actions.includes('dismiss') ? (
        <Button size="sm" variant="outline" onClick={onDismiss}>
          {lockCopy.dismiss}
        </Button>
      ) : null}
    </div>
  );
}
