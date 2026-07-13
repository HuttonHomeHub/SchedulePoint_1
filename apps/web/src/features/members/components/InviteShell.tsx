import { Card } from '@/components/ui/card';

/**
 * Centered card layout for the public invitation-accept flow — the single
 * `main` landmark for the page. A polite live region announces the outcome to
 * screen-reader users as the invitation resolves (loading → not-found /
 * wrong-account / ready-to-join), which is the page's key decision point
 * (WCAG SC 4.1.3). Mirrors {@link AuthShell} so every public screen owns exactly
 * one `main`.
 */
export function InviteShell({
  children,
  busy = false,
}: {
  children: React.ReactNode;
  busy?: boolean;
}): React.ReactElement {
  return (
    <main
      className="flex min-h-dvh items-center justify-center p-4"
      aria-live="polite"
      aria-busy={busy}
    >
      <Card className="w-full max-w-md">{children}</Card>
    </main>
  );
}
