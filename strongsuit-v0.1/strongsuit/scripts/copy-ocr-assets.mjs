// Copies tesseract.js's worker script and wasm cores out of node_modules into
// public/tesseract/ so OCR runs with zero network — without this, tesseract.js
// defaults to importScripts() from cdn.jsdelivr.net at runtime (DEBT-59's
// "no CDN scripts, anywhere" precedent). Generated files are gitignored;
// eng.traineddata next to them is tracked. Runs before dev/build.
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'public', 'tesseract')
mkdirSync(out, { recursive: true })

const files = [
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  // LSTM-only cores (lib/ocr.ts uses the LSTM engine): SIMD build plus the
  // plain fallback, chosen in lib/ocr.ts. The relaxed-SIMD and legacy-engine
  // variants are deliberately not shipped (~16MB more for no accuracy gain).
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
]
for (const [from, to] of files) copyFileSync(join(root, 'node_modules', from), join(out, to))
console.log(`[copy-ocr-assets] ${files.length} files → public/tesseract/`)
