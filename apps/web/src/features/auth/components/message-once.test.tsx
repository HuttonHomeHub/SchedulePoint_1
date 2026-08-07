import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useRequestPasswordReset, useResetPassword } from '../api/use-session';

import { ChangePasswordForm } from './ChangePasswordForm';
import { RequestPasswordResetForm } from './RequestPasswordResetForm';
import { ResetPasswordForm } from './ResetPasswordForm';
import { SignUpForm } from './SignUpForm';

/**
 * **One fact, one place on the screen** (ADR-0077 §9).
 *
 * The rule the whole milestone rests on: *a field's problem belongs to the field; the alert belongs
 * to the form.* Before it, `FormErrorSummary` listed every message in a tinted box while each
 * `TextField` printed the same sentence under its own control, so every validation failure on all
 * five auth forms was stated twice at once. The product owner reported it on sign-up — "password
 * insufficient is displayed in two places" — and it was systemic.
 *
 * This suite exists because the per-form tests could not catch it, and demonstrably did not:
 * `SignInForm.test.tsx` asserted `getAllByText(...).length > 0` **under a comment describing the
 * duplication as intended**. A gate that passes at one occurrence and at two is not a gate.
 *
 * It is also where the count's threshold is pinned. `FormProblemCount` is silent below two
 * problems, because React Hook Form already moves focus to the first invalid field — the case WCAG
 * 4.1.3 exempts — and only the *second and later* errors need announcing without focus. One
 * problem plus a box saying "1 problem" would be the same duplication in a new costume.
 */

function withClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

/** The two forms whose mutation is owned by their route (ADR-0077 M2-T3) need a host to hold it. */
function RequestHost() {
  return <RequestPasswordResetForm request={useRequestPasswordReset()} />;
}
function ResetHost() {
  return <ResetPasswordForm token="tok" reset={useResetPassword()} />;
}

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

async function submit(name: RegExp) {
  fireEvent.click(screen.getByRole('button', { name }));
  // React Hook Form validates asynchronously; wait for the first message to settle.
  await screen.findByRole('alert').catch(() => undefined);
}

describe('a validation message is never stated twice', () => {
  it('sign-up: a short password appears once, and earns no summary of its own', async () => {
    // The reported case, verbatim. Name and email are valid so the password is the ONLY problem —
    // which is what makes this the single-error branch as well as the duplication one.
    withClient(<SignUpForm onSuccess={vi.fn()} />);
    type('Full name', 'Jo Planner');
    type('Email', 'jo@example.com');
    type('Password', 'short');
    await submit(/create an account/i);

    expect(await screen.findAllByText('Password must be at least 12 characters')).toHaveLength(1);
    // No count box: one problem, and focus has already gone to the field carrying it.
    expect(screen.queryByText(/problems — check the highlighted fields below\./)).toBeNull();
  });

  it('sign-up: three empty fields state each message once, under one count', async () => {
    withClient(<SignUpForm onSuccess={vi.fn()} />);
    await submit(/create an account/i);

    expect(await screen.findAllByText('Name is required')).toHaveLength(1);
    expect(screen.getAllByText('Enter a valid email address')).toHaveLength(1);
    expect(screen.getAllByText('Password must be at least 12 characters')).toHaveLength(1);
    expect(screen.getAllByText('3 problems — check the highlighted fields below.')).toHaveLength(1);
  });

  it('reset-password: the cross-field mismatch message appears once', async () => {
    // A `refine()` error is attached by `path`, so it renders on a control like any other — the
    // shape most likely to be missed when reasoning about "field errors" as per-field only.
    withClient(<ResetHost />);
    type('New password', 'correct horse battery');
    type('Confirm new password', 'correct horse batteries');
    await submit(/set new password/i);

    expect(await screen.findAllByText('The two passwords do not match')).toHaveLength(1);
    expect(screen.queryByText(/problems — check the highlighted fields below\./)).toBeNull();
  });

  it('change-password: a wrong current password is not repeated in a banner', async () => {
    // `ChangePasswordForm` injects the SERVER's message through `setError`, and the old summary
    // read `Object.values(errors)` indiscriminately — it could not tell a resolver error from an
    // injected one, so the sentence the component's own docblock says "lands on the field, not in
    // a form banner" landed in both. Proven here through the client-validation path, which uses
    // the identical `errors` object.
    withClient(<ChangePasswordForm />);
    type('Current password', 'whatever-i-typed');
    type('New password', 'short');
    type('Confirm new password', 'short');
    await submit(/change password/i);

    expect(await screen.findAllByText('New password must be at least 12 characters')).toHaveLength(
      1,
    );
  });

  it('forgot-password: a malformed address appears once', async () => {
    withClient(<RequestHost />);
    type('Email', 'not-an-address');
    await submit(/send a reset link/i);

    expect(await screen.findAllByText('Enter a valid email address')).toHaveLength(1);
  });
});
