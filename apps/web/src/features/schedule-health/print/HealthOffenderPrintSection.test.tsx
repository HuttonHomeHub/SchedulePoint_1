import type { HealthOffender } from '@repo/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HealthOffenderPrintSection } from './HealthOffenderPrintSection';

/**
 * The extracted print section (zero-duration-task M3-T0). The unedited `HealthPrintDocument` suite is
 * the extraction's oracle; this pins what it added — explicit list roles (agreement-round A3).
 */
const OFFENDER: HealthOffender = {
  kind: 'ACTIVITY',
  id: 'a1',
  activityId: 'a1',
  code: 'Z1',
  name: 'Handover',
  note: 'no resource assignment',
};

describe('HealthOffenderPrintSection', () => {
  it('prints the offenders with explicit list and listitem roles', () => {
    render(
      <HealthOffenderPrintSection
        name="Zero-duration tasks"
        offenders={[OFFENDER]}
        offenderCount={1}
        offendersTruncated={false}
        offenderCap={50}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Zero-duration tasks — 1 finding' })).toBeVisible();
    const item = screen.getByText(/Z1 Handover/);
    expect(item).toHaveAttribute('role', 'listitem');
    expect(item.parentElement).toHaveAttribute('role', 'list');
  });

  it('states the cap when the list is truncated', () => {
    render(
      <HealthOffenderPrintSection
        name="Zero-duration tasks"
        offenders={[OFFENDER]}
        offenderCount={4}
        offendersTruncated
        offenderCap={1}
      />,
    );
    expect(
      screen.getByText('Showing the first 1 of 4 — open the plan for the full list.'),
    ).toBeInTheDocument();
  });
});
