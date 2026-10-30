import type { CodeTypeSummary, CodeValueSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { codeSwimlaneEditorReason } from '../model/code-swimlane-copy';

import { CodeSwimlaneField } from './CodeSwimlaneField';

import { codeKeys } from '@/lib/query/hierarchy-keys';
import { anActivity } from '@/test/activity-fixture';

const type = { id: 'area', name: 'Area' } as CodeTypeSummary;
const value = (id: string, shortCode: string, description: string | null) =>
  ({ id, codeTypeId: 'area', shortCode, description }) as CodeValueSummary;

function mount(codes: { codeTypeId: string; codeValueId: string }[], over = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(codeKeys.types('acme', 'p1'), [type]);
  queryClient.setQueryData(codeKeys.values('acme', 'p1', 'area'), [
    value('gf', 'GF', 'Ground floor'),
    value('l1', 'L1', null),
  ]);
  return render(
    <QueryClientProvider client={queryClient}>
      <CodeSwimlaneField
        orgSlug="acme"
        planId="p1"
        codeTypeId="area"
        activity={anActivity({ id: 'a', codes, ...over })}
      />
    </QueryClientProvider>,
  );
}

describe('CodeSwimlaneField', () => {
  it('shows the value the activity is in, by the name the diagram draws', () => {
    mount([{ codeTypeId: 'area', codeValueId: 'gf' }]);
    expect(screen.getByRole('textbox', { name: 'Current swimlane' })).toHaveValue('Ground floor');
  });

  it('falls back to the short code when the value has no description', () => {
    mount([{ codeTypeId: 'area', codeValueId: 'l1' }]);
    expect(screen.getByRole('textbox', { name: 'Current swimlane' })).toHaveValue('L1');
  });

  it('reads "No Area" for an activity with none, a deleted value, or a summary', () => {
    mount([]);
    expect(screen.getByRole('textbox', { name: 'Current swimlane' })).toHaveValue('No Area');
  });

  it('reads "No Area" for a value that is no longer live', () => {
    mount([{ codeTypeId: 'area', codeValueId: 'gone' }]);
    expect(screen.getByRole('textbox', { name: 'Current swimlane' })).toHaveValue('No Area');
  });

  it('reads "No Area" for a WBS summary, which is never a member of a code swimlane', () => {
    mount([{ codeTypeId: 'area', codeValueId: 'gf' }], { type: 'WBS_SUMMARY' });
    expect(screen.getByRole('textbox', { name: 'Current swimlane' })).toHaveValue('No Area');
  });

  it('is read-only rather than disabled, described by where the value is changed', async () => {
    const { container } = mount([{ codeTypeId: 'area', codeValueId: 'gf' }]);
    const field = screen.getByRole('textbox', { name: 'Current swimlane' });
    expect(field).toHaveAttribute('readonly');
    expect(field).not.toBeDisabled();
    expect(field).toHaveAccessibleDescription(codeSwimlaneEditorReason('Area'));
    expect(
      screen.getByText('Swimlanes follow Area in this plan. Change it under Codes above.'),
    ).toBeVisible();
    expect((await axe(container)).violations).toEqual([]);
  });
});
