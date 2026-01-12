'use client'

import { useState } from 'react'
import { X, MessageSquare, Loader2 } from 'lucide-react'

interface FeedbackModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (message: string) => Promise<void>
  questionNumber: number
}

export default function FeedbackModal({ isOpen, onClose, onSubmit, questionNumber }: FeedbackModalProps) {
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim() || isSubmitting) return

    setIsSubmitting(true)
    try {
      await onSubmit(message.trim())
      setMessage('')
      onClose()
    } catch (error) {
      // Error handling is done in parent component
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (isSubmitting) return
    setMessage('')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-800 dark:text-white">
                Báo lỗi / Góp ý
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Câu {questionNumber}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="mb-4">
            <label htmlFor="feedback-message" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Nội dung góp ý <span className="text-red-500">*</span>
            </label>
            <textarea
              id="feedback-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Vui lòng mô tả chi tiết vấn đề hoặc góp ý của bạn..."
              className="w-full h-32 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:text-white resize-none"
              disabled={isSubmitting}
              required
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Tối thiểu 10 ký tự
            </p>
          </div>

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={!message.trim() || message.trim().length < 10 || isSubmitting}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Đang gửi...
                </>
              ) : (
                'Gửi góp ý'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
