import { AuthShell } from '@/components/layout/auth-shell';

/**
 * The invitation-accept flow's page shell.
 *
 * **Delegates to {@link AuthShell}** (ADR-0074 M2-T1). It used to be a near-copy that had already
 * drifted on width and on whether it announced anything, and three new public screens were about
 * to make that five callers on two implementations — the ADR-0062 shape, where each looks right
 * alone and only a reader who opens the same thing two ways ever sees one is a version behind.
 *
 * Kept as a named wrapper rather than replaced at every call site: the name carries the fact that
 * this flow's children own their own `CardHeader`, which is what the title-less variant is for.
 */
export function InviteShell({
  children,
  busy = false,
}: {
  children: React.ReactNode;
  busy?: boolean;
}): React.ReactElement {
  return (
    <AuthShell size="md" busy={busy}>
      {children}
    </AuthShell>
  );
}
