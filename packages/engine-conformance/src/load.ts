import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  fixtureSchema,
  negativeCasesSchema,
  SUPPORTED_SCHEMA_VERSION,
  type ConformanceFixture,
  type NegativeCases,
} from './schema.js';

/** Absolute path to a file under the vendored `fixtures/` directory. */
export function fixturePath(relative: string): string {
  return fileURLToPath(new URL(`../fixtures/${relative}`, import.meta.url));
}

const FIXTURE_FILE = 'p6_torture_test_v1.json';
const NEGATIVE_FILE = 'negative_cases.json';

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(fixturePath(relative), 'utf8'));
}

function assertVersion(actual: string, file: string): void {
  if (actual !== SUPPORTED_SCHEMA_VERSION) {
    throw new Error(
      `${file}: schema_version ${actual} is not the supported ${SUPPORTED_SCHEMA_VERSION}. ` +
        `Fixture regeneration is a reviewed change — update the Zod schema and loaders (ADR-0034).`,
    );
  }
}

/**
 * Load and validate the main conformance fixture. Throws (with Zod's path detail) if the shape has
 * drifted from the pinned schema — the fixture is a versioned contract, not free-form data.
 */
export function loadFixture(): ConformanceFixture {
  const raw = readJson(FIXTURE_FILE);
  const parsed = fixtureSchema.parse(raw);
  assertVersion(parsed.schema_version, FIXTURE_FILE);
  return parsed;
}

/** Load and validate the hostile-input cases (`negative_cases.json`). */
export function loadNegativeCases(): NegativeCases {
  const raw = readJson(NEGATIVE_FILE);
  const parsed = negativeCasesSchema.parse(raw);
  assertVersion(parsed.schema_version, NEGATIVE_FILE);
  return parsed;
}
