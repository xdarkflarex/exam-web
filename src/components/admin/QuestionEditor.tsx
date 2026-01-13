'use client'

import { useState, useEffect } from 'react'
import { Save, RotateCcw, CheckCircle, Circle } from 'lucide-react'

interface QuestionData {
  id: string
  content: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_answer: 'A' | 'B' | 'C' | 'D'
  explanation?: string
}

interface QuestionEditorProps {
  question: QuestionData | null
  questionNumber: number
  onSave: (data: QuestionData) => void
  isSaving?: boolean
}

export default function QuestionEditor({ 
  question, 
  questionNumber, 
  onSave,
  isSaving = false 
}: QuestionEditorProps) {
  const [formData, setFormData] = useState<QuestionData | null>(null)
  const [originalData, setOriginalData] = useState<QuestionData | null>(null)
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    if (question) {
      setFormData({ ...question })
      setOriginalData({ ...question })
      setHasChanges(false)
    }
  }, [question])

  useEffect(() => {
    if (formData && originalData) {
      const changed = JSON.stringify(formData) !== JSON.stringify(originalData)
      setHasChanges(changed)
    }
  }, [formData, originalData])

  if (!formData) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-8 h-full flex items-center justify-center">
        <div className="text-center text-slate-500">
          <p className="text-lg">Chọn một câu hỏi để chỉnh sửa</p>
          <p className="text-sm mt-2">Chọn từ danh sách bên trái</p>
        </div>
      </div>
    )
  }

  const handleChange = (field: keyof QuestionData, value: string) => {
    setFormData(prev => prev ? { ...prev, [field]: value } : null)
  }

  const handleReset = () => {
    if (originalData) {
      setFormData({ ...originalData })
    }
  }

  const handleSave = () => {
    if (formData) {
      onSave(formData)
      setOriginalData({ ...formData })
      setHasChanges(false)
    }
  }

  const options: Array<{ key: 'A' | 'B' | 'C' | 'D', field: keyof QuestionData }> = [
    { key: 'A', field: 'option_a' },
    { key: 'B', field: 'option_b' },
    { key: 'C', field: 'option_c' },
    { key: 'D', field: 'option_d' },
  ]

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">
            Câu hỏi {questionNumber}
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            Đang chỉnh sửa bảng <code className="bg-slate-100 px-1.5 py-0.5 rounded text-teal-600">questions</code>
          </p>
        </div>
        {hasChanges && (
          <span className="px-3 py-1 bg-amber-50 text-amber-700 text-sm rounded-full">
            Chưa lưu
          </span>
        )}
      </div>

      {/* Question Content */}
      <div className="space-y-6">
        {/* Question Text */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Nội dung câu hỏi
          </label>
          <textarea
            value={formData.content}
            onChange={(e) => handleChange('content', e.target.value)}
            rows={4}
            className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none text-slate-800"
            placeholder="Nhập nội dung câu hỏi..."
          />
        </div>

        {/* Options */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-3">
            Các đáp án
          </label>
          <div className="space-y-3">
            {options.map(({ key, field }) => (
              <div 
                key={key}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                  formData.correct_answer === key 
                    ? 'border-teal-300 bg-teal-50' 
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleChange('correct_answer', key)}
                  className="flex-shrink-0"
                >
                  {formData.correct_answer === key ? (
                    <CheckCircle className="w-6 h-6 text-teal-600" />
                  ) : (
                    <Circle className="w-6 h-6 text-slate-300 hover:text-slate-400" />
                  )}
                </button>
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                  formData.correct_answer === key 
                    ? 'bg-teal-500 text-white' 
                    : 'bg-slate-100 text-slate-600'
                }`}>
                  {key}
                </span>
                <input
                  type="text"
                  value={formData[field] as string}
                  onChange={(e) => handleChange(field, e.target.value)}
                  className="flex-1 px-3 py-2 border-0 bg-transparent focus:outline-none focus:ring-0 text-slate-800"
                  placeholder={`Đáp án ${key}...`}
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Click vào biểu tượng tròn để chọn đáp án đúng
          </p>
        </div>

        {/* Explanation (optional) */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Giải thích (tùy chọn)
          </label>
          <textarea
            value={formData.explanation || ''}
            onChange={(e) => handleChange('explanation', e.target.value)}
            rows={2}
            className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none text-slate-800"
            placeholder="Thêm giải thích cho đáp án đúng..."
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 mt-8 pt-6 border-t border-slate-100">
        <button
          onClick={handleReset}
          disabled={!hasChanges || isSaving}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <RotateCcw className="w-4 h-4" />
          Hoàn tác
        </button>
        <button
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <Save className="w-4 h-4" />
          {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
        </button>
      </div>
    </div>
  )
}
