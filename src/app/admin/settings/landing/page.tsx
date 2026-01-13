'use client'

/**
 * Admin Landing Page Settings
 * 
 * Allows admin to edit the public landing page content.
 * Changes are saved to site_settings table in Supabase.
 */

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Save, RefreshCw, Globe, Type, MessageSquare, ToggleLeft, ToggleRight, Plus, Trash2, CheckCircle, AlertCircle } from 'lucide-react'

interface HeroContent {
  title: string
  subtitle: string
  cta_primary: string
  cta_secondary: string
}

interface Benefit {
  icon: string
  title: string
  description: string
}

interface LandingConfig {
  show_featured_exams: boolean
  featured_exams_count: number
}

const DEFAULT_HERO: HeroContent = {
  title: 'Nền tảng luyện thi Toán THPT',
  subtitle: 'Luyện đề – phân tích – cải thiện điểm số một cách hiệu quả',
  cta_primary: 'Đăng nhập',
  cta_secondary: 'Bắt đầu ngay',
}

const DEFAULT_BENEFITS: Benefit[] = [
  { icon: 'target', title: 'Đề thi chất lượng', description: 'Hàng trăm đề thi được biên soạn theo chuẩn đề thi THPT Quốc gia' },
  { icon: 'trending', title: 'Phân tích chi tiết', description: 'Thống kê điểm mạnh, điểm yếu và đề xuất bài tập phù hợp' },
  { icon: 'clock', title: 'Luyện thi mọi lúc', description: 'Học và làm bài thi trực tuyến 24/7 trên mọi thiết bị' },
  { icon: 'award', title: 'Theo dõi tiến bộ', description: 'Xem lịch sử làm bài và theo dõi sự tiến bộ qua từng ngày' },
]

const DEFAULT_CONFIG: LandingConfig = {
  show_featured_exams: true,
  featured_exams_count: 6,
}

const ICON_OPTIONS = [
  { value: 'target', label: 'Mục tiêu' },
  { value: 'trending', label: 'Xu hướng' },
  { value: 'clock', label: 'Đồng hồ' },
  { value: 'award', label: 'Giải thưởng' },
  { value: 'book', label: 'Sách' },
  { value: 'check', label: 'Hoàn thành' },
]

export default function LandingSettingsPage() {
  const supabase = createClient()

  // Form state
  const [hero, setHero] = useState<HeroContent>(DEFAULT_HERO)
  const [benefits, setBenefits] = useState<Benefit[]>(DEFAULT_BENEFITS)
  const [config, setConfig] = useState<LandingConfig>(DEFAULT_CONFIG)

  // UI state
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  /**
   * Load existing settings from database
   */
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const { data: settings } = await supabase
          .from('site_settings')
          .select('key, value')
          .in('key', ['landing.hero', 'landing.benefits', 'landing.config'])

        if (settings) {
          const heroData = settings.find(s => s.key === 'landing.hero')
          const benefitsData = settings.find(s => s.key === 'landing.benefits')
          const configData = settings.find(s => s.key === 'landing.config')

          if (heroData?.value) setHero(heroData.value as HeroContent)
          if (benefitsData?.value) setBenefits(benefitsData.value as Benefit[])
          if (configData?.value) setConfig(configData.value as LandingConfig)
        }
      } catch (error) {
        console.error('Error loading settings:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadSettings()
  }, [supabase])

  /**
   * Save all settings to database
   */
  const handleSave = async () => {
    setIsSaving(true)
    setMessage(null)

    try {
      const updates = [
        { key: 'landing.hero', value: hero, updated_at: new Date().toISOString() },
        { key: 'landing.benefits', value: benefits, updated_at: new Date().toISOString() },
        { key: 'landing.config', value: config, updated_at: new Date().toISOString() },
      ]

      for (const update of updates) {
        const { error } = await supabase
          .from('site_settings')
          .upsert(update, { onConflict: 'key' })

        if (error) throw error
      }

      setMessage({ type: 'success', text: 'Đã lưu thành công!' })
    } catch (error) {
      console.error('Error saving settings:', error)
      setMessage({ type: 'error', text: 'Lỗi khi lưu. Vui lòng thử lại.' })
    } finally {
      setIsSaving(false)
    }
  }

  /**
   * Reset to default values
   */
  const handleReset = () => {
    setHero(DEFAULT_HERO)
    setBenefits(DEFAULT_BENEFITS)
    setConfig(DEFAULT_CONFIG)
    setMessage(null)
  }

  /**
   * Add new benefit
   */
  const addBenefit = () => {
    if (benefits.length >= 6) return
    setBenefits([...benefits, { icon: 'check', title: '', description: '' }])
  }

  /**
   * Remove benefit
   */
  const removeBenefit = (index: number) => {
    setBenefits(benefits.filter((_, i) => i !== index))
  }

  /**
   * Update benefit
   */
  const updateBenefit = (index: number, field: keyof Benefit, value: string) => {
    const updated = [...benefits]
    updated[index] = { ...updated[index], [field]: value }
    setBenefits(updated)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-600 dark:text-slate-400">Đang tải...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3">
              <Globe className="w-7 h-7 text-teal-600 dark:text-teal-400" />
              Cài đặt Landing Page
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              Chỉnh sửa nội dung trang chủ công khai
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleReset}
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Đặt lại
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-400 text-white font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {isSaving ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Lưu thay đổi
            </button>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${
            message.type === 'success' 
              ? 'bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 text-green-700 dark:text-green-300'
              : 'bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300'
          }`}>
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
            {message.text}
          </div>
        )}

        {/* Hero Section Settings */}
        <div className="bg-slate-200 dark:bg-slate-800 rounded-2xl p-6 border border-slate-300 dark:border-slate-700 mb-6">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
            <Type className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            Hero Section
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Tiêu đề chính
              </label>
              <input
                type="text"
                value={hero.title}
                onChange={(e) => setHero({ ...hero, title: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:border-teal-500 dark:focus:border-teal-400 outline-none transition-colors"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Phụ đề
              </label>
              <textarea
                value={hero.subtitle}
                onChange={(e) => setHero({ ...hero, subtitle: e.target.value })}
                rows={2}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:border-teal-500 dark:focus:border-teal-400 outline-none transition-colors resize-none"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Nút CTA chính
                </label>
                <input
                  type="text"
                  value={hero.cta_primary}
                  onChange={(e) => setHero({ ...hero, cta_primary: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:border-teal-500 dark:focus:border-teal-400 outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Nút CTA phụ
                </label>
                <input
                  type="text"
                  value={hero.cta_secondary}
                  onChange={(e) => setHero({ ...hero, cta_secondary: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:border-teal-500 dark:focus:border-teal-400 outline-none transition-colors"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Config Settings */}
        <div className="bg-slate-200 dark:bg-slate-800 rounded-2xl p-6 border border-slate-300 dark:border-slate-700 mb-6">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            Cấu hình
          </h2>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-xl bg-slate-100 dark:bg-slate-700">
              <div>
                <p className="font-medium text-slate-800 dark:text-slate-100">Hiển thị đề thi nổi bật</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">Hiển thị các đề thi đã xuất bản trên trang chủ</p>
              </div>
              <button
                onClick={() => setConfig({ ...config, show_featured_exams: !config.show_featured_exams })}
                className={`p-1 rounded-full transition-colors ${
                  config.show_featured_exams 
                    ? 'bg-teal-600 dark:bg-teal-500' 
                    : 'bg-slate-400 dark:bg-slate-600'
                }`}
              >
                {config.show_featured_exams ? (
                  <ToggleRight className="w-8 h-8 text-white" />
                ) : (
                  <ToggleLeft className="w-8 h-8 text-white" />
                )}
              </button>
            </div>
            
            {config.show_featured_exams && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Số lượng đề thi hiển thị
                </label>
                <select
                  value={config.featured_exams_count}
                  onChange={(e) => setConfig({ ...config, featured_exams_count: parseInt(e.target.value) })}
                  className="w-32 px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:border-teal-500 dark:focus:border-teal-400 outline-none transition-colors"
                >
                  <option value={3}>3</option>
                  <option value={6}>6</option>
                  <option value={9}>9</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Benefits Settings */}
        <div className="bg-slate-200 dark:bg-slate-800 rounded-2xl p-6 border border-slate-300 dark:border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              Lợi ích ({benefits.length}/6)
            </h2>
            {benefits.length < 6 && (
              <button
                onClick={addBenefit}
                className="px-3 py-1.5 rounded-lg bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-sm font-medium hover:bg-teal-200 dark:hover:bg-teal-900/50 transition-colors flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                Thêm
              </button>
            )}
          </div>
          
          <div className="space-y-4">
            {benefits.map((benefit, index) => (
              <div key={index} className="p-4 rounded-xl bg-slate-100 dark:bg-slate-700">
                <div className="flex items-start gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Icon
                        </label>
                        <select
                          value={benefit.icon}
                          onChange={(e) => updateBenefit(index, 'icon', e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm focus:border-teal-500 dark:focus:border-teal-400 outline-none"
                        >
                          {ICON_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Tiêu đề
                        </label>
                        <input
                          type="text"
                          value={benefit.title}
                          onChange={(e) => updateBenefit(index, 'title', e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm focus:border-teal-500 dark:focus:border-teal-400 outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Mô tả
                      </label>
                      <input
                        type="text"
                        value={benefit.description}
                        onChange={(e) => updateBenefit(index, 'description', e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm focus:border-teal-500 dark:focus:border-teal-400 outline-none"
                      />
                    </div>
                  </div>
                  {benefits.length > 1 && (
                    <button
                      onClick={() => removeBenefit(index)}
                      className="p-2 rounded-lg text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Preview Link */}
        <div className="mt-6 text-center">
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal-600 dark:text-teal-400 hover:underline text-sm"
          >
            Mở trang chủ trong tab mới để xem trước →
          </a>
        </div>
      </div>
    </div>
  )
}
