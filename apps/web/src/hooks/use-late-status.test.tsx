import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useLateStatus } from './use-late-status';

function Status({ busyAncestor }: { busyAncestor: boolean }): React.ReactElement {
  const ref = useLateStatus<HTMLSpanElement>('Loading things…');
  return (
    <div aria-busy={busyAncestor ? 'true' : undefined}>
      <span ref={ref} role="status" />
    </div>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useLateStatus', () => {
  it('writes its text after mount', () => {
    const { getByRole } = render(<Status busyAncestor={false} />);
    expect(getByRole('status')).toHaveTextContent('Loading things…');
  });

  it('complains, in development, when the status sits inside an aria-busy subtree', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<Status busyAncestor />);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]?.[0])).toContain('aria-busy');
  });

  it('is silent when the status is outside any busy element', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<Status busyAncestor={false} />);
    expect(error).not.toHaveBeenCalled();
  });
});
