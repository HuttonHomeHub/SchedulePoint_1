import { describe, expect, it } from 'vitest';

import { makeTsldToolbarContext } from '@/features/tsld/toolbar/test-helpers';
import { buildTsldToolbarItems } from '@/features/tsld/toolbar/tsld-toolbar-items';

/**
 * What the plan toolbar does while the **Gantt** is the mounted surface (ADR-0059).
 *
 * The failure this guards against is a control that is enabled and does nothing. The canvas is
 * commanded through an imperative handle; in the Gantt that handle is null, so every command routed
 * only through it silently no-ops. A user clicking a lit "Zoom in" and seeing no change has no way
 * to tell a broken feature from a slow one.
 *
 * The line drawn here: the zoom **preset** is shared state that BOTH views read, so it must keep
 * working. Stepping, fitting and go-to-date are canvas *viewport* commands with no Gantt meaning, so
 * they shade with a reason.
 */
const item = (id: string): ReturnType<typeof buildTsldToolbarItems>[number] => {
  const found = buildTsldToolbarItems().find((i) => i.id === id);
  if (!found) throw new Error(`no toolbar item ${id}`);
  return found;
};

const inGantt = makeTsldToolbarContext({ planView: 'gantt', canvasActive: false });
const inDiagram = makeTsldToolbarContext({ planView: 'tsld', canvasActive: true });

describe('canvas viewport commands in the Gantt', () => {
  it.each(['zoom-in', 'zoom-out', 'fit'])('shades %s with a reason', (id) => {
    const control = item(id);
    expect(control.isEnabled?.(inGantt)).toBe(false);
    expect(control.disabledReason?.(inGantt)).toBe('Only in the diagram view');
  });

  it.each(['zoom-in', 'zoom-out', 'fit'])('leaves %s enabled in the diagram', (id) => {
    const control = item(id);
    expect(control.isEnabled?.(inDiagram)).toBe(true);
    expect(control.disabledReason?.(inDiagram)).toBeUndefined();
  });

  // "No activities yet" must still win over "only in the diagram" — the more fundamental reason is
  // the more useful one to read.
  it('still reports the no-schedule reason first', () => {
    const control = item('zoom-in');
    const empty = makeTsldToolbarContext({ canvasActive: false, hasDiagram: false });
    expect(control.disabledReason?.(empty)).not.toBe('Only in the diagram view');
  });
});

describe('the zoom preset', () => {
  // The preset is what the Gantt derives its scale from (ADR-0059 §2). Shading it would leave the
  // Gantt stuck at whatever scale the canvas last set.
  it('stays enabled in the Gantt', () => {
    expect(item('zoom-preset').isEnabled?.(inGantt)).toBe(true);
  });
});

describe('the view switch', () => {
  it('offers both halves and marks the active one', () => {
    expect(item('view-gantt').isActive?.(inGantt)).toBe(true);
    expect(item('view-tsld').isActive?.(inGantt)).toBe(false);
    expect(item('view-tsld').isActive?.(inDiagram)).toBe(true);
  });

  // Reading the schedule as bars is not an edit, so no role is shaded out of it.
  it('is never gated on write permission', () => {
    const viewer = makeTsldToolbarContext({ canEditSchedule: false });
    for (const id of ['view-tsld', 'view-gantt']) {
      expect(item(id).isEnabled?.(viewer)).not.toBe(false);
    }
  });
});
