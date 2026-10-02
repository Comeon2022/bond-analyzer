import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8787' } },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'shared/**/*.test.ts', 'worker/**/*.test.ts'] },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/react') || id.includes('/node_modules/scheduler')) return 'react-vendor';
          if (id.includes('/node_modules/recharts') || id.includes('/node_modules/d3-')) return 'charts-vendor';
        },
      },
    },
  },
});
