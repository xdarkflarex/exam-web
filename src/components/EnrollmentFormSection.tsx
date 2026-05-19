'use client'

import { useState } from 'react'
import { UserPlus, Phone, Mail, User, Users, GraduationCap, CheckCircle, AlertCircle, Loader2, ArrowRight, MessageSquare } from 'lucide-react'

const CLASSES = ['Toán 10', 'Toán 11', 'Toán 12', 'Tin học'] as const

interface EnrollmentFormSectionProps {
  title?: string
  subtitle?: string
}

interface FormState {
  full_name: string
  email: string
  phone: string
  class: string
  parent_name: string
  parent_phone: string
  user_notes: string
}

const INITIAL_FORM: FormState = {
  full_name: '',
  email: '',
  phone: '',
  class: '',
  parent_name: '',
  parent_phone: '',
  user_notes: '',
}

export default function EnrollmentFormSection({
  title = 'Đăng ký học ngay hôm nay',
  subtitle = 'Điền thông tin bên dưới, chúng tôi sẽ liên hệ với bạn trong 24 giờ',
}: EnrollmentFormSectionProps) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [errors, setErrors] = useState<Partial<FormState>>({})
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const validate = (): boolean => {
    const newErrors: Partial<FormState> = {}

    if (!form.full_name.trim() || form.full_name.trim().length < 2) {
      newErrors.full_name = 'Vui lòng nhập tên (tối thiểu 2 ký tự)'
    }
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      newErrors.email = 'Vui lòng nhập email hợp lệ'
    }
    if (!form.phone.trim() || !/^[0-9]{9,11}$/.test(form.phone.trim().replace(/\s/g, ''))) {
      newErrors.phone = 'Vui lòng nhập số điện thoại (9–11 số)'
    }
    if (!form.class) {
      newErrors.class = 'Vui lòng chọn lớp học'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleChange = (field: keyof FormState, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setStatus('loading')
    setMessage('')

    try {
      const res = await fetch('/api/enrollments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      const data = await res.json()

      if (data.success) {
        setStatus('success')
        setMessage(data.message)
        setForm(INITIAL_FORM)
        setErrors({})
      } else {
        setStatus('error')
        setMessage(data.message || 'Đã có lỗi xảy ra.')
      }
    } catch {
      setStatus('error')
      setMessage('Không thể kết nối. Vui lòng kiểm tra mạng và thử lại.')
    }
  }

  const inputBase =
    'w-full px-4 py-3 rounded-xl border bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 text-sm outline-none transition-all duration-200 focus:ring-2 focus:ring-teal-500/40'
  const inputNormal = `${inputBase} border-slate-300 dark:border-slate-600 focus:border-teal-500`
  const inputError = `${inputBase} border-red-400 dark:border-red-500 focus:border-red-500 focus:ring-red-500/30`

  return (
    <section id="enrollment-form" className="py-20 bg-gradient-to-br from-teal-50 to-slate-100 dark:from-teal-950/30 dark:to-slate-900 relative overflow-hidden">
      {/* Decorative bg element */}
      <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.02]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)', backgroundSize: '28px 28px' }} />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        {/* Section header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 text-sm font-medium mb-5">
            <UserPlus className="w-4 h-4" />
            Đăng ký học
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 mb-3">
            {title}
          </h2>
          <p className="text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
            {subtitle}
          </p>
        </div>

        {/* Form card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl shadow-slate-200/60 dark:shadow-slate-900/60 border border-slate-200 dark:border-slate-700 p-8 sm:p-10">

          {/* Success state */}
          {status === 'success' && (
            <div className="flex flex-col items-center text-center py-6">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
                <CheckCircle className="w-9 h-9 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Đăng ký thành công!</h3>
              <p className="text-slate-600 dark:text-slate-400 max-w-md mb-6">{message}</p>
              <button
                onClick={() => setStatus('idle')}
                className="px-6 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-sm font-medium"
              >
                Đăng ký thêm
              </button>
            </div>
          )}

          {/* Form */}
          {status !== 'success' && (
            <form onSubmit={handleSubmit} noValidate>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Tên học viên */}
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Tên học viên <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      value={form.full_name}
                      onChange={e => handleChange('full_name', e.target.value)}
                      placeholder="Nguyễn Văn An"
                      className={`${errors.full_name ? inputError : inputNormal} pl-10`}
                      disabled={status === 'loading'}
                    />
                  </div>
                  {errors.full_name && (
                    <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {errors.full_name}
                    </p>
                  )}
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type="email"
                      value={form.email}
                      onChange={e => handleChange('email', e.target.value)}
                      placeholder="email@example.com"
                      className={`${errors.email ? inputError : inputNormal} pl-10`}
                      disabled={status === 'loading'}
                    />
                  </div>
                  {errors.email && (
                    <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {errors.email}
                    </p>
                  )}
                </div>

                {/* Số điện thoại */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Số điện thoại <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={e => handleChange('phone', e.target.value)}
                      placeholder="0901234567"
                      className={`${errors.phone ? inputError : inputNormal} pl-10`}
                      disabled={status === 'loading'}
                    />
                  </div>
                  {errors.phone && (
                    <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {errors.phone}
                    </p>
                  )}
                </div>

                {/* Lớp học */}
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Lớp học <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <GraduationCap className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none z-10" />
                    <select
                      value={form.class}
                      onChange={e => handleChange('class', e.target.value)}
                      className={`${errors.class ? inputError : inputNormal} pl-10 appearance-none cursor-pointer`}
                      disabled={status === 'loading'}
                    >
                      <option value="">-- Chọn lớp học --</option>
                      {CLASSES.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  {errors.class && (
                    <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {errors.class}
                    </p>
                  )}
                </div>

                {/* Phụ huynh - Optional */}
                <div className="sm:col-span-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 italic">Thông tin phụ huynh (không bắt buộc)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Họ tên phụ huynh
                  </label>
                  <div className="relative">
                    <Users className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      value={form.parent_name}
                      onChange={e => handleChange('parent_name', e.target.value)}
                      placeholder="Họ tên phụ huynh"
                      className={`${inputNormal} pl-10`}
                      disabled={status === 'loading'}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    SĐT phụ huynh
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type="tel"
                      value={form.parent_phone}
                      onChange={e => handleChange('parent_phone', e.target.value)}
                      placeholder="Số điện thoại phụ huynh"
                      className={`${inputNormal} pl-10`}
                      disabled={status === 'loading'}
                    />
                  </div>
                </div>

                {/* Ghi chú */}
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Ghi chú / Câu hỏi
                  </label>
                  <div className="relative">
                    <MessageSquare className="absolute left-3.5 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
                    <textarea
                      value={form.user_notes}
                      onChange={e => handleChange('user_notes', e.target.value)}
                      placeholder="Bạn có câu hỏi gì cho chúng tôi không?"
                      rows={3}
                      className={`${inputNormal} pl-10 resize-none`}
                      disabled={status === 'loading'}
                    />
                  </div>
                </div>
              </div>

              {/* Error message */}
              {status === 'error' && (
                <div className="mt-5 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700 dark:text-red-300">{message}</p>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={status === 'loading'}
                className="mt-6 w-full sm:w-auto px-8 py-3.5 rounded-xl bg-teal-600 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-400 text-white font-semibold text-base shadow-lg shadow-teal-600/20 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
              >
                {status === 'loading' ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Đang gửi...
                  </>
                ) : (
                  <>
                    Gửi đơn đăng ký
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>

              <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
                Thông tin của bạn được bảo mật và chỉ dùng cho mục đích liên lạc.
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}
