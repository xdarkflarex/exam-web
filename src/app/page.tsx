import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { BookOpen, Target, TrendingUp, Clock, Award, ArrowRight, CheckCircle, LogIn, UserPlus, Sparkles, Newspaper } from 'lucide-react'
import ScrollRevealClient from '@/components/ScrollRevealClient'
import AnnouncementBanner from '@/components/AnnouncementBanner'
import ThemeToggle from '@/components/ThemeToggle'
import MinhMathLogo from '@/components/MinhMathLogo'
import ImageCarousel from '@/components/ImageCarousel'
import EnrollmentCarousel from '@/components/EnrollmentCarousel'
import GalleryGrid from '@/components/GalleryGrid'
import VideoSection from '@/components/VideoSection'
import AuthHeaderClient from '@/components/AuthHeaderClient'
import PostsSection from '@/components/PostsSection'
import EnrollmentFormSection from '@/components/EnrollmentFormSection'
import EnrollmentFloatingButton from '@/components/EnrollmentFloatingButton'
import ScrollToEnrollButton from '@/components/ScrollToEnrollButton'

export const dynamic = 'force-dynamic'

/**
 * Default content for landing page
 * Used when no content is found in site_settings
 */
const DEFAULT_CONTENT = {
  brand: {
    name: 'Minh Math',
    copyright: '© 2025 Minh Math. Luyện Thi Toán - Tin Cấp 2/Cấp 3',
  },
  hero: {
    badge: 'Luyện thi Toán & Tin học',
    title: 'Nền tảng luyện thi Toán THPT',
    subtitle: 'Luyện đề – phân tích – cải thiện điểm số một cách hiệu quả',
    cta_primary: 'Đăng nhập',
    cta_secondary: 'Bắt đầu ngay',
  },
  exams_section: {
    title: 'Đề thi có sẵn',
    subtitle: 'Đăng nhập để làm bài và xem kết quả chi tiết',
  },
  benefits: [
    {
      icon: 'target',
      title: 'Đề thi chất lượng',
      description: 'Hàng trăm đề thi được biên soạn theo chuẩn đề thi THPT Quốc gia',
    },
    {
      icon: 'trending',
      title: 'Phân tích chi tiết',
      description: 'Thống kê điểm mạnh, điểm yếu và đề xuất bài tập phù hợp',
    },
    {
      icon: 'clock',
      title: 'Luyện thi mọi lúc',
      description: 'Học và làm bài thi trực tuyến 24/7 trên mọi thiết bị',
    },
    {
      icon: 'award',
      title: 'Theo dõi tiến bộ',
      description: 'Xem lịch sử làm bài và theo dõi sự tiến bộ qua từng ngày',
    },
  ],
  benefits_section: {
    title: 'Tại sao chọn Minh Math?',
    subtitle: 'Nền tảng luyện thi trực tuyến hiện đại, giúp bạn chuẩn bị tốt nhất cho kỳ thi',
  },
  cta: {
    badge: 'Miễn phí',
    title: 'Sẵn sàng nâng cao điểm số?',
    subtitle: 'Tham gia cùng hàng nghìn học sinh đang luyện thi trên Minh Math',
    button: 'Đăng ký miễn phí',
  },
  config: {
    show_featured_exams: true,
    featured_exams_count: 6,
  },
}

/**
 * Create public Supabase client for landing page
 * Uses anon key - no authentication required
 */
function createPublicSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        fetch: (url: any, options: any) =>
          fetch(url, { ...options, cache: 'no-store' }),
      },
    }
  )
}

/**
 * Fetch landing page content from site_settings
 * Uses public client - no authentication required
 */
async function getLandingContent() {
  try {
    const supabase = createPublicSupabaseClient()
    
    const { data: settings } = await supabase
      .from('site_settings')
      .select('key, value')
      .like('key', 'landing.%')
    
    if (!settings || settings.length === 0) {
      return DEFAULT_CONTENT
    }

    const get = (key: string) => settings.find(s => s.key === key)?.value
    
    return {
      brand: get('landing.brand') || DEFAULT_CONTENT.brand,
      hero: get('landing.hero') || DEFAULT_CONTENT.hero,
      exams_section: get('landing.exams_section') || DEFAULT_CONTENT.exams_section,
      benefits: get('landing.benefits') || DEFAULT_CONTENT.benefits,
      benefits_section: get('landing.benefits_section') || DEFAULT_CONTENT.benefits_section,
      cta: get('landing.cta') || DEFAULT_CONTENT.cta,
      config: get('landing.config') || DEFAULT_CONTENT.config,
      hero_slides: get('landing.hero_slides') || [],
      enrollment: get('landing.enrollment') || [],
      enrollment_section: get('landing.enrollment_section') || { title: 'Tuyển sinh & Lịch khai giảng', subtitle: 'Đăng ký ngay — Số lượng có hạn!' },
      enrollment_interval: get('landing.enrollment_interval') || 6,
      gallery: get('landing.gallery') || [],
      gallery_section: get('landing.gallery_section') || { title: 'Thư viện ảnh', subtitle: '' },
      videos: get('landing.videos') || [],
      videos_section: get('landing.videos_section') || { title: 'Video giới thiệu', subtitle: '' },
      enrollment_form_section: get('landing.enrollment_form_section') || { title: 'Đăng ký học ngay hôm nay', subtitle: 'Điền thông tin bên dưới, chúng tôi sẽ liên hệ với bạn trong 24 giờ' },
      sections_config: get('landing.sections_config') || null,
    }
  } catch (error) {
    console.error('Error fetching landing content:', error)
    return DEFAULT_CONTENT
  }
}

/**
 * Fetch featured exams (published only, no question data)
 * Uses public client - no authentication required
 */
async function getFeaturedExams(count: number = 6) {
  try {
    const supabase = createPublicSupabaseClient()
    
    const { data: exams } = await supabase
      .from('exams')
      .select('id, title, subject, duration')
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(count)
    
    return exams || []
  } catch (error) {
    console.error('Error fetching featured exams:', error)
    return []
  }
}

/**
 * Fetch recent published posts for landing page
 */
async function getRecentPosts(count: number = 6) {
  try {
    const supabase = createPublicSupabaseClient()
    const { data } = await supabase
      .from('posts')
      .select('id, title, slug, excerpt, cover_image, category, published_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(count)
    return data || []
  } catch {
    return []
  }
}

/**
 * Icon component mapper
 */
function BenefitIcon({ icon, className }: { icon: string; className?: string }) {
  switch (icon) {
    case 'target':
      return <Target className={className} />
    case 'trending':
      return <TrendingUp className={className} />
    case 'clock':
      return <Clock className={className} />
    case 'award':
      return <Award className={className} />
    case 'book':
      return <BookOpen className={className} />
    default:
      return <CheckCircle className={className} />
  }
}

/**
 * Public Landing Page
 * 
 * This is the default entry point of the website.
 * Always accessible without authentication.
 * Content can be edited by admin via /admin/settings/landing
 */
export default async function LandingPage() {
  const content = await getLandingContent() as any
  const showExams = content.config?.show_featured_exams ?? true
  const exams = showExams ? await getFeaturedExams(content.config?.featured_exams_count || 6) : []
  const recentPosts = await getRecentPosts(6)

  const heroSlides = content.hero_slides || []
  const enrollment = content.enrollment || []
  const gallery = content.gallery || []
  const videos = content.videos || []

  const defaultSectionsOrder = [
    { id: 'hero', label: 'Hero Carousel', visible: true },
    { id: 'exams', label: 'Đề thi nổi bật', visible: true },
    { id: 'gallery', label: 'Thư viện ảnh', visible: true },
    { id: 'enrollment', label: 'Tuyển sinh & Lịch khai giảng', visible: true },
    { id: 'posts', label: 'Bài viết mới nhất', visible: true },
    { id: 'benefits', label: 'Lợi ích', visible: true },
    { id: 'videos', label: 'Video giới thiệu', visible: true },
    { id: 'enrollment_form', label: 'Form đăng ký học', visible: true },
    { id: 'cta', label: 'Kêu gọi hành động', visible: true },
  ]
  const rawConfig = content.sections_config || defaultSectionsOrder
  const presentIds = new Set(rawConfig.map((s: any) => s.id))
  const missingSections = defaultSectionsOrder.filter(s => !presentIds.has(s.id))
  const sectionsConfig = [...rawConfig, ...missingSections]
  const visibleSections = sectionsConfig.filter((s: any) => s.visible)

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 transition-colors">
      {/* Header */}
      <header className="sticky top-0 z-50 glass-strong shadow-sm fade-in">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 dark:from-teal-400 dark:to-teal-600 flex items-center justify-center shadow-lg shadow-teal-600/25 dark:shadow-teal-500/20 group-hover:shadow-teal-600/40 dark:group-hover:shadow-teal-400/30 transition-all duration-300 group-hover:scale-105">
                <MinhMathLogo size={24} className="text-white" />
              </div>
              <span className="text-xl font-bold text-slate-800 dark:text-slate-100 font-baloo">
                {content.brand?.name || DEFAULT_CONTENT.brand.name}
              </span>
            </Link>
            
            {/* Navigation */}
            <nav className="flex items-center gap-2 sm:gap-3">
              <ThemeToggle />
              <AuthHeaderClient />
            </nav>
          </div>
        </div>
      </header>

      {/* Announcement Banner */}
      <AnnouncementBanner />

      {/* Dynamic sections rendered by admin-configured order */}
      {visibleSections.map((sec: any) => {
        switch (sec.id) {
          case 'hero':
            return heroSlides.length > 0 ? (
              <section key="hero">
                <ImageCarousel slides={heroSlides} interval={5000}>
                  <div className="text-center px-6 max-w-3xl">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 backdrop-blur-sm text-white text-sm font-medium mb-6">
                      <MinhMathLogo size={16} className="text-white" />
                      {content.hero?.badge || DEFAULT_CONTENT.hero.badge}
                    </div>
                    <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6 font-baloo drop-shadow-lg">
                      {content.hero?.title || DEFAULT_CONTENT.hero.title}
                    </h1>
                    <p className="text-lg sm:text-xl text-white/90 max-w-2xl mx-auto mb-10 drop-shadow">
                      {content.hero?.subtitle || DEFAULT_CONTENT.hero.subtitle}
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                      <Link href="/login" className="w-full sm:w-auto px-8 py-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-lg shadow-lg transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2 font-baloo">
                        {content.hero?.cta_primary || DEFAULT_CONTENT.hero.cta_primary}
                        <ArrowRight className="w-5 h-5" />
                      </Link>
                      <Link href="/signup" className="w-full sm:w-auto px-8 py-4 rounded-xl border-2 border-white/50 text-white font-semibold text-lg hover:bg-white/10 transition-all hover:scale-105 active:scale-95 font-baloo backdrop-blur-sm">
                        {content.hero?.cta_secondary || DEFAULT_CONTENT.hero.cta_secondary}
                      </Link>
                      <ScrollToEnrollButton variant="hero-slide" />
                    </div>
                  </div>
                </ImageCarousel>
              </section>
            ) : (
              <section key="hero" className="py-20 sm:py-28">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-sm font-medium mb-6 slide-in-up">
                    <MinhMathLogo size={16} className="text-teal-700 dark:text-teal-300" />
                    {content.hero?.badge || DEFAULT_CONTENT.hero.badge}
                  </div>
                  <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-800 dark:text-slate-100 leading-tight mb-6 font-baloo slide-in-up" style={{animationDelay: '0.1s'}}>
                    {content.hero?.title || DEFAULT_CONTENT.hero.title}
                  </h1>
                  <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mb-10 slide-in-up" style={{animationDelay: '0.2s'}}>
                    {content.hero?.subtitle || DEFAULT_CONTENT.hero.subtitle}
                  </p>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-4 slide-in-up" style={{animationDelay: '0.3s'}}>
                    <Link href="/login" className="w-full sm:w-auto px-8 py-4 rounded-xl bg-teal-600 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-400 text-white font-semibold text-lg shadow-lg shadow-teal-600/20 transition-all duration-75 hover:scale-105 active:scale-95 flex items-center justify-center gap-2 hover-glow font-baloo">
                      {content.hero?.cta_primary || DEFAULT_CONTENT.hero.cta_primary}
                      <ArrowRight className="w-5 h-5" />
                    </Link>
                    <Link href="/signup" className="w-full sm:w-auto px-8 py-4 rounded-xl border-2 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-semibold text-lg hover:border-teal-500 dark:hover:border-teal-400 hover:text-teal-600 dark:hover:text-teal-400 transition-all duration-75 hover:scale-105 active:scale-95 font-baloo hover-lift">
                      {content.hero?.cta_secondary || DEFAULT_CONTENT.hero.cta_secondary}
                    </Link>
                    <ScrollToEnrollButton variant="hero-plain" />
                  </div>
                </div>
              </section>
            )

          case 'exams':
            return (
              <section key="exams" className="py-16 bg-slate-200/50 dark:bg-slate-800/50">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                  <ScrollRevealClient>
                    <div className="text-center mb-12">
                      <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 mb-3">
                        {content.exams_section?.title || DEFAULT_CONTENT.exams_section.title}
                      </h2>
                      <p className="text-slate-600 dark:text-slate-400">
                        {content.exams_section?.subtitle || DEFAULT_CONTENT.exams_section.subtitle}
                      </p>
                    </div>
                  </ScrollRevealClient>
                  {exams.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                      {exams.map((exam, index) => (
                        <ScrollRevealClient key={exam.id} delay={index * 80}>
                          <Link href="/login" className="group block bg-slate-200 dark:bg-slate-800 rounded-2xl p-6 border border-slate-300 dark:border-slate-700 hover:border-teal-500/60 dark:hover:border-teal-400/60 transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
                            <div className="flex items-start justify-between mb-4">
                              <div className="w-12 h-12 rounded-xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                                <BookOpen className="w-6 h-6 text-teal-600 dark:text-teal-400" />
                              </div>
                              <span className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                <Clock className="w-4 h-4" />
                                {exam.duration} phút
                              </span>
                            </div>
                            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">{exam.title}</h3>
                            <div className="flex items-center justify-between">
                              <p className="text-sm text-slate-500 dark:text-slate-400">{exam.subject || 'Toán học'}</p>
                              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-teal-500 group-hover:translate-x-1 transition-all duration-200" />
                            </div>
                          </Link>
                        </ScrollRevealClient>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 rounded-full bg-slate-300 dark:bg-slate-600 flex items-center justify-center mx-auto mb-4">
                        <BookOpen className="w-8 h-8 text-slate-500 dark:text-slate-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">Chưa có đề thi nào</h3>
                      <p className="text-slate-500 dark:text-slate-400">Hiện tại chưa có đề thi nào được xuất bản.</p>
                    </div>
                  )}
                </div>
              </section>
            )

          case 'gallery':
            return gallery.length > 0 ? (
              <GalleryGrid
                key="gallery"
                items={gallery}
                title={content.gallery_section?.title}
                subtitle={content.gallery_section?.subtitle}
              />
            ) : null

          case 'enrollment':
            return enrollment.length > 0 ? (
              <EnrollmentCarousel
                key="enrollment"
                slides={enrollment}
                title={content.enrollment_section?.title}
                subtitle={content.enrollment_section?.subtitle}
                interval={(content.enrollment_interval || 6) * 1000}
              />
            ) : null

          case 'posts':
            return <PostsSection key="posts" posts={recentPosts} />

          case 'benefits':
            return (
              <section key="benefits" className="py-20">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                  <ScrollRevealClient>
                    <div className="text-center mb-12">
                      <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 mb-3">
                        {content.benefits_section?.title || DEFAULT_CONTENT.benefits_section.title}
                      </h2>
                      <p className="text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
                        {content.benefits_section?.subtitle || DEFAULT_CONTENT.benefits_section.subtitle}
                      </p>
                    </div>
                  </ScrollRevealClient>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {(content.benefits || DEFAULT_CONTENT.benefits).map((benefit: any, index: number) => (
                      <ScrollRevealClient key={index} delay={index * 100}>
                        <div className="group bg-slate-200 dark:bg-slate-800 rounded-2xl p-6 border border-slate-300 dark:border-slate-700 h-full hover:border-teal-500/40 dark:hover:border-teal-400/40 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
                          <div className="w-12 h-12 rounded-xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-teal-200 dark:group-hover:bg-teal-900/50 transition-all duration-300">
                            <BenefitIcon icon={benefit.icon} className="w-6 h-6 text-teal-600 dark:text-teal-400" />
                          </div>
                          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2 group-hover:text-teal-700 dark:group-hover:text-teal-300 transition-colors">{benefit.title}</h3>
                          <p className="text-sm text-slate-600 dark:text-slate-400">{benefit.description}</p>
                        </div>
                      </ScrollRevealClient>
                    ))}
                  </div>
                </div>
              </section>
            )

          case 'videos':
            return videos.length > 0 ? (
              <VideoSection
                key="videos"
                videos={videos}
                title={content.videos_section?.title}
                subtitle={content.videos_section?.subtitle}
              />
            ) : null

          case 'enrollment_form':
            return (
              <EnrollmentFormSection
                key="enrollment_form"
                title={content.enrollment_form_section?.title}
                subtitle={content.enrollment_form_section?.subtitle}
              />
            )

          case 'cta':
            return (
              <section key="cta" className="py-20 bg-slate-200/50 dark:bg-slate-800/50 relative overflow-hidden">
                <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.02]" style={{backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)', backgroundSize: '32px 32px'}} />
                <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative">
                  <ScrollRevealClient>
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-sm font-medium mb-5">
                      <Sparkles className="w-4 h-4" />
                      {content.cta?.badge || DEFAULT_CONTENT.cta.badge}
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 mb-4">
                      {content.cta?.title || DEFAULT_CONTENT.cta.title}
                    </h2>
                    <p className="text-slate-600 dark:text-slate-400 mb-8">
                      {content.cta?.subtitle || DEFAULT_CONTENT.cta.subtitle}
                    </p>
                    <Link href="/signup" className="group inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 dark:from-teal-500 dark:to-teal-400 dark:hover:from-teal-400 dark:hover:to-teal-300 text-white font-semibold text-lg shadow-lg shadow-teal-600/25 dark:shadow-teal-500/20 hover:shadow-xl hover:shadow-teal-600/30 transition-all duration-300 hover:scale-[1.03] active:scale-[0.97]">
                      {content.cta?.button || DEFAULT_CONTENT.cta.button}
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-200" />
                    </Link>
                  </ScrollRevealClient>
                </div>
              </section>
            )

          default:
            return null
        }
      })}

      {/* Footer */}
      <footer className="py-8 border-t border-slate-300/50 dark:border-slate-700/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-600 to-teal-500 dark:from-teal-500 dark:to-teal-400 flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                <MinhMathLogo size={16} className="text-white" />
              </div>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                {content.brand?.name || DEFAULT_CONTENT.brand.name}
              </span>
            </Link>
            <div className="flex items-center gap-4">
              <a
                href="https://www.facebook.com/minhmath"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
                title="Facebook"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              </a>
              <a
                href="https://www.facebook.com/minhmath"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
                title="Fanpage"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z"/></svg>
              </a>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {content.brand?.copyright || DEFAULT_CONTENT.brand.copyright}
            </p>
          </div>
        </div>
      </footer>

      {/* Floating enrollment button + modal */}
      <EnrollmentFloatingButton />
    </div>
  )
}
