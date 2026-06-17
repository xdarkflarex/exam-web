'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import SectionManager, { SectionConfig } from '@/components/admin/SectionManager'
import MediaPickerModal from '@/components/admin/MediaPickerModal'
import {
  Save, RefreshCw, Globe, Layers, Image, ImageIcon, Video, Megaphone,
  Plus, Trash2, CheckCircle, AlertCircle, Type, BookOpen, Award,
  Sparkles, MessageSquare, ToggleLeft, ToggleRight, Camera, UserPlus
} from 'lucide-react'

/* ── Types ── */
interface BrandContent { name: string; copyright: string }
interface HeroContent { badge: string; title: string; subtitle: string; cta_primary: string; cta_secondary: string }
interface SectionHeading { title: string; subtitle: string }
interface CtaContent { badge: string; title: string; subtitle: string; button: string }
interface Benefit { icon: string; title: string; description: string }
interface LandingConfig { show_featured_exams: boolean; featured_exams_count: number }
interface HeroSlide { image_url: string; title?: string; subtitle?: string }
interface EnrollmentSlide { image_url: string; title?: string; link?: string }
interface GalleryItem { image_url: string; title?: string; category?: string }
interface VideoItem { youtube_url: string; title?: string }

/* ── Defaults ── */
const DEF_BRAND: BrandContent = { name: 'Minh Math', copyright: '© 2025 Minh Math. Luyện Thi Toán - Tin Cấp 2/Cấp 3' }
const DEF_HERO: HeroContent = { badge: 'Luyện thi Toán & Tin học', title: 'Nền tảng luyện thi Toán THPT', subtitle: 'Luyện đề – phân tích – cải thiện điểm số một cách hiệu quả', cta_primary: 'Đăng nhập', cta_secondary: 'Bắt đầu ngay' }
const DEF_EXAMS_SEC: SectionHeading = { title: 'Đề thi có sẵn', subtitle: 'Đăng nhập để làm bài và xem kết quả chi tiết' }
const DEF_BENEFITS_SEC: SectionHeading = { title: 'Tại sao chọn Minh Math?', subtitle: 'Nền tảng luyện thi trực tuyến hiện đại' }
const DEF_CTA: CtaContent = { badge: 'Miễn phí', title: 'Sẵn sàng nâng cao điểm số?', subtitle: 'Tham gia cùng hàng nghìn học sinh đang luyện thi trên Minh Math', button: 'Đăng ký miễn phí' }
const DEF_BENEFITS: Benefit[] = [
  { icon: 'target', title: 'Đề thi chất lượng', description: 'Hàng trăm đề thi được biên soạn theo chuẩn đề thi THPT Quốc gia' },
  { icon: 'trending', title: 'Phân tích chi tiết', description: 'Thống kê điểm mạnh, điểm yếu và đề xuất bài tập phù hợp' },
  { icon: 'clock', title: 'Luyện thi mọi lúc', description: 'Học và làm bài thi trực tuyến 24/7 trên mọi thiết bị' },
  { icon: 'award', title: 'Theo dõi tiến bộ', description: 'Xem lịch sử làm bài và theo dõi sự tiến bộ qua từng ngày' },
]
const DEF_CONFIG: LandingConfig = { show_featured_exams: true, featured_exams_count: 6 }
const SECTION_CATALOG: { id: string; label: string }[] = [
  { id: 'hero', label: 'Hero Carousel' },
  { id: 'exams', label: 'Đề thi nổi bật' },
  { id: 'gallery', label: 'Thư viện ảnh' },
  { id: 'enrollment', label: 'Tuyển sinh & Lịch khai giảng' },
  { id: 'posts', label: 'Bài viết mới nhất' },
  { id: 'benefits', label: 'Lợi ích' },
  { id: 'videos', label: 'Video giới thiệu' },
  { id: 'enrollment_form', label: 'Form đăng ký học' },
  { id: 'cta', label: 'Kêu gọi hành động' },
]

const DEF_SECTIONS: SectionConfig[] = SECTION_CATALOG.map(s => ({ ...s, visible: true }))
const ICON_OPTIONS = [
  { value: 'target', label: 'Mục tiêu' },
  { value: 'trending', label: 'Xu hướng' },
  { value: 'clock', label: 'Đồng hồ' },
  { value: 'award', label: 'Giải thưởng' },
  { value: 'book', label: 'Sách' },
  { value: 'check', label: 'Hoàn thành' },
]

type TabId = 'layout' | 'brand_hero' | 'hero_slides' | 'enrollment' | 'gallery' | 'videos' | 'benefits' | 'enrollment_form_section' | 'cta' | 'config'

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'layout', label: 'Bố cục', icon: <Layers className="w-4 h-4" /> },
  { id: 'brand_hero', label: 'Brand & Hero', icon: <Type className="w-4 h-4" /> },
  { id: 'hero_slides', label: 'Hero Slides', icon: <Image className="w-4 h-4" /> },
  { id: 'enrollment', label: 'Tuyển sinh', icon: <Megaphone className="w-4 h-4" /> },
  { id: 'gallery', label: 'Gallery', icon: <ImageIcon className="w-4 h-4" /> },
  { id: 'videos', label: 'Videos', icon: <Video className="w-4 h-4" /> },
  { id: 'benefits', label: 'Lợi ích', icon: <Award className="w-4 h-4" /> },
  { id: 'enrollment_form_section', label: 'Form đăng ký', icon: <UserPlus className="w-4 h-4" /> },
  { id: 'cta', label: 'CTA', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'config', label: 'Cấu hình', icon: <MessageSquare className="w-4 h-4" /> },
]

/* ── Shared input class ── */
const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm outline-none focus:border-teal-500'

export default function LandingCMSPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<TabId>('layout')

  // Content state (from old landing page)
  const [brand, setBrand] = useState<BrandContent>(DEF_BRAND)
  const [hero, setHero] = useState<HeroContent>(DEF_HERO)
  const [examsSection, setExamsSection] = useState<SectionHeading>(DEF_EXAMS_SEC)
  const [benefitsSection, setBenefitsSection] = useState<SectionHeading>(DEF_BENEFITS_SEC)
  const [cta, setCta] = useState<CtaContent>(DEF_CTA)
  const [benefits, setBenefits] = useState<Benefit[]>(DEF_BENEFITS)
  const [config, setConfig] = useState<LandingConfig>(DEF_CONFIG)

  // Sections state (from old sections page)
  const [sections, setSections] = useState<SectionConfig[]>(DEF_SECTIONS)
  const [heroSlides, setHeroSlides] = useState<HeroSlide[]>([])
  const [enrollment, setEnrollment] = useState<EnrollmentSlide[]>([])
  const [enrollmentSection, setEnrollmentSection] = useState<SectionHeading>({ title: 'Tuyển sinh & Lịch khai giảng', subtitle: 'Đăng ký ngay — Số lượng có hạn!' })
  const [enrollmentInterval, setEnrollmentInterval] = useState<number>(6)
  const [gallery, setGallery] = useState<GalleryItem[]>([])
  const [gallerySection, setGallerySection] = useState<SectionHeading>({ title: 'Thư viện ảnh', subtitle: '' })
  const [videos, setVideos] = useState<VideoItem[]>([])
  const [videosSection, setVideosSection] = useState<SectionHeading>({ title: 'Video giới thiệu', subtitle: '' })
  const [enrollmentFormSection, setEnrollmentFormSection] = useState<SectionHeading>({ title: 'Đăng ký học ngay hôm nay', subtitle: 'Điền thông tin bên dưới, chúng tôi sẽ liên hệ với bạn trong 24 giờ' })

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Media picker state
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerCallback, setPickerCallback] = useState<((url: string) => void) | null>(null)

  const openPicker = (cb: (url: string) => void) => {
    setPickerCallback(() => cb)
    setPickerOpen(true)
  }

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    try {
      const { data: settings } = await supabase
        .from('site_settings')
        .select('key, value')
        .like('key', 'landing.%')

      if (settings) {
        const g = (k: string) => settings.find(s => s.key === k)?.value
        if (g('landing.brand')) setBrand(g('landing.brand') as BrandContent)
        if (g('landing.hero')) setHero(g('landing.hero') as HeroContent)
        if (g('landing.exams_section')) setExamsSection(g('landing.exams_section') as SectionHeading)
        if (g('landing.benefits')) setBenefits(g('landing.benefits') as Benefit[])
        if (g('landing.benefits_section')) setBenefitsSection(g('landing.benefits_section') as SectionHeading)
        if (g('landing.cta')) setCta(g('landing.cta') as CtaContent)
        if (g('landing.config')) setConfig(g('landing.config') as LandingConfig)
        if (g('landing.sections_config')) {
          const raw = g('landing.sections_config') as SectionConfig[]
          const validIds = new Set(SECTION_CATALOG.map(c => c.id))
          const filtered = raw.filter(s => validIds.has(s.id))
          const presentIds = new Set(filtered.map(s => s.id))
          const missing = SECTION_CATALOG
            .filter(c => !presentIds.has(c.id))
            .map(c => ({ ...c, visible: true }))
          setSections([...filtered, ...missing])
        }
        if (g('landing.hero_slides')) setHeroSlides(g('landing.hero_slides') as HeroSlide[])
        if (g('landing.enrollment')) setEnrollment(g('landing.enrollment') as EnrollmentSlide[])
        if (g('landing.enrollment_section')) setEnrollmentSection(g('landing.enrollment_section') as SectionHeading)
        if (g('landing.enrollment_interval')) setEnrollmentInterval(g('landing.enrollment_interval') as number)
        if (g('landing.gallery')) setGallery(g('landing.gallery') as GalleryItem[])
        if (g('landing.gallery_section')) setGallerySection(g('landing.gallery_section') as SectionHeading)
        if (g('landing.videos')) setVideos(g('landing.videos') as VideoItem[])
        if (g('landing.videos_section')) setVideosSection(g('landing.videos_section') as SectionHeading)
        if (g('landing.enrollment_form_section')) setEnrollmentFormSection(g('landing.enrollment_form_section') as SectionHeading)
      }
    } catch (err) {
      console.error('Error loading:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setMessage(null)
    try {
      const updates = [
        { key: 'landing.brand', value: brand },
        { key: 'landing.hero', value: hero },
        { key: 'landing.exams_section', value: examsSection },
        { key: 'landing.benefits', value: benefits },
        { key: 'landing.benefits_section', value: benefitsSection },
        { key: 'landing.cta', value: cta },
        { key: 'landing.config', value: config },
        { key: 'landing.sections_config', value: sections },
        { key: 'landing.hero_slides', value: heroSlides },
        { key: 'landing.enrollment', value: enrollment },
        { key: 'landing.enrollment_section', value: enrollmentSection },
        { key: 'landing.enrollment_interval', value: enrollmentInterval },
        { key: 'landing.gallery', value: gallery },
        { key: 'landing.gallery_section', value: gallerySection },
        { key: 'landing.videos', value: videos },
        { key: 'landing.videos_section', value: videosSection },
        { key: 'landing.enrollment_form_section', value: enrollmentFormSection },
      ].map(u => ({ ...u, updated_at: new Date().toISOString() }))

      for (const update of updates) {
        const { error } = await supabase.from('site_settings').upsert(update as Record<string, unknown>, { onConflict: 'key' })
        if (error) throw error
      }
      setMessage({ type: 'success', text: 'Đã lưu thành công!' })
    } catch (err) {
      console.error('Save error:', err)
      setMessage({ type: 'error', text: 'Lỗi khi lưu. Vui lòng thử lại.' })
    } finally {
      setIsSaving(false)
    }
  }

  const addBenefit = () => { if (benefits.length < 6) setBenefits([...benefits, { icon: 'check', title: '', description: '' }]) }
  const removeBenefit = (i: number) => setBenefits(benefits.filter((_, idx) => idx !== i))
  const updateBenefit = (i: number, field: keyof Benefit, val: string) => {
    const u = [...benefits]; u[i] = { ...u[i], [field]: val }; setBenefits(u)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-600 dark:text-slate-400">Đang tải...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3">
              <Globe className="w-7 h-7 text-teal-600 dark:text-teal-400" />
              Landing Page
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">Quản lý toàn bộ nội dung và bố cục trang chủ</p>
          </div>
          <div className="flex items-center gap-3">
            <a href="/" target="_blank" rel="noopener noreferrer" className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors text-sm">
              Xem trang chủ ↗
            </a>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-400 text-white font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {isSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
              Lưu tất cả
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
            {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            {message.text}
          </div>
        )}

        {/* Layout: sidebar tabs + content */}
        <div className="flex gap-6">
          {/* Sidebar tabs */}
          <div className="w-48 flex-shrink-0">
            <div className="sticky top-6 space-y-1">
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
                    tab === t.id
                      ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Content panel */}
          <div className="flex-1 bg-slate-200 dark:bg-slate-800 rounded-2xl p-6 border border-slate-300 dark:border-slate-700 min-h-[500px]">

            {/* ─── LAYOUT ─── */}
            {tab === 'layout' && (
              <div>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-1">Bố cục trang chủ</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Dùng mũi tên ↑↓ để sắp xếp. Bấm mắt để ẩn/hiện. Bấm thùng rác để xóa.</p>
                <SectionManager sections={sections} onChange={setSections} availableSections={SECTION_CATALOG} />
                <div className="mt-4 p-3 rounded-xl bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800">
                  <p className="text-sm text-teal-700 dark:text-teal-300"><strong>Mẹo:</strong> Section chỉ hiển thị nếu có dữ liệu. Ví dụ: Gallery ẩn nếu chưa thêm ảnh.</p>
                </div>
              </div>
            )}

            {/* ─── BRAND & HERO ─── */}
            {tab === 'brand_hero' && (
              <div className="space-y-8">
                {/* Brand */}
                <div>
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                    <Globe className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                    Thương hiệu
                  </h2>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Tên thương hiệu</label>
                      <input type="text" value={brand.name} onChange={e => setBrand({ ...brand, name: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Copyright / Footer</label>
                      <input type="text" value={brand.copyright} onChange={e => setBrand({ ...brand, copyright: e.target.value })} className={inputCls} />
                    </div>
                  </div>
                </div>

                {/* Hero text */}
                <div>
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                    <Type className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                    Hero Section
                  </h2>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Badge</label>
                      <input type="text" value={hero.badge} onChange={e => setHero({ ...hero, badge: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Tiêu đề chính</label>
                      <input type="text" value={hero.title} onChange={e => setHero({ ...hero, title: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Phụ đề</label>
                      <textarea value={hero.subtitle} onChange={e => setHero({ ...hero, subtitle: e.target.value })} rows={2} className={inputCls + ' resize-none'} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Nút CTA chính</label>
                        <input type="text" value={hero.cta_primary} onChange={e => setHero({ ...hero, cta_primary: e.target.value })} className={inputCls} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Nút CTA phụ</label>
                        <input type="text" value={hero.cta_secondary} onChange={e => setHero({ ...hero, cta_secondary: e.target.value })} className={inputCls} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Exams section heading */}
                <div>
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                    Section Đề thi — Tiêu đề
                  </h2>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Tiêu đề</label>
                      <input type="text" value={examsSection.title} onChange={e => setExamsSection({ ...examsSection, title: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Phụ đề</label>
                      <input type="text" value={examsSection.subtitle} onChange={e => setExamsSection({ ...examsSection, subtitle: e.target.value })} className={inputCls} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ─── HERO SLIDES ─── */}
            {tab === 'hero_slides' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Hero Slides</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Ảnh carousel tự chạy ở đầu trang</p>
                  </div>
                  <button onClick={() => setHeroSlides([...heroSlides, { image_url: '', title: '', subtitle: '' }])} className="px-3 py-1.5 rounded-lg bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-sm font-medium hover:bg-teal-200 dark:hover:bg-teal-900/50 transition-colors flex items-center gap-1">
                    <Plus className="w-4 h-4" /> Thêm slide
                  </button>
                </div>
                {heroSlides.length === 0 && <p className="text-sm text-slate-400 text-center py-8">Chưa có slide. Hero sẽ hiển thị dạng text.</p>}
                <div className="space-y-4">
                  {heroSlides.map((slide, i) => (
                    <div key={i} className="p-4 rounded-xl bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600">
                      <div className="flex items-start gap-4">
                        {slide.image_url && <img src={slide.image_url} alt="" className="w-24 h-16 object-cover rounded-lg flex-shrink-0" />}
                        <div className="flex-1 space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">URL Ảnh *</label>
                            <div className="flex gap-2">
                              <input type="text" value={slide.image_url} onChange={e => { const u = [...heroSlides]; u[i] = { ...u[i], image_url: e.target.value }; setHeroSlides(u) }} placeholder="https://..." className={inputCls} />
                              <button type="button" onClick={() => openPicker((url) => { const u = [...heroSlides]; u[i] = { ...u[i], image_url: url }; setHeroSlides(u) })} className="px-3 py-2 rounded-lg bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors flex items-center gap-1 flex-shrink-0" title="Chọn từ Media"><Camera className="w-3.5 h-3.5" /> Media</button>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Tiêu đề</label>
                              <input type="text" value={slide.title || ''} onChange={e => { const u = [...heroSlides]; u[i] = { ...u[i], title: e.target.value }; setHeroSlides(u) }} className={inputCls} />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Phụ đề</label>
                              <input type="text" value={slide.subtitle || ''} onChange={e => { const u = [...heroSlides]; u[i] = { ...u[i], subtitle: e.target.value }; setHeroSlides(u) }} className={inputCls} />
                            </div>
                          </div>
                        </div>
                        <button onClick={() => setHeroSlides(heroSlides.filter((_, idx) => idx !== i))} className="p-2 rounded-lg text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ─── ENROLLMENT ─── */}
            {tab === 'enrollment' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Tuyển sinh & Lịch khai giảng</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Banner carousel tuyển sinh trên trang chủ</p>
                  </div>
                  <button onClick={() => setEnrollment([...enrollment, { image_url: '', title: '' }])} className="px-3 py-1.5 rounded-lg bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-sm font-medium hover:bg-teal-200 dark:hover:bg-teal-900/50 transition-colors flex items-center gap-1">
                    <Plus className="w-4 h-4" /> Thêm banner
                  </button>
                </div>

                {/* Section heading */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Tiêu đề section</label>
                    <input type="text" value={enrollmentSection.title} onChange={e => setEnrollmentSection({ ...enrollmentSection, title: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Phụ đề section</label>
                    <input type="text" value={enrollmentSection.subtitle} onChange={e => setEnrollmentSection({ ...enrollmentSection, subtitle: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Tự chuyển slide (giây)</label>
                    <input type="number" min={2} max={30} value={enrollmentInterval} onChange={e => setEnrollmentInterval(Math.max(2, Math.min(30, Number(e.target.value))))} className={inputCls} />
                  </div>
                </div>

                {enrollment.length === 0 && <p className="text-sm text-slate-400 text-center py-8">Chưa có banner tuyển sinh nào. Upload ảnh qua <a href="/admin/media" className="text-teal-600 underline">Thư viện media</a> rồi paste URL vào đây.</p>}
                <div className="space-y-3">
                  {enrollment.map((item, i) => (
                    <div key={i} className="p-4 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-start gap-4">
                      {item.image_url && <img src={item.image_url} alt="" className="w-32 h-20 object-cover rounded-lg flex-shrink-0" />}
                      <div className="flex-1 space-y-2">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">URL Ảnh *</label>
                          <div className="flex gap-2">
                            <input type="text" value={item.image_url} onChange={e => { const u = [...enrollment]; u[i] = { ...u[i], image_url: e.target.value }; setEnrollment(u) }} placeholder="https://..." className={inputCls} />
                            <button type="button" onClick={() => openPicker((url) => { const u = [...enrollment]; u[i] = { ...u[i], image_url: url }; setEnrollment(u) })} className="px-3 py-2 rounded-lg bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors flex items-center gap-1 flex-shrink-0" title="Chọn từ Media"><Camera className="w-3.5 h-3.5" /> Media</button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Tiêu đề</label>
                            <input type="text" value={item.title || ''} onChange={e => { const u = [...enrollment]; u[i] = { ...u[i], title: e.target.value }; setEnrollment(u) }} className={inputCls} />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Link (tuỳ chọn)</label>
                            <input type="text" value={item.link || ''} onChange={e => { const u = [...enrollment]; u[i] = { ...u[i], link: e.target.value }; setEnrollment(u) }} className={inputCls} />
                          </div>
                        </div>
                      </div>
                      <button onClick={() => setEnrollment(enrollment.filter((_, idx) => idx !== i))} className="p-2 rounded-lg text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ─── GALLERY ─── */}
            {tab === 'gallery' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Thư viện ảnh</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Grid ảnh với filter tabs theo danh mục</p>
                  </div>
                  <button onClick={() => setGallery([...gallery, { image_url: '', title: '', category: '' }])} className="px-3 py-1.5 rounded-lg bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-sm font-medium hover:bg-teal-200 dark:hover:bg-teal-900/50 transition-colors flex items-center gap-1">
                    <Plus className="w-4 h-4" /> Thêm ảnh
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Tiêu đề section</label>
                    <input type="text" value={gallerySection.title} onChange={e => setGallerySection({ ...gallerySection, title: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Phụ đề section</label>
                    <input type="text" value={gallerySection.subtitle} onChange={e => setGallerySection({ ...gallerySection, subtitle: e.target.value })} className={inputCls} />
                  </div>
                </div>
                {gallery.length === 0 && <p className="text-sm text-slate-400 text-center py-8">Chưa có ảnh nào.</p>}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {gallery.map((item, i) => (
                    <div key={i} className="p-3 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-start gap-3">
                      {item.image_url && <img src={item.image_url} alt="" className="w-16 h-16 object-cover rounded-lg flex-shrink-0" />}
                      <div className="flex-1 space-y-2">
                        <div className="flex gap-2">
                          <input type="text" value={item.image_url} onChange={e => { const u = [...gallery]; u[i] = { ...u[i], image_url: e.target.value }; setGallery(u) }} placeholder="URL ảnh" className={inputCls + ' !text-xs'} />
                          <button type="button" onClick={() => openPicker((url) => { const u = [...gallery]; u[i] = { ...u[i], image_url: url }; setGallery(u) })} className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-200 transition-colors flex-shrink-0" title="Chọn từ Media"><Camera className="w-3.5 h-3.5" /></button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input type="text" value={item.title || ''} onChange={e => { const u = [...gallery]; u[i] = { ...u[i], title: e.target.value }; setGallery(u) }} placeholder="Tiêu đề" className={inputCls + ' !text-xs'} />
                          <input type="text" value={item.category || ''} onChange={e => { const u = [...gallery]; u[i] = { ...u[i], category: e.target.value }; setGallery(u) }} placeholder="Danh mục" className={inputCls + ' !text-xs'} />
                        </div>
                      </div>
                      <button onClick={() => setGallery(gallery.filter((_, idx) => idx !== i))} className="p-1.5 rounded text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors flex-shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ─── VIDEOS ─── */}
            {tab === 'videos' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Video giới thiệu</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Nhúng YouTube video trên trang chủ</p>
                  </div>
                  <button onClick={() => setVideos([...videos, { youtube_url: '', title: '' }])} className="px-3 py-1.5 rounded-lg bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-sm font-medium hover:bg-teal-200 dark:hover:bg-teal-900/50 transition-colors flex items-center gap-1">
                    <Plus className="w-4 h-4" /> Thêm video
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Tiêu đề section</label>
                    <input type="text" value={videosSection.title} onChange={e => setVideosSection({ ...videosSection, title: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Phụ đề section</label>
                    <input type="text" value={videosSection.subtitle} onChange={e => setVideosSection({ ...videosSection, subtitle: e.target.value })} className={inputCls} />
                  </div>
                </div>
                {videos.length === 0 && <p className="text-sm text-slate-400 text-center py-8">Chưa có video nào.</p>}
                <div className="space-y-3">
                  {videos.map((v, i) => (
                    <div key={i} className="p-4 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center gap-4">
                      <div className="flex-1 grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">YouTube URL</label>
                          <input type="text" value={v.youtube_url} onChange={e => { const u = [...videos]; u[i] = { ...u[i], youtube_url: e.target.value }; setVideos(u) }} placeholder="https://www.youtube.com/watch?v=..." className={inputCls} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Tiêu đề</label>
                          <input type="text" value={v.title || ''} onChange={e => { const u = [...videos]; u[i] = { ...u[i], title: e.target.value }; setVideos(u) }} className={inputCls} />
                        </div>
                      </div>
                      <button onClick={() => setVideos(videos.filter((_, idx) => idx !== i))} className="p-2 rounded-lg text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ─── BENEFITS ─── */}
            {tab === 'benefits' && (
              <div>
                {/* Section heading */}
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                  <Award className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                  Section Lợi ích
                </h2>
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Tiêu đề</label>
                    <input type="text" value={benefitsSection.title} onChange={e => setBenefitsSection({ ...benefitsSection, title: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Phụ đề</label>
                    <input type="text" value={benefitsSection.subtitle} onChange={e => setBenefitsSection({ ...benefitsSection, subtitle: e.target.value })} className={inputCls} />
                  </div>
                </div>

                {/* Benefits cards */}
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Các thẻ lợi ích ({benefits.length}/6)</p>
                  {benefits.length < 6 && (
                    <button onClick={addBenefit} className="px-3 py-1.5 rounded-lg bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-sm font-medium hover:bg-teal-200 dark:hover:bg-teal-900/50 transition-colors flex items-center gap-1">
                      <Plus className="w-4 h-4" /> Thêm
                    </button>
                  )}
                </div>
                <div className="space-y-3">
                  {benefits.map((b, i) => (
                    <div key={i} className="p-4 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-start gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Icon</label>
                            <select value={b.icon} onChange={e => updateBenefit(i, 'icon', e.target.value)} className={inputCls}>
                              {ICON_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </div>
                          <div className="col-span-2">
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Tiêu đề</label>
                            <input type="text" value={b.title} onChange={e => updateBenefit(i, 'title', e.target.value)} className={inputCls} />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Mô tả</label>
                          <input type="text" value={b.description} onChange={e => updateBenefit(i, 'description', e.target.value)} className={inputCls} />
                        </div>
                      </div>
                      {benefits.length > 1 && (
                        <button onClick={() => removeBenefit(i)} className="p-2 rounded-lg text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ─── ENROLLMENT FORM SECTION ─── */}
            {tab === 'enrollment_form_section' && (
              <div>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-1 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                  Form Đăng ký Học
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                  Tiêu đề và phụ đề hiển thị bên trên form. Form luôn hiển thị (không cần dữ liệu upload).
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Tiêu đề</label>
                    <input
                      type="text"
                      value={enrollmentFormSection.title}
                      onChange={e => setEnrollmentFormSection({ ...enrollmentFormSection, title: e.target.value })}
                      placeholder="Đăng ký học ngay hôm nay"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Phụ đề</label>
                    <textarea
                      value={enrollmentFormSection.subtitle}
                      onChange={e => setEnrollmentFormSection({ ...enrollmentFormSection, subtitle: e.target.value })}
                      placeholder="Điền thông tin bên dưới, chúng tôi sẽ liên hệ..."
                      rows={2}
                      className={inputCls + ' resize-none'}
                    />
                  </div>
                </div>
                <div className="mt-6 p-4 rounded-xl bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800">
                  <p className="text-sm text-teal-700 dark:text-teal-300">
                    <strong>Fields trong form:</strong> Tên học viên, Email, Số điện thoại, Lớp (Toán 10/11/12, Tin học).
                    Đơn đăng ký được lưu vào database. Xem danh sách tại <a href="/admin/enrollments" className="underline font-medium">/admin/enrollments</a>.
                  </p>
                </div>
              </div>
            )}

            {/* ─── CTA ─── */}
            {tab === 'cta' && (
              <div>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                  Section CTA (Kêu gọi hành động)
                </h2>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Badge</label>
                    <input type="text" value={cta.badge} onChange={e => setCta({ ...cta, badge: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Tiêu đề</label>
                    <input type="text" value={cta.title} onChange={e => setCta({ ...cta, title: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Phụ đề</label>
                    <input type="text" value={cta.subtitle} onChange={e => setCta({ ...cta, subtitle: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Nút CTA</label>
                    <input type="text" value={cta.button} onChange={e => setCta({ ...cta, button: e.target.value })} className={inputCls} />
                  </div>
                </div>
              </div>
            )}

            {/* ─── CONFIG ─── */}
            {tab === 'config' && (
              <div>
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
                      className={`p-1 rounded-full transition-colors ${config.show_featured_exams ? 'bg-teal-600 dark:bg-teal-500' : 'bg-slate-400 dark:bg-slate-600'}`}
                    >
                      {config.show_featured_exams ? <ToggleRight className="w-8 h-8 text-white" /> : <ToggleLeft className="w-8 h-8 text-white" />}
                    </button>
                  </div>
                  {config.show_featured_exams && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Số lượng đề thi hiển thị</label>
                      <select value={config.featured_exams_count} onChange={e => setConfig({ ...config, featured_exams_count: parseInt(e.target.value) })} className={inputCls + ' w-32'}>
                        <option value={3}>3</option>
                        <option value={6}>6</option>
                        <option value={9}>9</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Media Picker Modal */}
      <MediaPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(url) => {
          if (pickerCallback) pickerCallback(url)
          setPickerOpen(false)
        }}
        bucket="Landingpage"
      />
    </div>
  )
}
