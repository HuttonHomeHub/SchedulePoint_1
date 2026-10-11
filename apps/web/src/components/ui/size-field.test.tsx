import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SizeField, useSizeNotice } from './size-field';

/**
 * **The shared typed size** (ADR-0173, extracted by ADR-0188 D2). The Gantt's Columns group keeps its
 * own suite and runs against this unchanged, so what is pinned here is the field on its own: it
 * applies on commit and never per keystroke, says when it limited a value, and — the case the
 * extraction found — Escape discards a draft even when the container closes on the same key.
 */

function Harness(props: {
  apply?: (size: number) => number;
  limitReason?: string;
}): React.ReactElement {
  const { setNotice, status } = useSizeNotice();
  return (
    <div>
      <SizeField
        subject="Panel width"
        value={300}
        min={100}
        max={500}
        step={16}
        hintId="hint"
        apply={props.apply ?? ((size) => size)}
        onNotice={setNotice}
        {...(props.limitReason ? { limitReason: props.limitReason } : {})}
      />
      <p id="hint">100 to 500 pixels</p>
      {status}
    </div>
  );
}

const field = (): HTMLInputElement =>
  screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Panel width' });

describe('SizeField', () => {
  it('is a labelled spinbutton with the range and the hint wired in', () => {
    render(<Harness />);
    expect(field()).toHaveValue(300);
    expect(field()).toHaveAttribute('min', '100');
    expect(field()).toHaveAttribute('max', '500');
    expect(field()).toHaveAttribute('step', '16');
    expect(field()).toHaveAccessibleDescription('100 to 500 pixels');
  });

  it('applies on Enter and on blur, never per keystroke', () => {
    const apply = vi.fn((size: number) => size);
    render(<Harness apply={apply} />);
    fireEvent.change(field(), { target: { value: '2' } });
    fireEvent.change(field(), { target: { value: '250' } });
    expect(apply).not.toHaveBeenCalled();
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(apply).toHaveBeenCalledExactlyOnceWith(250);
    fireEvent.change(field(), { target: { value: '260' } });
    fireEvent.blur(field());
    expect(apply).toHaveBeenLastCalledWith(260);
  });

  it('steps by its own step with the arrows, and the step applies', () => {
    const apply = vi.fn((size: number) => size);
    render(<Harness apply={apply} />);
    fireEvent.keyDown(field(), { key: 'ArrowUp' });
    expect(apply).toHaveBeenLastCalledWith(316);
    fireEvent.keyDown(field(), { key: 'ArrowDown' });
    expect(apply).toHaveBeenLastCalledWith(284);
  });

  it('says so when a value outside the range is limited, and when nothing usable was typed', () => {
    render(<Harness />);
    fireEvent.change(field(), { target: { value: '9000' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Panel width limited to 500 px. Allowed range is 100 to 500 pixels.',
    );
    fireEvent.change(field(), { target: { value: '' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Panel width not changed. Enter 100 to 500 pixels.',
    );
    expect(field()).toHaveValue(300);
  });

  it('completes the limited-to sentence with the host’s reason when the range was fine', () => {
    render(<Harness apply={() => 220} limitReason="so the chart keeps at least 240 px" />);
    fireEvent.change(field(), { target: { value: '400' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Panel width limited to 220 px so the chart keeps at least 240 px.',
    );
  });

  /**
   * **Verified red** before the fix: a container that closes on Escape (`usePopoverPanel`) listens on
   * `document` in the capture phase and moves focus at once, so the blur reached the field BEFORE its
   * own key handler had marked the draft discarded, and Escape applied what it should have thrown
   * away. This stands a listener like that in front of the field.
   */
  it('Escape discards a draft even when the container blurs the field first', () => {
    const apply = vi.fn((size: number) => size);
    render(<Harness apply={apply} />);
    const closeLikeAPopover = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') field().blur();
    };
    document.addEventListener('keydown', closeLikeAPopover, true);
    try {
      field().focus();
      fireEvent.change(field(), { target: { value: '450' } });
      fireEvent.keyDown(field(), { key: 'Escape' });
    } finally {
      document.removeEventListener('keydown', closeLikeAPopover, true);
    }
    expect(apply).not.toHaveBeenCalled();
    expect(field()).toHaveValue(300);
  });

  it('Escape on an untouched field changes nothing', () => {
    const apply = vi.fn((size: number) => size);
    render(<Harness apply={apply} />);
    fireEvent.keyDown(field(), { key: 'Escape' });
    fireEvent.blur(field());
    expect(apply).not.toHaveBeenCalled();
  });
});

describe('useSizeNotice', () => {
  it('is a live region from the start, and an identical notice replaces its node', () => {
    render(<Harness />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    const limit = (): void => {
      fireEvent.change(field(), { target: { value: '20' } });
      fireEvent.keyDown(field(), { key: 'Enter' });
    };
    limit();
    const first = screen.getByRole('status').firstElementChild;
    limit();
    expect(screen.getByRole('status').firstElementChild).not.toBe(first);
  });
});
