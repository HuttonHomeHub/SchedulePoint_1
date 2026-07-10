import { z } from 'zod';

/** Project create/edit form schema — mirrors the API DTO (name ≤ 200, description ≤ 2000). */
export const projectFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(200, 'Name is too long.'),
  description: z.string().trim().max(2000, 'Description is too long.').optional(),
});

export type ProjectFormValues = z.infer<typeof projectFormSchema>;
