/**
 * The words of "Page not found", in one place so the two screens that say it cannot drift.
 *
 * `NotFoundScreen` (the root picture, outside the shell) and `OrgNotFoundScreen` (a member's
 * mistype, inside it) differ in structure and must not differ in wording: ADR-0086 wants every
 * address that is not a page to read the same. A module that is not a component also keeps the
 * react-refresh lint rule quiet about a file that exports a constant beside a component.
 */
export const NOT_FOUND_COPY = {
  title: 'Page not found',
  description: 'There is nothing at this address.',
} as const;
