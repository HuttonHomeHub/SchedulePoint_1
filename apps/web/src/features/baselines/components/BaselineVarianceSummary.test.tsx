import type { PlanVarianceSummary } from '@repo/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BaselineVarianceSummary } from './BaselineVarianceSummary';

function summary(overrides: Partial<PlanVarianceSummary> = {}): PlanVarianceSummary {
  return {
    baselineId: 'b1',
    baselineName: 'Contract Baseline',
    capturedAt: '2026-01-05T09:00:00Z',
    worstFinishSlipDays: 6,
    behindCount: 3,
    addedCount: 1,
    removedCount: 0,
    ...overrides,
  };
}

describe('BaselineVarianceSummary', () => {
  it('renders nothing when there is no active baseline', () => {
    const { container } = render(
      <BaselineVarianceSummary summary={summary({ baselineId: null })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('summarises the worst slip and the counts against the active baseline', () => {
    render(<BaselineVarianceSummary summary={summary()} />);
    expect(screen.getByText(/vs\. Contract Baseline:/)).toBeInTheDocument();
    expect(screen.getByText(/worst slip 6 d · 3 behind · 1 added/)).toBeInTheDocument();
  });

  it('reads as on/ahead when nothing is behind', () => {
    render(
      <BaselineVarianceSummary
        summary={summary({ worstFinishSlipDays: null, behindCount: 0, addedCount: 0 })}
      />,
    );
    expect(screen.getByText(/on or ahead of baseline · 0 behind/)).toBeInTheDocument();
  });
});
