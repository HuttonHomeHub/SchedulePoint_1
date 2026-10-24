import type { ActivitySummary } from '@repo/types';
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * The panel's use of `deriveDiagramSource` (swimlanes M2-T1): it runs **once per data change and
 * never per frame**, it is handed the host's swimlane input as given, and with no input the panel
 * is the panel it was before (SC-3).
 *
 * The derivation is wrapped rather than replaced, so the picture under test is the real one and
 * the spy only counts.
 */
const h = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock('../model/derive-diagram-source', async (importOriginal) => {
  const actual = await importOriginal<{ deriveDiagramSource: typeof DeriveFn }>();
  return {
    deriveDiagramSource: (...args: Parameters<typeof actual.deriveDiagramSource>) => {
      h.calls.push(args);
      return actual.deriveDiagramSource(...args);
    },
  };
});

vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => vi.fn() }));

import type { deriveDiagramSource as DeriveFn } from '../model/derive-diagram-source';

import { TsldPanel } from './TsldPanel';

import { DEFAULT_VIEW_TOGGLES } from '@/features/tsld/render/paint';
import type { SwimlaneInput } from '@/features/tsld/render/project-swimlanes';
import { useTsldCanvasUiState } from '@/features/tsld/toolbar/use-tsld-canvas-ui-state';
import { anActivity } from '@/test/activity-fixture';

const ACTIVITIES: ActivitySummary[] = [
  anActivity({
    id: 'a',
    name: 'Pour',
    laneIndex: 0,
    earlyStart: '2026-01-02',
    earlyFinish: '2026-01-09',
  }),
  anActivity({
    id: 'b',
    name: 'Wire',
    laneIndex: 1,
    earlyStart: '2026-01-03',
    earlyFinish: '2026-01-10',
  }),
];

const INPUT: SwimlaneInput = {
  swimlanes: [{ id: 's1', name: 'Mechanical' }],
  membership: new Map([['a', 's1']]),
  storedLanes: new Map(),
};

interface Props {
  activities?: ActivitySummary[];
  swimlanes?: SwimlaneInput | null;
  canEdit?: boolean;
  band?: boolean;
}

function Harness({ activities = ACTIVITIES, swimlanes, canEdit = false, band = false }: Props) {
  const ui = useTsldCanvasUiState();
  return (
    <TsldPanel
      activities={activities}
      dependencies={[]}
      dataDate="2026-01-01"
      canEdit={canEdit}
      {...(swimlanes === undefined ? {} : { swimlanes })}
      canvasUi={{ ...ui, viewToggles: { ...DEFAULT_VIEW_TOGGLES, wbsBand: band } }}
    />
  );
}

describe('TsldPanel — the diagram source is derived once per data change', () => {
  it('does not re-derive on a re-render with the same data, or on an unrelated prop', () => {
    h.calls.length = 0;
    const { rerender } = render(<Harness swimlanes={INPUT} />);
    expect(h.calls).toHaveLength(1);

    rerender(<Harness swimlanes={INPUT} />);
    rerender(<Harness swimlanes={INPUT} canEdit />);
    expect(h.calls).toHaveLength(1);
  });

  it('does not re-derive when the user selects, which re-renders the panel on every interaction', () => {
    h.calls.length = 0;
    const { getAllByRole } = render(<Harness swimlanes={INPUT} />);
    const before = h.calls.length;
    act(() => getAllByRole('option')[0]?.click());
    act(() => getAllByRole('option')[1]?.click());
    expect(h.calls).toHaveLength(before);
  });

  it('re-derives once for each change to the data or the swimlane input it reads', () => {
    h.calls.length = 0;
    const { rerender } = render(<Harness swimlanes={INPUT} />);
    expect(h.calls).toHaveLength(1);

    rerender(<Harness swimlanes={INPUT} activities={[...ACTIVITIES]} />);
    expect(h.calls).toHaveLength(2);

    rerender(<Harness swimlanes={{ ...INPUT }} activities={[...ACTIVITIES]} />);
    expect(h.calls).toHaveLength(3);
  });

  it('hands the derivation the host’s input exactly as given', () => {
    h.calls.length = 0;
    render(<Harness swimlanes={INPUT} />);
    const options = h.calls[0]?.[1] as { swimlanes: unknown; dataDate: string };
    expect(options.swimlanes).toBe(INPUT);
    expect(options.dataDate).toBe('2026-01-01');
  });
});

describe('TsldPanel — with no swimlane input it is the panel it was (SC-3)', () => {
  it('renders the same document with the prop absent, null, or never offered', () => {
    // `useId` values are per-root counters, so two roots in one test would differ by them alone.
    const html = (node: React.ReactElement): string => {
      const view = render(node);
      const out = view.container.innerHTML.replace(/(:r[0-9a-z]+:|_r_[0-9a-z]+_)/g, '_id_');
      view.unmount();
      return out;
    };
    expect(html(<Harness swimlanes={null} />)).toBe(html(<Harness />));
  });
});
