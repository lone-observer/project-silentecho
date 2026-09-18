import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Several assertions drive hundreds of seeded runs through the reducer —
    // the source-of-truth sweep in tests/outcomes.test.ts is the slowest. They
    // sit under vitest's 5s default on a fast desktop and over it on slower
    // hardware, so the suite was green or red depending on the machine. A test
    // whose result depends on CPU speed is not measuring what it claims to.
    testTimeout: 30_000,
  },
} as never)
