import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CanvasModeBand, modeStatementText } from './CanvasModeBand';

/**
 * The mode statement band (ADR-0064 T4/T5). Its job is to make "which tool is armed, and what does
 * the next click mean" readable without looking at the toolbar — the question the epic's founding
 * defect turned on.
 */
describe('CanvasModeBand', () => {
  it('renders nothing at all when nothing is armed — it must not reserve canvas height', () => {
    const { container } = render(<CanvasModeBand statement={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('states the armed tool and the click a zero-duration type expects', () => {
    render(
      <CanvasModeBand
        statement={{ kind: 'adding', typeLabel: 'Start milestone', gesture: 'click' }}
      />,
    );
    // A milestone has no length to drag, so "place it" is the whole gesture.
    expect(screen.getByTestId('canvas-mode-band')).toHaveTextContent(
      'Adding start milestone · click to place · Esc to stop',
    );
  });

  it('names BOTH gestures for a type that has a length', () => {
    render(<CanvasModeBand statement={{ kind: 'adding', typeLabel: 'Task', gesture: 'drag' }} />);
    // **The shortcut clause survives the 2026-08-26 shortening deliberately.** The copy was cut
    // from prose to a middot status line, but `or click for a day` is not an explanation — it is an
    // undocumented shortcut the sentence exists to surface, which is why the assertion still names
    // both gestures. See `modeStatementText`'s docblock.
    // The old copy said "click the diagram to draw" for every type. For a task that under-describes
    // the tool: dragging sizes the bar, and the click is a one-day shortcut nobody could discover
    // from a sentence that never mentioned dragging. Naming the click as a shortcut, not a mistake,
    // is the point — it commits through the naming popover exactly like a drag does.
    expect(screen.getByTestId('canvas-mode-band')).toHaveTextContent(
      'Adding task · drag to set length, or click for a day · Esc to stop',
    );
  });

  it('names the picked endpoint mid-pick, so "which one did I click" is answerable', () => {
    render(
      <CanvasModeBand
        statement={{ kind: 'linkPicking', linkType: 'FS', predecessorName: 'Set out' }}
      />,
    );
    expect(screen.getByTestId('canvas-mode-band')).toHaveTextContent(
      'Linking FS from “Set out” · click the successor · Esc to drop the pick',
    );
  });

  it('confirms a created link with its DIRECTION, and offers Undo', () => {
    const onUndo = vi.fn();
    render(
      <CanvasModeBand
        statement={{
          kind: 'linked',
          predecessorName: 'Set out',
          successorName: 'Reinforce',
          linkType: 'FS',
        }}
        onUndo={onUndo}
      />,
    );
    // Direction is the whole point: "linked A and B" would have been true of the reversed row too.
    expect(screen.getByTestId('canvas-mode-band')).toHaveTextContent(
      'Linked “Set out” → “Reinforce” (FS).',
    );
    screen.getByRole('button', { name: 'Undo' }).click();
    expect(onUndo).toHaveBeenCalledOnce();
  });

  it('states the link without an Undo when no inverse is available', () => {
    render(
      <CanvasModeBand
        statement={{
          kind: 'linked',
          predecessorName: 'A',
          successorName: 'B',
          linkType: 'SS',
        }}
      />,
    );
    // A button that cannot undo anything is worse than no button.
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    expect(screen.getByTestId('canvas-mode-band')).toHaveTextContent('Linked “A” → “B” (SS).');
  });

  it('is not a live region — the panel already announces every one of these transitions', () => {
    render(<CanvasModeBand statement={{ kind: 'linking', linkType: 'FF' }} />);
    const band = screen.getByTestId('canvas-mode-band');
    expect(band).not.toHaveAttribute('aria-live');
    expect(band).not.toHaveAttribute('role');
  });

  it('exports the sentence so the screen and the live region cannot drift', () => {
    // The panel calls this for its announcement; the band calls it for its text. One string.
    expect(modeStatementText({ kind: 'loe', startPicked: true })).toBe(
      'Level of effort · click the finish driver · Esc to stop',
    );
  });
});
