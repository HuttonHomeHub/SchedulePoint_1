import { Button } from '@/components/ui/button';
import { NoticeStrip } from '@/components/ui/notice-strip';

/** What the band has to say, or `null` for "say nothing and take no height". */
export type CanvasModeStatement =
  | { kind: 'adding'; typeLabel: string }
  | { kind: 'linking'; linkType: string }
  | { kind: 'linkPicking'; linkType: string; predecessorName: string }
  | { kind: 'loe'; startPicked: boolean }
  | {
      /** A link was just created. Names the direction that was recorded, and offers to undo it. */
      kind: 'linked';
      predecessorName: string;
      successorName: string;
      linkType: string;
    };

/**
 * Build the band's sentence for a statement. **Pure and exported**, so the same words reach the
 * screen and the live region from one place — the alternative is two strings that agree on the day
 * they are written and diverge on the day one is edited.
 */
export function modeStatementText(statement: CanvasModeStatement): string {
  switch (statement.kind) {
    case 'adding':
      return `Adding ${statement.typeLabel.toLowerCase()} — click the diagram to draw. Esc to stop.`;
    case 'linking':
      return `Linking ${statement.linkType} — click the predecessor. Esc to stop.`;
    case 'linkPicking':
      return `Linking ${statement.linkType} from “${statement.predecessorName}” — click the successor. Esc to drop the pick.`;
    case 'loe':
      return statement.startPicked
        ? 'Level of effort — click the finish driver. Esc to stop.'
        : 'Level of effort — click the start driver. Esc to stop.';
    case 'linked':
      return `Linked “${statement.predecessorName}” → “${statement.successorName}” (${statement.linkType}).`;
  }
}

/**
 * The **mode statement band** (ADR-0064 T4/T5) — a compact, non-modal strip stating which tool is
 * armed, what click it expects next, and what the last link created.
 *
 * It sits in the **reserved chrome above the scene**, never floating over it. The canvas already
 * carries an ADR-0054 cursor chip, an ADR-0056 Today pill and an ADR-0031 floating selection bar;
 * a fourth overlay would eventually come to rest on top of the very bar a planner is trying to
 * click — which is not hypothetical, it is how this epic's own test harness failed once.
 *
 * **Nothing armed renders nothing**, not an empty strip: an always-present band costs canvas height
 * in the state the canvas is in most of the time, and the flag-off parity suite would have nothing
 * to compare against. The scene's paint is untouched either way — this is DOM above the canvas, so
 * canvas-relative geometry (and every hit test built on it) is unchanged.
 */
export function CanvasModeBand({
  statement,
  onUndo,
}: {
  statement: CanvasModeStatement | null;
  /** Present only for `linked`, and only when an inverse is actually available. */
  onUndo?: (() => void) | undefined;
}): React.ReactElement | null {
  if (!statement) return null;
  const confirmation = statement.kind === 'linked';
  return (
    // No `role` is passed, so this is NOT a live region. `TsldPanel` already announces every one of
    // these transitions through the app's single polite region; a second one here would say the
    // same sentence twice, which is the double-speak the plan named as this task's risk.
    <NoticeStrip
      data-testid="canvas-mode-band"
      message={modeStatementText(statement)}
      tone={confirmation ? 'muted' : 'accent'}
    >
      {confirmation && onUndo ? (
        <Button type="button" variant="ghost" size="sm" onClick={onUndo}>
          Undo
        </Button>
      ) : null}
    </NoticeStrip>
  );
}
