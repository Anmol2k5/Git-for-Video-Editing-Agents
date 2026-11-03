import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // CRUCIAL: CEP requires relative paths for assets
  build: {
    outDir: 'dist',
    // Adobe CEP 11.1 embeds Chromium 88 (see its official runtime table).
    target: 'chrome88',
    cssTarget: 'chrome88',
  }
})
