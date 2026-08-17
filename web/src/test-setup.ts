import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { resetAuthSession } from './auth/auth';

afterEach(() => {
  cleanup();
  resetAuthSession();
  localStorage.clear();
});
