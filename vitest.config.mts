import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/** Testes unitários das partes puras (sem Electron, sem DOM). */
export default defineConfig({
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@shared': resolve('src/shared')
    }
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node'
  }
})
