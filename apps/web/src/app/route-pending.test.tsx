import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RoutePending } from './route-pending';
import { router } from './router';

describe('RoutePending', () => {
  it('is a busy region announced as loading, with no landmark of its own', () => {
    const { container } = render(<RoutePending />);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(container.querySelector('main')).toBeNull();
  });
});

describe('the router pending configuration', () => {
  it('registers the pending component as the default', () => {
    expect(router.options.defaultPendingComponent).toBe(RoutePending);
  });

  it('leaves the timing to the library: 1000 ms before, 500 ms minimum after', () => {
    // These are the library defaults arriving through `createRouter`, so a bump that changes them
    // fails here instead of silently changing when a skeleton shows.
    expect(router.options.defaultPendingMs).toBe(1000);
    expect(router.options.defaultPendingMinMs).toBe(500);
  });

  it('does not declare either timing option itself', () => {
    // The check above cannot tell a default from a restated default; the source can. Comments are
    // stripped first, because the docblock beside the option names both words.
    const source = readFileSync(join(process.cwd(), 'src/app/router.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(source).not.toMatch(/defaultPendingMs|defaultPendingMinMs/);
  });
});
