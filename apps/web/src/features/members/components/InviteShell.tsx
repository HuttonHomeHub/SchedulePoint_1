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
 *
 * It no longer passes a width. ADR-0077 M2-T4 gave every public screen one (448px), which is what
 * this one already had — the sign-in card was the narrow one.
 */
export function InviteShell({
  children,
  busy = false,
}: {
  children: React.ReactNode;
  busy?: boolean;
}): React.ReactElement {
  return <AuthShell busy={busy}>{children}</AuthShell>;
}
