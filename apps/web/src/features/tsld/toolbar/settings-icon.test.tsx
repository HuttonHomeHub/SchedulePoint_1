import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { buildTsldToolbarItems } from './tsld-toolbar-items';

describe('the Settings… toolbar item', () => {
  it('shows the gear, and no other item shares it', () => {
    const items = buildTsldToolbarItems();
    const gearIds = items
      .filter((item) => {
        if (!item.icon) return false;
        const { container } = render(<>{item.icon}</>);
        return container.querySelector('.lucide-settings') !== null;
      })
      .map((item) => item.id);
    expect(gearIds).toEqual(['calendar']);
  });
});
