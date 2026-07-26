import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Surface } from '@/components/ui/surface';

/**
 * The surface-scope primitive (ADR-0055 §1). The contract under test is small on purpose: a
 * scope is an attribute plus the two utilities that, inside it, resolve to the surface's own
 * colours. Everything else about the mechanism lives in CSS and is pinned by
 * `styles/token-architecture.test.ts`.
 */
describe('Surface', () => {
  it('marks the scope with the tone so the CSS rebind rule matches', () => {
    render(
      <Surface tone="chrome" data-testid="scope">
        content
      </Surface>,
    );
    expect(screen.getByTestId('scope')).toHaveAttribute('data-surface', 'chrome');
  });

  it('paints itself with the ordinary page utilities, which the scope rebinds', () => {
    render(
      <Surface tone="panel" data-testid="scope">
        content
      </Surface>,
    );
    // Not `bg-panel` — that utility deliberately does not exist (ADR-0055 §1). Inside the
    // scope, `bg-background` IS the panel fill, which is why descendants need no change.
    expect(screen.getByTestId('scope')).toHaveClass('bg-background', 'text-foreground');
  });

  it('renders the element the caller asks for and keeps its own classes', () => {
    render(
      <Surface tone="chrome" as="header" className="sticky top-0" data-testid="scope">
        content
      </Surface>,
    );
    const scope = screen.getByTestId('scope');
    expect(scope.tagName).toBe('HEADER');
    expect(scope).toHaveClass('sticky', 'top-0');
  });

  it('renders a div by default and forwards arbitrary props', () => {
    render(
      <Surface tone="panel" aria-label="Project Explorer" data-testid="scope">
        content
      </Surface>,
    );
    const scope = screen.getByTestId('scope');
    expect(scope.tagName).toBe('DIV');
    expect(scope).toHaveAttribute('aria-label', 'Project Explorer');
  });

  it('fails loud when a scope is nested inside an identical scope', () => {
    // The inner scope would rebind names to the values they already hold, so its author
    // cannot be getting what they intended. Dev-only throw, the `defineToolbar` precedent.
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() =>
      render(
        <Surface tone="chrome">
          <Surface tone="chrome">content</Surface>
        </Surface>,
      ),
    ).toThrow(/nested inside another "chrome" surface/);
    error.mockRestore();
  });

  it('allows a different tone inside another — a panel docked in chrome is legal', () => {
    render(
      <Surface tone="chrome">
        <Surface tone="panel" data-testid="inner">
          content
        </Surface>
      </Surface>,
    );
    expect(screen.getByTestId('inner')).toHaveAttribute('data-surface', 'panel');
  });
});
