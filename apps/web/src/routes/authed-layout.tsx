import { AppShell } from '@/components/layout/navigator/app-shell';

/**
 * The authenticated app shell — the persistent app-shell of ADR-0029: a mounted-once top bar, the
 * Project Explorer rail, and one workspace region.
 *
 * **This was two layouts until `VITE_NAV_TREE` retired (ADR-0084/0088, 2026-08-18.)** The flag-off
 * branch was a header-plus-routed-content fallback kept as an emergency rollback — and it had not
 * been one for a long time: a `VITE_` constant is inlined at build time and no published image
 * passes it, so no user could reach that branch and none ever had. What it did instead was oblige
 * every later change to be made twice, which is how it came to carry its own copy of the
 * `h-dvh` + scrolling-`main` fix.
 */
export function AuthedLayout(): React.ReactElement {
  return <AppShell />;
}
