import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StaffConsoleScreen } from '@/features/staff/ui/staff-console-screen';

const apiFetch = vi.fn<(path: string) => Promise<unknown>>();
vi.mock('@/lib/api/client', () => ({
  apiFetch: (path: string) => apiFetch(path),
  apiFetchEnvelope: (path: string) => apiFetch(path),
}));

function mount(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <StaffConsoleScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  document.title = 'SchedulePoint';
  apiFetch.mockReset();
});
afterEach(() => {
  document.title = '';
});

describe('the console names itself only once it knows who is asking (M1-T5)', () => {
  it('keeps the document title while identity is pending', () => {
    // Verified red against `identity.data ? 'Staff console' : 'Not found'`, which set
    // "Not found · SchedulePoint" for the first moments of every staff visit.
    apiFetch.mockReturnValue(new Promise(() => undefined));
    mount();
    expect(document.title).toBe('SchedulePoint');
  });

  it('says "Not found" once a non-staff answer arrives', async () => {
    apiFetch.mockImplementation((path) =>
      path.endsWith('/staff/me') || path.includes('identity')
        ? Promise.resolve(null)
        : new Promise(() => undefined),
    );
    mount();
    await waitFor(() => {
      expect(document.title).toBe('Not found · SchedulePoint');
    });
  });
});
