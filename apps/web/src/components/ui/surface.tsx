import { createContext, useContext } from 'react';

import { cn } from '@/lib/utils';

/**
 * A **surface scope** (ADR-0055 §1) — a region within which the semantic token names keep their
 * meaning but resolve to a surface-appropriate family.
 *
 * Applying a scope is a COMPONENT, not a class, and deliberately so. The `--chrome-*`,
 * `--panel-*` and `--brand-*` families are not mapped into Tailwind's theme, so `bg-chrome` does
 * not compile: this component is the only route to those values. That is the structural guard — a
 * developer cannot hand-apply a chrome colour to a page component, because the class does not
 * exist.
 *
 * Inside its own scope `bg-background text-foreground` ARE the surface's colours, which is why
 * every descendant needs no change: `text-muted-foreground` in the header keeps its name and
 * starts resolving to a grey that was actually validated against the header's fill.
 *
 * Portals are outside every scope by construction — `Menu`, `Dialog`, `Sheet` and the combobox
 * listbox render to `document.body`, so a menu opened from the navy toolbar paints on `--popover`.
 * That is intended: an overlay belongs to the page, not to the surface that summoned it.
 */
/**
 * `chrome` is the app's top band, `panel` the navigator rail, `brand` the public screens' navy
 * panel (ADR-0077 §1) and `auth` the card that panel is joined to (ADR-0077 M7).
 *
 * **`brand` and `auth` are the odd ones and the ADR says why**: both are **theme-invariant** —
 * identical values in Light, Dark and Corporate — because a signed-out visitor cannot choose a
 * theme and something else chooses one for them. They are the scopes whose fill is a decision
 * about identity rather than about position in the app.
 *
 * `auth` exists because ADR-0077 §2's argument was originally applied to only half the screen.
 * The panel was pinned to navy; the card beside it kept following the theme, so a Dark-mode
 * visitor met a fixed navy panel joined to a dark card — one screen wearing two identities,
 * neither of them chosen. Pinning the card needs a scope rather than a class because the page's
 * own fill is theme-driven by construction: no page token can be theme-invariant.
 *
 * The bar for a fifth scope is written down in ADR-0077 §1. It is five conditions, and the load-
 * bearing one is that the region's fill must be chosen for a reason the page's fill structurally
 * cannot serve — otherwise it is a component with props, not a scope.
 */
export type SurfaceTone = 'chrome' | 'panel' | 'brand' | 'auth' | 'card' | 'popover';

/**
 * The two **resets** (ADR-0097 §1.5c). They are not scopes in the ADR-0077 §1 sense — nobody has
 * to clear five conditions to add one, because they add no vocabulary. They RESTORE the page
 * family for their subtree and then change one thing: their own fill.
 *
 * That is what keeps ADR-0055's promise that "a `Card` means the same thing everywhere" true
 * inside a rebinding world. Without it, a `Card` landing inside `chrome` composites
 * `text-muted-foreground` — which IS rebound, to a grey validated against navy — on `--card`,
 * which is not. Two halves of one pair, governed by different scopes: the exact defect the closure
 * defines, and latent rather than live only because no `<Card>` currently renders inside a
 * `<Surface>`.
 */
export const RESET_TONES = ['card', 'popover'] as const satisfies readonly SurfaceTone[];

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
