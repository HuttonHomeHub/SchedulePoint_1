import type { PlanEditLockActor } from '@repo/types';
import { useState } from 'react';

import { lockCopy } from '../lib/lock-copy';
import type { LockAction } from '../lib/lock-view';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

export interface EditLockControlsProps {
  actions: readonly LockAction[];
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
  actions,
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
  if (actions.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.includes('start') ? (
        <Button size="sm" onClick={onStart} disabled={isPending}>
          {lockCopy.startEditing}
        </Button>
      ) : null}
      {actions.includes('stop') ? (
        <Button size="sm" variant="outline" onClick={onStop} disabled={isPending}>
          {lockCopy.stopEditing}
        </Button>
      ) : null}
      {actions.includes('request') ? (
        <Button size="sm" variant="outline" onClick={onRequest} disabled={isPending}>
          {lockCopy.requestControl}
        </Button>
      ) : null}
      {actions.includes('waiting') ? (
        <Button size="sm" variant="outline" disabled>
          {lockCopy.takeOverNow}
        </Button>
      ) : null}
      {actions.includes('takeover') ? (
        <Button size="sm" onClick={onTakeOver} disabled={isPending}>
          {lockCopy.takeOverNow}
        </Button>
      ) : null}
      {actions.includes('override') ? (
        <>
          <Button size="sm" onClick={() => setConfirmOverride(true)} disabled={isPending}>
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
        <Button size="sm" onClick={onHandover} disabled={isPending}>
          {lockCopy.handOver}
        </Button>
      ) : null}
      {actions.includes('keep') ? (
        <Button size="sm" variant="ghost" onClick={onKeep} disabled={isPending}>
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
