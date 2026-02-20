'use client'

import { useEffect } from 'react'
import { X, AlertTriangle, CheckCircle, Clock } from 'lucide-react'

interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  type?: 'warning' | 'success' | 'danger' | 'info'
  showCancel?: boolean
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Xác nhận',
  cancelText = 'Hủy',
  type = 'warning',
  showCancel = true
}: ConfirmModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  if (!isOpen) return null

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-6 h-6 text-green-500" />
      case 'danger':
        return <AlertTriangle className="w-6 h-6 text-red-500" />
      case 'info':
        return <Clock className="w-6 h-6 text-blue-500" />
      default:
        return <AlertTriangle className="w-6 h-6 text-yellow-500" />
    }
  }

  const getConfirmButtonClass = () => {
    switch (type) {
      case 'success':
        return 'bg-green-600 hover:bg-green-700'
      case 'danger':
        return 'bg-red-600 hover:bg-red-700'
      default:
        return 'bg-indigo-600 hover:bg-indigo-700'
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div 
        className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-in"
        onClick={onClose}
      />
      <div className="relative bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-2xl max-w-md w-full p-4 sm:p-6 scale-in">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 sm:top-4 sm:right-4 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5 text-slate-400" />
        </button>

        <div className="flex items-start sm:items-center gap-3 sm:gap-4 mb-3 sm:mb-4 pr-8">
          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
            type === 'success' ? 'bg-green-100 dark:bg-green-900/30' :
            type === 'danger' ? 'bg-red-100 dark:bg-red-900/30' :
            type === 'info' ? 'bg-blue-100 dark:bg-blue-900/30' :
            'bg-yellow-100 dark:bg-yellow-900/30'
          }`}>
            {getIcon()}
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white">
            {title}
          </h2>
        </div>

        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mb-5 sm:mb-6 ml-0 sm:ml-16">
          {message}
        </p>

        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 sm:justify-end">
          {showCancel && (
            <button
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2.5 sm:py-2 rounded-lg font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-center"
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={onConfirm}
            className={`w-full sm:w-auto px-4 py-2.5 sm:py-2 rounded-lg font-medium text-white transition-colors text-center ${getConfirmButtonClass()}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
