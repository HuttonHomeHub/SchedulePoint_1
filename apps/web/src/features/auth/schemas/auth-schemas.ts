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
