// Registers jest-dom matchers (toBeInTheDocument, toBeDisabled, ...) for jsdom tests
// and tears down rendered React trees between cases so queries never see stale DOM.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
