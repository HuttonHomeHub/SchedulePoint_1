import type { DependencySummary } from '@repo/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TsldPanel } from './TsldPanel';

/**
 * Canvas-first authoring (ADR-0032, M1): with `VITE_CANVAS_AUTHORING` on, the interactive canvas
 * mounts on an **empty, uncalculated** plan as long as there's a timeline anchor (`plannedStart`, or
 * today when it's null) — so a planner can draw the first activity on a blank canvas. Flag-off keeps
 * today's empty-state note (covered in `TsldPanel.test.tsx`). Editing flag on too, so the surface is
 * the authoring one.
 */
vi.mock('../../../config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, CANVAS_AUTHORING_ENABLED: true, TSLD_EDITING_ENABLED: true };
});

const NO_DEPS: DependencySummary[] = [];

describe('TsldPanel — canvas-first authoring (flag on)', () => {
  it('mounts a blank draw-ready canvas on an empty plan with a start date', () => {
    render(<TsldPanel activities={[]} dependencies={NO_DEPS} dataDate="2026-01-01" canEdit fill />);
    // The interactive diagram region is present — not the "no activities" note.
    expect(screen.getByRole('region', { name: 'Time-scaled logic diagram' })).toBeInTheDocument();
    expect(screen.queryByText(/No activities to diagram yet/)).not.toBeInTheDocument();
  });

  it('anchors an empty start-less plan to today so the canvas is still drawable', () => {
    // No plannedStart, but `todayIso` supplies the anchor → the canvas mounts anyway.
    render(
      <TsldPanel
        activities={[]}
        dependencies={NO_DEPS}
        dataDate={null}
        todayIso="2026-06-01"
        canEdit
        fill
      />,
    );
    expect(screen.getByRole('region', { name: 'Time-scaled logic diagram' })).toBeInTheDocument();
  });

  it('still shows the empty-state note when there is no anchor at all', () => {
    // Start-less AND no `todayIso` → nothing to anchor to → keep the read-only note.
    render(<TsldPanel activities={[]} dependencies={NO_DEPS} dataDate={null} canEdit fill />);
    expect(screen.getByText(/No activities to diagram yet/)).toBeInTheDocument();
  });
});
