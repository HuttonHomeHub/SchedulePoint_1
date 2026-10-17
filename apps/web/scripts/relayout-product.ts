import type { PlanResult, Run } from './relayout-bench';

/**
 * **Which Re-layout the build under test contains** (spec `docs/specs/relayout-quality`, FC-R0).
 *
 * FC-R0 compares the benchmark with the Arrange dialog, and the dialog runs whatever source the dev
 * server is serving. A `--product` flag the operator had to keep in step with that source let a default
 * run compare an M1 dialog with a today's-budget benchmark (the first reading, `m0-reading.md`). So
 * the product is read from the build itself — the benchmark is bundled from the same tree the dialog
 * is served from — and a flag may only assert it, never override it.
 *
 * Pure, and importable by both bundles: the browser half reports what it was built with, the node half
 * checks the flag and picks the run to compare.
 */
export type Product = 'today' | 'm1';

export const PRODUCTS: readonly Product[] = ['today', 'm1'];

/** The product a tree contains, from the exports of `use-arrange-search` (a namespace import). */
export function detectProduct(arrange: Record<string, unknown>): Product {
  return 'relayoutBudget' in arrange ? 'm1' : 'today';
}

/**
 * The product to compare the dialog with. `requested` is the `--product` flag, or null; it may only
 * agree with the build. The exception is `--write-baseline`, whose subject is TODAY's figures
 * computed with today's budget in the benchmark alone (no dialog is read), so it must say `today`
 * whatever the tree contains.
 */
export function resolveProduct(
  requested: string | null,
  detected: Product,
  writingBaseline: boolean,
): Product {
  if (requested !== null && !(PRODUCTS as readonly string[]).includes(requested)) {
    throw new Error('--product takes `today` or `m1`');
  }
  if (writingBaseline) {
    if (requested !== 'today') {
      throw new Error(
        "--write-baseline needs --product=today: the baseline is today's figures, computed with today's budget",
      );
    }
    return 'today';
  }
  if (requested !== null && requested !== detected) {
    throw new Error(
      `--product=${requested} but this tree's Arrange dialog runs ${detected}: FC-R0 would compare two different Re-layouts`,
    );
  }
  return detected;
}

/** The benchmark's run for `product`: the one the dialog of that build would show. */
export function productRunOf(
  plan: Pick<PlanResult, 'today' | 'variants' | 'seedName'>,
  product: Product,
): Run {
  const run =
    product === 'today'
      ? plan.today
      : plan.variants.find((v) => v.budget === 'current' && v.start === 0);
  if (!run) throw new Error(`no ${product} Re-layout run for ${plan.seedName}`);
  return run;
}

export function selfTest(): string[] {
  const done: string[] = [];
  const expect = (name: string, got: unknown, want: unknown): void => {
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      throw new Error(
        `relayout-product self-test FAILED: ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
      );
    }
    done.push(name);
  };
  const refuses = (name: string, call: () => unknown): void => {
    let threw = false;
    try {
      call();
    } catch {
      threw = true;
    }
    expect(name, threw, true);
  };

  expect('detect: a tree without relayoutBudget is today', detectProduct({}), 'today');
  expect('detect: a tree with relayoutBudget is m1', detectProduct({ relayoutBudget: 1 }), 'm1');
  expect('resolve: no flag takes the build', resolveProduct(null, 'm1', false), 'm1');
  expect('resolve: a flag that agrees is accepted', resolveProduct('m1', 'm1', false), 'm1');
  refuses('resolve: a flag that disagrees with the build throws', () =>
    resolveProduct('today', 'm1', false),
  );
  refuses('resolve: an unknown product throws', () => resolveProduct('m9', 'm1', false));
  expect('baseline: today is allowed on any tree', resolveProduct('today', 'm1', true), 'today');
  refuses('baseline: without --product=today it throws', () => resolveProduct(null, 'today', true));
  refuses('baseline: --product=m1 throws', () => resolveProduct('m1', 'm1', true));

  const run = (name: string, budget: 'seed' | 'current', start: number): Run =>
    ({ name, budget, start }) as unknown as Run;
  const plan = {
    seedName: 'p',
    today: run('today', 'seed', 0),
    variants: [run('other', 'current', 1), run('m1', 'current', 0)],
  };
  expect("run: today compares today's budget", productRunOf(plan, 'today').name, 'today');
  expect(
    "run: m1 compares the current-budget pack start, never today's",
    productRunOf(plan, 'm1').name,
    'm1',
  );
  refuses('run: m1 with no current-budget run throws', () =>
    productRunOf({ ...plan, variants: [] }, 'm1'),
  );
  return done;
}
