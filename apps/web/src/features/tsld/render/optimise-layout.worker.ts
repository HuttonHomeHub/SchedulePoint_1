import { handleOptimiseRequest, type OptimiseRequest } from './optimise-layout-protocol';

// The module worker that runs Tidy and Re-layout off the main thread (ADR-0152).
self.onmessage = (event: MessageEvent<OptimiseRequest>) => {
  handleOptimiseRequest(event.data, (message) => self.postMessage(message));
};
