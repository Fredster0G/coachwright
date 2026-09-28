import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { rmSync } from 'node:fs'

// The website build (VITE_TARGET=web) has no on-device AI, so it must not
// ship the ~14MB of OCR runtime + language data that public/tesseract holds
// for the desktop app.
function dropDesktopOnlyAssets(): Plugin {
  let outDir = 'dist'
  return {
    name: 'drop-desktop-only-assets',
    apply: 'build',
    configResolved(c) { outDir = path.resolve(c.root, c.build.outDir) },
    closeBundle() {
      if (process.env.VITE_TARGET === 'web') rmSync(path.join(outDir, 'tesseract'), { recursive: true, force: true })
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), dropDesktopOnlyAssets()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // Website build: swap the on-device AI runtimes for throwing stubs so
      // their JS and ~23MB of wasm never ship (see src/web-stubs/).
      ...(process.env.VITE_TARGET === 'web' ? {
        '@huggingface/transformers': path.resolve(__dirname, 'src/web-stubs/transformers.ts'),
        'tesseract.js': path.resolve(__dirname, 'src/web-stubs/tesseract.ts'),
      } : {}),
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'electron/**/*.test.ts'] },
})
