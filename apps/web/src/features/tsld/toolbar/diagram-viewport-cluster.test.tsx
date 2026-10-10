import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DiagramViewportCluster } from './diagram-viewport-cluster';
import { makeTsldToolbarContext } from './test-helpers';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { AnnouncerProvider } from '@/components/ui/announcer';
import { splitByRow } from '@/components/ui/toolbar';

/**
 * **ADR-0135 for a toolbar that goes, not an item** (toolbar-redesign M4). Switching to the Gantt
 * unmounts the diagram, its slot and so the cluster. A reader standing on a cluster button would
 * land on `<body>`, which also silences every workspace accelerator; so focus goes to the view
 * switch's Gantt segment and the move is announced.
 *
 * Verified red by deleting the unmount cleanup: focus stays on `<body>` and no sentence is spoken.
 */
const items = splitByRow(buildTsldToolbarItems()).canvas;

function Harness(): React.ReactElement {
  const [diagram, setDiagram] = useState(true);
  return (
    <AnnouncerProvider>
      <button type="button" data-toolbar-item="view-gantt" onClick={() => setDiagram(false)}>
        Gantt
      </button>
      {diagram ? <DiagramViewportCluster items={items} context={makeTsldToolbarContext()} /> : null}
    </AnnouncerProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('DiagramViewportCluster', () => {
  it('is a toolbar named "Diagram viewport" holding the four viewport controls', () => {
    render(<Harness />);
    const toolbar = screen.getByRole('toolbar', { name: 'Diagram viewport' });
    expect(toolbar).toBeInTheDocument();
    expect(
      [...toolbar.querySelectorAll('[data-toolbar-item]')].map((el) =>
        el.getAttribute('data-toolbar-item'),
      ),
    ).toEqual(['zoom-out', 'zoom-in', 'fit', 'minimap']);
  });

  it('hands focus to the Gantt segment, and says so, when it unmounts under focus', () => {
    const { rerender } = render(<Harness />);
    const zoomIn = screen.getByRole('button', { name: 'Zoom in' });
    zoomIn.focus();
    expect(zoomIn).toHaveFocus();
    // The cluster goes (the diagram unmounts) while it holds focus.
    act(() => {
      screen.getByRole('button', { name: 'Gantt' }).click();
    });
    rerender(<Harness />);
    expect(screen.queryByRole('toolbar', { name: 'Diagram viewport' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Gantt' })).toHaveFocus();
    expect(screen.getByTestId('announcer')).toHaveTextContent(
      'Diagram viewport controls are only in the Diagram view. Focus moved to Gantt.',
    );
  });

  it('leaves focus alone when it unmounts without holding it', () => {
    render(<Harness />);
    const gantt = screen.getByRole('button', { name: 'Gantt' });
    fireEvent.click(gantt);
    expect(screen.queryByRole('toolbar', { name: 'Diagram viewport' })).toBeNull();
    expect(screen.getByTestId('announcer')).toHaveTextContent('');
  });
});
