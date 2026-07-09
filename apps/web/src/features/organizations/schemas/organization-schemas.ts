import { z } from 'zod';

/** Client-side validation for creating an organisation (mirrors the API rule). */
export const createOrganizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Organisation name is required')
    .max(120, 'Name must be 120 characters or fewer'),
});

export type CreateOrganizationValues = z.infer<typeof createOrganizationSchema>;
