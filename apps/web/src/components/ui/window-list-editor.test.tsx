import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { WindowListEditor, type WindowRowValue } from './window-list-editor';

/** A host that owns the rows, as every real consumer does. */
function Harness({
  initial = [],
  problems,
  readOnly,
}: {
  initial?: WindowRowValue[];
  problems?: { index: number; message: string }[];
  readOnly?: boolean;
}) {
  const [rows, setRows] = useState(initial);
  return (
    <WindowListEditor
      rows={rows}
      onChange={setRows}
      legend="Monday hours"
      {...(problems ? { problems } : {})}
      {...(readOnly ? { readOnly } : {})}
    />
  );
}

describe('WindowListEditor', () => {
  it('names the group so it is findable without sight of the heading', () => {
    render(<Harness />);
    expect(screen.getByRole('group', { name: 'Monday hours' })).toBeInTheDocument();
  });

  it('says a day is not worked rather than showing an empty void', () => {
    render(<Harness />);
    expect(screen.getByText('Not worked.')).toBeInTheDocument();
  });

  it('renders each window as a list item, not a table row', () => {
    // A set of periods, with no meaningful column relationships to navigate — `<ul>`, per the
    // ADR-0067 a11y contract.
    render(<Harness initial={[{ start: '08:00', end: '12:00' }]} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  /**
   * WCAG 2.5.3 Label in Name: the accessible name must begin with the word a sighted user reads,
   * so speech input ("click Start") matches. A name like "Monday hours, period 1 start" reads
   * correctly aloud and fails that test.
   */
  it('leads each field’s accessible name with its visible column word', () => {
    render(<Harness initial={[{ start: '08:00', end: '12:00' }]} />);
    expect(screen.getByRole('textbox', { name: /^Start time/ })).toHaveValue('08:00');
    expect(screen.getByRole('textbox', { name: /^End time/ })).toHaveValue('12:00');
  });

  it('adds a row seeded with an ordinary working day', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /^Add hours/ }));
    expect(screen.getByRole('textbox', { name: /^Start time/ })).toHaveValue('08:00');
    expect(screen.getByRole('textbox', { name: /^End time/ })).toHaveValue('17:00');
  });

  it('keeps a half-typed value rather than rewriting it', () => {
    // A field that corrects you mid-keystroke is worse than one that waits: "8:" is on the way to
    // "8:30", and text is the source of truth until the boundary parses it.
    render(<Harness initial={[{ start: '08:00', end: '12:00' }]} />);
    const start = screen.getByRole('textbox', { name: /^Start time/ });
    fireEvent.change(start, { target: { value: '8:' } });
    expect(start).toHaveValue('8:');
  });

  it('links a row’s error to both of its fields and marks them invalid', () => {
    render(
      <Harness
        initial={[{ start: '12:00', end: '08:00' }]}
        problems={[{ index: 0, message: 'The end time must be after the start time.' }]}
      />,
    );
    const start = screen.getByRole('textbox', { name: /^Start time/ });
    const end = screen.getByRole('textbox', { name: /^End time/ });
    // `aria-describedby`-linked, not merely printed nearby — the ADR-0060 M6 finding.
    expect(start).toHaveAccessibleDescription('The end time must be after the start time.');
    expect(end).toHaveAccessibleDescription('The end time must be after the start time.');
    expect(start).toHaveAttribute('aria-invalid', 'true');
  });

  it('puts a row’s error on that row only', () => {
    render(
      <Harness
        initial={[
          { start: '08:00', end: '12:00' },
          { start: '10:00', end: '14:00' },
        ]}
        problems={[{ index: 1, message: 'These hours overlap the row above.' }]}
      />,
    );
    const [first, second] = screen.getAllByRole('listitem');
    expect(within(first!).getByRole('textbox', { name: /^Start time/ })).not.toHaveAttribute(
      'aria-invalid',
    );
    expect(within(second!).getByRole('textbox', { name: /^Start time/ })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('removes a row and moves focus to the next one, not to the body', async () => {
    render(
      <Harness
        initial={[
          { start: '08:00', end: '12:00' },
          { start: '13:00', end: '17:00' },
        ]}
      />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: /^Remove/ })[0]!);

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
    // The surviving row is now first; focus landed on it rather than falling to `<body>`, which
    // is the classic "where am I?" for a keyboard or screen-reader user.
    const remaining = screen.getByRole('textbox', { name: /^Start time/ });
    expect(remaining).toHaveValue('13:00');
    await waitFor(() => expect(document.activeElement).toBe(remaining));
  });

  it('moves focus to Add when the last row is removed', async () => {
    render(<Harness initial={[{ start: '08:00', end: '12:00' }]} />);
    fireEvent.click(screen.getByRole('button', { name: /^Remove/ }));

    await waitFor(() => expect(screen.getByText('Not worked.')).toBeInTheDocument());
    // There is no row left to focus; Add is the only thing to do next, so focus goes there.
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Add hours/ })),
    );
  });

  it('distinguishes each row’s controls for a screen reader', () => {
    render(
      <Harness
        initial={[
          { start: '08:00', end: '12:00' },
          { start: '13:00', end: '17:00' },
        ]}
      />,
    );
    // "Remove" three times over is unusable; each names the period it removes.
    expect(
      screen.getByRole('button', { name: 'Remove Monday hours, period 1' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remove Monday hours, period 2' }),
    ).toBeInTheDocument();
  });

  it('renders read-only as text with no controls at all', () => {
    // Not disabled inputs: a disabled control is still a control, and a reader tabbing the form
    // meets a row of dead ends. ADR-0060 M6 / ADR-0063 M6.
    render(<Harness initial={[{ start: '08:00', end: '12:00' }]} readOnly />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('08:00–12:00')).toBeInTheDocument();
  });

  it('reports every edit to its host', () => {
    const onChange = vi.fn();
    render(
      <WindowListEditor
        rows={[{ start: '08:00', end: '12:00' }]}
        onChange={onChange}
        legend="Monday hours"
      />,
    );
    fireEvent.change(screen.getByRole('textbox', { name: /^End time/ }), {
      target: { value: '13:00' },
    });
    expect(onChange).toHaveBeenCalledWith([{ start: '08:00', end: '13:00' }]);
  });
});
