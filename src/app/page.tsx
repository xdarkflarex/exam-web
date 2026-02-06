import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { Sigma, BookOpen, Target, TrendingUp, Clock, Award, ArrowRight, CheckCircle } from 'lucide-react'
import ScrollRevealClient from '@/components/ScrollRevealClient'
import AnnouncementBanner from '@/components/AnnouncementBanner'

/**
 * Default content for landing page
 * Used when no content is found in site_settings
 */
const DEFAULT_CONTENT = {
  hero: {
    title: 'Nền tảng luyện thi Toán THPT',
    subtitle: 'Luyện đề – phân tích – cải thiện điểm số một cách hiệu quả',
    cta_primary: 'Đăng nhập',
    cta_secondary: 'Bắt đầu ngay',
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
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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
      .in('key', ['landing.hero', 'landing.benefits', 'landing.config'])
    
    if (!settings || settings.length === 0) {
      return DEFAULT_CONTENT
    }
    
    const hero = settings.find(s => s.key === 'landing.hero')?.value || DEFAULT_CONTENT.hero
    const benefits = settings.find(s => s.key === 'landing.benefits')?.value || DEFAULT_CONTENT.benefits
    const config = settings.find(s => s.key === 'landing.config')?.value || DEFAULT_CONTENT.config
    
    return { hero, benefits, config }
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
  const content = await getLandingContent()
  const showExams = content.config?.show_featured_exams ?? true
  const exams = showExams ? await getFeaturedExams(content.config?.featured_exams_count || 6) : []

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 transition-colors">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-200/90 dark:bg-slate-800/90 backdrop-blur-lg border-b border-slate-300/50 dark:border-slate-700/50 shadow-lg shadow-slate-200/20 dark:shadow-slate-900/20 fade-in">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 hover-scale">
              <div className="w-10 h-10 rounded-xl bg-teal-600 dark:bg-teal-500 flex items-center justify-center shadow-lg shadow-teal-600/20 hover-glow">
                <Sigma className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold text-slate-800 dark:text-slate-100 font-baloo">
                ExamHub
              </span>
            </Link>
            
            {/* Navigation */}
            <nav className="flex items-center gap-3">
              <Link
                href="/login"
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-400 transition-all duration-75 hover-scale"
              >
                Đăng nhập
              </Link>
              <Link
                href="/signup"
                className="btn-secondary micro-bounce-on-hover"
              >
                Đăng ký
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Announcement Banner */}
      <AnnouncementBanner />

      {/* Hero Section */}
      <section className="py-20 sm:py-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-sm font-medium mb-6 slide-in-up">
            <Sigma className="w-4 h-4" />
            Luyện thi Toán THPT
          </div>
          
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-800 dark:text-slate-100 leading-tight mb-6 font-baloo slide-in-up" style={{animationDelay: '0.1s'}}>
            {content.hero?.title || DEFAULT_CONTENT.hero.title}
          </h1>
          
          <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mb-10 slide-in-up" style={{animationDelay: '0.2s'}}>
            {content.hero?.subtitle || DEFAULT_CONTENT.hero.subtitle}
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 slide-in-up" style={{animationDelay: '0.3s'}}>
            <Link
              href="/login"
              className="w-full sm:w-auto px-8 py-4 rounded-xl bg-teal-600 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-400 text-white font-semibold text-lg shadow-lg shadow-teal-600/20 transition-all duration-75 hover:scale-105 active:scale-95 flex items-center justify-center gap-2 hover-glow font-baloo"
            >
              {content.hero?.cta_primary || DEFAULT_CONTENT.hero.cta_primary}
              <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/signup"
              className="w-full sm:w-auto px-8 py-4 rounded-xl border-2 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-semibold text-lg hover:border-teal-500 dark:hover:border-teal-400 hover:text-teal-600 dark:hover:text-teal-400 transition-all duration-75 hover:scale-105 active:scale-95 font-baloo hover-lift"
            >
              {content.hero?.cta_secondary || DEFAULT_CONTENT.hero.cta_secondary}
            </Link>
          </div>
        </div>
      </section>

      {/* Featured Exams Section */}
      <section className="py-16 bg-slate-200/50 dark:bg-slate-800/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <ScrollRevealClient>
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 mb-3">
                Đề thi có sẵn
              </h2>
              <p className="text-slate-600 dark:text-slate-400">
                Đăng nhập để làm bài và xem kết quả chi tiết
              </p>
            </div>
          </ScrollRevealClient>
          
          {exams.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {exams.map((exam) => (
                <Link
                  key={exam.id}
                  href="/login"
                  className="group bg-slate-200 dark:bg-slate-800 rounded-2xl p-6 border border-slate-300 dark:border-slate-700 hover:border-teal-500 dark:hover:border-teal-400 transition-all hover:shadow-lg"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                      <BookOpen className="w-6 h-6 text-teal-600 dark:text-teal-400" />
                    </div>
                    <span className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {exam.duration} phút
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                    {exam.title}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {exam.subject || 'Toán học'}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-slate-300 dark:bg-slate-600 flex items-center justify-center mx-auto mb-4">
                <BookOpen className="w-8 h-8 text-slate-500 dark:text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Chưa có đề thi nào
              </h3>
              <p className="text-slate-500 dark:text-slate-400">
                Hiện tại chưa có đề thi nào được xuất bản.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <ScrollRevealClient>
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 mb-3">
                Tại sao chọn ExamHub?
              </h2>
              <p className="text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
                Nền tảng luyện thi trực tuyến hiện đại, giúp bạn chuẩn bị tốt nhất cho kỳ thi
              </p>
            </div>
          </ScrollRevealClient>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {(content.benefits || DEFAULT_CONTENT.benefits).map((benefit: any, index: number) => (
              <ScrollRevealClient key={index} delay={index * 100}>
                <div className="bg-slate-200 dark:bg-slate-800 rounded-2xl p-6 border border-slate-300 dark:border-slate-700 h-full">
                  <div className="w-12 h-12 rounded-xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center mb-4">
                    <BenefitIcon icon={benefit.icon} className="w-6 h-6 text-teal-600 dark:text-teal-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">
                    {benefit.title}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {benefit.description}
                  </p>
                </div>
              </ScrollRevealClient>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-20 bg-slate-200/50 dark:bg-slate-800/50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <ScrollRevealClient>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 mb-4">
              Sẵn sàng nâng cao điểm số?
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-8">
              Tham gia cùng hàng nghìn học sinh đang luyện thi trên ExamHub
            </p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-teal-600 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-400 text-white font-semibold text-lg shadow-lg shadow-teal-600/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              Đăng ký miễn phí
              <ArrowRight className="w-5 h-5" />
            </Link>
          </ScrollRevealClient>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-slate-300 dark:border-slate-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-teal-600 dark:bg-teal-500 flex items-center justify-center">
                <Sigma className="w-4 h-4 text-white" />
              </div>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                ExamHub
              </span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              © {new Date().getFullYear()} ExamHub. Powered by Gemini AI 2.0
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
