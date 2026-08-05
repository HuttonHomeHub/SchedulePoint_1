// Must precede every other import: it disables Zod's `new Function` probe, whose answer is
// memoised on first use and whose attempt the CSP reports (ADR-0074 M1). See the module docblock.
import '@/config/zod-jitless';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { Providers } from '@/app/providers';
import { DESIGNED_CHROME_ENABLED } from '@/config/env';

import '@/styles/globals.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

// The designed-chrome flag also carries token VALUES (ADR-0055 §6) — S3's light Corporate rail
// lives in a `[data-designed-chrome]` layer in `globals.css`. Stamped before the first render, so
// there is no frame of the old palette, and absent when the flag is off, which is what makes the
// rollback byte-for-byte for colour and not only for structure.
if (DESIGNED_CHROME_ENABLED) {
  document.documentElement.setAttribute('data-designed-chrome', '');
}

createRoot(rootElement).render(
  <StrictMode>
    <Providers />
  </StrictMode>,
);
