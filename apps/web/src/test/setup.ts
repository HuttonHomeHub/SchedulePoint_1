// Global test setup for Vitest (jsdom environment).
// Extends `expect` with Testing Library's DOM matchers and clears the DOM
// between tests to keep them isolated.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom doesn't implement the native <dialog> modal methods our Dialog primitive
// relies on; stub them so components that open a dialog can be unit-tested.
if (typeof HTMLDialogElement !== 'undefined') {
  const proto = HTMLDialogElement.prototype as unknown as {
    showModal?: (this: HTMLDialogElement) => void;
    close?: (this: HTMLDialogElement) => void;
  };
  if (!proto.showModal) {
    proto.showModal = function showModal(this: HTMLDialogElement): void {
      this.open = true;
    };
  }
  if (!proto.close) {
    proto.close = function close(this: HTMLDialogElement): void {
      this.open = false;
      this.dispatchEvent(new Event('close'));
    };
  }
}

afterEach(() => {
  cleanup();
});
