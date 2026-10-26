import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useCommittedDraft } from './use-committed-draft';

/**
 * **The draft-and-commit contract** (ADR-0173, ADR-0188 D2), one `it` per row of the keyboard table
 * in the hook's docblock. Extracted from `SizeField`, whose own suite runs unedited beside this one.
 */

function Harness(props: {
  onCommit?: (raw: string, via: 'enter' | 'blur' | 'step') => void;
  onDraftLost?: () => void;
  type?: string;
  step?: number;
  shut?: boolean;
}): React.ReactElement {
  const ref = useRef<HTMLInputElement>(null);
  const draft = useCommittedDraft({
    value: '300',
    onCommit: props.onCommit ?? (() => undefined),
    inputRef: ref,
    type: props.type ?? 'number',
    step: props.step ?? 16,
    ...(props.onDraftLost ? { onDraftLost: props.onDraftLost } : {}),
    ...(props.shut ? { shut: true } : {}),
  });
  return <input ref={ref} aria-label="Field" type={props.type ?? 'number'} {...draft} />;
}

const field = (): HTMLInputElement => screen.getByLabelText<HTMLInputElement>('Field');

describe('useCommittedDraft', () => {
  it('keystrokes change the draft and do not commit', () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    fireEvent.change(field(), { target: { value: '2' } });
    fireEvent.change(field(), { target: { value: '250' } });
    expect(onCommit).not.toHaveBeenCalled();
    expect(field()).toHaveValue(250);
  });

  it('Enter commits with a draft and without one', () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onCommit).toHaveBeenLastCalledWith('300', 'enter');
    fireEvent.change(field(), { target: { value: '250' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onCommit).toHaveBeenLastCalledWith('250', 'enter');
    expect(field()).toHaveValue(300);
  });

  it('blur commits only a draft', () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    fireEvent.blur(field());
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.change(field(), { target: { value: '260' } });
    fireEvent.blur(field());
    expect(onCommit).toHaveBeenCalledExactlyOnceWith('260', 'blur');
  });

  it('the arrows step from the draft, or from the value, and apply for a number input', () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    fireEvent.keyDown(field(), { key: 'ArrowUp' });
    expect(onCommit).toHaveBeenLastCalledWith('316', 'step');
    fireEvent.change(field(), { target: { value: '100' } });
    fireEvent.keyDown(field(), { key: 'ArrowDown' });
    expect(onCommit).toHaveBeenLastCalledWith('84', 'step');
  });

  it('leaves the arrows alone on a text input', () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} type="text" />);
    const notPrevented = fireEvent.keyDown(field(), { key: 'ArrowUp' });
    expect(notPrevented).toBe(true);
    expect(onCommit).not.toHaveBeenCalled();
  });

  /** Verified red against a handler that set `discarded` from `onKeyDown` (see `SizeField`'s suite). */
  it('Escape discards a draft even when the container blurs the field first', () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
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
    expect(onCommit).not.toHaveBeenCalled();
    expect(field()).toHaveValue(300);
  });

  it('Escape on an untouched field changes nothing', () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    fireEvent.keyDown(field(), { key: 'Escape' });
    fireEvent.blur(field());
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('unmounting with a draft reports it lost, and does not after an Escape', () => {
    const onDraftLost = vi.fn();
    const first = render(<Harness onDraftLost={onDraftLost} />);
    fireEvent.change(field(), { target: { value: '450' } });
    first.unmount();
    expect(onDraftLost).toHaveBeenCalledOnce();

    const second = render(<Harness onDraftLost={onDraftLost} />);
    fireEvent.change(field(), { target: { value: '450' } });
    fireEvent.keyDown(field(), { key: 'Escape' });
    second.unmount();
    expect(onDraftLost).toHaveBeenCalledOnce();
  });

  it('a shut field commits nothing on Enter or the arrows', () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} shut />);
    fireEvent.keyDown(field(), { key: 'Enter' });
    fireEvent.keyDown(field(), { key: 'ArrowUp' });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('Enter while an IME is composing does not commit', () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} type="text" />);
    fireEvent.keyDown(field(), { key: 'Enter', isComposing: true });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledOnce();
  });
});
