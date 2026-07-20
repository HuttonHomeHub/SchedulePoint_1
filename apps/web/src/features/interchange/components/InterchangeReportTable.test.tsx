import type { InterchangeReport } from '@repo/interchange';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { InterchangeReportTable } from './InterchangeReportTable';

const report: InterchangeReport = {
  detectedFormat: 'XER',
  sourceVersion: '19.12',
  sourceFilename: 'tower.xer',
  mapped: { activities: 214, relationships: 231, calendars: 3 },
  approximations: [
    {
      kind: 'approximation',
      entity: 'activity',
      sourceRef: 'A1010',
      detail: 'constraint MSO → SNET',
      reason: 'unsupported constraint kind',
    },
  ],
  repairs: [],
  drops: [
    {
      kind: 'drop',
      entity: 'resourceAssignment',
      sourceRef: null,
      detail: '12 assignments dropped',
    },
  ],
};

describe('InterchangeReportTable', () => {
  it('renders the mapped counts', () => {
    render(<InterchangeReportTable report={report} />);
    expect(screen.getByText('214')).toBeInTheDocument();
    expect(screen.getByText('231')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders each finding section as a labelled region with its count', () => {
    render(<InterchangeReportTable report={report} />);
    expect(screen.getByRole('heading', { name: 'Approximations (1)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Repairs (0)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dropped (1)' })).toBeInTheDocument();
  });

  it('lists each finding line, reusing the report detail + reason', () => {
    render(<InterchangeReportTable report={report} />);
    expect(screen.getByText(/constraint MSO → SNET/)).toBeInTheDocument();
    expect(screen.getByText(/unsupported constraint kind/)).toBeInTheDocument();
    expect(screen.getByText(/12 assignments dropped/)).toBeInTheDocument();
  });

  it('shows an empty state for a section with no findings', () => {
    render(<InterchangeReportTable report={report} />);
    expect(screen.getByText('No repairs were needed.')).toBeInTheDocument();
  });
});
