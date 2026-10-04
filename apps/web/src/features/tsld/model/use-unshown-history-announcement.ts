import { useEffect, useRef } from 'react';

import type { DockStrip } from './dock-strip';

/**
 * Speak an undo/redo failure or refusal the dock strip loses the dock to.
 *
 * The workspace leaves failures to the strip's own `role="alert"` (ADR-0132, one utterance per
 * event), but a conflict banner outranks the history strip in `resolveDockStrip`, and then nothing
 * would have said it — neither seen nor spoken. So whenever a failure exists and `history` is not
 * the strip on show, it is announced here, once per result. A success needs nothing: the workspace
 * already announced it.
 */
export function useUnshownHistoryAnnouncement(
  notice: { id: number; kind: 'success' | 'failure'; message: string } | null | undefined,
  dockStrip: DockStrip,
  announce: (message: string) => void,
): void {
  const spokenId = useRef<number | null>(null);
  useEffect(() => {
    if (notice?.kind !== 'failure' || dockStrip === 'history') return;
    if (spokenId.current === notice.id) return;
    spokenId.current = notice.id;
    announce(notice.message);
  }, [notice, dockStrip, announce]);
}
