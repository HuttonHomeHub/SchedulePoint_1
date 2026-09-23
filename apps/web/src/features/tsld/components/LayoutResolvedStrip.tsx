import { Button } from '@/components/ui/button';
import { NoticeStrip } from '@/components/ui/notice-strip';

export interface LayoutResolvedStripProps {
  /** The sentence the edit's resolution was announced with — one source for both channels. */
  message: string;
  /** Undo the move this strip describes. The host withdraws the strip once it is not on top. */
  onUndo: () => void;
  onDismiss: () => void;
  /**
   * Hand focus somewhere stable BEFORE the strip goes. Both buttons remove the strip that holds
   * them, so without a destination focus falls to `<body>` — WCAG 2.4.3, and on this workspace it
   * also silently disables every keyboard accelerator, because they are a React `onKeyDown` on the
   * workspace root (ADR-0149 D8: a control that destroys itself names its successor).
   */
  restoreFocus: () => void;
}

/**
 * What an edit's automatic overlap resolution did (NetPoint-layout M3, ADR-0153).
 *
 * **No `role`**: the resolution is announced once, by the workspace, through the app's single polite
 * region at the moment it happens — the same sentence this strip shows. A second live region here
 * would say it twice (the `CanvasModeBand` rule), and the strip mounts together with its content,
 * which is the unreliable case for a live region anyway (ADR-0132).
 *
 * `Undo` is here because the move was not something the planner asked for: they stretched a bar
 * and a different lane changed. Reaching for `Ctrl+Z` works too, and is the same step — this is a
 * visible route to it beside the sentence that says what it would reverse.
 */
export function LayoutResolvedStrip({
  message,
  onUndo,
  onDismiss,
  restoreFocus,
}: LayoutResolvedStripProps): React.ReactElement {
  return (
    <NoticeStrip data-testid="canvas-layout-resolved" tone="muted" message={message}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          restoreFocus();
          onUndo();
        }}
      >
        Undo
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          restoreFocus();
          onDismiss();
        }}
      >
        Dismiss
      </Button>
    </NoticeStrip>
  );
}
