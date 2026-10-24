import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SwimlaneAssignment } from '../model/swimlane-assignment';

import { MoveToSwimlaneButton } from './MoveToSwimlaneButton';

vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => vi.fn() }));

const assignment: SwimlaneAssignment = {
  shown: true,
  choices: [{ id: 's1', name: 'Civil' }],
  currentOf: () => null,
  assign: vi.fn(),
};
const REASON = 'Turn on Swimlanes in View to move activities between them.';

describe('MoveToSwimlaneButton shaded', () => {
  it('describes itself with the reason exactly once, and carries no native title', () => {
    render(
      <MoveToSwimlaneButton
        assignment={assignment}
        ids={['a']}
        names={['A']}
        gate={{ writable: false, reason: REASON }}
      />,
    );
    const button = screen.getByRole('button', { name: /move to swimlane/i });
    expect(button).toHaveAccessibleDescription(REASON);
    expect(button).not.toHaveAttribute('title');
    expect(button).toHaveAttribute('aria-disabled', 'true');
  });

  it('shows the reason in a tooltip that adds nothing to the description', () => {
    render(
      <MoveToSwimlaneButton
        assignment={assignment}
        ids={['a']}
        names={['A']}
        gate={{ writable: false, reason: REASON }}
      />,
    );
    const button = screen.getByRole('button', { name: /move to swimlane/i });
    fireEvent.focus(button);
    expect(screen.getAllByText(REASON).length).toBeGreaterThan(1);
    expect(button).toHaveAccessibleDescription(REASON);
  });
});
