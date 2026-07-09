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

    // Each message appears in the error summary and inline on the field.
    expect((await screen.findAllByText('Enter a valid email address')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Password is required').length).toBeGreaterThan(0);
    // The invalid field is flagged for assistive tech.
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });
});
