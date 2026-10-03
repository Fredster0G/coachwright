// ===== Client-side image resize (spec §4.26) =====
// Progress photos are stored as dataURLs directly in IndexedDB (same pattern
// as client/logo photos elsewhere in the app) — resizing before storage keeps
// years of photos from bloating the database or a backup file. Browser-only
// (Canvas/Image APIs); not unit-tested for that reason — exercised via the
// Progress Photos UI instead.

/** `type` 'image/png' keeps transparency (logos); JPEG is far smaller for photos. */
export function resizeImageToDataUrl(file: File, maxDim = 1280, quality = 0.82, type: 'image/jpeg' | 'image/png' = 'image/jpeg'): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error("Couldn't process that image.")); return }
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL(type, quality))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read that image file.")) }
    img.src = url
  })
}
