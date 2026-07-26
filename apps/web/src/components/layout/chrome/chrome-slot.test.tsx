import { render, screen } from '@testing-library/react';
import { createContext } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ChromePortal, ChromeSlot, ChromeSlotProvider, useChromeSlot } from './chrome-slot';

/**
 * Flag-ON behaviour of the chrome slot (ADR-0055 §3). The flag-off identity-wrapper case has its
 * own suite (`chrome-slot.flag-off.test.tsx`) because the two need opposite `vi.mock`s.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  DESIGNED_CHROME_ENABLED: true,
}));

/** Stands in for the workspace's own contexts (the model, the toolbar context, the registry). */
const WorkspaceContext = createContext('');

function Band({ children }: { children: React.ReactNode }): React.ReactElement {
  const { slotRef, node } = useChromeSlot();
  return (
    <ChromeSlotProvider node={node}>
      <div data-testid="band">
        <ChromeSlot slotRef={slotRef} />
      </div>
      <div data-testid="workspace">{children}</div>
    </ChromeSlotProvider>
  );
}

describe('ChromeSlot / ChromePortal (flag on)', () => {
  it('renders portalled children into the band, not where they are written', () => {
    render(
      <Band>
        <ChromePortal>
          <button type="button">Recalculate</button>
        </ChromePortal>
      </Band>,
    );
    const button = screen.getByRole('button', { name: 'Recalculate' });
    expect(screen.getByTestId('band')).toContainElement(button);
    expect(screen.getByTestId('workspace')).not.toContainElement(button);
  });

  it('renders the children exactly once', () => {
    // The failure this guards is the tempting "render in place until the slot mounts" fallback:
    // it paints the toolbar twice for one frame on the way in.
    render(
      <Band>
        <ChromePortal>
          <button type="button">Recalculate</button>
        </ChromePortal>
      </Band>,
    );
    expect(screen.getAllByRole('button', { name: 'Recalculate' })).toHaveLength(1);
  });

  it('renders nothing, and does not throw, when there is no band above it', () => {
    // The flag-off `_authed` layout and every unit-test harness are in this state.
    expect(() =>
      render(
        <ChromePortal>
          <button type="button">Recalculate</button>
        </ChromePortal>,
      ),
    ).not.toThrow();
    expect(screen.queryByRole('button', { name: 'Recalculate' })).not.toBeInTheDocument();
  });

  it('keeps the portalled subtree in the REACT tree — context still reaches it', () => {
    // This is the whole reason for a portal rather than lifting state: the toolbar keeps reading
    // the workspace's context, so `usePlanWorkspaceModel` and the registry predicates are untouched.
    const Ctx = WorkspaceContext;
    render(
      <Band>
        <Ctx.Provider value="from the workspace">
          <ChromePortal>
            <Ctx.Consumer>{(value) => <span data-testid="ctx">{value}</span>}</Ctx.Consumer>
          </ChromePortal>
        </Ctx.Provider>
      </Band>,
    );
    expect(screen.getByTestId('ctx')).toHaveTextContent('from the workspace');
    expect(screen.getByTestId('band')).toContainElement(screen.getByTestId('ctx'));
  });
});
