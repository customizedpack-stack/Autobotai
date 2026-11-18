import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// DEMO builds (VITE_DEMO=true) use relative asset paths and hash routing so the
// app can be hosted from any folder without server rewrites.
const demo = process.env.VITE_DEMO === 'true'

export default defineConfig({
  base: demo ? './' : '/',
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
