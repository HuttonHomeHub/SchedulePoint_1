import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatGrid } from './stat-grid';

/**
 * The tone, wrap and container-wrapper properties are pinned in `page-archetypes.test.tsx`; this
 * file owns the accessible-name and definition-list shape that `docs/TECH_DEBT.md` #325's
 * convergence depends on (the import review's "Mapped" counts are named by `label`).
 */
describe('StatGrid', () => {
  it('names the list when given a label, so an unheaded grid is not an anonymous list', () => {
    render(<StatGrid label="Mapped" items={[{ label: 'Activities', value: 12 }]} />);

    const list = screen.getByLabelText('Mapped');
    expect(list.tagName).toBe('DL');
    expect(within(list).getByText('Activities')).toBeInTheDocument();
    expect(within(list).getByText('12')).toBeInTheDocument();
  });

  it('carries no accessible name when none is given', () => {
    const { container } = render(<StatGrid items={[{ label: 'Activities', value: 12 }]} />);

    expect(container.querySelector('dl')).not.toHaveAttribute('aria-label');
  });

  it('renders the sub line as a second <dd> in the same term group, so the list stays valid', () => {
    const { container } = render(
      <StatGrid items={[{ label: 'Estimate at Completion', value: '£100', sub: 'VAC £5' }]} />,
    );

    const group = container.querySelector('dl > div');
    expect(group?.querySelectorAll(':scope > dt')).toHaveLength(1);
    const definitions = group?.querySelectorAll(':scope > dd');
    expect(definitions).toHaveLength(2);
    expect(definitions?.[1]).toHaveTextContent('VAC £5');
  });

  it('renders no second <dd> for an item without a sub line', () => {
    const { container } = render(<StatGrid items={[{ label: 'Earned Value', value: '£1' }]} />);

    expect(container.querySelectorAll('dl > div > dd')).toHaveLength(1);
  });
});
