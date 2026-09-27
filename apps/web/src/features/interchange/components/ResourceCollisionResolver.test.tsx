import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ResourceCollisionResolver } from './ResourceCollisionResolver';

/**
 * The collision list is `list-none`, the style WebKit and VoiceOver read as "not a list", so its
 * roles are explicit (ADR-0122). Asserted on the attribute, because jsdom does not model the CSS
 * that suppresses the implicit role and a role query would pass against the broken markup.
 */
describe('ResourceCollisionResolver', () => {
  it('exposes the collisions with explicit list and listitem roles', () => {
    const { container } = render(
      <ResourceCollisionResolver
        collisions={[
          {
            resourceKey: 'r1',
            name: 'Crane',
            code: null,
            existing: { id: 'lib-1', name: 'Crane', code: 'CR', archived: false },
          },
          {
            resourceKey: 'r2',
            name: 'Site Crew',
            code: 'CREW-Z',
            existing: { id: 'lib-2', name: 'Site Crew', code: null, archived: true },
          },
        ]}
        resolutions={{}}
        onChange={vi.fn()}
      />,
    );
    const list = container.querySelector('ul');
    expect(list).toHaveAttribute('role', 'list');
    const items = list!.querySelectorAll(':scope > li');
    expect(items).toHaveLength(2);
    for (const item of items) expect(item).toHaveAttribute('role', 'listitem');
  });
});
