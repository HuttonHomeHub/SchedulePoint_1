import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useCommittedDraft, type CommitVia } from './use-committed-draft';

/**
 * **The draft-and-commit contract** (ADR-0173, ADR-0188 D2), one `it` per row of the keyboard table
 * in the hook's docblock. Extracted from `SizeField`, whose own suite runs unedited beside this one.
 */

function Harness(props: {
  onCommit?: (raw: string, via: CommitVia) => void | 'keep';
  onDraftLost?: () => void;
  type?: React.HTMLInputTypeAttribute;
  step?: number;
  shut?: boolean;
}): React.ReactElement {
  const ref = useRef<HTMLInputElement>(null);
  const draft = useCommittedDraft({
    value: '300',
    onCommit: props.onCommit ?? (() => undefined),
    inputRef: ref,
    type: props.type ?? 'number',
    ...(props.step === undefined ? {} : { step: props.step }),
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
    render(<Harness onCommit={onCommit} step={16} />);
    fireEvent.keyDown(field(), { key: 'ArrowUp' });
    expect(onCommit).toHaveBeenLastCalledWith('316', 'step');
    fireEvent.change(field(), { target: { value: '100' } });
    fireEvent.keyDown(field(), { key: 'ArrowDown' });
    expect(onCommit).toHaveBeenLastCalledWith('84', 'step');
  });

  it('leaves the arrows alone on a text input', () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} type="text" step={16} />);
    const notPrevented = fireEvent.keyDown(field(), { key: 'ArrowUp' });
    expect(notPrevented).toBe(true);
    expect(onCommit).not.toHaveBeenCalled();
  });

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
    render(<Harness onCommit={onCommit} shut step={16} />);
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

  it('Enter is prevented, and still is when the field is shut, so a form never submits', () => {
    render(<Harness />);
    expect(fireEvent.keyDown(field(), { key: 'Enter' })).toBe(false);
    cleanup();
    render(<Harness shut />);
    expect(fireEvent.keyDown(field(), { key: 'Enter' })).toBe(false);
  });

  it('a blur on a shut field commits nothing and drops the draft', () => {
    const onCommit = vi.fn();
    const view = render(<Harness onCommit={onCommit} />);
    fireEvent.change(field(), { target: { value: '450' } });
    view.rerender(<Harness onCommit={onCommit} shut />);
    fireEvent.blur(field());
    expect(onCommit).not.toHaveBeenCalled();
    expect(field()).toHaveValue(300);
  });

  it('returning keep leaves the typed text for the caller to correct', () => {
    render(<Harness onCommit={() => 'keep'} />);
    fireEvent.change(field(), { target: { value: '450' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(field()).toHaveValue(450);
  });

  it('does not stop or prevent Escape, and ignores Escape aimed at another element', () => {
    render(
      <div>
        <Harness />
        <button type="button">Other</button>
      </div>,
    );
    fireEvent.change(field(), { target: { value: '450' } });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Other' }), { key: 'Escape' });
    expect(field()).toHaveValue(450);
    const seen = vi.fn();
    document.addEventListener('keydown', seen);
    try {
      expect(fireEvent.keyDown(field(), { key: 'Escape' })).toBe(true);
    } finally {
      document.removeEventListener('keydown', seen);
    }
    expect(seen).toHaveBeenCalledOnce();
  });

  it('Escape then blur discards, and typing again afterwards commits on blur', () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    fireEvent.change(field(), { target: { value: '450' } });
    fireEvent.keyDown(field(), { key: 'Escape' });
    fireEvent.blur(field());
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.change(field(), { target: { value: '400' } });
    fireEvent.blur(field());
    expect(onCommit).toHaveBeenCalledExactlyOnceWith('400', 'blur');
  });

  it('typing after an Escape and then unmounting reports the draft lost', () => {
    const onDraftLost = vi.fn();
    const view = render(<Harness onDraftLost={onDraftLost} />);
    fireEvent.change(field(), { target: { value: '450' } });
    fireEvent.keyDown(field(), { key: 'Escape' });
    fireEvent.change(field(), { target: { value: '460' } });
    view.unmount();
    expect(onDraftLost).toHaveBeenCalledOnce();
  });

  it('an empty draft steps from the committed value', () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} step={16} />);
    fireEvent.change(field(), { target: { value: '' } });
    fireEvent.keyDown(field(), { key: 'ArrowUp' });
    expect(onCommit).toHaveBeenLastCalledWith('316', 'step');
  });

  it('does not step without a finite step', () => {
    const onCommit = vi.fn();
    const view = render(<Harness onCommit={onCommit} />);
    expect(fireEvent.keyDown(field(), { key: 'ArrowUp' })).toBe(true);
    view.rerender(<Harness onCommit={onCommit} step={Number.NaN} />);
    expect(fireEvent.keyDown(field(), { key: 'ArrowUp' })).toBe(true);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('reports a lost draft through the latest callback', () => {
    const first = vi.fn();
    const second = vi.fn();
    const view = render(<Harness onDraftLost={first} />);
    fireEvent.change(field(), { target: { value: '450' } });
    view.rerender(<Harness onDraftLost={second} />);
    view.unmount();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
});
