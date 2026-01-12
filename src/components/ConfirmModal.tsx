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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5 text-slate-400" />
        </button>

        <div className="flex items-center gap-4 mb-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
            type === 'success' ? 'bg-green-100 dark:bg-green-900/30' :
            type === 'danger' ? 'bg-red-100 dark:bg-red-900/30' :
            type === 'info' ? 'bg-blue-100 dark:bg-blue-900/30' :
            'bg-yellow-100 dark:bg-yellow-900/30'
          }`}>
            {getIcon()}
          </div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">
            {title}
          </h2>
        </div>

        <p className="text-slate-600 dark:text-slate-400 mb-6 ml-16">
          {message}
        </p>

        <div className="flex gap-3 justify-end">
          {showCancel && (
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg font-medium text-white transition-colors ${getConfirmButtonClass()}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
