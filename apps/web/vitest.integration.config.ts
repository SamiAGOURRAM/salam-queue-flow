import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  envDir: path.resolve(__dirname, '../..'),
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/integration/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@queuemed/core': path.resolve(__dirname, '../../packages/core/src'),
    },
  },
});
