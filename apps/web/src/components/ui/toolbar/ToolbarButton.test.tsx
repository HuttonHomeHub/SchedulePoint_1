import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToolbarButton } from './ToolbarButton';

const useTooltip = vi.hoisted(() => vi.fn());
vi.mock('@/components/ui/tooltip', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useTooltip,
}));

beforeEach(() => {
  useTooltip.mockReset();
  useTooltip.mockReturnValue({ triggerProps: { ref: () => undefined }, tooltip: null });
});

describe('ToolbarButton tooltip options', () => {
  it('passes the tooltip prop on to useTooltip, whole', () => {
    render(
      <ToolbarButton
        itemId="zoom-in"
        tabIndex={0}
        label="Zoom in"
        labelState="hidden"
        onActivate={() => undefined}
        tooltip={{ placement: 'above', dismissOnPress: true }}
      />,
    );
    expect(useTooltip).toHaveBeenCalledWith(
      expect.objectContaining({ placement: 'above', dismissOnPress: true, content: 'Zoom in' }),
    );
  });

  it('leaves the primitive defaults when no tooltip prop is given', () => {
    render(
      <ToolbarButton
        itemId="zoom-in"
        tabIndex={0}
        label="Zoom in"
        labelState="hidden"
        onActivate={() => undefined}
      />,
    );
    const options = useTooltip.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(options).not.toHaveProperty('placement');
    expect(options).not.toHaveProperty('dismissOnPress');
  });
});

describe('ToolbarButton visibleLabel (toolbar-redesign M5)', () => {
  // A member of a promoted flat pressed set prints its value ("Total float") under a caption and is
  // named with the set ("Colour by: Total float"): the name must be the long one, the text the short one,
  // and the visible text must be inside the name (WCAG 2.5.3).
  it('prints the short text and names the control with the long one', () => {
    const { getByRole } = render(
      <ToolbarButton
        itemId="colour-by-totalFloat"
        tabIndex={0}
        label="Colour by: Total float"
        visibleLabel="Total float"
        onActivate={() => undefined}
      />,
    );
    const button = getByRole('button', { name: 'Colour by: Total float' });
    expect(button).toHaveAttribute('aria-label', 'Colour by: Total float');
    expect(button).toHaveTextContent(/^Total float$/);
  });

  it('paints the whole label, and sets no aria-label, when there is no visibleLabel', () => {
    const { getByRole } = render(
      <ToolbarButton
        itemId="health-check"
        tabIndex={0}
        label="Health check"
        onActivate={() => undefined}
      />,
    );
    const button = getByRole('button', { name: 'Health check' });
    expect(button).not.toHaveAttribute('aria-label');
    expect(button).toHaveTextContent('Health check');
  });
});
