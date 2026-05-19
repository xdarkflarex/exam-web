'use client'

import { useState, useEffect } from 'react'
import { UserPlus, X, Phone, Mail, User, Users, GraduationCap, CheckCircle, AlertCircle, Loader2, ArrowRight, MessageSquare } from 'lucide-react'

const CLASSES = ['Toán 10', 'Toán 11', 'Toán 12', 'Tin học'] as const

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

export default function EnrollmentFloatingButton() {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [errors, setErrors] = useState<Partial<FormState>>({})
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [pulse, setPulse] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setPulse(false), 8000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const validate = (): boolean => {
    const newErrors: Partial<FormState> = {}
    if (!form.full_name.trim() || form.full_name.trim().length < 2) newErrors.full_name = 'Tối thiểu 2 ký tự'
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) newErrors.email = 'Email không hợp lệ'
    if (!form.phone.trim() || !/^[0-9]{9,11}$/.test(form.phone.trim().replace(/\s/g, ''))) newErrors.phone = 'SĐT 9–11 số'
    if (!form.class) newErrors.class = 'Chọn lớp học'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleChange = (field: keyof FormState, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }))
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
      setMessage('Không thể kết nối. Vui lòng thử lại.')
    }
  }

  const handleClose = () => {
    setOpen(false)
    if (status === 'success') setStatus('idle')
  }

  const inputBase = 'w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none transition-all duration-200 focus:ring-2 focus:ring-teal-500/40 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400'
  const inputNormal = `${inputBase} border-slate-300 dark:border-slate-600 focus:border-teal-500`
  const inputError = `${inputBase} border-red-400 focus:border-red-500 focus:ring-red-500/30`

  return (
    <>
      {/* Floating button — góc phải dưới */}
      <button
        onClick={() => setOpen(true)}
        className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-5 py-3.5 rounded-2xl bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 dark:from-teal-500 dark:to-teal-400 dark:hover:from-teal-400 dark:hover:to-teal-300 text-white font-semibold shadow-2xl shadow-teal-600/30 hover:shadow-teal-600/50 transition-all duration-300 hover:scale-105 active:scale-95 ${pulse ? 'animate-bounce' : ''}`}
        aria-label="Đăng ký học"
      >
        <UserPlus className="w-5 h-5" />
        <span className="hidden sm:inline">Đăng ký học</span>
        <span className="sm:hidden">Đăng ký</span>
      </button>

      {/* Modal overlay */}
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm enroll-fade-in"
            onClick={handleClose}
          />

          {/* Modal content */}
          <div className="relative w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden max-h-[90vh] overflow-y-auto enroll-slide-up">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-2">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center">
                  <UserPlus className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Đăng ký học</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Chúng tôi sẽ liên hệ bạn trong 24h</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 pb-6 pt-4">
              {/* Success */}
              {status === 'success' ? (
                <div className="flex flex-col items-center text-center py-4">
                  <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-3">
                    <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
                  </div>
                  <h4 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">Đăng ký thành công!</h4>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">{message}</p>
                  <button
                    onClick={handleClose}
                    className="px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-medium text-sm transition-colors"
                  >
                    Đóng
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} noValidate className="space-y-4">
                  {/* Tên */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Tên học viên <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        value={form.full_name}
                        onChange={e => handleChange('full_name', e.target.value)}
                        placeholder="Nguyễn Văn An"
                        className={`${errors.full_name ? inputError : inputNormal} pl-9`}
                        disabled={status === 'loading'}
                      />
                    </div>
                    {errors.full_name && <p className="mt-1 text-xs text-red-500">{errors.full_name}</p>}
                  </div>

                  {/* Email + SĐT */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Email <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        <input
                          type="email"
                          value={form.email}
                          onChange={e => handleChange('email', e.target.value)}
                          placeholder="email@..."
                          className={`${errors.email ? inputError : inputNormal} pl-9`}
                          disabled={status === 'loading'}
                        />
                      </div>
                      {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Số điện thoại <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        <input
                          type="tel"
                          value={form.phone}
                          onChange={e => handleChange('phone', e.target.value)}
                          placeholder="0901234567"
                          className={`${errors.phone ? inputError : inputNormal} pl-9`}
                          disabled={status === 'loading'}
                        />
                      </div>
                      {errors.phone && <p className="mt-1 text-xs text-red-500">{errors.phone}</p>}
                    </div>
                  </div>

                  {/* Lớp */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Lớp học <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <GraduationCap className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none z-10" />
                      <select
                        value={form.class}
                        onChange={e => handleChange('class', e.target.value)}
                        className={`${errors.class ? inputError : inputNormal} pl-9 appearance-none cursor-pointer`}
                        disabled={status === 'loading'}
                      >
                        <option value="">-- Chọn lớp --</option>
                        {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    {errors.class && <p className="mt-1 text-xs text-red-500">{errors.class}</p>}
                  </div>

                  {/* Phụ huynh (optional) */}
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2 italic">Thông tin phụ huynh (không bắt buộc)</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="relative">
                        <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        <input
                          type="text"
                          value={form.parent_name}
                          onChange={e => handleChange('parent_name', e.target.value)}
                          placeholder="Tên PH"
                          className={`${inputNormal} pl-9`}
                          disabled={status === 'loading'}
                        />
                      </div>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        <input
                          type="tel"
                          value={form.parent_phone}
                          onChange={e => handleChange('parent_phone', e.target.value)}
                          placeholder="SĐT PH"
                          className={`${inputNormal} pl-9`}
                          disabled={status === 'loading'}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Ghi chú */}
                  <div>
                    <div className="relative">
                      <MessageSquare className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                      <textarea
                        value={form.user_notes}
                        onChange={e => handleChange('user_notes', e.target.value)}
                        placeholder="Ghi chú / Câu hỏi..."
                        rows={2}
                        className={`${inputNormal} pl-9 resize-none`}
                        disabled={status === 'loading'}
                      />
                    </div>
                  </div>

                  {/* Error */}
                  {status === 'error' && (
                    <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-red-700 dark:text-red-300">{message}</p>
                    </div>
                  )}

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={status === 'loading'}
                    className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-400 text-white font-semibold shadow-lg shadow-teal-600/20 transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {status === 'loading' ? (
                      <><Loader2 className="w-5 h-5 animate-spin" />Đang gửi...</>
                    ) : (
                      <>Gửi đơn đăng ký<ArrowRight className="w-5 h-5" /></>
                    )}
                  </button>

                  <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center">
                    Thông tin được bảo mật và chỉ dùng cho mục đích liên lạc.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
