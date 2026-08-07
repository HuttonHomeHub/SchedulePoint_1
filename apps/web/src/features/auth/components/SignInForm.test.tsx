import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SignInForm } from './SignInForm';

function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SignInForm onSuccess={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('SignInForm', () => {
  it('renders accessible, labelled fields and a submit button', () => {
    renderForm();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('blocks submission and shows validation messages for empty input', async () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    // **Exactly one, and this assertion used to be the defect's own witness.** It read
    // `.length).toBeGreaterThan(0)` above a comment saying "each message appears in the error
    // summary AND inline on the field" — describing the duplication as though it were the design.
    // ADR-0077 §9 removed it: a field's problem belongs to the field. A count that survives at
    // `> 0` is a gate that cannot fail, which is how this shipped past a suite for months.
    expect(await screen.findAllByText('Enter a valid email address')).toHaveLength(1);
    expect(screen.getAllByText('Password is required')).toHaveLength(1);
    // The invalid field is flagged for assistive tech.
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });
});
