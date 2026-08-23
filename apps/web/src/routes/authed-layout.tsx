import { AppShell } from '@/components/layout/navigator/app-shell';
import { NavigationGuard } from '@/components/layout/unsaved-work/navigation-guard';
import { UnsavedWorkProvider } from '@/components/layout/unsaved-work/unsaved-work-provider';

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
 *
 * **`UnsavedWorkProvider` + `NavigationGuard`**: surfaces declare what unsaved work they hold, and
 * the guard stops a navigation that would discard it. A modal blocks the canvas and blocks nothing
 * about Back, Forward, reload or a closed tab — before this, that work vanished silently. It sits
 * here rather than at the root route
 * because every surface that can hold unsaved work is authenticated — the five public auth forms
 * deliberately do not register, since losing a half-typed sign-in is not work.
 *
 * It re-renders nothing on a registration change: the registry lives in a ref, and the only
 * consumer that paints from it subscribes. The `app-shell` suites passing unchanged through this
 * commit is the before/after oracle for that (ADR-0078's barrel-preserving argument).
 */
export function AuthedLayout(): React.ReactElement {
  return (
    <UnsavedWorkProvider>
      <NavigationGuard />
      <AppShell />
    </UnsavedWorkProvider>
  );
}
