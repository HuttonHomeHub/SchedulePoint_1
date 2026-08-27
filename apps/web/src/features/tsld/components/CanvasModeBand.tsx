import { Button } from '@/components/ui/button';
import { NoticeStrip } from '@/components/ui/notice-strip';

/** What the band has to say, or `null` for "say nothing and take no height". */
export type CanvasModeStatement =
  | {
      kind: 'adding';
      typeLabel: string;
      /**
       * Which gesture the armed type actually wants. **Required, never optional**: an optional
       * field defaults silently, and the default would be wrong for half the types — the sentence
       * would ship describing a gesture the tool does not have. A zero-duration type is placed by
       * a single click; a task is drawn by dragging its length, with a click as a one-day
       * shortcut. Both are named for the drag case, because the click is not a mistake to warn
       * against — it is an undocumented shortcut nobody could discover from the old copy.
       */
      gesture: 'click' | 'drag';
    }
  | { kind: 'linking'; linkType: string }
  /**
   * The marquee sweep is armed (`docs/specs/canvas-multi-select/` M2-T4).
   *
   * It gets the same three things every other armed tool has — a statement, an announcement and
   * Escape — because the failure ADR-0064 was opened on was a tool that armed and said nothing.
   */
  | { kind: 'marquee' }
  | { kind: 'linkPicking'; linkType: string; predecessorName: string }
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
 *
 * ## Shortened 2026-08-26, and what deliberately survived
 *
 * The product owner reported these as adding little. They cost **no canvas height** — ADR-0092 docks
 * them into a row the workspace pays for either way — so this was a copy decision, not a layout one,
 * and it splits each sentence into three parts: the **mode**, the **gesture**, and the **exit**.
 *
 * - The **mode** stays. ADR-0064 was opened on a planner who could not tell which tool was armed —
 *   six link attempts producing zero dependencies — so the leading words are the reason this band
 *   exists at all.
 * - The **exit** stays. ADR-0064 records Escape's behaviour being specified wrongly and found only
 *   by testing; `Esc to stop` is the only place the product says it.
 * - The **explanation** goes: `— drag on the diagram to draw its length` becomes `· drag to set
 *   length`. Em-dash-and-full-stop prose becomes middot-separated clauses, which reads as a status
 *   line rather than a paragraph.
 *
 * **Two clauses were kept against the brief, and this is why.** `or click for a day` and `Ctrl to
 * add` are not explanations — the comments beside them record each as an **undocumented shortcut
 * nobody could discover from the copy**, added deliberately for that reason. Cutting them would
 * re-hide a capability rather than trim a sentence, so they are compressed instead: the drag
 * statement is 66 characters against 88, the marquee 58 against 99. Going shorter is a one-line
 * edit if the product owner would rather have the brevity than the discovery.
 */
export function modeStatementText(statement: CanvasModeStatement): string {
  switch (statement.kind) {
    case 'adding':
      return statement.gesture === 'click'
        ? `Adding ${statement.typeLabel.toLowerCase()} · click to place · Esc to stop`
        : `Adding ${statement.typeLabel.toLowerCase()} · drag to set length, or click for a day · Esc to stop`;
    case 'linking':
      return `Linking ${statement.linkType} · click the predecessor · Esc to stop`;
    case 'marquee':
      // Names the modifier as well as the tool: holding Ctrl/Cmd sweeps without arming anything, and
      // a planner who never finds that is left toggling a tool for every rectangle they draw.
      return 'Marquee select · drag to select, Ctrl to add · Esc to stop';
    case 'linkPicking':
      return `Linking ${statement.linkType} from “${statement.predecessorName}” · click the successor · Esc to drop the pick`;
    case 'linked':
      return `Linked “${statement.predecessorName}” → “${statement.successorName}” (${statement.linkType}).`;
  }
}

/**
 * The **mode statement band** (ADR-0064 T4/T5) — a compact, non-modal strip stating which tool is
 * armed, what click it expects next, and what the last link created.
 *
 * It sits in **reserved chrome, never floating over the scene** — above it until 2026-08-13 and in the canvas dock at the foot of the workspace since (ADR-0092 D2), which is the same rule paying no height for itself. The canvas already
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
