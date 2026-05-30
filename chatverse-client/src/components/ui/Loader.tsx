import React from 'react'

interface LoaderProps {
  variant?: 'spinner' | 'typing' | 'chat-skeleton' | 'page-skeleton'
  text?: string
}

export default function Loader({ variant = 'spinner', text }: LoaderProps) {
  // 1. TYPING INDICATOR (अब बिल्कुल छोटा और स्लिम है)
  if (variant === 'typing') {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800/60 w-fit rounded-2xl rounded-tl-sm shadow-sm">
        <span className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        {text && <span className="ml-1.5 text-[10px] text-gray-400 font-medium tracking-wide">{text}</span>}
      </div>
    )
  }

  // 2. CHAT MESSAGES SKELETON
  if (variant === 'chat-skeleton') {
    return (
      <div className="flex-1 p-6 space-y-6 overflow-hidden">
        <div className="flex gap-3 items-start animate-pulse">
          <div className="w-8 h-8 bg-gray-800 rounded-full flex-shrink-0" />
          <div className="h-12 bg-gray-800 rounded-2xl rounded-tl-sm w-1/3" />
        </div>
        <div className="flex gap-3 items-start flex-row-reverse animate-pulse">
          <div className="w-8 h-8 bg-gray-800 rounded-full flex-shrink-0" />
          <div className="h-10 bg-indigo-900/40 rounded-2xl rounded-tr-sm w-1/4" />
        </div>
        <div className="flex gap-3 items-start animate-pulse">
          <div className="w-8 h-8 bg-gray-800 rounded-full flex-shrink-0" />
          <div className="h-20 bg-gray-800 rounded-2xl rounded-tl-sm w-1/2" />
        </div>
      </div>
    )
  }

  // 3. FULL PAGE SKELETON
  if (variant === 'page-skeleton') {
    return (
      <div className="flex h-screen bg-gray-950 text-white overflow-hidden w-full">
        <div className="w-64 flex-shrink-0 border-r border-gray-800 flex flex-col p-4">
          <div className="flex items-center gap-3 mb-8 animate-pulse">
            <div className="w-8 h-8 bg-gray-800 rounded-full" />
            <div className="h-6 bg-gray-800 rounded-md w-2/3" />
          </div>
          <div className="space-y-5 flex-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex gap-3 items-center animate-pulse">
                <div className="w-10 h-10 bg-gray-800 rounded-xl" />
                <div className="h-3 bg-gray-800 rounded w-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex-1 flex flex-col">
          <div className="px-6 py-4 border-b border-gray-800 animate-pulse h-[73px] bg-gray-900/20" />
          <Loader variant="chat-skeleton" />
        </div>
      </div>
    )
  }

  // 4. DEFAULT SPINNER
  return (
    <div className="flex flex-col items-center justify-center p-4">
      <div className="w-6 h-6 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin" />
      {text && <p className="mt-2 text-xs text-gray-500 animate-pulse">{text}</p>}
    </div>
  )
}