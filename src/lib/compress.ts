/**
 * src/lib/compress.ts
 * Client-side image compression using Canvas API.
 * Converts any image to WebP (quality ~0.8, max 1920px).
 * Generates a thumbnail (max 320px, WebP).
 * Rejects if result > 2 MB.
 */
import { MAX_FILE_BYTES, MAX_IMAGE_DIMENSION, MAX_THUMB_DIMENSION, IMAGE_QUALITY, THUMB_QUALITY } from './limits'

export interface CompressResult {
  /** Original WebP blob */
  blob: Blob
  /** Thumbnail WebP blob */
  thumbBlob: Blob
  width: number
  height: number
  thumbWidth: number
  thumbHeight: number
  sizeBytes: number
}

function resizeDimensions(w: number, h: number, maxDim: number): [number, number] {
  if (w <= maxDim && h <= maxDim) return [w, h]
  const ratio = Math.min(maxDim / w, maxDim / h)
  return [Math.round(w * ratio), Math.round(h * ratio)]
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('Canvas toBlob returned null'))),
      'image/webp',
      quality
    )
  })
}

export async function compressImage(file: File): Promise<CompressResult> {
  // Validate mime type
  const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
  if (!allowed.includes(file.type)) {
    throw new Error('Only PNG, JPEG, WebP, GIF images are allowed')
  }

  const bitmap = await createImageBitmap(file)
  const [w, h] = resizeDimensions(bitmap.width, bitmap.height, MAX_IMAGE_DIMENSION)
  const [tw, th] = resizeDimensions(bitmap.width, bitmap.height, MAX_THUMB_DIMENSION)

  // Full-size
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, w, h)
  const blob = await canvasToBlob(canvas, IMAGE_QUALITY)

  if (blob.size > MAX_FILE_BYTES) {
    throw new Error(`Image is too large after compression (${(blob.size / 1024 / 1024).toFixed(1)} MB). Max 2 MB.`)
  }

  // Thumbnail
  const tCanvas = document.createElement('canvas')
  tCanvas.width = tw
  tCanvas.height = th
  const tCtx = tCanvas.getContext('2d')!
  tCtx.drawImage(bitmap, 0, 0, tw, th)
  const thumbBlob = await canvasToBlob(tCanvas, THUMB_QUALITY)

  bitmap.close()

  return { blob, thumbBlob, width: w, height: h, thumbWidth: tw, thumbHeight: th, sizeBytes: blob.size }
}

/**
 * Upload a blob to a Supabase signed URL (PUT request).
 * Returns the response status.
 */
export async function uploadToSignedUrl(
  signedUrl: string,
  blob: Blob,
  onProgress?: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', signedUrl)
    xhr.setRequestHeader('Content-Type', 'image/webp')
    xhr.upload.onprogress = e => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`Upload failed: ${xhr.status}`))
    }
    xhr.onerror = () => reject(new Error('Upload network error'))
    xhr.send(blob)
  })
}
