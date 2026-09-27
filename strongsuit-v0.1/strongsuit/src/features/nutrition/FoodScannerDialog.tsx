import { useState, useEffect, useRef } from 'react'
import { Dialog } from '@/design/overlay'
import { Button } from '@/design/controls'
import { Camera, Search, Loader2, AlertCircle } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { foodItemsRepo, trainerRepo } from '@/db/repo'
import { lookupBarcode } from '@/lib/food'
import { cloudCapabilities } from '@/lib/cloudCapability'
import type { FoodItem } from '@/db/types'

// Support native BarcodeDetector if available in the browser (Chrome, Android, etc)
declare global {
  class BarcodeDetector {
    constructor(options?: { formats: string[] })
    detect(image: ImageBitmapSource): Promise<Array<{ rawValue: string, format: string }>>
    static getSupportedFormats(): Promise<string[]>
  }
}

interface FoodScannerDialogProps {
  open: boolean
  onClose: () => void
  onScan: (item: FoodItem) => void
}

export function FoodScannerDialog({ open, onClose, onScan }: FoodScannerDialogProps) {
  const [mode, setMode] = useState<'scan' | 'manual'>('scan')
  const [error, setError] = useState<string | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const trainer = useLiveQuery(() => trainerRepo.get())
  const cloud = cloudCapabilities(trainer)

  // Camera stream state
  const videoRef = useRef<HTMLVideoElement>(null)
  const [cameraActive, setCameraActive] = useState(false)
  // A ref, not the cameraActive state above, gates the detection loop.
  // frame() below closes over whatever `cameraActive` was in the render that
  // created it — since scanLoop() is invoked synchronously right after
  // setCameraActive(true), before React has re-rendered, that closure saw
  // the OLD value (false) and the loop died on its first tick, forever,
  // with the camera preview still showing and no error — scanning silently
  // never worked. A ref is always current regardless of render timing.
  const scanCancelRef = useRef(false)

  // Manual search state
  const [manualBarcode, setManualBarcode] = useState('')

  // Teardown camera on unmount or close
  useEffect(() => {
    if (!open) {
      stopCamera()
    }
    return () => stopCamera()
  }, [open])

  const stopCamera = () => {
    scanCancelRef.current = true
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      stream.getTracks().forEach(t => t.stop())
      videoRef.current.srcObject = null
    }
    setCameraActive(false)
  }

  // Camera boot loop
  useEffect(() => {
    if (open && mode === 'scan' && !cameraActive) {
      startCamera()
    }
  }, [open, mode, cameraActive])

  const startCamera = async () => {
    try {
      scanCancelRef.current = false
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        setCameraActive(true)
        scanLoop(videoRef.current)
      }
    } catch (err) {
      console.warn('Camera access denied or unavailable', err)
      setError('Camera unavailable. Please enter barcode manually.')
      setMode('manual')
    }
  }

  const scanLoop = async (video: HTMLVideoElement) => {
    // Only set up BarcodeDetector if natively supported. Otherwise, we'd fall back to zxing-wasm.
    // For this demonstration, we'll try BarcodeDetector, and if missing, we import zxing-wasm.
    let zxingReader: any = null
    const hasNativeDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window
    let detector: BarcodeDetector | null = null

    if (hasNativeDetector) {
      detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] })
    } else {
      // Dynamic import to keep bundle small if native is supported
      const { readBarcodesFromImageData } = await import('zxing-wasm/reader')
      zxingReader = readBarcodesFromImageData
    }

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    const frame = async () => {
      if (scanCancelRef.current || !videoRef.current) return

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        try {
          if (detector) {
            const barcodes = await detector.detect(video)
            if (barcodes.length > 0) {
              scanCancelRef.current = true
              handleBarcodeScanned(barcodes[0].rawValue)
              return
            }
          } else if (zxingReader && ctx) {
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
            const result = await zxingReader(imageData, {
              tryHarder: false,
              formats: ['EAN_13', 'EAN_8', 'UPC_A', 'UPC_E']
            })
            if (result && result.length > 0) {
              scanCancelRef.current = true
              handleBarcodeScanned(result[0].text)
              return
            }
          }
        } catch (e) {
          // Ignored — frame decode errors are common, we just keep trying
        }
      }
      requestAnimationFrame(frame)
    }

    requestAnimationFrame(frame)
  }

  const handleBarcodeScanned = async (barcode: string) => {
    stopCamera()
    setManualBarcode(barcode)
    setMode('manual')
    await handleLookup(barcode)
  }

  const handleLookup = async (barcode: string) => {
    setError(null)
    setLookupLoading(true)
    
    try {
      // 1. Check local cache
      const local = await foodItemsRepo.byBarcode(barcode)
      if (local) {
        onScan(local)
        return
      }

      // 2. Doctrine check: offline?
      if (!cloud.barcodeLookup) {
        setError('Barcode not found in local cache. You are in fully-local mode, so network lookups to Open Food Facts are disabled.')
        setLookupLoading(false)
        return
      }

      // 3. Query Open Food Facts
      const remote = await lookupBarcode(barcode)
      if ('type' in remote) {
        setError(remote.message)
      } else {
        // Cache it for next time
        await foodItemsRepo.create(remote)
        onScan(remote)
      }
    } finally {
      setLookupLoading(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Log Food">
      <div className="space-y-4 pt-4">
        {/* Mode Toggle */}
        <div className="flex rounded-md shadow-sm p-1 bg-surface2 border border-line mx-auto w-fit">
          <button
            onClick={() => { setMode('scan'); setError(null) }}
            className={`flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors ${mode === 'scan' ? 'bg-surface shadow text-ink' : 'text-faint hover:text-muted'}`}
          >
            <Camera size={16} /> Scan Barcode
          </button>
          <button
            onClick={() => { setMode('manual'); stopCamera(); setError(null) }}
            className={`flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors ${mode === 'manual' ? 'bg-surface shadow text-ink' : 'text-faint hover:text-muted'}`}
          >
            <Search size={16} /> Manual Entry
          </button>
        </div>

        {/* Viewport */}
        <div className="relative overflow-hidden rounded-lg border border-line bg-surface2 aspect-[4/3] flex items-center justify-center">
          {mode === 'scan' ? (
            <>
              <video
                ref={videoRef}
                className="absolute inset-0 h-full w-full object-cover"
                playsInline
                autoPlay
                muted
              />
              <div className="absolute inset-0 pointer-events-none border-[40px] border-black/40">
                <div className="h-full w-full border-2 border-verde-600 rounded" />
              </div>
              {!cameraActive && (
                <div className="text-faint flex flex-col items-center gap-2">
                  <Camera size={32} />
                  <span>Starting camera...</span>
                </div>
              )}
            </>
          ) : (
            <div className="w-full max-w-sm px-4">
              <label className="block text-sm font-medium text-ink mb-1">Enter Barcode Manually</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualBarcode}
                  onChange={e => setManualBarcode(e.target.value)}
                  className="flex-1 rounded-md border-line shadow-sm sm:text-sm"
                  placeholder="e.g. 000000000000"
                  onKeyDown={e => e.key === 'Enter' && handleLookup(manualBarcode)}
                />
                <Button onClick={() => handleLookup(manualBarcode)} disabled={lookupLoading || !manualBarcode}>
                  {lookupLoading ? <Loader2 size={16} className="animate-spin" /> : 'Search'}
                </Button>
              </div>
              {error && (
                <div className="mt-4 rounded-md bg-signal-600/10 p-3 flex gap-2 text-sm text-signal-600">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <p>{error}</p>
                </div>
              )}
              {cloud.barcodeLookup && (
                <p className="mt-4 text-xs text-faint text-center">
                  Lookups check your local cache first. If missing, product details will be securely fetched from Open Food Facts.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  )
}
