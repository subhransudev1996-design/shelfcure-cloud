import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite config for the desktop app. Tauri integration added in Phase 2.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: 'esnext',
    sourcemap: true,
  },
});
