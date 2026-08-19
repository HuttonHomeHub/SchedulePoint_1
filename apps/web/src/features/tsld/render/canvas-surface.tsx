import { createContext, useCallback, useContext, useState } from 'react';

/**
 * The **canvas surface element**, published so every palette resolver reads the diagram's own scope
 * rather than the page's (ADR-0097 Landing E).
 *
 * `render/palette.ts` makes 86 token reads and every one of them defaulted to
 * `document.documentElement` — so a bar's fill was the PAGE's `--primary`, painted on a ground that
 * is not the page, and the contrast matrix had no canvas pair at all. The painter does not change a
 * line; only the element handed to `getComputedStyle` does.
 *
 * **Published as state, not a ref.** `getComputedStyle` needs a real element at the moment it runs,
 * and a ref mutation re-renders nobody — so a consumer would resolve once against nothing and never
 * recover. A callback ref feeding `useState` re-renders the consumers exactly once, when the node
 * mounts, which is what makes `TsldPanel`'s two `useMemo`s correct rather than one-frame-stale
 * forever. Same reasoning, and the same shape, as `useChromeSlot`.
 *
 * **The provider sits in `plan-workspace.tsx`, above `ToolbarPlanWorkspace`**, which is not
 * arbitrary: `useTsldToolbarContext` is called in that component's OWN body, so a provider rendered
 * in its JSX would not cover it — and that hook is what reaches `resolvePrintPalette`, the export
 * path. A miss there paints page colours into a delivered PDF, where nobody is watching a screen to
 * notice.
 */
const CanvasSurfaceContext = createContext<HTMLElement | null>(null);
const RegisterContext = createContext<((node: HTMLElement | null) => void) | null>(null);

export function CanvasSurfaceProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [element, setElement] = useState<HTMLElement | null>(null);
  // Stable, so the `<Surface>` ref identity never changes and React does not detach/reattach.
  const register = useCallback((node: HTMLElement | null) => setElement(node), []);
  return (
    <RegisterContext value={register}>
      <CanvasSurfaceContext value={element}>{children}</CanvasSurfaceContext>
    </RegisterContext>
  );
}

/** The `<Surface tone="canvas">` element's own hook: hands its node up to the provider. */
export function useRegisterCanvasSurface(): (node: HTMLElement | null) => void {
  const register = useContext(RegisterContext);
  const detached = useCallback(() => undefined, []);
  return register ?? detached;
}

/**
 * The element a palette resolver should read.
 *
 * **Falls back to `document.documentElement`, and that fallback is the honest weak point of this
 * design rather than a convenience.** A resolver reading the page paints plausible colours, passes
 * every test, and is invisible to anyone not comparing two screenshots — which is precisely the
 * failure this landing exists to remove. It is kept because the alternative is worse: a hard
 * failure would blank a planner's diagram whenever a unit test, a Storybook-style harness or a
 * future host mounts the canvas outside the provider.
 *
 * So the guarantee is moved to where it can be checked rather than hoped for:
 *
 * - **the compiler** — every resolver in `render/palette.ts` takes its root as a REQUIRED
 *   parameter, so a call site that forgets one does not compile (the ADR-0070 `hoursPerDay`
 *   precedent, adopted for exactly this class of silent-wrong-value bug);
 * - **a test** (`canvas-surface.test.tsx`) that pins the seam in both directions — a consumer
 *   inside the scope receives the registered element, and a consumer ABOVE it (the `TsldPanel`
 *   shape) receives it too, which is what the state-not-a-ref decision exists for.
 *
 * That test mounts a synthetic host rather than the real panel, and distinguishes the scope from
 * the page by element identity rather than by two differing token values. Said plainly because an
 * earlier draft of this docblock claimed the stronger thing: the guarantee is real and the artifact
 * is narrower than the sentence was (ADR-0076).
 *
 * The fallback is what a caller gets when neither of those applies, i.e. when there is genuinely no
 * diagram on screen.
 */
export function useCanvasSurface(): HTMLElement {
  return useContext(CanvasSurfaceContext) ?? document.documentElement;
}
