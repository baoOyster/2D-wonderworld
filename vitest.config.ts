import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Polyfill ImageData cho môi trường Node trước khi import framebuffer.
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
  },
});
