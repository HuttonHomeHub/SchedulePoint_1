import { z } from 'zod';

/**
 * Client-side auth validation. Mirrors the server rules (Better Auth / the
 * feature spec): password ≥ 12 chars, name ≤ 80. The server is authoritative;
 * these give fast, accessible inline feedback.
 */
export const signInSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type SignInValues = z.infer<typeof signInSchema>;

export const signUpSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80, 'Name must be 80 characters or fewer'),
  email: z.email('Enter a valid email address'),
  password: z.string().min(12, 'Password must be at least 12 characters'),
});

export type SignUpValues = z.infer<typeof signUpSchema>;

/**
 * Change your own password from `/account` (ADR-0074 M3).
 *
 * Three rules, and each is here because the server would otherwise say it late or not at all:
 * the new password must clear the same 12-character floor as sign-up, the confirmation must
 * match (a client-only concern — the endpoint takes one value), and the new password must
 * **differ from the current one**, which the server accepts silently. Confirming a change that
 * changed nothing is the shape a person reads as "it did not work".
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().min(12, 'New password must be at least 12 characters'),
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: 'The two passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((values) => values.newPassword !== values.currentPassword, {
    message: 'Choose a password you are not already using',
    path: ['newPassword'],
  });

export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

/** Ask for a reset link (ADR-0074 M4). One field, and the server answers identically either way. */
export const requestPasswordResetSchema = z.object({
  email: z.email('Enter a valid email address'),
});

export type RequestPasswordResetValues = z.infer<typeof requestPasswordResetSchema>;

/**
 * Set a new password from an emailed link (ADR-0074 M4).
 *
 * No current-password field, and that is the point of the flow: the person cannot supply one.
 * The confirmation is client-only — the endpoint takes a single value — and exists because a typo
 * in a password you cannot see locks you out of the account you just recovered.
 */
export const resetPasswordSchema = z
  .object({
    newPassword: z.string().min(12, 'Password must be at least 12 characters'),
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: 'The two passwords do not match',
    path: ['confirmPassword'],
  });

export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
