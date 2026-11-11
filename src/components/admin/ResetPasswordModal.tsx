'use client'

/**
 * Hộp thoại "Đặt lại mật khẩu" cho một tài khoản học sinh ở `/admin/users`.
 *
 * Hai bước, cố ý không gộp làm một cú bấm:
 *   1. XÁC NHẬN — chọn kiểu mật khẩu mới. Đặt lại mật khẩu không hoàn tác được:
 *      mật khẩu cũ của học sinh mất ngay, nên phải hỏi lại (DESIGN_SYSTEM:
 *      hành động không hoàn tác cần xác nhận).
 *   2. KẾT QUẢ — hiện mật khẩu mới ĐÚNG MỘT LẦN, kèm nút chép một đoạn tin nhắn
 *      gửi cho học sinh. Đóng hộp là mật khẩu biến khỏi bộ nhớ trang; muốn biết
 *      lại thì đặt lại lần nữa. Không lưu ở đâu là cách duy nhất chắc chắn nó
 *      không rò ra đâu cả.
 *
 * Giá trị của "mật khẩu mặc định" KHÔNG nằm trong file này: `AGENTS.md` mục 5
 * cấm đưa mật khẩu tạm vào client. Client chỉ gửi `mode`; server trả mật khẩu
 * về sau khi đã đặt xong.
 */

import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle, Copy, KeyRound, Loader2, X } from 'lucide-react'
import type { ResetMode } from '@/lib/auth/password-reset'

export interface ResetPasswordTarget {
  id: string
  full_name: string | null
  email: string | null
}

interface ResetResult {
  email: string | null
  fullName: string | null
  password: string
}

const MODES: { value: ResetMode; title: string; description: string }[] = [
  {
    value: 'default',
    title: 'Mật khẩu mặc định',
    description:
      'Dễ báo cho học sinh. Nhưng ai biết email của em cũng đoán được — chỉ đặt lại ngay trước khi báo, và bảo em đăng nhập luôn.',
  },
  {
    value: 'random',
    title: 'Mật khẩu ngẫu nhiên',
    description: 'An toàn hơn: chỉ người được bạn gửi mới biết.',
  },
]

export default function ResetPasswordModal({
  user,
  onClose,
}: {
  user: ResetPasswordTarget
  onClose: () => void
}) {
  const [mode, setMode] = useState<ResetMode>('default')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ResetResult | null>(null)
  const [copied, setCopied] = useState(false)

  const displayName = user.full_name || user.email || 'tài khoản này'

  // Esc để đóng — trừ lúc đang gửi: đóng giữa chừng là không biết mật khẩu đã
  // đổi hay chưa.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !working) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, working])

  const submit = async () => {
    setWorking(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, mode }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok || !body?.password) {
        setError(body?.error || 'Không đặt lại được mật khẩu. Vui lòng thử lại.')
        return
      }
      setResult({ email: body.email ?? user.email, fullName: body.fullName ?? user.full_name, password: body.password })
    } catch {
      setError('Lỗi kết nối. Mật khẩu CHƯA được đổi — thử lại sau.')
    } finally {
      setWorking(false)
    }
  }

  const copyMessage = async () => {
    if (!result) return
    const text =
      `Tài khoản luyện thi\nEmail: ${result.email ?? ''}\nMật khẩu mới: ${result.password}\n` +
      '(Đăng nhập xong, hệ thống sẽ yêu cầu em đổi sang mật khẩu của riêng em)'
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm"
        onClick={() => !working && onClose()}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-password-title"
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              <KeyRound className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="reset-password-title" className="font-semibold text-slate-800 dark:text-slate-100">
                {result ? 'Đã đặt lại mật khẩu' : 'Đặt lại mật khẩu'}
              </h2>
              <p className="truncate text-sm text-slate-500 dark:text-slate-400">
                {displayName}
                {user.full_name && user.email ? ` · ${user.email}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={working}
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-200 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-700"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {result ? (
          <div className="space-y-4 px-6 py-5">
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Mật khẩu mới
              </p>
              <p className="select-all rounded-xl border border-slate-300 bg-white/70 px-4 py-3 font-mono text-xl font-semibold tracking-wider text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                {result.password}
              </p>
            </div>
            <p className="flex gap-2 text-sm text-slate-600 dark:text-slate-400">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden="true" />
              Lần đăng nhập tới, học sinh bắt buộc đổi sang mật khẩu mới từ 8 ký tự trở lên.
            </p>
            <p className="flex gap-2 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Mật khẩu chỉ hiện một lần. Đóng hộp này là không xem lại được.
            </p>
            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <button
                onClick={onClose}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Xong
              </button>
              <button
                onClick={copyMessage}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-400"
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
                {copied ? 'Đã chép' : 'Chép tin nhắn gửi học sinh'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 px-6 py-5">
            <fieldset className="space-y-2" disabled={working}>
              <legend className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Mật khẩu mới</legend>
              {MODES.map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${
                    mode === option.value
                      ? 'border-teal-500 bg-teal-50 dark:border-teal-500 dark:bg-teal-900/20'
                      : 'border-slate-300 hover:border-slate-400 dark:border-slate-600 dark:hover:border-slate-500'
                  }`}
                >
                  <input
                    type="radio"
                    name="reset-mode"
                    value={option.value}
                    checked={mode === option.value}
                    onChange={() => setMode(option.value)}
                    className="mt-1 h-4 w-4 accent-teal-600"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{option.title}</span>
                    <span className="block text-sm text-slate-600 dark:text-slate-400">{option.description}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <p className="text-sm text-slate-600 dark:text-slate-400">
              Mật khẩu cũ mất ngay khi bấm. Lần đăng nhập tới, học sinh bắt buộc đổi sang mật khẩu của riêng em.
            </p>

            {error && (
              <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                {error}
              </p>
            )}

            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <button
                onClick={onClose}
                disabled={working}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-200 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Hủy
              </button>
              <button
                onClick={submit}
                disabled={working}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-60 dark:bg-amber-500 dark:text-slate-900 dark:hover:bg-amber-400"
              >
                {working ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <KeyRound className="h-4 w-4" aria-hidden="true" />}
                {working ? 'Đang đặt lại…' : 'Đặt lại mật khẩu'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
