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

/**
 * What each role can do, in one sentence.
 *
 * **The copy is taken from `docs/PROJECT_BRIEF.md` §5 rather than written here**, because a second
 * description of the permission model is a second thing to keep in step. It lives beside the labels
 * because two surfaces read it: the roles panel, and the invitation dialog, where somebody chooses
 * what they are about to grant.
 */
export const ROLE_SUMMARIES: Record<InviteMemberValues['role'], string> = {
  VIEWER: 'Read-only access to shared plans in this organisation.',
  CONTRIBUTOR: 'Updates progress and adds notes on assigned plans. Cannot change logic or dates.',
  PLANNER:
    'Full access to clients, projects, plans and activities, and can change a plan’s logic and dates.',
  ORG_ADMIN: 'Everything a Planner can do, plus members, settings and the shared libraries.',
};
