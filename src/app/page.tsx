import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { BookOpen, Target, TrendingUp, Clock, Award, ArrowRight, CheckCircle, Sparkles, ListOrdered } from 'lucide-react'
import ScrollRevealClient from '@/components/ScrollRevealClient'
import AnnouncementBanner from '@/components/AnnouncementBanner'
import MinhMathLogo from '@/components/MinhMathLogo'
import ImageCarousel from '@/components/ImageCarousel'
import EnrollmentCarousel from '@/components/EnrollmentCarousel'
import GalleryGrid from '@/components/GalleryGrid'
import VideoSection from '@/components/VideoSection'
import LandingHeader from '@/components/landing/LandingHeader'
import LandingFooter from '@/components/landing/LandingFooter'
import StatsStrip, { type LandingStats } from '@/components/landing/StatsStrip'
import QuickAccessGrid from '@/components/landing/QuickAccessGrid'
import KnowledgeTopicsGrid from '@/components/landing/KnowledgeTopicsGrid'
import PostsSection from '@/components/PostsSection'
import EnrollmentFormSection from '@/components/EnrollmentFormSection'
import EnrollmentFloatingButton from '@/components/EnrollmentFloatingButton'
import HeroActions from '@/components/landing/HeroActions'
import HeroParallax from '@/components/landing/HeroParallax'
import { surfaceClass, type SectionSurface } from '@/components/landing/sectionSurface'

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
 * Kiểm tra người dùng hiện tại đã đăng nhập chưa.
 *
 * Dùng `createServerClient` (@supabase/ssr) để đọc cookie session — khác với
 * `createPublicSupabaseClient()` ở trên vốn luôn ở mức anon. Chỉ cần biết
 * "có session hay không" để bỏ nhãn "Cần đăng nhập" ở lưới truy cập nhanh;
 * KHÔNG đọc profile/email/lớp của học sinh và không dùng để nới quyền dữ liệu.
 *
 * Trang này đã `force-dynamic` nên việc đọc cookie không làm mất cache.
 */
async function getIsAuthenticated() {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          // Landing page là Server Component: không được ghi cookie ở đây.
          // Việc refresh session do middleware lo.
          set() {},
          remove() {},
        },
      }
    )
    const { data: { user } } = await supabase.auth.getUser()
    return Boolean(user)
  } catch {
    return false
  }
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
 *
 * Kèm `question_count` để card đề hiển thị số câu thật. Đếm bằng
 * `count: 'exact', head: true` nên không tải nội dung câu hỏi nào về client.
 * Nếu anon không đọc được `exam_questions` (RLS) thì count = 0 và card ẩn dòng đó.
 */
async function getFeaturedExams(count: number = 6) {
  try {
    const supabase = createPublicSupabaseClient()

    const { data: exams } = await supabase
      .from('exams')
      .select('id, title, subject, duration')
      .eq('is_published', true)
      .eq('exam_mode', 'simulation')
      .order('created_at', { ascending: false })
      .limit(count)

    if (!exams || exams.length === 0) return []

    return await Promise.all(
      exams.map(async exam => {
        try {
          const { count: questionCount } = await supabase
            .from('exam_questions')
            .select('id', { count: 'exact', head: true })
            .eq('exam_id', exam.id)
          return { ...exam, question_count: questionCount || 0 }
        } catch {
          return { ...exam, question_count: 0 }
        }
      })
    )
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
 * Đếm số liệu công khai cho dải thống kê dưới hero.
 *
 * Dùng `head: true` + `count: 'exact'` nên chỉ lấy con số, không tải hàng nào về.
 * Bảng nào anon không đọc được (RLS) thì trả 0 và ô đó tự bị ẩn ở `StatsStrip`
 * — không hiển thị số bịa.
 */
async function getLandingStats(): Promise<LandingStats> {
  const empty: LandingStats = { exams: 0, theories: 0, posts: 0, topics: 0 }
  try {
    const supabase = createPublicSupabaseClient()

    /** Điều kiện "đã công khai" của từng bảng; bảng không có cột thì bỏ trống. */
    const publishedFilter: Record<string, { column: string; value: unknown } | null> = {
      exams: { column: 'is_published', value: true },
      theories: { column: 'is_published', value: true },
      posts: { column: 'status', value: 'published' },
      topics: null,
    }

    const countOf = async (table: keyof typeof publishedFilter) => {
      try {
        let query = supabase.from(table).select('id', { count: 'exact', head: true })
        const filter = publishedFilter[table]
        if (filter) query = query.eq(filter.column, filter.value)
        const { count } = await query
        return count || 0
      } catch {
        return 0
      }
    }

    const [exams, theories, posts, topics] = await Promise.all([
      countOf('exams'),
      countOf('theories'),
      countOf('posts'),
      countOf('topics'),
    ])
    return { exams, theories, posts, topics }
  } catch {
    return empty
  }
}

/**
 * Danh sách chuyên mục kiến thức công khai (bảng `topics`).
 * Rỗng khi anon không có quyền đọc — section sẽ tự ẩn.
 */
async function getKnowledgeTopics(count: number = 12) {
  try {
    const supabase = createPublicSupabaseClient()
    const { data } = await supabase
      .from('topics')
      .select('id, name')
      .order('order_index')
      .limit(count)
    return data || []
  } catch {
    return []
  }
}

/**
 * Bảng màu xoay vòng cho khối "Lợi ích".
 *
 * Bốn tông đều đã có trong `docs/DESIGN_SYSTEM.md` mục "Màu trạng thái" — đây
 * KHÔNG phải hệ màu thứ ba, chỉ là dùng lại phần bảng màu vốn bị bỏ không trên
 * trang chủ (trước đây mọi thứ đều teal).
 *
 * Lưu ý: đây là trang trí trên trang giới thiệu, không truyền đạt trạng thái.
 * Không tái dùng bảng này cho badge đúng/sai hay chip trạng thái trong app —
 * ở đó màu phải mang nghĩa và phải đi kèm icon/chữ.
 */
const BENEFIT_TONES = [
  { tile: 'bg-teal-100 dark:bg-teal-900/30', icon: 'text-teal-700 dark:text-teal-300', rule: 'bg-teal-500' },
  { tile: 'bg-indigo-100 dark:bg-indigo-900/30', icon: 'text-indigo-700 dark:text-indigo-300', rule: 'bg-indigo-500' },
  { tile: 'bg-amber-100 dark:bg-amber-900/30', icon: 'text-amber-700 dark:text-amber-300', rule: 'bg-amber-500' },
  { tile: 'bg-emerald-100 dark:bg-emerald-900/30', icon: 'text-emerald-700 dark:text-emerald-300', rule: 'bg-emerald-500' },
] as const

/**
 * Màu dải bên trái của card đề (`--rail` của `.bento-rail`).
 *
 * Dùng thang 500 chứ không phải 600/700: dải chỉ rộng 4px và phải đọc được
 * trên CẢ nền card sáng (#f7f9fc) lẫn nền card tối (#1e293b). Đây là trang trí
 * phân loại, không phải chữ, nên không thuộc diện phải đạt ngưỡng tương phản
 * WCAG cho text.
 *
 * Vì sao băm tên môn thay vì bảng tra cứng: `exams.subject` là chuỗi tự do do
 * giáo viên nhập, không phải enum. Bảng tra cứng sẽ trả về màu mặc định cho mọi
 * môn chưa liệt kê, tức là mọi đề lại cùng một màu — đúng cái đang cần chữa.
 * Băm cho kết quả TẤT ĐỊNH nên server và client vẽ ra cùng một màu, không lệch
 * hydration.
 */
const EXAM_RAILS = ['#14b8a6', '#6366f1', '#f59e0b', '#10b981'] as const

function examRail(subject?: string | null): string {
  const key = (subject || '').trim()
  if (!key) return EXAM_RAILS[0]
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) % 1000003
  }
  return EXAM_RAILS[hash % EXAM_RAILS.length]
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
export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const query = (q || '').trim()

  const content = await getLandingContent() as any
  const showExams = content.config?.show_featured_exams ?? true
  const [allExams, recentPosts, stats, knowledgeTopics, isAuthenticated] = await Promise.all([
    showExams ? getFeaturedExams(content.config?.featured_exams_count || 6) : Promise.resolve([]),
    getRecentPosts(6),
    getLandingStats(),
    getKnowledgeTopics(12),
    getIsAuthenticated(),
  ])

  // Lọc phía client-render trên đúng danh sách đề public đã lấy về.
  // Không mở route search mới nên không thêm bề mặt dữ liệu nào.
  const normalize = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd')
  const needle = normalize(query)
  const exams = needle
    ? allExams.filter(e =>
        normalize(`${e.title || ''} ${e.subject || ''}`).includes(needle)
      )
    : allExams

  const heroSlides = content.hero_slides || []
  const enrollment = content.enrollment || []
  const gallery = content.gallery || []
  const videos = content.videos || []

  const defaultSectionsOrder = [
    { id: 'hero', label: 'Hero Carousel', visible: true },
    { id: 'stats', label: 'Số liệu nền tảng', visible: true },
    { id: 'quick_access', label: 'Truy cập nhanh', visible: true },
    { id: 'exams', label: 'Đề thi nổi bật', visible: true },
    { id: 'knowledge_topics', label: 'Chuyên mục kiến thức', visible: true },
    { id: 'gallery', label: 'Thư viện ảnh', visible: true },
    { id: 'enrollment', label: 'Tuyển sinh & Lịch khai giảng', visible: true },
    { id: 'posts', label: 'Bài viết mới nhất', visible: true },
    { id: 'benefits', label: 'Lợi ích', visible: true },
    { id: 'videos', label: 'Video giới thiệu', visible: true },
    { id: 'enrollment_form', label: 'Form đăng ký học', visible: true },
    { id: 'cta', label: 'Kêu gọi hành động', visible: true },
  ]
  const rawConfig = content.sections_config || defaultSectionsOrder
  // Config admin đã lưu có thể thiếu section mới. Chèn section thiếu vào ngay
  // sau "người láng giềng đứng trước" của nó trong thứ tự mặc định, thay vì dồn
  // hết xuống cuối trang. Thứ tự admin đã tự sắp cho các section cũ giữ nguyên.
  const presentIds = new Set(rawConfig.map((s: any) => s.id))
  const sectionsConfig = [...rawConfig]
  for (const missing of defaultSectionsOrder) {
    if (presentIds.has(missing.id)) continue
    const defaultIndex = defaultSectionsOrder.findIndex(s => s.id === missing.id)
    let insertAt = sectionsConfig.length
    for (let i = defaultIndex - 1; i >= 0; i--) {
      const anchor = sectionsConfig.findIndex(s => s.id === defaultSectionsOrder[i].id)
      if (anchor !== -1) {
        insertAt = anchor + 1
        break
      }
    }
    sectionsConfig.splice(insertAt, 0, { ...missing })
    presentIds.add(missing.id)
  }
  const visibleSections = sectionsConfig.filter((s: any) => s.visible)

  /*
    NHỊP NỀN GIỮA CÁC SECTION

    Trang cũ chỉ có hai trạng thái nền — "trong suốt" và `bg-slate-200/50` — và
    chúng được gán CỨNG cho từng section. Hệ quả: `exams`, `knowledge_topics`,
    `gallery` đứng liền nhau và cùng có nền, nên ba khối dính thành một mảng
    phẳng dài; còn `benefits` và `videos` liền nhau thì cùng trong suốt.

    Nền phải tính theo VỊ TRÍ THỰC TẾ, vì hai thứ đều động: admin sắp lại thứ tự
    qua `landing.sections_config`, và section không có dữ liệu thì tự ẩn. Nếu
    chỉ đếm theo `visibleSections` thì một section ẩn sẽ làm hai section cạnh
    nhau nhận cùng một nền — nên `willRender` phải lặp lại đúng điều kiện ẩn của
    từng section bên dưới.

    Hero luôn `plain`: nó đã có `.hero-gradient` riêng, chồng thêm nền xen kẽ chỉ
    làm bẩn.
  */
  const willRender = (id: string): boolean => {
    switch (id) {
      case 'stats':
        return stats.exams > 0 || stats.topics > 0 || stats.theories > 0 || stats.posts > 0
      case 'knowledge_topics':
        return knowledgeTopics.length > 0
      case 'gallery':
        return gallery.length > 0
      case 'enrollment':
        return enrollment.length > 0
      case 'posts':
        return recentPosts.length > 0
      case 'videos':
        return videos.length > 0
      default:
        return true
    }
  }

  const surfaces = new Map<string, SectionSurface>()
  // Bắt đầu bằng `alt` để section ngay dưới hero tách hẳn khỏi nền gradient của
  // hero. Nếu bắt đầu bằng `plain` thì hero và section kế nó cùng chìm vào nền
  // trang, và nhịp xen kẽ mất đúng cái tương phản đầu tiên mà người cuộn thấy.
  let nextIsAlt = true
  for (const sec of visibleSections) {
    if (!willRender(sec.id)) continue
    if (sec.id === 'hero') {
      surfaces.set(sec.id, 'plain')
      continue
    }
    surfaces.set(sec.id, nextIsAlt ? 'alt' : 'plain')
    nextIsAlt = !nextIsAlt
  }
  const sectionSurface = (id: string): SectionSurface => surfaces.get(id) ?? 'plain'

  /*
    ĐỘ TRẢI CỦA Ô ĐỀ DẪN DẮT

    Lưới đề ở `lg` có 3 cột. Ô dẫn dắt luôn rộng 2 cột, nhưng nó cao 1 hay 2
    hàng — hay trải hết 3 cột — phải phụ thuộc SỐ ĐỀ, nếu không hàng cuối sẽ thủng
    một lỗ. Số đề không cố định: admin đặt `featured_exams_count`, và ô tìm kiếm
    ở header còn lọc bớt danh sách này.

    Đếm ô nhỏ còn lại là `n - 1`, và ô dẫn dắt chừa lại:
      - `n % 3 === 1`  -> trải hết 3 cột, `n - 1` ô nhỏ chia đúng thành các hàng 3.
      - `n % 3 === 0`  -> cao 2 hàng, chừa 2 ô ở cột 3; `n - 3` ô còn lại chia hết cho 3.
      - `n % 3 === 2`  -> cao 1 hàng, chừa 1 ô ở cột 3; `n - 2` ô còn lại chia hết cho 3.
    Cả ba nhánh đều lấp kín, với mọi `n >= 1`.
  */
  const examLeadSpan =
    exams.length % 3 === 1
      ? 'sm:col-span-2 lg:col-span-3'
      : exams.length % 3 === 0
        ? 'sm:col-span-2 lg:col-span-2 lg:row-span-2'
        : 'sm:col-span-2 lg:col-span-2'

  /*
    Ở `sm` lưới chỉ có 2 cột và ô dẫn dắt chiếm cả hai, nên số ô nhỏ phải CHẴN
    mới lấp kín. Khi nó lẻ, ô cuối trải hai cột — ở `lg` trả lại 1 cột.
  */
  const examTailSpansTwoOnSm = exams.length > 1 && (exams.length - 1) % 2 === 1

  /*
    Khi ô dẫn dắt trải hết 3 cột (nhánh `n % 3 === 1`) nó rộng gần 1100px. Xếp
    dọc ở bề rộng đó thì tiêu đề một dòng nằm chơ vơ và nửa phải bỏ trống — nên
    ở nhánh này nội dung xếp NGANG: tên đề bên trái, thông số + nút bên phải.
    Hai nhánh còn lại ô chỉ rộng 2/3 lưới, xếp dọc vẫn kín.
  */
  const examLeadIsWide = exams.length % 3 === 1

  return (
    /*
      Nền trang KHÔNG đặt bằng utility nữa. `globals.css` đã đặt
      `html, body { background-color: var(--background) }`, và `--background`
      (#eef1f6) là giá trị đã hiệu chỉnh để bớt chói — đè `bg-slate-100`
      (#f1f5f9) lên trên chỉ làm mất công hiệu chỉnh đó. Xem
      `docs/DESIGN_TODO.md` mục 0 bất biến 2 và mục 4.
    */
    <div className="min-h-screen transition-colors">
      {/* Header */}
      <LandingHeader
        brandName={content.brand?.name || DEFAULT_CONTENT.brand.name}
        hotline={content.brand?.hotline}
        initialQuery={query}
      />

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
                      <MinhMathLogo size={22} />
                      {content.hero?.badge || DEFAULT_CONTENT.hero.badge}
                    </div>
                    <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6 font-baloo drop-shadow-lg">
                      {content.hero?.title || DEFAULT_CONTENT.hero.title}
                    </h1>
                    <p className="text-lg sm:text-xl text-white/90 max-w-2xl mx-auto mb-10 drop-shadow">
                      {content.hero?.subtitle || DEFAULT_CONTENT.hero.subtitle}
                    </p>
                    <HeroActions
                      isAuthenticated={isAuthenticated}
                      ctaPrimary={content.hero?.cta_primary || DEFAULT_CONTENT.hero.cta_primary}
                      ctaSecondary={content.hero?.cta_secondary || DEFAULT_CONTENT.hero.cta_secondary}
                      variant="slide"
                    />
                  </div>
                </ImageCarousel>
              </section>
            ) : (
              <section key="hero" className="relative overflow-hidden hero-gradient py-20 sm:py-28">
                {/* Trang trí: ký hiệu toán trôi chậm + quầng sáng mờ.
                    aria-hidden + pointer-events-none để không lọt vào a11y tree
                    hay chắn click. Chuyển động bị tắt bởi prefers-reduced-motion. */}
                <HeroParallax className="absolute inset-0 pointer-events-none overflow-hidden">
                  <span className="absolute top-[18%] left-[8%] text-6xl sm:text-8xl font-serif text-teal-600/15 dark:text-teal-400/15 float-slow">∫</span>
                  <span className="absolute top-[30%] right-[12%] text-5xl sm:text-7xl font-serif text-teal-600/10 dark:text-teal-400/10 float-slow-delay-1">π</span>
                  <span className="absolute bottom-[18%] left-[20%] text-5xl sm:text-7xl font-serif text-amber-500/10 float-slow-delay-2">∑</span>
                  <span className="absolute top-[50%] right-[26%] text-6xl sm:text-8xl font-serif text-teal-600/10 dark:text-teal-400/10 float-slow">√</span>
                  <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-teal-400/15 dark:bg-teal-500/10 blur-3xl" />
                  <div className="absolute -bottom-32 -left-24 w-96 h-96 rounded-full bg-amber-400/10 blur-3xl" />
                </HeroParallax>
                <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-200/80 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium mb-6 slide-in-up">
                    <span className="flex w-2 h-2 rounded-full bg-teal-500 animate-pulse" aria-hidden="true" />
                    <MinhMathLogo size={22} />
                    {content.hero?.badge || DEFAULT_CONTENT.hero.badge}
                  </div>
                  <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-800 dark:text-slate-100 leading-tight mb-6 font-baloo slide-in-up" style={{animationDelay: '0.1s'}}>
                    {content.hero?.title || DEFAULT_CONTENT.hero.title}
                  </h1>
                  <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mb-10 slide-in-up" style={{animationDelay: '0.2s'}}>
                    {content.hero?.subtitle || DEFAULT_CONTENT.hero.subtitle}
                  </p>
                  <div className="slide-in-up" style={{animationDelay: '0.3s'}}>
                    <HeroActions
                      isAuthenticated={isAuthenticated}
                      ctaPrimary={content.hero?.cta_primary || DEFAULT_CONTENT.hero.cta_primary}
                      ctaSecondary={content.hero?.cta_secondary || DEFAULT_CONTENT.hero.cta_secondary}
                      variant="plain"
                    />
                  </div>
                </div>
              </section>
            )

          case 'stats':
            return <StatsStrip key="stats" stats={stats} surface={sectionSurface('stats')} />

          case 'quick_access':
            return (
              <QuickAccessGrid
                key="quick_access"
                isAuthenticated={isAuthenticated}
                surface={sectionSurface('quick_access')}
              />
            )

          case 'knowledge_topics':
            return (
              <KnowledgeTopicsGrid
                key="knowledge_topics"
                items={knowledgeTopics}
                surface={sectionSurface('knowledge_topics')}
              />
            )

          case 'exams':
            return (
              <section
                key="exams"
                id="exams"
                className={`scroll-mt-32 py-16 ${surfaceClass(sectionSurface('exams'))}`}
              >
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                  <ScrollRevealClient>
                    <div className="text-center mb-12">
                      <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 mb-3 font-baloo">
                        {content.exams_section?.title || DEFAULT_CONTENT.exams_section.title}
                      </h2>
                      <p className="text-slate-600 dark:text-slate-400">
                        {content.exams_section?.subtitle || DEFAULT_CONTENT.exams_section.subtitle}
                      </p>
                    </div>
                  </ScrollRevealClient>
                  {exams.length > 0 ? (
                    /*
                      LƯỚI BENTO — không còn ba cột đều nhau.

                      Ô dẫn dắt to hơn, các đề sau nhỏ hơn. Nhưng "to hơn" phải
                      to theo cách LẤP KÍN lưới, nếu không thì bento chỉ đổi một
                      nhịp lặp lấy một lỗ trống ở hàng cuối. Số đề là dữ liệu
                      động (`featured_exams_count`, mặc định 6, và đề có thể bị
                      lọc bởi ô tìm kiếm), nên độ trải của ô dẫn dắt được suy ra
                      từ số đề — xem `examLeadSpan` ngay trên `return`.

                      Ô nhỏ cố ý BỎ HẲN ô icon teal `w-12 h-12` và nút "Làm bài
                      ngay" — đó chính là công thức đang lặp ở mọi khối khác của
                      trang. Việc phân loại chuyển sang dải màu 4px bên trái
                      (`.bento-rail`), rẻ hơn về thị giác và không đụng vào ngân
                      sách màu teal vốn để dành cho hành động.
                    */
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                      {/*
                        Đã đăng nhập thì vào thẳng trang chuẩn bị làm bài; chưa thì qua
                        /login. Trước đây luôn trỏ /login, nên học sinh đang có session
                        bấm "Làm bài ngay" sẽ bị middleware đẩy về /student (xem
                        src/middleware.ts:149) và không bao giờ tới được đề vừa bấm.
                      */}
                      <ScrollRevealClient className={examLeadSpan}>
                        <Link
                          href={isAuthenticated ? `/exam/prepare/${exams[0].id}` : '/login'}
                          className={`group relative flex h-full flex-col justify-between overflow-hidden bento-tile-lead p-6 sm:p-8 ${
                            examLeadIsWide ? 'lg:flex-row lg:items-center lg:gap-12' : ''
                          }`}
                        >
                          {/* Hoạ tiết giấy kẻ ô: card đề phải gợi cảm giác TỜ ĐỀ THI
                              chứ không phải card sản phẩm. Tương phản ~2% nên không
                              cạnh tranh với chữ đặt trên nó. */}
                          <span
                            className="paper-grid absolute inset-0 pointer-events-none"
                            aria-hidden="true"
                          />
                          <div className={`relative ${examLeadIsWide ? 'lg:flex-1' : ''}`}>
                            <div className="mb-4 flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-600 dark:bg-teal-500 px-3 py-1 text-xs font-bold text-white">
                                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                                Đề mới nhất
                              </span>
                              {exams[0].subject && (
                                <span className="rounded-full border border-slate-300 dark:border-slate-600 px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                                  {exams[0].subject}
                                </span>
                              )}
                            </div>
                            <h3 className="font-baloo text-2xl sm:text-3xl font-bold leading-snug text-slate-800 dark:text-slate-100 line-clamp-3 transition-colors group-hover:text-teal-700 dark:group-hover:text-teal-300">
                              {exams[0].title}
                            </h3>
                          </div>
                          <div className={`relative mt-8 ${examLeadIsWide ? 'lg:mt-0 lg:shrink-0' : ''}`}>
                            {/* Chỉ hiện dữ liệu thật đang có trong bảng `exams`. */}
                            <div className="mb-6 flex flex-wrap gap-x-10 gap-y-4">
                              <div>
                                <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                  Thời gian làm bài
                                </div>
                                <div className="mt-1 flex items-center gap-2 text-lg font-semibold text-slate-800 dark:text-slate-100">
                                  <Clock className="w-4 h-4 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                                  {exams[0].duration} phút
                                </div>
                              </div>
                              {exams[0].question_count > 0 && (
                                <div>
                                  <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    Số câu
                                  </div>
                                  <div className="mt-1 flex items-center gap-2 text-lg font-semibold text-slate-800 dark:text-slate-100">
                                    <ListOrdered className="w-4 h-4 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                                    {exams[0].question_count} câu
                                  </div>
                                </div>
                              )}
                            </div>
                            <span className="inline-flex items-center gap-2 rounded-xl bg-teal-600 dark:bg-teal-500 px-6 py-3 text-sm font-semibold text-white transition-colors duration-300 group-hover:bg-teal-700 dark:group-hover:bg-teal-400">
                              Làm bài ngay
                              <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                            </span>
                          </div>
                        </Link>
                      </ScrollRevealClient>

                      {exams.slice(1).map((exam, index) => (
                        <ScrollRevealClient
                          key={exam.id}
                          delay={(index + 1) * 70}
                          className={
                            examTailSpansTwoOnSm && index === exams.length - 2
                              ? 'sm:col-span-2 lg:col-span-1'
                              : ''
                          }
                        >
                          <Link
                            href={isAuthenticated ? `/exam/prepare/${exam.id}` : '/login'}
                            className="group bento-tile flex h-full flex-col py-4 pl-6 pr-4 bento-rail"
                            style={{ '--rail': examRail(exam.subject) } as React.CSSProperties}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <h3 className="text-base font-semibold leading-snug text-slate-800 dark:text-slate-100 line-clamp-2 transition-colors group-hover:text-teal-700 dark:group-hover:text-teal-300">
                                {exam.title}
                              </h3>
                              <ArrowRight
                                className="mt-0.5 w-4 h-4 shrink-0 text-slate-400 transition-all duration-200 group-hover:translate-x-1 group-hover:text-teal-600 dark:group-hover:text-teal-400"
                                aria-hidden="true"
                              />
                            </div>
                            <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-4 text-xs text-slate-500 dark:text-slate-400">
                              {exam.subject && (
                                <span className="font-semibold text-slate-600 dark:text-slate-300">
                                  {exam.subject}
                                </span>
                              )}
                              <span className="inline-flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                                {exam.duration} phút
                              </span>
                              {exam.question_count > 0 && (
                                <span className="inline-flex items-center gap-1.5">
                                  <ListOrdered className="w-3.5 h-3.5" aria-hidden="true" />
                                  {exam.question_count} câu
                                </span>
                              )}
                            </div>
                          </Link>
                        </ScrollRevealClient>
                      ))}
                    </div>
                  ) : query ? (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 rounded-full bg-slate-300 dark:bg-slate-600 flex items-center justify-center mx-auto mb-4">
                        <BookOpen className="w-8 h-8 text-slate-500 dark:text-slate-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">
                        Không tìm thấy đề thi phù hợp
                      </h3>
                      <p className="text-slate-500 dark:text-slate-400 mb-6">
                        Không có đề nào khớp với &ldquo;{query}&rdquo; trong danh sách đề nổi bật.
                      </p>
                      <Link
                        href="/"
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-teal-700 dark:text-teal-300 bg-teal-100 dark:bg-teal-900/30 hover:bg-teal-200 dark:hover:bg-teal-900/50 transition-colors"
                      >
                        Xem tất cả đề thi
                      </Link>
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
                surface={sectionSurface('gallery')}
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
                surface={sectionSurface('enrollment')}
              />
            ) : null

          case 'posts':
            return (
              <PostsSection
                key="posts"
                posts={recentPosts}
                surface={sectionSurface('posts')}
              />
            )

          case 'benefits':
            return (
              <section
                key="benefits"
                id="benefits"
                className={`scroll-mt-32 py-20 ${surfaceClass(sectionSurface('benefits'))}`}
              >
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                  <ScrollRevealClient>
                    <div className="text-center mb-12">
                      <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 mb-3 font-baloo">
                        {content.benefits_section?.title || DEFAULT_CONTENT.benefits_section.title}
                      </h2>
                      <p className="text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
                        {content.benefits_section?.subtitle || DEFAULT_CONTENT.benefits_section.subtitle}
                      </p>
                    </div>
                  </ScrollRevealClient>
                  {/*
                    Lợi ích KHÔNG dùng khung card.

                    Trước đây khối này dùng đúng công thức của card đề thi bên
                    trên (`bg-slate-200` + viền + `rounded-2xl` + ô icon teal
                    `w-12 h-12`), nên cuộn một mạch qua trang chủ là gặp 11 khối
                    gần như y hệt nhau. Đổi sang danh sách có số thứ tự lớn và
                    không viền để nó là một LOẠI ĐỐI TƯỢNG khác hẳn về hình,
                    không chỉ khác nội dung.

                    Màu icon xoay vòng qua bảng màu đã có trong DESIGN_SYSTEM.md
                    thay vì teal cho cả bốn. Đây là trang trí trên trang giới
                    thiệu, không mang nghĩa trạng thái — teal vẫn là màu duy nhất
                    của hành động, mọi nút CTA giữ nguyên teal.
                  */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-10">
                    {(content.benefits || DEFAULT_CONTENT.benefits).map((benefit: any, index: number) => {
                      const tone = BENEFIT_TONES[index % BENEFIT_TONES.length]
                      return (
                        <ScrollRevealClient key={index} delay={index * 100}>
                          <div className="group relative h-full pt-2">
                            <span
                              aria-hidden="true"
                              className="absolute -top-3 right-1 text-6xl font-bold leading-none text-slate-300/50 dark:text-slate-700/50 select-none font-baloo"
                            >
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            <div className={`relative w-12 h-12 rounded-2xl ${tone.tile} flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110`}>
                              <BenefitIcon icon={benefit.icon} className={`w-6 h-6 ${tone.icon}`} />
                            </div>
                            <h3 className="relative text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">
                              {benefit.title}
                            </h3>
                            <p className="relative text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                              {benefit.description}
                            </p>
                            <span className={`relative mt-4 block h-0.5 w-10 rounded-full ${tone.rule} transition-all duration-300 group-hover:w-16`} />
                          </div>
                        </ScrollRevealClient>
                      )
                    })}
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
                surface={sectionSurface('videos')}
              />
            ) : null

          case 'enrollment_form':
            return (
              <EnrollmentFormSection
                key="enrollment_form"
                title={content.enrollment_form_section?.title}
                subtitle={content.enrollment_form_section?.subtitle}
                surface={sectionSurface('enrollment_form')}
              />
            )

          case 'cta':
            return (
              /*
                Khối CTA giữ NGUYÊN nút gradient: theo
                `docs/DESIGN_OVERHAUL_2026-08-09.md` mục 2.3, mỗi trang chỉ được
                MỘT bề mặt gradient và nó thuộc về hành động quan trọng nhất.
                Gradient nền của `EnrollmentFormSection` đã bị gỡ chính vì lý do
                này, không phải vì nó xấu.
              */
              <section
                key="cta"
                className={`py-20 relative overflow-hidden ${surfaceClass(sectionSurface('cta'))}`}
              >
                <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.02]" style={{backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)', backgroundSize: '32px 32px'}} />
                <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative">
                  <ScrollRevealClient>
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-sm font-medium mb-5">
                      <Sparkles className="w-4 h-4" />
                      {content.cta?.badge || DEFAULT_CONTENT.cta.badge}
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 mb-4 font-baloo">
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

      {/*
        Footer. Hai link Facebook truyền `undefined` khi admin chưa nhập, để
        `LandingFooter` giữ mặc định — không hardcode URL ở hai nơi.
      */}
      <LandingFooter
        brandName={content.brand?.name || DEFAULT_CONTENT.brand.name}
        copyright={content.brand?.copyright || DEFAULT_CONTENT.brand.copyright}
        hotline={content.brand?.hotline}
        email={content.brand?.email}
        address={content.brand?.address}
        facebookUrl={content.brand?.facebook_page}
        teacherFacebookUrl={content.brand?.facebook_teacher}
      />

      {/* Floating enrollment button + modal */}
      <EnrollmentFloatingButton />
    </div>
  )
}
