import nest from '@repo/config/eslint/nest';

export default [
  ...nest,
  {
    // `examples/` holds non-shipping reference templates (see ADR-0014). They
    // are not compiled into the app and reference types that may not exist in
    // the live Prisma client, so they are excluded from linting/type-checking.
    ignores: ['examples/**', 'dist/**'],
  },
];
