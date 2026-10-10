import { render, screen, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it } from 'vitest';

import { useWithdrawnColumnHandoff } from './use-withdrawn-column-handoff';

import { AnnouncerProvider } from '@/components/ui/announcer';

const SAID = 'Controls hidden: not enough room.';

function Host({
  withdrawn,
  withTarget = true,
  targetFocusable = true,
}: {
  withdrawn: boolean;
  withTarget?: boolean;
  targetFocusable?: boolean;
}): React.ReactElement {
  const columnRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);
  useWithdrawnColumnHandoff({
    columnRef,
    withdrawn,
    target: withTarget ? targetRef : undefined,
    fallbackSelector: '[data-fallback]',
    message: SAID,
  });
  return (
    <>
      <div ref={targetRef} {...(targetFocusable ? { tabIndex: -1 } : {})} data-testid="target" />
      <button type="button" data-fallback="">
        View
      </button>
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

  it('falls back to the control outside the stage when the target cannot take focus', async () => {
    const { rerender } = mount(<Host withdrawn={false} targetFocusable={false} />);
    screen.getByRole('button', { name: 'Zoom in' }).focus();
    rerender(
      <AnnouncerProvider>
        <Host withdrawn targetFocusable={false} />
      </AnnouncerProvider>,
    );
    expect(screen.getByRole('button', { name: 'View' })).toHaveFocus();
    await waitFor(() => expect(screen.getByTestId('announcer')).toHaveTextContent(SAID));
  });

  it('uses the fallback alone when the host offers no target', () => {
    const { rerender } = mount(<Host withdrawn={false} withTarget={false} />);
    screen.getByRole('button', { name: 'Zoom in' }).focus();
    rerender(
      <AnnouncerProvider>
        <Host withdrawn withTarget={false} />
      </AnnouncerProvider>,
    );
    expect(screen.getByRole('button', { name: 'View' })).toHaveFocus();
  });

  it('does not act on mount when the column starts withdrawn', () => {
    mount(<Host withdrawn />);
    expect(screen.getByTestId('target')).not.toHaveFocus();
  });
});
