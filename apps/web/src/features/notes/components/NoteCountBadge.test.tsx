import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { NoteCountBadge } from './NoteCountBadge';

describe('NoteCountBadge', () => {
  it('renders nothing when the count is zero', () => {
    const { container } = render(<NoteCountBadge count={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a negative/absent count', () => {
    const { container } = render(<NoteCountBadge count={-1} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the count with a spelled-out accessible label (plural)', () => {
    render(<NoteCountBadge count={3} />);
    // The meaning is in text, not the icon/colour alone.
    expect(screen.getByText('3 notes')).toBeInTheDocument();
  });

  it('uses the singular for a single note', () => {
    render(<NoteCountBadge count={1} />);
    expect(screen.getByText('1 note')).toBeInTheDocument();
  });
});
