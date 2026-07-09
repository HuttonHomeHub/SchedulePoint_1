import { z } from 'zod';

export const inviteMemberSchema = z.object({
  email: z.email('Enter a valid email address'),
  role: z.enum(['VIEWER', 'CONTRIBUTOR', 'PLANNER', 'ORG_ADMIN']),
});

export type InviteMemberValues = z.infer<typeof inviteMemberSchema>;

/** Human-readable role labels for selects/badges. */
export const ROLE_LABELS: Record<InviteMemberValues['role'], string> = {
  VIEWER: 'Viewer',
  CONTRIBUTOR: 'Contributor',
  PLANNER: 'Planner',
  ORG_ADMIN: 'Org Admin',
};

export const ROLE_OPTIONS = ['VIEWER', 'CONTRIBUTOR', 'PLANNER', 'ORG_ADMIN'] as const;
