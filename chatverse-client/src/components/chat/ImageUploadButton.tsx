import { useRef, useState } from 'react'
import { Paperclip } from 'lucide-react'
import { useToastStore } from '../../stores/toastStore'
import IconButton from '../ui/IconButton'

interface ImageUploadButtonProps {
  onImageReady: (compressedBase64: string) => Promise<void>
  disabled?: boolean
}

/**
 * Reusable image picker. Compresses to JPEG @ ~0.4 quality and width <= 600px
 * before handing the base64 string to the parent.
 *
 * Used independently of ChatPage's inline upload flow (which also runs
 * client-side nsfwjs scanning). Keep these in sync if you wire both up.
 */
export default function ImageUploadButton({ onImageReady, disabled }: ImageUploadButtonProps) {
  const [isScanning, setIsScanning] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { showToast } = useToastStore()

  const processImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      showToast({
        type: 'error',
        title: 'Invalid file',
        message: 'Only images are allowed.',
        duration: 3000,
      })
      return
    }

    setIsScanning(true)
    try {
      const img = new Image()
      const objectUrl = URL.createObjectURL(file)
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = () => reject(new Error('Image failed to load.'))
        img.src = objectUrl
      })

      const canvas = document.createElement('canvas')
      let width = img.width
      let height = img.height
      if (width > 600) {
        height = Math.round((height * 600) / width)
        width = 600
      }
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Browser does not support canvas.')

      ctx.drawImage(img, 0, 0, width, height)
      const compressedBase64 = canvas.toDataURL('image/jpeg', 0.4)

      if (compressedBase64.length > 500_000) {
        throw new Error('Image is still too large. Try another photo.')
      }

      await onImageReady(compressedBase64)
    } catch (err: any) {
      console.error('Image processing error:', err)
      showToast({
        type: 'error',
        title: 'Processing failed',
        message: err?.message ?? 'Failed to process image.',
        duration: 4000,
      })
    } finally {
      setIsScanning(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <>
      <IconButton
        type="button"
        variant="subtle"
        onClick={() => fileInputRef.current?.click()}
        disabled={isScanning || disabled}
        aria-label="Attach image"
      >
        {isScanning ? (
          <span
            className="w-3.5 h-3.5 rounded-full border-[1.5px] border-current border-t-transparent"
            style={{ animation: 'spin 0.7s linear infinite' }}
          />
        ) : (
          <Paperclip size={16} />
        )}
      </IconButton>
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        className="hidden"
        onChange={processImage}
      />
    </>
  )
}
