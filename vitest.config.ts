import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    environment: 'jsdom',
    include: [
      'src/lib/**/*.test.{ts,tsx}',
      'src/content/**/*.test.{ts,tsx}',
      'src/overlay/**/*.test.{ts,tsx}',
      'src/services/**/*.test.{ts,tsx}',
      'src/settings/**/*.test.{ts,tsx}',
      'src/entrypoints/**/*.test.{ts,tsx}',
    ],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.{ts,tsx}'],
      exclude: ['src/lib/**/*.test.{ts,tsx}', 'src/lib/**/types.ts'],
    },
  },
});
