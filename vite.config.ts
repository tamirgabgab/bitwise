import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // The simulation core is pure TypeScript, so tests run in plain Node.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
