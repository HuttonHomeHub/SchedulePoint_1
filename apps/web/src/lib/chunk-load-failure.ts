/**
 * Whether an error is a route chunk that failed to download.
 *
 * **A copy of the router's own predicate, not an import of it.** `isModuleNotFoundError` is not
 * re-exported by `@tanstack/react-router`, and this package has no direct `@tanstack/router-core`
 * dependency — adding one would reopen the two-installed-versions risk `docs/TECH_DEBT.md` #178
 * records. The three prefixes are the messages Chrome, Firefox and Safari give for a failed dynamic
 * import (`@tanstack/router-core` `utils.js:147-150`). That location is registered in
 * `scripts/dependency-claims.json`, so `check:claims` fails on the router bump that changes them.
 */
export function isChunkLoadFailure(error: unknown): boolean {
  const message = (error as { message?: unknown } | null | undefined)?.message;
  if (typeof message !== 'string') return false;
  return (
    message.startsWith('Failed to fetch dynamically imported module') ||
    message.startsWith('error loading dynamically imported module') ||
    message.startsWith('Importing a module script failed')
  );
}
