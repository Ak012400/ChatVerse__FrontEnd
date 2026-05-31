import { useRef, useState } from 'react'
import { useToastStore } from '../../stores/toastStore'
import Loader from '../ui/Loader'

interface ImageUploadButtonProps {
  onImageReady: (compressedBase64: string) => Promise<void>;
  disabled?: boolean;
}

export default function ImageUploadButton({ onImageReady, disabled }: ImageUploadButtonProps) {
  const [isScanning, setIsScanning] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { showToast } = useToastStore()

  const processImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      showToast({ type: 'error', title: 'Invalid File', message: 'Only images are allowed.', duration: 3000 })
      return
    }

    setIsScanning(true)

    try {
      // 1. Load Image
      const img = new Image()
      const objectUrl = URL.createObjectURL(file)
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = () => reject(new Error("Image failed to load in browser."))
        img.src = objectUrl
      })

      // 2. Smart Canvas Compression (No Upscaling)
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
      if (!ctx) throw new Error("Browser does not support canvas.")
      
      ctx.drawImage(img, 0, 0, width, height)
      
      // Quality 0.4 for very small size
      const compressedBase64 = canvas.toDataURL('image/jpeg', 0.4) 

      if (compressedBase64.length > 500000) {
        throw new Error("Image is still too large. Try another photo.")
      }

      // 3. Send to Parent (ChatPage)
      await onImageReady(compressedBase64)

    } catch (err: any) {
      console.error("Image Processing Error:", err)
      showToast({ type: 'error', title: 'Processing Failed', message: err.message || 'Failed to process image.', duration: 4000 })
    } finally {
      setIsScanning(false)
      if (fileInputRef.current) fileInputRef.current.value = '' // Reset input
    }
  }

  // 💥 FIX: Fragment `<>` का यूज़ किया है ताकि Tailwind का flex लेआउट न फटे!
  return (
    <>
      <button 
        type="button" 
        onClick={() => fileInputRef.current?.click()} 
        disabled={isScanning || disabled}
        className="px-3 py-3 rounded-xl border bg-gray-900 border-gray-800 text-gray-400 hover:text-white transition text-xl flex items-center justify-center min-w-[50px]"
      >
        {isScanning ? <Loader variant="spinner" /> : '📎'}
      </button>
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