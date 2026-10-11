import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CONFLICT_REMEDIES } from './conflict-remedy';
import {
  SELECTION_BAR_GROUP_ORDER,
  SelectionActionsBar,
  type SelectionBarContext,
  type SelectionCanvasContext,
} from './selection-actions';

import type { ConflictKey } from '@/features/tsld/render/conflicts';

/**
 * **The selection bar leads with its subject** (selection-bar-fit M3, ADR-0187) and **keeps the
 * warning glyph to the reason and the fix** (#486, SC-5).
 *
 * The order is asserted from the DOM, the same place a keyboard reader's roving sequence comes from:
 * `Toolbar` resolves ONE order for the markup and the arrow keys (`toolbar-registry.ts`'s
 * `resolveItems`), so a bar that showed one order and walked another is the failure this pins against
 * (ADR-0111). The real-browser half, line positions and the first Tab stop, is the journeys'.
 */

const canvas: SelectionCanvasContext = {
  isolateActive: false,
  isolateMode: 'full',
  toggleIsolate: vi.fn(),
  setIsolateMode: vi.fn(),
  zoomToSelection: vi.fn(),
};

function ctx(over: Partial<SelectionBarContext> = {}): SelectionBarContext {
  return {
    canvas,
    targetName: 'Pour slab',
    definitionGate: null,
    makeMilestone: { applies: false },
    onMakeMilestone: vi.fn(),
    floatPathsOpen: false,
    toggleFloatPaths: vi.fn(),
    canEditSchedule: true,
    scheduleRefusal: () => null,
    canReportProgress: true,
    canWriteNotes: true,
    onNotes: vi.fn(),
    isSummary: false,
    hasPlacement: false,
    conflictKey: null,
    conflictKeys: [],
    clearPlacement: { enabled: true, reason: null },
    onClearVisualPlacement: vi.fn(),
    onOpenEditorAt: vi.fn(),
    onOpenLogic: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onDissolve: vi.fn(),
    onDuplicate: vi.fn(),
    onDuplicateBand: vi.fn(),
    onResources: vi.fn(),
    onProgress: vi.fn(),
    ...over,
  };
}

const shown = (): string[] =>
  [
    ...screen
      .getByRole('toolbar', { name: 'Actions for Pour slab' })
      .querySelectorAll<HTMLElement>('[data-toolbar-item]'),
  ].map((el) => el.getAttribute('data-toolbar-item') ?? '');

const FIND = ['zoom-to-selection', 'isolate-logic', 'float-paths'];

describe('the selection bar leads with the activity’s own actions', () => {
  it('states the order the bar renders: object, then find', () => {
    expect(SELECTION_BAR_GROUP_ORDER).toEqual(['object', 'find']);
  });

  it('puts Logic first and the viewing controls last in the Diagram, flagged or not', () => {
    const { unmount } = render(<SelectionActionsBar context={ctx()} />);
    const plain = shown();
    expect(plain[0]).toBe('open-logic');
    expect(plain.slice(-FIND.length)).toEqual(FIND);
    unmount();

    render(
      <SelectionActionsBar
        context={ctx({ conflictKey: 'constraintViolated', conflictKeys: ['constraintViolated'] })}
      />,
    );
    const flagged = shown();
    // The remedy answers the reason on the line above it, so it is the first control, not the fourth.
    expect(flagged[0]).toBe('conflict-remedy');
    expect(flagged[1]).toBe('open-logic');
    expect(flagged.slice(-FIND.length)).toEqual(FIND);
  });

  it('leaves Float paths as the Gantt bar’s last control, not its lone first one', () => {
    render(<SelectionActionsBar context={ctx({ canvas: null })} />);
    const order = shown();
    expect(order[0]).toBe('open-logic');
    expect(order.at(-1)).toBe('float-paths');
    expect(order).not.toContain('zoom-to-selection');
  });

  it('keeps the first Tab stop on the first control shown (one roving stop, the leading control)', () => {
    render(
      <SelectionActionsBar
        context={ctx({ conflictKey: 'constraintViolated', conflictKeys: ['constraintViolated'] })}
      />,
    );
    const stops = [
      ...screen
        .getByRole('toolbar', { name: 'Actions for Pour slab' })
        .querySelectorAll<HTMLElement>('[data-toolbar-item]'),
    ];
    expect(stops.filter((el) => el.getAttribute('tabindex') === '0')).toEqual([stops[0]]);
    expect(stops[0]?.getAttribute('data-toolbar-item')).toBe('conflict-remedy');
  });
});

describe('the warning glyph on the bar (#486, SC-5)', () => {
  const KEYS = Object.keys(CONFLICT_REMEDIES) as ConflictKey[];

  for (const key of KEYS) {
    for (const hasPlacement of [false, true]) {
      it(`shows at most two triangles for ${key}, ${hasPlacement ? 'placed' : 'unplaced'}`, () => {
        const { container } = render(
          <SelectionActionsBar
            context={ctx({ conflictKey: key, conflictKeys: [key], hasPlacement })}
          />,
        );
        // One for the reason, and at most one more for the fix: the route remedy and the barAction
        // remedy (Clear visual start) are mutually exclusive because a conflict has one remedy kind.
        const triangles = container.querySelectorAll('svg.lucide-triangle-alert').length;
        expect(triangles).toBeGreaterThanOrEqual(1);
        expect(triangles).toBeLessThanOrEqual(2);
      });
    }
  }

  it('shows none on an unflagged selection', () => {
    const { container } = render(<SelectionActionsBar context={ctx()} />);
    expect(container.querySelectorAll('svg.lucide-triangle-alert')).toHaveLength(0);
  });
});
