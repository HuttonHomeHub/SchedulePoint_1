import { createContext, useContext } from 'react';

import { cn } from '@/lib/utils';

/**
 * A **surface scope** (ADR-0055 §1) — a region within which the semantic token names keep their
 * meaning but resolve to a surface-appropriate family.
 *
 * Applying a scope is a COMPONENT, not a class, and deliberately so. The `--chrome-*` and
 * `--panel-*` families are not mapped into Tailwind's theme, so `bg-chrome` does not compile:
 * this component is the only route to those values. That is the structural guard — a developer
 * cannot hand-apply a chrome colour to a page component, because the class does not exist.
 *
 * Inside its own scope `bg-background text-foreground` ARE the surface's colours, which is why
 * every descendant needs no change: `text-muted-foreground` in the header keeps its name and
 * starts resolving to a grey that was actually validated against the header's fill.
 *
 * Portals are outside every scope by construction — `Menu`, `Dialog`, `Sheet` and the combobox
 * listbox render to `document.body`, so a menu opened from the navy toolbar paints on `--popover`.
 * That is intended: an overlay belongs to the page, not to the surface that summoned it.
 */
export type SurfaceTone = 'chrome' | 'panel';

/**
 * Carries the enclosing tone for the nesting invariant ONLY, and is deliberately not exported.
 * Components must never branch on their surface in JS (`docs/FRONTEND_ARCHITECTURE.md`) — the
 * whole point of the mechanism is that they don't have to know where they are.
 */
const SurfaceToneContext = createContext<SurfaceTone | null>(null);

export interface SurfaceProps extends React.HTMLAttributes<HTMLElement> {
  tone: SurfaceTone;
  /** The element to render — `header`, `aside`, `div` … Defaults to `div`. */
  as?: React.ElementType;
}

/**
 * Nesting the same tone twice is a mistake, not a feature: the inner scope rebinds names that are
 * already bound to the same values, which means someone believes they are changing surface and
 * isn't. Fails loud in development, renders anyway in production — the `defineToolbar` precedent
 * (`components/ui/toolbar/toolbar-registry.ts`), because a mis-nested wrapper should never blank
 * a planner's screen. A DIFFERENT tone inside another is legal (a panel docked inside chrome is
 * not used today, but it is not an error).
 */
export function Surface({
  tone,
  as: Component = 'div',
  className,
  children,
  ...rest
}: SurfaceProps): React.ReactElement {
  const enclosing = useContext(SurfaceToneContext);
  if (enclosing === tone && import.meta.env.DEV) {
    throw new Error(
      `<Surface tone="${tone}"> is nested inside another "${tone}" surface. A scope inside an ` +
        `identical scope rebinds names to the values they already have, so the inner one cannot ` +
        `be doing what its author intended. Remove one, or use a different tone.`,
    );
  }
  return (
    <SurfaceToneContext value={tone}>
      <Component
        data-surface={tone}
        className={cn('bg-background text-foreground', className)}
        {...rest}
      >
        {children}
      </Component>
    </SurfaceToneContext>
  );
}
