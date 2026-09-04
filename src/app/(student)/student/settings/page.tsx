/**
 * Cài đặt tài khoản học sinh.
 *
 * Làm đẹp đợt 2026-08-09. Logic xác thực, đổi mật khẩu và cập nhật hồ sơ giữ
 * nguyên hoàn toàn — đây là bề mặt bảo mật, không phải bề mặt design.
 *
 * MỘT SỬA LỖI THẬT đi kèm đợt này: khối "Giao diện" trước đây quyết định markup
 * bằng giá trị `theme` của JavaScript (`mounted && theme === 'dark' ? <Moon/> :
 * <Sun/>`, `left-8` hay `left-1`), nên phải giữ thêm một state `mounted` chỉ để
 * chặn lệch hydration. Đó đúng là bất biến số 4 của docs/DESIGN_TODO.md mục 0:
 * markup không được phụ thuộc `theme`. Bản này chuyển hết sang biến thể `dark:`
 * của CSS — class `dark` trên `<html>` do script inline đặt trước lượt vẽ đầu,
 * nên trạng thái công tắc đúng ngay từ HTML server trả về và `mounted` biến mất
 * cùng với cả một nhịp nháy.
 *
 * `theme` vẫn được đọc, nhưng chỉ trong handler onClick — đó là hành vi lúc chạy,
 * không phải markup, nên không có gì để lệch.
 */

'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  User,
  Mail,
  Moon,
  Sun,
  Shield,
  Save,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Palette,
} from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'

const FIELD_CLASS =
  'w-full rounded-xl border border-slate-200 bg-[var(--background-raised)] px-4 py-2.5 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white'

export default function StudentSettingsPage() {
  const supabase = useMemo(() => createClient(), [])
  const { theme, setTheme } = useTheme()

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    school: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Password change state
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  })
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        /* `class_name` KHÔNG PHẢI LÀ MỘT CỘT. `profiles` có `class_id` (khoá trỏ
           tới `classes`), không có `class_name`. Câu select cũ liệt kê nó nên
           PostgREST trả `42703 column does not exist` cho CẢ câu, `profile` về
           null, và MỌI ô trên form rỗng — kể cả Họ và tên. Lỗi lại bị nuốt vì
           chỗ này chỉ hứng `data`, không hứng `error`. Nhìn từ ngoài: form trống
           trơn, không một thông báo.

           Không thay bằng `class_id`: học sinh không đọc được bảng `classes`
           (RLS `20260722` chỉ mở cho admin và giáo viên chủ nhiệm), nên có lấy
           được khoá cũng không đổi ra tên lớp. Xem thêm ở chỗ ô Lớp bên dưới. */
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('full_name, school')
          .eq('id', user.id)
          .single()

        if (profileError) {
          console.error('Fetch profile error:', profileError)
          setSaveError('Không tải được thông tin cá nhân. Tải lại trang giúp thầy cô nhé.')
          return
        }

        setFormData({
          fullName: profile?.full_name || '',
          email: user.email || '',
          school: profile?.school || ''
        })
      } catch (error) {
        console.error('Error fetching user data:', error)
      } finally {
        setLoading(false)
      }
    }
    void fetchUserData()
  }, [supabase])

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setSaveSuccess(false)
    setSaveError(null)
  }

  const handleSaveProfile = async () => {
    setSaving(true)
    setSaveSuccess(false)
    setSaveError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setSaveError('Vui lòng đăng nhập lại')
        return
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: formData.fullName,
          school: formData.school,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)

      if (error) {
        setSaveError('Không thể lưu thay đổi')
        console.error('Save profile error:', error)
        return
      }

      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (error) {
      setSaveError('Đã xảy ra lỗi')
      console.error('Error saving profile:', error)
    } finally {
      setSaving(false)
    }
  }

  const handlePasswordChange = (field: string, value: string) => {
    setPasswordData(prev => ({ ...prev, [field]: value }))
    setPasswordSuccess(false)
    setPasswordError(null)
  }

  const handleChangePassword = async () => {
    setPasswordError(null)
    setPasswordSuccess(false)

    // Validation
    if (!passwordData.currentPassword) {
      setPasswordError('Vui lòng nhập mật khẩu hiện tại')
      return
    }
    if (!passwordData.newPassword) {
      setPasswordError('Vui lòng nhập mật khẩu mới')
      return
    }
    if (passwordData.newPassword.length < 6) {
      setPasswordError('Mật khẩu mới phải có ít nhất 6 ký tự')
      return
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError('Mật khẩu xác nhận không khớp')
      return
    }

    setChangingPassword(true)

    try {
      // First verify current password by re-signing in
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) {
        setPasswordError('Không thể xác thực người dùng')
        return
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: passwordData.currentPassword
      })

      if (signInError) {
        setPasswordError('Mật khẩu hiện tại không đúng')
        return
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: passwordData.newPassword
      })

      if (updateError) {
        setPasswordError('Không thể đổi mật khẩu. Vui lòng thử lại.')
        console.error('Update password error:', updateError)
        return
      }

      setPasswordSuccess(true)
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      })
      setTimeout(() => setPasswordSuccess(false), 3000)
    } catch (error) {
      setPasswordError('Đã xảy ra lỗi')
      console.error('Error changing password:', error)
    } finally {
      setChangingPassword(false)
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-center" role="status" aria-live="polite">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-teal-500 border-t-transparent" />
          <p className="text-slate-500 dark:text-slate-400">Đang tải cài đặt...</p>
        </div>
      </main>
    )
  }

  const initial = (formData.fullName.trim()[0] || '?').toUpperCase()

  return (
    <main className="min-h-screen p-4 lg:p-6">
      <div className="mx-auto max-w-3xl">
        {/* Đầu trang mang luôn danh tính: tên, email, chữ cái đầu. Trang cài đặt cũ
            mở ra là một tiêu đề trơn rồi mới tới thẻ hồ sơ lặp lại đúng thông tin
            đó — hai lần nói cùng một chuyện. */}
        <header className="animate-dash-in bento-tile-lead mb-6 overflow-hidden">
          <div className="paper-grid p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
              <div
                className="font-baloo flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-teal-100 text-2xl font-bold text-teal-700 dark:bg-teal-900/40 dark:text-teal-300"
                aria-hidden="true"
              >
                {initial}
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold text-slate-800 dark:text-white sm:text-3xl">
                  {formData.fullName || 'Chưa cập nhật tên'}
                </h1>
                <p className="mt-1 truncate text-sm text-slate-600 dark:text-slate-300">{formData.email}</p>
                <p className="mt-2 flex flex-wrap gap-2 text-xs">
                  {formData.school && (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                      {formData.school}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </header>

        <div className="space-y-5">
          {/* Thông tin cá nhân */}
          <section className="bento-tile animate-dash-in-1 p-5 sm:p-6" aria-labelledby="profile-heading">
            <h2 id="profile-heading" className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-white">
              <User className="h-5 w-5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
              Thông tin cá nhân
            </h2>

            <div className="space-y-4">
              <div>
                <label htmlFor="settings-full-name" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Họ và tên
                </label>
                <input
                  id="settings-full-name"
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => handleInputChange('fullName', e.target.value)}
                  placeholder="Nhập họ và tên"
                  className={FIELD_CLASS}
                />
              </div>

              <div>
                <label htmlFor="settings-email" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <input
                    id="settings-email"
                    type="email"
                    value={formData.email}
                    disabled
                    className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 py-2.5 pl-10 pr-4 text-slate-600 dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-300"
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Email không thể thay đổi</p>
              </div>

              {/* KHÔNG CÓ Ô "LỚP" Ở ĐÂY, và đó là chủ ý.

                  Ô cũ là ô chữ tự do, và nó vừa không ĐỌC được vừa không GHI
                  được:

                    * ghi — trigger `protect_profile_writes` (`20260722`) ném
                      `PROFILE_SECURITY_FIELD_UPDATE_FORBIDDEN` khi học sinh đổi
                      `class_id` của chính mình. Xếp lớp là quyền của giáo viên;
                      cho học sinh tự đổi là cho các em tự rời lớp và mất luôn
                      bài tập được giao theo lớp.
                    * đọc — RLS trên `classes` chỉ mở cho admin và giáo viên chủ
                      nhiệm, nên phiên của học sinh có khoá lớp cũng không đổi ra
                      được tên lớp.

                  Một ô không đọc được cũng không ghi được thì không phải tính
                  năng, nó là cái bẫy: học sinh gõ vào, bấm Lưu, rồi nhận lỗi mà
                  không hiểu vì sao. Bỏ hẳn thật thà hơn là làm nó xám đi.

                  Muốn học sinh THẤY lớp mình thì phải mở một đường đọc riêng
                  (RPC `SECURITY DEFINER` chỉ trả tên lớp của chính người gọi) —
                  việc đó chưa ai yêu cầu. */}
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label htmlFor="settings-school" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Trường
                  </label>
                  <input
                    id="settings-school"
                    type="text"
                    value={formData.school}
                    onChange={(e) => handleInputChange('school', e.target.value)}
                    placeholder="Nhập tên trường"
                    className={FIELD_CLASS}
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 font-medium text-white transition-colors hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:bg-teal-400 dark:focus:ring-offset-slate-800"
              >
                {saving ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden="true" />
                    Đang lưu...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" aria-hidden="true" />
                    Lưu thay đổi
                  </>
                )}
              </button>
              <span role="status" aria-live="polite" className="text-sm">
                {saveSuccess && (
                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Đã lưu thành công
                  </span>
                )}
                {saveError && (
                  <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400">
                    <AlertCircle className="h-4 w-4" aria-hidden="true" />
                    {saveError}
                  </span>
                )}
              </span>
            </div>
          </section>

          {/* Đổi mật khẩu */}
          <section className="bento-tile animate-dash-in-2 p-5 sm:p-6" aria-labelledby="password-heading">
            <h2 id="password-heading" className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-white">
              <Lock className="h-5 w-5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
              Đổi mật khẩu
            </h2>

            <div className="space-y-4">
              <PasswordField
                id="settings-current-password"
                label="Mật khẩu hiện tại"
                placeholder="Nhập mật khẩu hiện tại"
                value={passwordData.currentPassword}
                visible={showPasswords.current}
                onToggle={() => setShowPasswords(p => ({ ...p, current: !p.current }))}
                onChange={(value) => handlePasswordChange('currentPassword', value)}
                autoComplete="current-password"
              />
              <PasswordField
                id="settings-new-password"
                label="Mật khẩu mới"
                placeholder="Nhập mật khẩu mới (ít nhất 6 ký tự)"
                value={passwordData.newPassword}
                visible={showPasswords.new}
                onToggle={() => setShowPasswords(p => ({ ...p, new: !p.new }))}
                onChange={(value) => handlePasswordChange('newPassword', value)}
                autoComplete="new-password"
              />
              <PasswordField
                id="settings-confirm-password"
                label="Xác nhận mật khẩu mới"
                placeholder="Nhập lại mật khẩu mới"
                value={passwordData.confirmPassword}
                visible={showPasswords.confirm}
                onToggle={() => setShowPasswords(p => ({ ...p, confirm: !p.confirm }))}
                onChange={(value) => handlePasswordChange('confirmPassword', value)}
                autoComplete="new-password"
              />
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleChangePassword}
                disabled={changingPassword}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-5 py-2.5 font-medium text-white transition-colors hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 disabled:bg-slate-400 dark:bg-slate-600 dark:hover:bg-slate-500 dark:focus:ring-offset-slate-800"
              >
                {changingPassword ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden="true" />
                    Đang đổi...
                  </>
                ) : (
                  <>
                    <Shield className="h-4 w-4" aria-hidden="true" />
                    Đổi mật khẩu
                  </>
                )}
              </button>
              <span role="status" aria-live="polite" className="text-sm">
                {passwordSuccess && (
                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Đổi mật khẩu thành công
                  </span>
                )}
                {passwordError && (
                  <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400">
                    <AlertCircle className="h-4 w-4" aria-hidden="true" />
                    {passwordError}
                  </span>
                )}
              </span>
            </div>
          </section>

          {/* Giao diện */}
          <section className="bento-tile animate-dash-in-2 p-5 sm:p-6" aria-labelledby="theme-heading">
            <h2 id="theme-heading" className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-white">
              <Palette className="h-5 w-5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
              Giao diện
            </h2>

            <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-100 p-4 dark:bg-slate-700/60">
              <div className="flex min-w-0 items-center gap-3">
                {/* Hai icon cùng nằm trong HTML, CSS chọn cái nào hiện. Không có
                    nhánh JavaScript nào ở đây nên không có gì để lệch hydration. */}
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-amber-500 dark:bg-slate-800 dark:text-teal-300">
                  <Sun className="h-5 w-5 dark:hidden" aria-hidden="true" />
                  <Moon className="hidden h-5 w-5 dark:block" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-slate-800 dark:text-white">Chế độ tối</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    <span className="dark:hidden">Đang dùng nền sáng</span>
                    <span className="hidden dark:inline">Đang dùng nền tối, đỡ mỏi mắt khi học buổi đêm</span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                aria-label="Chuyển giữa chế độ sáng và chế độ tối"
                className="relative h-7 w-14 shrink-0 rounded-full bg-slate-300 transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:bg-teal-600 dark:focus:ring-offset-slate-800"
              >
                <span className="absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow-sm transition-[left] dark:left-8" />
              </button>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

function PasswordField({
  id,
  label,
  placeholder,
  value,
  visible,
  onToggle,
  onChange,
  autoComplete,
}: {
  id: string
  label: string
  placeholder: string
  value: string
  visible: boolean
  onToggle: () => void
  onChange: (value: string) => void
  autoComplete: string
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`${FIELD_CLASS} pr-11`}
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={visible ? `Ẩn ${label.toLowerCase()}` : `Hiện ${label.toLowerCase()}`}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200"
        >
          {visible ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>
    </div>
  )
}
