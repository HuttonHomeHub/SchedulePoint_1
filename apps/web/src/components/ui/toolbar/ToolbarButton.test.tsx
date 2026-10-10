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
