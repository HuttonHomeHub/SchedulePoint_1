import { Maximize2, Minimize2 } from 'lucide-react';

import { planSurfaceTarget } from './focus-reachable';
import { setActualSize } from './workspace-scale-pref';
import { useInWorkspace, useWorkspaceScale } from './workspace-scale-provider';

import { Button } from '@/components/ui/button';
import { useTooltip } from '@/components/ui/tooltip';
import { useContainerUnmountHandoff } from '@/components/ui/use-container-unmount-handoff';

/** Spec story 3's tooltip, verbatim. Exported so the journey asserts the shipped sentence. */
export const WORKSPACE_SCALE_TIP =
  'Shrinks the plan view to fit this window. Choose actual size if you have zoomed the browser.';

/**
 * **"Scaled to 88 %" / "Actual size"** — the reader's way out of the scale (ADR-0222 D4.3, spec story 3),
 * at the trailing end of the foot row.
 *
 * A toggle button, pressed while **actual size** is chosen. Shown only while the workspace is scaled, or
 * while the reader has chosen actual size in a window that would otherwise scale — so it never appears in
 * a window that fits, and never disappears on the press that turned the scale off. It is also absent
 * when a guard holds (enlarged text, browser zoom): the scale is already 1 there and the control would
 * offer nothing.
 *
 * **The accessible name leads with the subject and keeps the visible text inside it** (WCAG 2.5.3 Label
 * in Name): the visible words are "Scaled to 88 %" or "Actual size", and a name of only "Workspace
 * scale" would not contain them, so the name is "Workspace scale: " followed by the same words. The
 * state is `aria-pressed`, and the words change with it because the reader is told what they have, not
 * what a press would do.
 *
 * **Its words step aside, like the plan facts, while a selection bar has the foot row on a short workspace**
 * (`SELECTION_FACTS_YIELD` in `activity-bottom-panel.tsx`): there the row is the bar's whole width (ADR-0219),
 * and a 120 px button beside it wraps the row by a line and takes it from the diagram. The icon, the name and
 * the pressed state stay.
 */
export function WorkspaceScaleSwitch(): React.ReactElement | null {
  const inWorkspace = useInWorkspace();
  const { scale, wouldScale, actualSize } = useWorkspaceScale();

  const visible = inWorkspace && (scale < 1 || (actualSize && wouldScale));
  if (!visible) return null;
  return <ScaleSwitchButton scale={scale} actualSize={actualSize} />;
}

/**
 * **Split from the gate so the button can hand focus on when it goes** (ADR-0135 for a container, SC 2.4.3).
 * The switch leaves under a reader who is on it — the window widens past the scaled range, or a zoom or
 * text-size guard turns scaling off while Actual size is chosen — and the browser drops focus to
 * `<body>`, which also switches off every workspace accelerator. The hook's cleanup runs only when the
 * component that holds it unmounts, so it lives here and not in the always-mounted gate. The plan
 * surface takes focus, as it does when anything else leaves the workspace; nothing is said, because the
 * reader's own action (resizing, zooming) is what removed the control.
 */
function ScaleSwitchButton({
  scale,
  actualSize,
}: {
  scale: number;
  actualSize: boolean;
}): React.ReactElement {
  const { wrapperProps } = useContainerUnmountHandoff({ target: planSurfaceTarget });
  const tip = useTooltip({ content: WORKSPACE_SCALE_TIP, purpose: 'description' });

  const { ref: tipRef, ...tipTrigger } = tip.triggerProps;
  const Icon = actualSize ? Maximize2 : Minimize2;
  const text = actualSize ? 'Actual size' : `Scaled to ${String(Math.round(scale * 100))} %`;
  return (
    // `contents` keeps the wrapper out of the foot row's flex layout while still being the node the
    // hook asks whether focus is inside.
    <span {...wrapperProps} className="contents">
      <Button
        {...tipTrigger}
        ref={tipRef}
        variant="ghost"
        size="sm"
        aria-label={`Workspace scale: ${text}`}
        aria-pressed={actualSize}
        data-workspace-scale-switch
        className="shrink-0"
        onClick={() => setActualSize(!actualSize)}
      >
        <Icon aria-hidden="true" className="size-4" />
        <span data-workspace-scale-label>{text}</span>
      </Button>
      {tip.tooltip}
    </span>
  );
}
