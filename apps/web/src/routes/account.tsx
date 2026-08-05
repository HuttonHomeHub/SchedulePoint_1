import { FormSection } from '@/components/ui/form-layout';
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
      <h1 className="text-2xl font-semibold tracking-tight">Your account</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Your sign-in details. Everything here applies to you personally, in every organisation you
        belong to.
      </p>

      <div className="mt-6 flex flex-col gap-8">
        <FormSection
          title="Email address"
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

        <FormSection title="Password" description="Choose something you do not use anywhere else.">
          <ChangePasswordForm />
        </FormSection>
      </div>
    </div>
  );
}
