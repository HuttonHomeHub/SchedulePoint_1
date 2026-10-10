import { render, screen, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it } from 'vitest';

import { useWithdrawnColumnHandoff } from './use-withdrawn-column-handoff';

import { AnnouncerProvider } from '@/components/ui/announcer';

const SAID = 'Controls hidden: not enough room.';

function Host({
  withdrawn,
  withTarget = true,
}: {
  withdrawn: boolean;
  withTarget?: boolean;
}): React.ReactElement {
  const columnRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);
  useWithdrawnColumnHandoff({
    columnRef,
    withdrawn,
    target: withTarget ? targetRef : undefined,
    message: SAID,
  });
  return (
    <>
      <div ref={targetRef} tabIndex={-1} data-testid="target" />
      <button type="button">elsewhere</button>
      <div ref={columnRef} className={withdrawn ? 'invisible' : undefined}>
        <button type="button">Zoom in</button>
      </div>
    </>
  );
}

const mount = (ui: React.ReactElement) => render(<AnnouncerProvider>{ui}</AnnouncerProvider>);

describe('useWithdrawnColumnHandoff', () => {
  it('moves focus to the target and says why when the column is withdrawn under focus', async () => {
    const { rerender } = mount(<Host withdrawn={false} />);
    screen.getByRole('button', { name: 'Zoom in' }).focus();
    rerender(
      <AnnouncerProvider>
        <Host withdrawn />
      </AnnouncerProvider>,
    );
    expect(screen.getByTestId('target')).toHaveFocus();
    await waitFor(() => expect(screen.getByTestId('announcer')).toHaveTextContent(SAID));
  });

  it('leaves a reader who is elsewhere where they are, and says nothing', () => {
    const { rerender } = mount(<Host withdrawn={false} />);
    screen.getByRole('button', { name: 'elsewhere' }).focus();
    rerender(
      <AnnouncerProvider>
        <Host withdrawn />
      </AnnouncerProvider>,
    );
    expect(screen.getByRole('button', { name: 'elsewhere' })).toHaveFocus();
    expect(screen.getByTestId('announcer')).toBeEmptyDOMElement();
  });

  it('does nothing when the host offers no target', () => {
    const { rerender } = mount(<Host withdrawn={false} withTarget={false} />);
    const zoom = screen.getByRole('button', { name: 'Zoom in' });
    zoom.focus();
    rerender(
      <AnnouncerProvider>
        <Host withdrawn withTarget={false} />
      </AnnouncerProvider>,
    );
    expect(zoom).toHaveFocus();
  });

  it('does not act on mount when the column starts withdrawn', () => {
    mount(<Host withdrawn />);
    expect(screen.getByTestId('target')).not.toHaveFocus();
  });
});
