import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5174 },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        // function form: xyflow's package name itself contains "react", so the
        // canvas check must come before the react check
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return;
          if (id.includes('@xyflow')) return 'vendor-canvas';
          if (id.includes('react') || id.includes('scheduler')) return 'vendor-react';
        },
      },
    },
  },
});
