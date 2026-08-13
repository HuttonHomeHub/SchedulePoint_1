import { createContext, useContext, useEffect, useRef, useState } from 'react';

/**
 * **The width of the band a toolbar sits in, as opposed to the width of the toolbar itself.**
 *
 * `Toolbar` asks its own `clientWidth` two different questions, and only one of them is a question
 * about the toolbar:
 *
 * | question                                  | honest input      | consumer                      |
 * | ----------------------------------------- | ----------------- | ----------------------------- |
 * | *how much room does this surface have?*   | the **band**      | `resolveLayoutMode`           |
 * | *does my content fit my box?*             | the **container** | `computeLadder`               |
 *
 * The first is a property of the window; the second is a property of the row. Conflating them is
 * honest only while a toolbar IS the full-width row — and this register has now recorded that
 * assumption failing **three times**:
 *
 * 1. **ADR-0091 D4 was withdrawn** because merging the identity line into the command band would
 *    have left Row 1's toolbar ~891 px of leftover width, dropping it below every band floor and
 *    silently withdrawing every plain-button label at 1920.
 * 2. **Shipped, in `web-v0.86.0`.** Putting the project-finish chip beside Row 1's toolbar took
 *    136 px out of its container (1630 → 1494 at a 1646 px viewport), which is below the 1536 px
 *    `comfortable` floor, so the four viewport commands lost their labels on the product owner's
 *    Surface Pro. Measured, not inferred: Row 1's container is 136 px narrower than Row 2's on the
 *    same screen, and the difference is exactly the chip plus its `gap-2`.
 * 3. **Latent.** The mode row is `shrink-0`, so its `clientWidth` is its ~330 px content and it
 *    resolves `collapsed` at every viewport including 3840. Harmless only because all four of its
 *    items are `showLabel: 'always'`; the first `isVisible(ctx, env)` fold added there would fire
 *    on a wall display.
 *
 * **The invariant, which is the whole point of this module: the band width may never be an input to
 * a fit decision.** It says how roomy the surface is, never whether a particular row's content fits
 * — that second question must keep reading the row's own box, or a wide band would hand labels to a
 * narrow row and overflow it.
 *
 * A toolbar with no provider above it falls back to its own `clientWidth`, which is correct for a
 * toolbar that genuinely is its own surface (the floating selection bar is one, and it is
 * deliberately not in a band).
 */
const ToolbarBandContext = createContext<number | null>(null);

/**
 * Publish this element's width as the band width for every {@link Toolbar} inside it.
 *
 * One `ResizeObserver` on the band, not one per row — the rows share a surface, so they share a
 * measurement, and two observers answering one question is how they come to disagree.
 */
export function ToolbarBandProvider({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const next = node.clientWidth;
      // Zero means "not laid out" (a hidden pane, or no layout engine at all). Publishing it would
      // tell every row in the band that it is collapsed, which is deciding from nothing — the same
      // reason `Toolbar.measure` holds its previous state at `available <= 0`.
      if (next > 0) setWidth(next);
    });
    observer.observe(node);
    setWidth(node.clientWidth > 0 ? node.clientWidth : null);
    return () => observer.disconnect();
  }, []);

  return (
    <ToolbarBandContext.Provider value={width}>
      <div ref={ref} {...(className ? { className } : {})}>
        {children}
      </div>
    </ToolbarBandContext.Provider>
  );
}

/** The enclosing band's width, or `null` when this toolbar is its own surface. */
export function useToolbarBandWidth(): number | null {
  return useContext(ToolbarBandContext);
}
