import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CreateOrganizationForm } from './CreateOrganizationForm';

function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CreateOrganizationForm onCreated={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('CreateOrganizationForm', () => {
  it('renders an accessible name field and submit button', () => {
    renderForm();
    expect(screen.getByLabelText('Organisation name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create organisation/i })).toBeInTheDocument();
  });

  it('blocks submission and flags the field when the name is empty', async () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: /create organisation/i }));

    expect((await screen.findAllByText('Organisation name is required')).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Organisation name')).toHaveAttribute('aria-invalid', 'true');
  });
});
