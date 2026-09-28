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
    basis: 'PLACED',
    ...overrides,
  };
}

describe('BaselineVarianceSummary', () => {
  it('renders nothing when there is no active baseline', () => {
    const { container } = render(
      <BaselineVarianceSummary summary={summary({ baselineId: null, basis: null })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('summarises the worst slip and the counts against the active baseline, naming the placed basis', () => {
    render(<BaselineVarianceSummary summary={summary()} />);
    expect(screen.getByText(/vs\. Contract Baseline \(placed dates\):/)).toBeInTheDocument();
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

  // US-2 (placement-baseline-variance): a NONE-level baseline names the earliest basis
  // and explains why bars moved by hand are not counted, with the recapture remedy.
  it('names the earliest basis and explains it on a NONE-level baseline', () => {
    render(<BaselineVarianceSummary summary={summary({ basis: 'NETWORK' })} />);
    expect(screen.getByText(/vs\. Contract Baseline \(earliest dates\):/)).toBeInTheDocument();
    expect(
      screen.getByText(
        /captured before placements were recorded, so bars moved by hand are not counted/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Capture a new baseline to compare placed dates\./),
    ).toBeInTheDocument();
  });

  // basis absent (an older API image during a rolling update, ADR-0047) — no qualifier and
  // no second sentence, since nothing is guessed.
  it('shows no basis qualifier or explanation when basis is absent', () => {
    render(
      <BaselineVarianceSummary
        summary={{ ...summary(), basis: undefined as unknown as PlanVarianceSummary['basis'] }}
      />,
    );
    expect(screen.getByText(/vs\. Contract Baseline:/)).toBeInTheDocument();
    expect(screen.queryByText(/captured before placements were recorded/)).not.toBeInTheDocument();
  });
});
