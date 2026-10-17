import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { resourcedReason } from './make-milestone-gate';
import { SelectionActionsBar, type SelectionBarContext } from './selection-actions';

/**
 * **One sentence for one refusal across the selection bar** (`docs/TECH_DEBT.md` #397).
 *
 * Make milestone… shades with the editor gate's sentence; Edit, Duplicate and Delete used to shade
 * with the host's `scheduleRefusal`, which words the same role refusal differently. A Viewer reads
 * the bar's controls one after another, so two sentences for one fact read as two facts.
 */
const ROLE = 'Your role cannot edit activity details.';

const ctx = (over: Partial<SelectionBarContext> = {}): SelectionBarContext => ({
  canvas: null,
  targetName: 'Pour slab',
  definitionGate: { writable: false, reason: ROLE, readable: true },
  makeMilestone: { applies: true, enabled: false, reason: ROLE },
  onMakeMilestone: vi.fn(),
  floatPathsOpen: false,
  toggleFloatPaths: null,
  canEditSchedule: false,
  scheduleRefusal: (action) => `Your role cannot ${action}.`,
  canReportProgress: true,
  canWriteNotes: true,
  onNotes: vi.fn(),
  isSummary: false,
  hasPlacement: false,
  conflictKey: null,
  conflictKeys: [],
  clearPlacement: { enabled: false, reason: 'Nothing to clear' },
  onOpenLogic: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onDissolve: vi.fn(),
  onDuplicate: vi.fn(),
  onDuplicateBand: vi.fn(),
  onResources: vi.fn(),
  onProgress: vi.fn(),
  onClearVisualPlacement: vi.fn(),
  onOpenEditorAt: vi.fn(),
  ...over,
});

/** Accessible description of every shaded control on the bar, keyed by its registry id. */
const shadedReasons = (): Map<string, string> => {
  const out = new Map<string, string>();
  const toolbar = screen.getByRole('toolbar', { name: 'Actions for Pour slab' });
  for (const el of toolbar.querySelectorAll<HTMLElement>('[aria-disabled="true"]')) {
    const id = el.getAttribute('aria-describedby');
    out.set(
      el.getAttribute('data-toolbar-item') ?? '',
      id ? (document.getElementById(id)?.textContent ?? '') : '',
    );
  }
  return out;
};

describe('the selection bar words a role refusal one way', () => {
  it('shows a Viewer the same sentence on Make milestone, Edit, Duplicate and Delete', () => {
    render(<SelectionActionsBar context={ctx()} />);
    const shaded = shadedReasons();
    for (const id of ['make-milestone', 'edit', 'duplicate', 'delete']) {
      expect(shaded.get(id), id).toBe(ROLE);
    }
    expect(new Set(shaded.values())).toEqual(new Set([ROLE]));
  });

  it('keeps the pen sentence for a Planner who lacks the pen', () => {
    const pen = 'Start editing to change this activity.';
    render(
      <SelectionActionsBar
        context={ctx({
          definitionGate: { writable: false, reason: pen, readable: true },
          makeMilestone: { applies: true, enabled: false, reason: pen },
          scheduleRefusal: () => pen,
        })}
      />,
    );
    expect(new Set(shadedReasons().values())).toEqual(new Set([pen]));
  });

  it('leaves an open bar open and keeps the assignments reason on Make milestone alone', () => {
    render(
      <SelectionActionsBar
        context={ctx({
          definitionGate: { writable: true, reason: null, readable: true },
          makeMilestone: { applies: true, enabled: false, reason: resourcedReason(1) },
          canEditSchedule: true,
          scheduleRefusal: () => null,
        })}
      />,
    );
    expect([...shadedReasons().keys()]).toEqual(['make-milestone']);
  });
});
