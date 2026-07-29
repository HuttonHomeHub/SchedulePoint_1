import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  ContextStrip,
  FieldGrid,
  FieldGridContainer,
  FieldGridFull,
  FormSection,
} from './form-layout';

/**
 * The properties worth pinning here are the *semantic* ones — the ones a class name cannot express
 * and a visual review cannot see. Column counts are `@container` CSS with no computed value in
 * jsdom, so asserting them here would test the class string, not the behaviour; that claim is made
 * in the browser instead (`e2e-dialogs/`).
 */
describe('FormSection', () => {
  it('names its group so the fields inside are announced as belonging together', () => {
    render(
      <FormSection title="Constraints">
        <input aria-label="Constraint date" />
      </FormSection>,
    );
    const group = screen.getByRole('group', { name: 'Constraints' });
    expect(within(group).getByLabelText('Constraint date')).toBeInTheDocument();
  });

  it('exposes the title as a heading as well, so sections can be navigated', () => {
    // The reason for a heading rather than a styled span: in a seven-section dialog, heading
    // navigation is the difference between reaching "Cost" in one keystroke and arrowing through
    // twenty controls to find it.
    render(
      <FormSection title="Availability">
        <input aria-label="Calendar" />
      </FormSection>,
    );
    expect(screen.getByRole('heading', { name: 'Availability' })).toBeInTheDocument();
  });

  it('links its description to the group rather than leaving it as loose text', () => {
    render(
      <FormSection title="External interfaces" description="Imported from another programme.">
        <input aria-label="Earliest start" />
      </FormSection>,
    );
    expect(screen.getByRole('group', { name: 'External interfaces' })).toHaveAccessibleDescription(
      'Imported from another programme.',
    );
  });

  it('renders an aside without it leaking into the group name', () => {
    // A status ("Not set", "2 set") is what lets a reader skip a section honestly — but folded into
    // the accessible name it would make the group's name change as its contents do.
    render(
      <FormSection title="Levelling" aside="Priority 500">
        <input aria-label="Priority" />
      </FormSection>,
    );
    expect(screen.getByRole('group', { name: 'Levelling' })).toBeInTheDocument();
    expect(screen.getByText('Priority 500')).toBeInTheDocument();
  });

  it('refuses to nest, loudly, in development', () => {
    expect(() =>
      render(
        <FormSection title="Outer">
          <FormSection title="Inner">
            <input aria-label="x" />
          </FormSection>
        </FormSection>,
      ),
    ).toThrow(/nested inside another FormSection/);
  });
});

describe('FieldGrid', () => {
  it('keeps its children reachable and in order', () => {
    render(
      <FieldGridContainer>
        <FieldGrid columns="lead">
          <input aria-label="Constraint" />
          <input aria-label="Date" />
          <FieldGridFull>
            <textarea aria-label="Description" />
          </FieldGridFull>
        </FieldGrid>
      </FieldGridContainer>,
    );
    expect(screen.getByLabelText('Constraint')).toBeInTheDocument();
    expect(screen.getByLabelText('Date')).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
  });
});

describe('ContextStrip', () => {
  it('announces each fact as a label/value pair', () => {
    render(
      <ContextStrip
        label="Computed schedule"
        facts={[
          { label: 'Early start', value: '12 Aug 2026' },
          { label: 'Total float', value: '0d' },
        ]}
      />,
    );
    const strip = screen.getByLabelText('Computed schedule');
    expect(within(strip).getByText('Early start')).toBeInTheDocument();
    expect(within(strip).getByText('12 Aug 2026')).toBeInTheDocument();
    expect(within(strip).getByText('Total float')).toBeInTheDocument();
    expect(within(strip).getByText('0d')).toBeInTheDocument();
  });

  it('contains no interactive elements — it reports, it never edits', () => {
    // The contract that keeps it a context strip rather than a second, competing form.
    const { container } = render(
      <ContextStrip label="Computed schedule" facts={[{ label: 'Float', value: '0d' }]} />,
    );
    expect(container.querySelectorAll('button, input, select, textarea, a')).toHaveLength(0);
  });
});
