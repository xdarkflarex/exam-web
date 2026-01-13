'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, User, Mail, School, BookOpen, Moon, Sun, Bell, Shield, Save } from 'lucide-react'
import { StudentHeader } from '@/components/student'
import { useTheme } from '@/contexts/ThemeContext'

export default function StudentSettingsPage() {
  const router = useRouter()
  const { theme, toggleTheme } = useTheme()
  
  const [formData, setFormData] = useState({
    fullName: '',
    email: 'student@example.com',
    className: '',
    school: '',
  })

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <StudentHeader title="Cai dat" minimal />
      
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
        <button
          onClick={() => router.push('/student')}
          className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Quay lai
        </button>
      </div>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 pb-12">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-6">
          Cai dat tai khoan
        </h1>

        <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            Thong tin ca nhan
          </h2>

          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <User className="w-8 h-8 text-slate-400 dark:text-slate-500" />
            </div>
            <div>
              <button className="text-sm text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 font-medium">
                Thay doi anh dai dien
              </button>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                JPG, PNG toi da 2MB
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Ho va ten
              </label>
              <input
                type="text"
                value={formData.fullName}
                onChange={(e) => handleInputChange('fullName', e.target.value)}
                placeholder="Nhap ho va ten"
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                disabled
                className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-500 dark:text-slate-400 cursor-not-allowed"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Email khong the thay doi
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Lop
              </label>
              <input
                type="text"
                value={formData.className}
                onChange={(e) => handleInputChange('className', e.target.value)}
                placeholder="Vi du: 12A1"
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Truong
              </label>
              <input
                type="text"
                value={formData.school}
                onChange={(e) => handleInputChange('school', e.target.value)}
                placeholder="Nhap ten truong"
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
          </div>
        </section>

        <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            {theme === 'dark' ? <Moon className="w-5 h-5 text-teal-600 dark:text-teal-400" /> : <Sun className="w-5 h-5 text-teal-600 dark:text-teal-400" />}
            Giao dien
          </h2>

          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <div>
              <p className="font-medium text-slate-800 dark:text-white">Che do toi</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Giam moi mat khi hoc lau</p>
            </div>
            <button
              onClick={toggleTheme}
              className={`relative w-12 h-6 rounded-full transition-colors ${theme === 'dark' ? 'bg-teal-600' : 'bg-slate-300'}`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${theme === 'dark' ? 'left-7' : 'left-1'}`} />
            </button>
          </div>
        </section>

        <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <Bell className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            Thong bao
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Tinh nang dang phat trien...</p>
        </section>

        <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            Bao mat
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Tinh nang dang phat trien...</p>
        </section>

        <button className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-teal-600 hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-500 text-white rounded-xl font-medium transition-colors">
          <Save className="w-5 h-5" />
          Luu thay doi
        </button>
      </main>
    </div>
  )
}
