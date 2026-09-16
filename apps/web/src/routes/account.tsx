import { FormSection } from '@/components/ui/form-layout';
import { PageHeader } from '@/components/ui/page';
import { ChangePasswordForm, ResendVerificationButton, useSession } from '@/features/auth';

/**
 * The account screen (`/account`, ADR-0074 M3) — behind `VITE_ACCOUNT_SETTINGS`.
 *
 * **Deliberately not a settings information architecture.** It is the smallest surface that hosts
 * the two things a person needs and had nowhere to do: change their password, and see whether
 * their address is verified (with a way to fix it if not). Theme lives in the account menu, name
 * and organisation membership are not editable here, and none of that is an oversight — spec §4.4
 * lists what is out of scope, and that list is the contract against a settings screen growing.
 *
 * No org in the path and no permission check, because there is nothing to check: everything on it
 * is about the reader's own account, and the endpoints behind it accept no user id.
 */
export function AccountScreen(): React.ReactElement {
  const session = useSession();
  const user = session.data?.user;

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 p-6">
      {/* **The frame stays hand-written and the header does not.** This screen is a declared
          exception to `PageContainer` — 672 px, narrower than the archetype's narrowest measure, with
          the reason recorded at `components/ui/page/page-container.structural.test.ts:45-54`. The
          measure is the exception; the heading's rank, size and description wiring never were, so
          they move to the archetype like every other screen's. The consequence is written down
          rather than left implicit: this adoption is **ungated**, because `routes/archetypes
          .structural.test.ts` scopes itself to the nine in-scope screens and would have to exempt
          this one from its frame assertion to see this one line — an exception list inside a gate
          whose whole value is having none. So it can regress silently, and that is accepted. */}
      <PageHeader
        title="Your account"
        description="Your sign-in details. Everything here applies to you personally, in every organisation you belong to."
      />

      <div className="mt-6 flex flex-col gap-8">
        {/* `headingLevel={2}`: this is a page, so its own `h1` is the level above. The default 3
            is right inside a dialog and skips a level here (ADR-0074 M5-T1). */}
        <FormSection
          title="Email address"
          headingLevel={2}
          description="Where we send verification and account emails."
        >
          {user === undefined ? (
            // Withheld rather than rendered as a placeholder: an em dash where an address belongs
            // reads as "you have no email", which is never true of a signed-in reader.
            <p className="text-muted-foreground text-sm">Loading your details…</p>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm">
                <span className="font-medium">{user.email}</span>{' '}
                {user.emailVerified ? (
                  <span className="text-muted-foreground">— verified</span>
                ) : (
                  <span className="text-muted-foreground">— not verified yet</span>
                )}
              </p>
              {user.emailVerified ? null : (
                <>
                  <p className="text-muted-foreground text-sm">
                    Open the link we emailed you to confirm this address. Sending a new one replaces
                    any earlier link.
                  </p>
                  <ResendVerificationButton email={user.email} />
                </>
              )}
            </div>
          )}
        </FormSection>

        <FormSection
          title="Password"
          headingLevel={2}
          description="Choose something you do not use anywhere else."
        >
          <ChangePasswordForm />
        </FormSection>
      </div>
    </div>
  );
}
