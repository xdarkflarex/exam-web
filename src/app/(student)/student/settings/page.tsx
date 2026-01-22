'use client'

import { useState, useEffect } from 'react'
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
  CheckCircle,
  AlertCircle
} from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'

export default function StudentSettingsPage() {
  const supabase = createClient()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    className: '',
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
    setMounted(true)
    fetchUserData()
  }, [])

  const fetchUserData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, class_name, school')
        .eq('id', user.id)
        .single()

      setFormData({
        fullName: profile?.full_name || '',
        email: user.email || '',
        className: profile?.class_name || '',
        school: profile?.school || ''
      })
    } catch (error) {
      console.error('Error fetching user data:', error)
    } finally {
      setLoading(false)
    }
  }

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
          class_name: formData.className,
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 lg:p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
            Cài đặt
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            Quản lý thông tin cá nhân và tài khoản của bạn
          </p>
        </div>

        {/* Profile Section */}
        <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            Thông tin cá nhân
          </h2>

          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
              <User className="w-8 h-8 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <p className="font-medium text-slate-800 dark:text-white">
                {formData.fullName || 'Chưa cập nhật'}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {formData.email}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Họ và tên
              </label>
              <input
                type="text"
                value={formData.fullName}
                onChange={(e) => handleInputChange('fullName', e.target.value)}
                placeholder="Nhập họ và tên"
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="email"
                  value={formData.email}
                  disabled
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-100 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-500 dark:text-slate-400 cursor-not-allowed"
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Email không thể thay đổi
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Lớp
                </label>
                <input
                  type="text"
                  value={formData.className}
                  onChange={(e) => handleInputChange('className', e.target.value)}
                  placeholder="Ví dụ: 12A1"
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Trường
                </label>
                <input
                  type="text"
                  value={formData.school}
                  onChange={(e) => handleInputChange('school', e.target.value)}
                  placeholder="Nhập tên trường"
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
          </div>

          {/* Save Profile Button */}
          <div className="mt-6 flex items-center gap-3">
            <button 
              onClick={handleSaveProfile}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white rounded-xl font-medium transition-colors"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Đang lưu...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Lưu thay đổi
                </>
              )}
            </button>
            {saveSuccess && (
              <span className="flex items-center gap-1 text-green-600 dark:text-green-400 text-sm">
                <CheckCircle className="w-4 h-4" />
                Đã lưu thành công
              </span>
            )}
            {saveError && (
              <span className="flex items-center gap-1 text-red-600 dark:text-red-400 text-sm">
                <AlertCircle className="w-4 h-4" />
                {saveError}
              </span>
            )}
          </div>
        </section>

        {/* Password Section */}
        <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <Lock className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            Đổi mật khẩu
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Mật khẩu hiện tại
              </label>
              <div className="relative">
                <input
                  type={showPasswords.current ? 'text' : 'password'}
                  value={passwordData.currentPassword}
                  onChange={(e) => handlePasswordChange('currentPassword', e.target.value)}
                  placeholder="Nhập mật khẩu hiện tại"
                  className="w-full px-4 py-2.5 pr-10 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswords(p => ({ ...p, current: !p.current }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPasswords.current ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Mật khẩu mới
              </label>
              <div className="relative">
                <input
                  type={showPasswords.new ? 'text' : 'password'}
                  value={passwordData.newPassword}
                  onChange={(e) => handlePasswordChange('newPassword', e.target.value)}
                  placeholder="Nhập mật khẩu mới (ít nhất 6 ký tự)"
                  className="w-full px-4 py-2.5 pr-10 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswords(p => ({ ...p, new: !p.new }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPasswords.new ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Xác nhận mật khẩu mới
              </label>
              <div className="relative">
                <input
                  type={showPasswords.confirm ? 'text' : 'password'}
                  value={passwordData.confirmPassword}
                  onChange={(e) => handlePasswordChange('confirmPassword', e.target.value)}
                  placeholder="Nhập lại mật khẩu mới"
                  className="w-full px-4 py-2.5 pr-10 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswords(p => ({ ...p, confirm: !p.confirm }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPasswords.confirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Change Password Button */}
          <div className="mt-6 flex items-center gap-3">
            <button 
              onClick={handleChangePassword}
              disabled={changingPassword}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-900 dark:bg-slate-600 dark:hover:bg-slate-500 disabled:bg-slate-400 text-white rounded-xl font-medium transition-colors"
            >
              {changingPassword ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Đang đổi...
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4" />
                  Đổi mật khẩu
                </>
              )}
            </button>
            {passwordSuccess && (
              <span className="flex items-center gap-1 text-green-600 dark:text-green-400 text-sm">
                <CheckCircle className="w-4 h-4" />
                Đổi mật khẩu thành công
              </span>
            )}
            {passwordError && (
              <span className="flex items-center gap-1 text-red-600 dark:text-red-400 text-sm">
                <AlertCircle className="w-4 h-4" />
                {passwordError}
              </span>
            )}
          </div>
        </section>

        {/* Theme Section */}
        <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            {mounted && theme === 'dark' ? (
              <Moon className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            ) : (
              <Sun className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            )}
            Giao diện
          </h2>

          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700 rounded-xl">
            <div>
              <p className="font-medium text-slate-800 dark:text-white">Chế độ tối</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Giảm mỏi mắt khi học lâu</p>
            </div>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className={`relative w-14 h-7 rounded-full transition-colors ${
                mounted && theme === 'dark' ? 'bg-teal-600' : 'bg-slate-300'
              }`}
              disabled={!mounted}
            >
              <span className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${
                mounted && theme === 'dark' ? 'left-8' : 'left-1'
              }`} />
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
