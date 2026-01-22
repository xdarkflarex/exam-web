'use client'

import { useState } from 'react'
import { X, ZoomIn } from 'lucide-react'

interface QuestionImageProps {
  src: string
  alt?: string
  className?: string
}

export default function QuestionImage({ src, alt = "Question diagram", className = "" }: QuestionImageProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)

  const openModal = () => setIsModalOpen(true)
  const closeModal = () => setIsModalOpen(false)

  return (
    <>
      {/* Thumbnail Image */}
      <div className={`flex justify-center ${className}`}>
        <div className="relative group cursor-pointer" onClick={openModal}>
          <img 
            src={src} 
            alt={alt}
            className="max-w-full h-auto rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow duration-200 bg-white"
            style={{ maxWidth: '520px' }}
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 rounded-lg transition-colors duration-200 flex items-center justify-center">
            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white/90 dark:bg-slate-800/90 rounded-full p-2">
              <ZoomIn className="w-5 h-5 text-slate-600 dark:text-slate-300" />
            </div>
          </div>
        </div>
      </div>

      {/* Full Screen Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center">
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 z-10 p-2 bg-white/90 dark:bg-slate-800/90 rounded-full hover:bg-white dark:hover:bg-slate-800 transition-colors shadow-lg"
            >
              <X className="w-5 h-5 text-slate-600 dark:text-slate-300" />
            </button>
            
            <img 
              src={src} 
              alt={alt}
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl bg-white"
              onClick={closeModal}
            />
          </div>
          
          {/* Click outside to close */}
          <div 
            className="absolute inset-0 -z-10"
            onClick={closeModal}
          />
        </div>
      )}
    </>
  )
}
