'use client'

import { useState } from 'react'
import { Settings, Bell, Shield, Database, Save } from 'lucide-react'
import { AdminHeader } from '@/components/admin'

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState({
    siteName: 'ExamHub',
    allowRegistration: true,
    examTimeWarning: 5,
    autoSubmitOnTimeout: true,
    showCorrectAnswers: true,
    emailNotifications: true
  })

  return (
    <div className="min-h-screen">
      <AdminHeader title="Cài đặt" subtitle="Quản lý cấu hình hệ thống" />
      
      <div className="p-8 max-w-4xl">
        {/* General Settings */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 mb-6">
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
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  settings.allowRegistration ? 'left-7' : 'left-1'
                }`} />
              </button>
            </div>
          </div>
        </div>

        {/* Exam Settings */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 mb-6">
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
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
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
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  settings.showCorrectAnswers ? 'left-7' : 'left-1'
                }`} />
              </button>
            </div>
          </div>
        </div>

        {/* Notification Settings */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 mb-6">
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
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                settings.emailNotifications ? 'left-7' : 'left-1'
              }`} />
            </button>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button className="flex items-center gap-2 px-6 py-2.5 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-700 transition-colors">
            <Save className="w-4 h-4" />
            Lưu cài đặt
          </button>
        </div>

        {/* Note */}
        <div className="mt-6 p-4 bg-slate-50 rounded-xl">
          <p className="text-sm text-slate-600">
            <strong>Lưu ý:</strong> Đây là trang cài đặt mẫu. Các cài đặt chưa được kết nối với backend.
            Bạn có thể tùy chỉnh theo nhu cầu thực tế của hệ thống.
          </p>
        </div>
      </div>
    </div>
  )
}
