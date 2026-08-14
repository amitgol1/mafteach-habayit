import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    // VITE_BACKEND_PORT lets the Playwright E2E harness point this dev
    // server at an isolated backend (port 4001) instead of the real one.
    proxy: {
      '/api': `http://localhost:${process.env.VITE_BACKEND_PORT || 4000}`,
      '/uploads': `http://localhost:${process.env.VITE_BACKEND_PORT || 4000}`,
    },
  },
})
