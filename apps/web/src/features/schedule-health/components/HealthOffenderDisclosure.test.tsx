import type { HealthOffender } from '@repo/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HealthOffenderDisclosure } from './HealthOffenderDisclosure';

/**
 * The extracted disclosure (zero-duration-task M3-T0). Its behaviour is pinned by the unedited
 * `ScheduleHealthPanel` suite, which is the before/after oracle for the extraction; this file pins
 * only what the extraction added: the explicit list roles (agreement-round A3, ADR-0122) and the
 * verdict-free slots an advisory needs.
 */
const OFFENDER: HealthOffender = {
  kind: 'ACTIVITY',
  id: 'a1',
  activityId: 'a1',
  code: 'Z1',
  name: 'Handover',
  note: 'no resource assignment',
};

describe('HealthOffenderDisclosure', () => {
  it('renders the offender list with explicit list and listitem roles', () => {
    render(
      <ul>
        <li>
          <HealthOffenderDisclosure
            name="Zero-duration tasks"
            badge={<span>1</span>}
            offenders={[OFFENDER]}
            offenderCount={1}
            offendersTruncated={false}
            offenderCap={50}
            onActivate={vi.fn()}
          />
        </li>
      </ul>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Zero-duration tasks/ }));
    const button = screen.getByRole('button', { name: /Handover/ });
    const item = button.closest('li');
    expect(item).toHaveAttribute('role', 'listitem');
    expect(item?.parentElement).toHaveAttribute('role', 'list');
  });

  it('takes no verdict: the badge slot is whatever the caller passes', () => {
    const onActivate = vi.fn();
    render(
      <HealthOffenderDisclosure
        name="Zero-duration tasks"
        badge={<span>3 tasks</span>}
        offenders={[OFFENDER]}
        offenderCount={3}
        offendersTruncated
        offenderCap={1}
        onActivate={onActivate}
      />,
    );
    const toggle = screen.getByRole('button', { name: /Zero-duration tasks\s*3 tasks/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(screen.getByText('Showing 1 of 3.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Handover/ }));
    expect(onActivate).toHaveBeenCalledWith(OFFENDER);
  });
});
