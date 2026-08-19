// Must precede every other import: it disables Zod's `new Function` probe, whose answer is
// memoised on first use and whose attempt the CSP reports (ADR-0074 M1). See the module docblock.
import '@/config/zod-jitless';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { Providers } from '@/app/providers';

import '@/styles/globals.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <Providers />
  </StrictMode>,
);
