import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API_PORT = process.env.PORT ?? '3000';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Reachable from a phone on the same Wi-Fi, so QR codes can be tested
    // against the dev server. Run `npm run dev -- --host` to expose it.
    port: 5173,
    // In development the app is served from 5173 and the API lives on 3000.
    // Proxying rather than pointing the client at `http://localhost:3000`
    // keeps everything same-origin, which is what lets the httpOnly session
    // cookie work identically here and in production, where one Node process
    // serves both. Run `npm run server` alongside `npm run dev`.
    proxy: {
      '/api': {
        target: `http://localhost:${API_PORT}`,
        changeOrigin: false,
      },
    },
  },
});
