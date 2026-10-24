import type { ActivitySummary } from '@repo/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { WbsSwimlaneField } from './WbsSwimlaneField';

import { anActivity } from '@/test/activity-fixture';

const TREE: ActivitySummary[] = [
  anActivity({ id: 'works', type: 'WBS_SUMMARY', name: 'The Works' }),
  anActivity({ id: 'struct', type: 'WBS_SUMMARY', parentId: 'works', name: 'Structure' }),
  anActivity({ id: 'slab', parentId: 'struct', name: 'Pour slab' }),
  anActivity({ id: 'shed', parentId: null, name: 'Site shed' }),
];

describe('WbsSwimlaneField', () => {
  it('shows the swimlane the activity is in, at any depth below its summary', () => {
    render(<WbsSwimlaneField activities={TREE} level={2} activityId="slab" />);
    expect(screen.getByRole('textbox', { name: 'Swimlane' })).toHaveValue('Structure');
  });

  it('shows "No swimlane" for work no summary at the level holds', () => {
    render(<WbsSwimlaneField activities={TREE} level={2} activityId="shed" />);
    expect(screen.getByRole('textbox', { name: 'Swimlane' })).toHaveValue('No swimlane');
  });

  it('follows a rename of the summary, since the name is read and not stored', () => {
    const renamed = TREE.map((a) => (a.id === 'struct' ? { ...a, name: 'Substructure' } : a));
    render(<WbsSwimlaneField activities={renamed} level={2} activityId="slab" />);
    expect(screen.getByRole('textbox', { name: 'Swimlane' })).toHaveValue('Substructure');
  });

  it('is read-only rather than disabled, and states its reason where it is described', () => {
    render(<WbsSwimlaneField activities={TREE} level={2} activityId="slab" />);
    const field = screen.getByRole('textbox', { name: 'Swimlane' });
    // Operable (focusable, selectable) but not editable: ADR-0083, not a native `disabled`.
    expect(field).toHaveAttribute('readonly');
    expect(field).not.toBeDisabled();
    expect(field).toHaveAccessibleDescription('Swimlanes follow the WBS in this plan.');
    expect(screen.getByText('Swimlanes follow the WBS in this plan.')).toBeVisible();
  });

  it('keeps its value when typed into', () => {
    render(<WbsSwimlaneField activities={TREE} level={2} activityId="slab" />);
    const field = screen.getByRole('textbox', { name: 'Swimlane' });
    fireEvent.change(field, { target: { value: 'Elsewhere' } });
    expect(field).toHaveValue('Structure');
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <WbsSwimlaneField activities={TREE} level={2} activityId="slab" />,
    );
    expect((await axe(container)).violations).toEqual([]);
  });
});
