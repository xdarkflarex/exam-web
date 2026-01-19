'use client'

import { useState, useEffect } from 'react'
import { Settings, Bell, Shield, Database, Save, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { AdminHeader } from '@/components/admin'
import { createClient } from '@/lib/supabase/client'

interface SiteSettings {
  siteName: string
  allowRegistration: boolean
  examTimeWarning: number
  autoSubmitOnTimeout: boolean
  showCorrectAnswers: boolean
  emailNotifications: boolean
}

const DEFAULT_SETTINGS: SiteSettings = {
  siteName: 'ExamHub',
  allowRegistration: true,
  examTimeWarning: 5,
  autoSubmitOnTimeout: true,
  showCorrectAnswers: true,
  emailNotifications: true
}

export default function AdminSettingsPage() {
  const supabase = createClient()
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const { data } = await supabase
        .from('site_settings')
        .select('key, value')
        .eq('key', 'admin.settings')
        .single()

      if (data?.value) {
        setSettings({ ...DEFAULT_SETTINGS, ...data.value })
      }
    } catch (err) {
      console.log('No existing settings, using defaults')
    }
    setLoading(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveStatus('idle')
    
    try {
      const { error } = await supabase
        .from('site_settings')
        .upsert({
          key: 'admin.settings',
          value: settings,
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' })

      if (error) throw error
      
      setSaveStatus('success')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } catch (err) {
      console.error('Save error:', err)
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen">
        <AdminHeader title="Cài đặt" subtitle="Quản lý cấu hình hệ thống" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <AdminHeader title="Cài đặt" subtitle="Quản lý cấu hình hệ thống" />
      
      <div className="p-8 max-w-4xl">
        {/* General Settings */}
        <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center">
              <Settings className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800">Cài đặt chung</h2>
              <p className="text-sm text-slate-500">Cấu hình cơ bản của hệ thống</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Tên hệ thống
              </label>
              <input
                type="text"
                value={settings.siteName}
                onChange={(e) => setSettings({ ...settings, siteName: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>

            <div className="flex items-center justify-between py-3 border-t border-slate-100">
              <div>
                <p className="font-medium text-slate-800">Cho phép đăng ký mới</p>
                <p className="text-sm text-slate-500">Học sinh có thể tự đăng ký tài khoản</p>
              </div>
              <button
                onClick={() => setSettings({ ...settings, allowRegistration: !settings.allowRegistration })}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  settings.allowRegistration ? 'bg-teal-500' : 'bg-slate-300'
                }`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-slate-100 rounded-full transition-transform ${
                  settings.allowRegistration ? 'left-7' : 'left-1'
                }`} />
              </button>
            </div>
          </div>
        </div>

        {/* Exam Settings */}
        <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <Database className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800">Cài đặt bài thi</h2>
              <p className="text-sm text-slate-500">Cấu hình liên quan đến bài thi</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Cảnh báo thời gian (phút)
              </label>
              <input
                type="number"
                value={settings.examTimeWarning}
                onChange={(e) => setSettings({ ...settings, examTimeWarning: parseInt(e.target.value) })}
                className="w-32 px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
              <p className="text-sm text-slate-500 mt-1">Hiển thị cảnh báo khi còn bao nhiêu phút</p>
            </div>

            <div className="flex items-center justify-between py-3 border-t border-slate-100">
              <div>
                <p className="font-medium text-slate-800">Tự động nộp bài khi hết giờ</p>
                <p className="text-sm text-slate-500">Hệ thống tự động nộp bài khi hết thời gian</p>
              </div>
              <button
                onClick={() => setSettings({ ...settings, autoSubmitOnTimeout: !settings.autoSubmitOnTimeout })}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  settings.autoSubmitOnTimeout ? 'bg-teal-500' : 'bg-slate-300'
                }`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-slate-100 rounded-full transition-transform ${
                  settings.autoSubmitOnTimeout ? 'left-7' : 'left-1'
                }`} />
              </button>
            </div>

            <div className="flex items-center justify-between py-3 border-t border-slate-100">
              <div>
                <p className="font-medium text-slate-800">Hiển thị đáp án đúng</p>
                <p className="text-sm text-slate-500">Cho phép học sinh xem đáp án sau khi nộp bài</p>
              </div>
              <button
                onClick={() => setSettings({ ...settings, showCorrectAnswers: !settings.showCorrectAnswers })}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  settings.showCorrectAnswers ? 'bg-teal-500' : 'bg-slate-300'
                }`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-slate-100 rounded-full transition-transform ${
                  settings.showCorrectAnswers ? 'left-7' : 'left-1'
                }`} />
              </button>
            </div>
          </div>
        </div>

        {/* Notification Settings */}
        <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
              <Bell className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800">Thông báo</h2>
              <p className="text-sm text-slate-500">Cấu hình thông báo hệ thống</p>
            </div>
          </div>

          <div className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium text-slate-800">Email thông báo</p>
              <p className="text-sm text-slate-500">Nhận email khi có góp ý mới từ học sinh</p>
            </div>
            <button
              onClick={() => setSettings({ ...settings, emailNotifications: !settings.emailNotifications })}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                settings.emailNotifications ? 'bg-teal-500' : 'bg-slate-300'
              }`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-slate-100 rounded-full transition-transform ${
                settings.emailNotifications ? 'left-7' : 'left-1'
              }`} />
            </button>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center justify-end gap-4">
          {saveStatus === 'success' && (
            <span className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm">
              <CheckCircle className="w-4 h-4" />
              Đã lưu thành công
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              Lỗi khi lưu
            </span>
          )}
          <button 
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Đang lưu...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Lưu cài đặt
              </>
            )}
          </button>
        </div>

        {/* Note */}
        <div className="mt-6 p-4 bg-teal-50 dark:bg-teal-900/20 rounded-xl border border-teal-200 dark:border-teal-800">
          <p className="text-sm text-teal-700 dark:text-teal-300">
            <strong>Lưu ý:</strong> Các cài đặt được lưu trong bảng <code className="bg-teal-100 dark:bg-teal-800 px-1 rounded">site_settings</code> và sẽ được áp dụng cho toàn hệ thống.
          </p>
        </div>
      </div>
    </div>
  )
}
