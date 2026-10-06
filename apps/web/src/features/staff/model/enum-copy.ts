/**
 * Plain-language names for the values the API reports as enums, so no screen prints an identifier.
 *
 * **Every table falls back to the raw value with its underscores replaced, never to a blank and
 * never to a default.** The vocabulary is the server's and is not shared with this package
 * (`docs/TECH_DEBT.md` #310), so a value that arrives without a label here must read as unpolished
 * rather than as something it is not — the ADR-0125 `?? 'HEALTHY'` lesson, applied to copy.
 */

const MAIL_KINDS: Record<string, string> = {
  invitation: 'Invitation',
  email_verification: 'Email confirmation',
  password_reset: 'Password reset',
  test: 'Test email',
};

const CSP_ACTIONS: Record<string, string> = {
  enforce: 'Blocked',
  report: 'Reported only',
};

function raw(value: string): string {
  return value.replace(/_/g, ' ');
}

/** What kind of email failed. The kinds are `operational-alert.service.ts`'s. */
export function mailKindLabel(kind: string): string {
  return MAIL_KINDS[kind] ?? raw(kind);
}

/**
 * What the browser did with a policy violation. `null` is "—" rather than a guess: the legacy
 * report body carries no disposition in every engine.
 */
export function cspActionLabel(disposition: string | null): string {
  if (disposition === null) return '—';
  return CSP_ACTIONS[disposition] ?? raw(disposition);
}

/** "production" → "Production". Unknown environments keep their own name, capitalised. */
export function environmentLabel(environment: string): string {
  const text = raw(environment);
  return text.charAt(0).toUpperCase() + text.slice(1);
}
