import { ROLE_LABELS, ROLE_OPTIONS } from '../schemas/invite-schemas';

import { SectionCard } from '@/components/ui/page';

/**
 * What each role can do, on the one screen where somebody chooses one.
 *
 * **It exists because the choice was unexplained where it is made.** The roster's `Role` select and
 * the invitation dialog both offer four words — Viewer, Contributor, Planner, Org Admin — and
 * nothing anywhere in the product says what they mean. Somebody inviting a subcontractor had to
 * guess whether "Contributor" could move a date.
 *
 * **The copy is taken from `docs/PROJECT_BRIEF.md` §5 rather than written here**, because a
 * second description of the permission model is a second thing to keep in step, and the register's
 * standing finding is that it does not get kept. Where the brief is more specific than a screen
 * needs it is shortened, never extended: nothing below claims a capability the brief does not.
 *
 * **It is also an honest occupant of the narrow column.** Members is two-column (product-owner
 * decision 3), and the invitations section alone leaves the second column ragged — the defect the
 * organisation landing already has, where "Needs your attention" holds one item beside a card four
 * times its height. A panel that is there to fill space would be decoration; this one answers a
 * question the screen raises and cannot otherwise answer.
 */
const ROLE_SUMMARIES: Record<(typeof ROLE_OPTIONS)[number], string> = {
  VIEWER: 'Read-only access to shared plans in this organisation.',
  CONTRIBUTOR: 'Updates progress and adds notes on assigned plans. Cannot change logic or dates.',
  PLANNER:
    'Full access to clients, projects, plans and activities, and can hold a plan’s edit lock.',
  ORG_ADMIN: 'Everything a Planner can do, plus members, settings and the shared libraries.',
};

/**
 * Most-capable first, which is the reverse of `ROLE_OPTIONS`.
 *
 * That ordering is deliberate rather than incidental: a reader arrives at this panel to find out
 * what they are about to grant, and the question is nearly always "is this too much?". Reading down
 * from the most capable answers it in the first line. `ROLE_OPTIONS` is left alone — it is the
 * picker's order, and a picker sensibly offers its least-privileged option first.
 */
const MOST_CAPABLE_FIRST = [...ROLE_OPTIONS].reverse();

export function RolesPanel(): React.ReactElement {
  return (
    <SectionCard title="What each role can do">
      <dl className="flex flex-col gap-3 text-sm">
        {MOST_CAPABLE_FIRST.map((role) => (
          <div key={role} className="flex flex-col gap-0.5">
            <dt className="font-medium">{ROLE_LABELS[role]}</dt>
            <dd className="text-muted-foreground">{ROLE_SUMMARIES[role]}</dd>
          </div>
        ))}
      </dl>
    </SectionCard>
  );
}
