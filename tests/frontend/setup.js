import { vi } from 'vitest';

// jsdom does not implement these browser APIs; make them inert so the form's
// UI code can run under test.
Element.prototype.scrollIntoView = vi.fn();
window.print = vi.fn();

if (!navigator.clipboard) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn(async () => {}) },
    configurable: true,
  });
}
