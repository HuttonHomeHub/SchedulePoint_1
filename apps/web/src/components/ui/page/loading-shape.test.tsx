import { render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { LoadingShape } from './loading-shape';
import { Skeleton, SkeletonText } from './skeleton';

describe('LoadingShape', () => {
  it('speaks its label once, from a status that mounted empty', () => {
    // A server render runs no effects, so it shows exactly what the first commit contains: a live
    // region inserted already holding its sentence is commonly not announced.
    const html = renderToString(
      <LoadingShape label="Loading notes…">
        <Skeleton className="h-4 w-48" />
      </LoadingShape>,
    );
    expect(html).toMatch(/role="status"[^>]*><\/span>/);
    expect(html).not.toContain('Loading notes…');

    render(
      <LoadingShape label="Loading notes…">
        <Skeleton className="h-4 w-48" />
      </LoadingShape>,
    );
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Loading notes…');
  });

  it('still holds one status with one sentence under StrictMode', () => {
    render(
      <StrictMode>
        <LoadingShape label="Loading notes…">
          <Skeleton className="h-4 w-48" />
        </LoadingShape>
      </StrictMode>,
    );
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toBe('Loading notes…');
  });

  it('renders no live region at all when an enclosing region already speaks', () => {
    const { container } = render(
      <LoadingShape label="Loading accounts…" announce="none">
        <Skeleton className="h-4 w-48" />
      </LoadingShape>,
    );
    expect(screen.queryByRole('status')).toBeNull();
    expect(container.querySelector('[aria-live]')).toBeNull();
    // The sentence is still there for a reader who browses into it.
    expect(container).toHaveTextContent('Loading accounts…');
  });

  it('hides the material from assistive technology and sets no aria-busy of its own', () => {
    const { container } = render(
      <LoadingShape label="Loading notes…">
        <Skeleton className="h-4 w-48" />
      </LoadingShape>,
    );
    const material = container.querySelector('[data-skeleton]')?.parentElement;
    expect(material).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('[aria-busy]')).toBeNull();
  });

  it('keeps its status outside any aria-busy subtree the caller wraps around it', () => {
    // The persisting container is the caller's `aria-busy`; the status is a sibling of the
    // material inside the shape, and the shape is not inside the busy element (spec §4.7 rule 2).
    const { container } = render(
      <div>
        <LoadingShape label="Loading notes…">
          <Skeleton className="h-4 w-48" />
        </LoadingShape>
        <div aria-busy="true" />
      </div>,
    );
    expect(screen.getByRole('status').closest('[aria-busy="true"]')).toBeNull();
    expect(container.querySelector('[data-loading-shape]')).not.toBeNull();
  });

  it('has no axe violations, and nothing focusable inside the hidden material', async () => {
    const { container } = render(
      <LoadingShape label="Loading notes…">
        <Skeleton className="h-4 w-48" />
        <SkeletonText sample="12 Oct 2026" />
      </LoadingShape>,
    );
    expect((await axe(container)).violations).toEqual([]);
    const material = container.querySelector('[aria-hidden="true"]');
    expect(material?.querySelector('a, button, input, select, textarea, [tabindex]')).toBeNull();
  });
});

describe('Skeleton material', () => {
  it('carries the data-skeleton hook the forced-colours rule and the instruments read', () => {
    const { container } = render(<Skeleton className="h-4 w-24" />);
    expect(container.firstElementChild).toHaveAttribute('data-skeleton');
  });

  it('takes the border token on a ground that is itself bg-muted', () => {
    const { container } = render(
      <>
        <Skeleton />
        <Skeleton surface="muted" />
      </>,
    );
    const [plain, onMuted] = [...container.children];
    expect(plain?.className).toContain('bg-muted');
    expect(onMuted?.className).toContain('bg-border');
    expect(onMuted?.className).not.toContain('bg-muted');
  });
});

describe('SkeletonText', () => {
  it('sizes itself by hiding the sample with visibility, never by making it transparent', () => {
    // `color: transparent` is overridden to CanvasText under forced colours, which would print the
    // sample — fake data — on screen. `visibility: hidden` stays hidden in that mode.
    const { container } = render(<SkeletonText sample="12 Oct 2026" />);
    const sample = container.querySelector('span');
    expect(sample).toHaveTextContent('12 Oct 2026');
    expect(sample?.className).toContain('invisible');
    expect(sample?.className).not.toMatch(/transparent/);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});
