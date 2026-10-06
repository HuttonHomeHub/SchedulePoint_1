import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { KeyValueList, SectionCard, SectionGroup, SubSection } from './index';

/** Every heading's rank, in document order — the tree a screen-reader user navigates by. */
function ranks(): number[] {
  return screen.getAllByRole('heading').map((heading) => Number(heading.tagName.slice(1)));
}

/**
 * The heading rank is derived from where a thing sits (staff console redesign M2, ADR-0178), and
 * the default must leave the seventeen existing `SectionCard` consumers exactly as they were.
 */
describe('heading rank', () => {
  it('leaves a SectionCard outside any group an h2, with its DOM unchanged', () => {
    const { container } = render(<SectionCard title="Calendars">body</SectionCard>);
    expect(screen.getByRole('heading', { level: 2, name: 'Calendars' })).toBeInTheDocument();
    // The structure the other consumers were written against: a section named by its h2, and no
    // wrapper element introduced by the heading context.
    const section = container.querySelector('section');
    expect(section).not.toBeNull();
    expect(section?.getAttribute('aria-labelledby')).toBe(
      container.querySelector('h2')?.getAttribute('id'),
    );
    expect(section).not.toHaveAttribute('aria-busy');
  });

  it('makes a SectionCard inside a SectionGroup an h3 under the group’s h2', () => {
    render(
      <SectionGroup title="Mail and records">
        <SectionCard title="Mail">body</SectionCard>
      </SectionGroup>,
    );
    expect(ranks()).toEqual([2, 3]);
  });

  it('makes a SubSection one rank below its card, in a group or out of one', () => {
    const { unmount } = render(
      <SectionCard title="Diagnostics">
        <SubSection title="Question one">a</SubSection>
      </SectionCard>,
    );
    expect(ranks()).toEqual([2, 3]);
    unmount();

    render(
      <SectionGroup title="Tools">
        <SectionCard title="Diagnostics">
          <SubSection title="Question one">a</SubSection>
        </SectionCard>
      </SectionGroup>,
    );
    expect(ranks()).toEqual([2, 3, 4]);
  });

  it('never skips a level across a whole grouped page', () => {
    render(
      <>
        <SectionGroup title="Conditions">
          <SectionCard title="Mail">
            <SubSection title="Recent sends">x</SubSection>
          </SectionCard>
          <SectionCard title="Retention">y</SectionCard>
        </SectionGroup>
        <SectionGroup title="Tools">
          <SectionCard title="Diagnostics">
            <SubSection title="Question">z</SubSection>
          </SectionCard>
        </SectionGroup>
      </>,
    );
    const all = ranks();
    expect(all[0]).toBe(2);
    for (let i = 1; i < all.length; i++) {
      // A heading may go deeper by one, or return to any shallower rank — never down by two.
      expect(all[i]! - all[i - 1]!).toBeLessThanOrEqual(1);
    }
  });
});

describe('SectionGroup', () => {
  it('is not a landmark: it adds no region beside the named sections inside it', () => {
    render(
      <SectionGroup title="Conditions" description="What may need you.">
        <SectionCard title="Mail">body</SectionCard>
      </SectionGroup>,
    );
    expect(screen.getAllByRole('region')).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Mail' })).toBeInTheDocument();
    expect(screen.getByText('What may need you.')).toBeInTheDocument();
  });

  it('is a focusable anchor only when it has an id', () => {
    const { container, rerender } = render(<SectionGroup title="Tools">x</SectionGroup>);
    expect(container.querySelector('section')).not.toHaveAttribute('tabindex');
    expect(container.querySelector('section')).not.toHaveAttribute('id');
    rerender(
      <SectionGroup title="Tools" id="tools">
        x
      </SectionGroup>,
    );
    expect(container.querySelector('section')).toHaveAttribute('id', 'tools');
    expect(container.querySelector('section')).toHaveAttribute('tabindex', '-1');
  });

  it('renders a Back to top link only when told where it goes', () => {
    const { rerender } = render(<SectionGroup title="Tools">x</SectionGroup>);
    expect(screen.queryByRole('link', { name: 'Back to top' })).not.toBeInTheDocument();
    rerender(
      <SectionGroup title="Tools" backToTopHref="#top">
        x
      </SectionGroup>,
    );
    expect(screen.getByRole('link', { name: 'Back to top' })).toHaveAttribute('href', '#top');
  });
});

describe('SubSection', () => {
  it('is a heading alone when it has no children', () => {
    render(<SubSection title="Caption" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Caption' })).toBeInTheDocument();
  });
});

describe('KeyValueList', () => {
  it('is a description list, with a consequence as a second description of the same term', () => {
    const { container } = render(
      <KeyValueList
        items={[
          { label: 'Sweep schedule', value: 'Every hour', consequence: 'Old rows go on the hour.' },
          { label: 'Hierarchy expiry', value: 'Off' },
        ]}
      />,
    );
    expect(container.querySelectorAll('dl')).toHaveLength(1);
    expect(container.querySelectorAll('dt')).toHaveLength(2);
    expect(container.querySelectorAll('dd')).toHaveLength(3);
    expect(container.querySelector('p')).toBeNull();
    expect(screen.getByText('Old rows go on the hour.').tagName).toBe('DD');
  });
});
