import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { NoticeStrip } from '@/components/ui/notice-strip';

export interface TouchGestureHintProps {
  /** Open the help sheet, whose Touch section lists the gesture this tip mentions. */
  onOpenGestures: () => void;
  onDismiss: () => void;
  /**
   * Hand focus to the plan surface once the strip has unmounted itself — the contract
   * `PlacementMigrationNotice` states: the Dismiss button is a child of what it removes.
   */
  restoreFocus?: (() => void) | undefined;
}

/**
 * The one-time tip that tells a finger user a button's name is a press-and-hold away.
 *
 * **No live-region role**, by ADR-0132's discriminator: the sentence reads the same to somebody
 * who arrived five minutes later, so it is a standing condition, not an event.
 *
 * **Touch gestures does not dismiss it.** Opening the sheet is reading about the gesture, not
 * having understood it; the strip stays until the ✕ is pressed.
 */
export function TouchGestureHint({
  onOpenGestures,
  onDismiss,
  restoreFocus,
}: TouchGestureHintProps): React.ReactElement {
  return (
    <NoticeStrip
      tone="info"
      density="comfortable"
      messageFit="grow"
      message={<>Press and hold an icon button to see its name. A tap still presses it.</>}
    >
      <Button variant="outline" size="sm" aria-haspopup="dialog" onClick={onOpenGestures}>
        Touch gestures
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => {
          onDismiss();
          // After, not before: `onDismiss` is what unmounts this button.
          restoreFocus?.();
        }}
        aria-label="Dismiss this tip"
      >
        <X aria-hidden="true" className="size-4" />
      </Button>
    </NoticeStrip>
  );
}
