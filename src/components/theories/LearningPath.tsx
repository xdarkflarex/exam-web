'use client'

/**
 * Chế độ "Lộ trình" — bản thi công Phase 3 của
 * docs/STUDENT_SKILL_TREE_REDESIGN.md mục 3.3.
 *
 * Bốn ràng buộc định hình toàn bộ file này:
 *
 * 1. MỘT MÔ HÌNH BỐ CỤC DUY NHẤT, không đổi theo dữ liệu. Chuyên đề là chặng
 *    (header dính), bài học xếp dọc theo `order_index` bên trong chặng. Không có
 *    nhánh nào chọn cách sắp xếp khác — bố cục bất biến là điều kiện để học sinh
 *    xây được bản đồ trong đầu, và đó là toàn bộ giá trị của một cây kỹ năng.
 *
 * 2. LỌC CHỈ LÀM MỜ VÀ CUỘN TỚI. Node không khớp vẫn được vẽ, vẫn tab tới được,
 *    chỉ giảm độ đậm. Bỏ node khỏi DOM khi lọc làm bố cục nhảy mỗi lần gõ phím.
 *
 * 3. KHÔNG DÙNG ReactFlow. Đây là DOM thường: heading thật, danh sách thật, nút
 *    thật. Nhờ vậy bàn phím và trình đọc màn hình chạy được mà không phải mô
 *    phỏng, và light mode là light mode thật chứ không phải một canvas ép tối.
 *
 * 4. MÀU LẤY THEO `mastery` (làm ĐÚNG bao nhiêu), KHÔNG theo `status`/`progress`
 *    (đã LÀM tới đâu). Dự án đã dính đúng lỗi trộn hai khái niệm này một lần
 *    rồi: node emerald ghi "Đã đạt 80%" trong khi học sinh sai toàn bộ. Xem mục
 *    2.1 và 7.1.
 */

import { useCallback, useEffect, useMemo, useRef, type CSSProperties } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  Flag,
  Hourglass,
  LockKeyhole,
  Route,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import {
  getMasteryStatusHint,
  getMasteryStatusLabel,
  type MasteryStatus,
} from '@/lib/analytics/knowledge-mastery'
import type { SkillTreeItem, SkillTreePrerequisite } from '@/components/theories/SkillTree'

interface StatusFace {
  Icon: LucideIcon
  /** Chip trạng thái. Luôn kèm chữ — trạng thái không bao giờ chỉ là màu. */
  chip: string
  /** Dải màu bên trái ô, truyền qua biến `--rail` của `.bento-rail`. */
  rail: string
  /** Viền chấm mốc trên trục dọc. */
  dot: string
}

/**
 * Sáu mức năng lực, mỗi mức một MÀU + một ICON + một CHỮ.
 *
 * Tông màu cố ý trùng `statusTone` của `/student/analytics` và `WeakAreas`:
 * cùng một trạng thái phải trông giống nhau ở mọi trang, nếu không học sinh
 * phải học lại bảng màu mỗi lần đổi trang. `stable` vì thế là xanh dương, chỉ
 * `mastered` mới là xanh lá.
 */
const STATUS_FACE: Record<MasteryStatus, StatusFace> = {
  no_data: {
    Icon: CircleDashed,
    chip: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200',
    rail: '#64748b',
    dot: 'border-slate-400 dark:border-slate-500',
  },
  collecting: {
    Icon: Hourglass,
    chip: 'border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200',
    rail: '#8b5cf6',
    dot: 'border-violet-500',
  },
  needs_work: {
    Icon: AlertTriangle,
    chip: 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200',
    rail: '#f43f5e',
    dot: 'border-rose-500',
  },
  building: {
    Icon: TrendingUp,
    chip: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
    rail: '#f59e0b',
    dot: 'border-amber-500',
  },
  stable: {
    Icon: CheckCircle2,
    chip: 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200',
    rail: '#3b82f6',
    dot: 'border-blue-500',
  },
  mastered: {
    Icon: Trophy,
    chip: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200',
    rail: '#10b981',
    dot: 'border-emerald-500',
  },
}

const DAY_MS = 86_400_000

function startOfDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
}

/**
 * Đếm theo NGÀY LỊCH, không theo số mili-giây chia 24 giờ.
 *
 * Hạn nộp lúc 23h hôm nay cách hiện tại 2 tiếng; chia cho một ngày rồi làm tròn
 * lên sẽ ra "còn 1 ngày" và hiển thị thành "hạn ngày mai" — sai đúng vào lúc
 * học sinh cần con số đó chính xác nhất.
 *
 * `now` được TRUYỀN VÀO chứ không đọc `Date.now()` tại chỗ: hàm thuần thì test
 * được, và quan trọng hơn là nó dùng đúng mốc thời gian mà `/learn` đã dùng để
 * đếm "bài tập đang mở". Hai chỗ tự đọc đồng hồ riêng sẽ mâu thuẫn nhau ngay
 * tại ranh giới hạn nộp — đúng lúc con số quan trọng nhất.
 */
export function formatDeadline(iso: string, now: number): { text: string; urgent: boolean } | null {
  const target = new Date(iso)
  if (Number.isNaN(target.getTime())) return null

  const date = target.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
  const days = Math.round((startOfDay(target) - startOfDay(new Date(now))) / DAY_MS)

  if (days < 0) return { text: `Quá hạn ${date}`, urgent: true }
  if (days === 0) return { text: `Hạn hôm nay, ${date}`, urgent: true }
  if (days === 1) return { text: `Hạn ngày mai, ${date}`, urgent: true }
  return { text: `Còn ${days} ngày — hạn ${date}`, urgent: days <= 3 }
}

interface NodeProps {
  item: SkillTreeItem
  selected: boolean
  /** Mốc thời gian dùng chung cho cả trang. `null` = chưa đọc được đồng hồ. */
  now: number | null
  onSelect: (item: SkillTreeItem) => void
  onJump: (prerequisiteId: string) => void
}

function PrerequisiteChip({
  prerequisite,
  onJump,
}: {
  prerequisite: SkillTreePrerequisite
  onJump: (prerequisiteId: string) => void
}) {
  const unmet = prerequisite.met === false

  return (
    <button
      type="button"
      // `relative z-10`: nằm TRÊN lớp phủ `after:` của nút tiêu đề, nếu không cú
      // bấm sẽ rơi vào lớp phủ và mở nhầm chính bài đang đứng.
      onClick={() => onJump(prerequisite.id)}
      className={`relative z-10 inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700 dark:focus-visible:outline-teal-400 ${
        unmet
          ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/50'
          : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
      }`}
      title={
        unmet
          ? `Nên học vững "${prerequisite.title}" trước — bấm để mở bài đó`
          : `Tiên quyết: "${prerequisite.title}" — bấm để mở bài đó`
      }
    >
      {unmet ? (
        <LockKeyhole className="h-3 w-3 shrink-0" aria-hidden="true" />
      ) : (
        <Route className="h-3 w-3 shrink-0" aria-hidden="true" />
      )}
      <span className="truncate">Cần: {prerequisite.title}</span>
    </button>
  )
}

function PathNode({ item, selected, now, onSelect, onJump }: NodeProps) {
  const face = STATUS_FACE[item.mastery]
  const StatusIcon = face.Icon
  const deadline = item.nextDeadline && now !== null ? formatDeadline(item.nextDeadline, now) : null
  const hasAccuracy = item.accuracy !== null && item.mastery !== 'no_data'
  const started = item.total > 0 && item.answered > 0

  /**
   * Chip tiên quyết gồm hai nhóm:
   *  - quan hệ CHÉO chuyên đề — thông tin mà chế độ này cố ý không vẽ bằng
   *    đường, vì đường chéo trên trục dọc là nguồn rối chính (mục 3.3);
   *  - mọi tiên quyết CHƯA VỮNG, kể cả cùng chuyên đề, vì đó là lời nhắc thứ tự.
   * Tiên quyết cùng chuyên đề và đã vững thì thứ tự dọc đã nói hộ rồi.
   */
  const chips = item.prerequisites.filter(
    (prerequisite) => prerequisite.group !== item.group || prerequisite.met === false
  )

  /*
   * Bài đang mở dùng `outline`, KHÔNG dùng `ring-*`.
   *
   * `.bento-tile` được khai báo ngoài mọi `@layer` trong `globals.css`, còn
   * utility của Tailwind nằm trong `@layer utilities` — CSS không phân lớp luôn
   * thắng CSS phân lớp, nên `box-shadow` của `.bento-tile` nuốt gọn `ring-2` và
   * viền chọn sẽ không bao giờ hiện. `outline` không bị `.bento-tile` đụng tới.
   */
  return (
    <article
      className={`bento-tile bento-rail relative py-3 pl-5 pr-4 ${
        item.matched ? '' : 'opacity-40 saturate-50'
      } ${selected ? 'outline outline-2 outline-teal-700 dark:outline-teal-400' : ''}`}
      style={{ '--rail': face.rail } as CSSProperties}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${face.chip}`}
          aria-hidden="true"
        >
          <StatusIcon className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <h4 className="text-base font-bold leading-snug text-slate-800 dark:text-slate-100">
            {/*
              Mẫu "stretched link": chỉ CHỮ nằm trong `<button>` (button chỉ nhận
              phrasing content), còn vùng bấm được kéo phủ cả thẻ bằng `after:`.
              Bọc cả thẻ trong `<button>` là HTML không hợp lệ — lỗi đã xảy ra ở
              `PostCard` và được sửa cùng cách.

              Vòng focus vẽ VÀO TRONG (`outline-offset` âm). `.bento-rail` đặt
              `overflow: hidden` để cắt dải màu bên trái, và cái đó cắt luôn phần
              tràn ra ngoài của con — vòng focus vẽ ra ngoài sẽ bị xén mất, tức
              là điều hướng bằng bàn phím không thấy mình đang ở đâu.
            */}
            <button
              type="button"
              onClick={() => onSelect(item)}
              aria-current={selected ? 'true' : undefined}
              className="text-left outline-none after:absolute after:inset-0 after:rounded-2xl hover:text-teal-700 focus-visible:after:outline-2 focus-visible:after:outline-teal-700 focus-visible:after:[outline-offset:-3px] focus-visible:after:[outline-style:solid] dark:hover:text-teal-300 dark:focus-visible:after:outline-teal-400"
            >
              {item.title}
            </button>
          </h4>

          {/* Trạng thái = màu + icon + CHỮ. Chữ luôn có mặt, không phụ thuộc màu. */}
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold ${face.chip}`}
            >
              <StatusIcon className="h-3 w-3" aria-hidden="true" />
              {getMasteryStatusLabel(item.mastery)}
            </span>
            {hasAccuracy && (
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                đúng {item.accuracy}%
              </span>
            )}
            <span className="text-slate-500 dark:text-slate-400">
              {getMasteryStatusHint(item.mastery)}
            </span>
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 pl-11 text-xs text-slate-600 dark:text-slate-300">
        {item.assignmentCount === 0 ? (
          <span className="inline-flex items-center gap-1.5">
            <ClipboardList className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            Chưa có bài tập được giao
          </span>
        ) : item.openAssignments > 0 ? (
          <span className="inline-flex items-center gap-1.5">
            <ClipboardList className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
            {item.openAssignments} bài tập đang mở
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <ClipboardList className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            {item.assignmentCount} bài tập — đã hết hạn nộp
          </span>
        )}

        {deadline && (
          <span
            className={`inline-flex items-center gap-1.5 font-medium ${
              deadline.urgent ? 'text-rose-700 dark:text-rose-300' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
            {deadline.text}
          </span>
        )}

        {/*
          Tiến độ làm bài là thông tin THỨ HAI (mục 3.1): có mặt, nhưng không
          quyết định màu của node. Chưa làm câu nào thì nói bằng chữ — không vẽ
          thanh 0% cho một việc chưa bắt đầu.
        */}
        {item.total > 0 &&
          (started ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="text-slate-500 dark:text-slate-400">Đã làm</span>
              <span
                className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={item.total}
                aria-valuenow={item.answered}
                aria-label={`Đã làm ${item.answered} trên ${item.total} câu`}
              >
                <span
                  className="block h-full rounded-full bg-slate-500 dark:bg-slate-400"
                  style={{ width: `${Math.min(100, Math.round((item.answered / item.total) * 100))}%` }}
                />
              </span>
              <span className="tabular-nums">
                {item.answered}/{item.total} câu
              </span>
            </span>
          ) : (
            <span className="text-slate-500 dark:text-slate-400">Chưa làm câu nào</span>
          ))}

        {item.pending > 0 && (
          <span className="text-slate-500 dark:text-slate-400">{item.pending} câu chờ chấm</span>
        )}
      </div>

      {(chips.length > 0 || item.openAssignments > 0 || item.assignmentCount === 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 pl-11">
          {chips.map((prerequisite) => (
            <PrerequisiteChip key={prerequisite.id} prerequisite={prerequisite} onJump={onJump} />
          ))}

          {item.openAssignments > 0 && item.nextAssignmentId ? (
            <Link
              href={`/homework/prepare/${item.nextAssignmentId}`}
              className="relative z-10 inline-flex items-center gap-1 rounded-full border border-teal-600/40 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800 transition-colors hover:bg-teal-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700 dark:border-teal-400/40 dark:bg-teal-950/50 dark:text-teal-200 dark:hover:bg-teal-900/60 dark:focus-visible:outline-teal-400"
            >
              Làm bài
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          ) : (
            /*
              Trạng thái rỗng (mục 3.3): CTA là "Đọc lý thuyết", và không có 0% ở
              đâu cả. Đây là nhãn của chính lớp phủ bấm được nên `pointer-events-none`
              — cú bấm rơi xuyên xuống nút tiêu đề, không cần một nút thứ hai.
            */
            <span className="pointer-events-none inline-flex items-center gap-1 rounded-full border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">
              <BookOpen className="h-3 w-3" aria-hidden="true" />
              Đọc lý thuyết
            </span>
          )}
        </div>
      )}
    </article>
  )
}

interface Props {
  items: SkillTreeItem[]
  selectedId?: string | null
  /** Có đang lọc/tìm kiếm không. CHỈ đổi hành vi cuộn, tuyệt đối không đổi bố cục. */
  filtering?: boolean
  /** Mốc thời gian dùng chung cho cả trang, xem `formatDeadline`. */
  now?: number | null
  onSelect: (item: SkillTreeItem) => void
}

export default function LearningPath({ items, selectedId, filtering = false, now = null, onSelect }: Props) {
  const nodeRefs = useRef(new Map<string, HTMLLIElement>())

  const registerNode = useCallback((id: string, element: HTMLLIElement | null) => {
    if (element) nodeRefs.current.set(id, element)
    else nodeRefs.current.delete(id)
  }, [])

  const revealNode = useCallback((id: string | null | undefined) => {
    if (!id) return
    const element = nodeRefs.current.get(id)
    if (!element) return
    // `block: 'nearest'` không làm gì khi node đã nằm trong khung nhìn, nên bộ
    // lọc không giật trang mỗi lần gõ thêm một ký tự. `scroll-mt-*` trên `<li>`
    // bù phần bị header dính che.
    element.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'nearest',
    })
  }, [])

  /**
   * Gom bài học thành chặng theo chuyên đề.
   *
   * Thứ tự chặng là thứ tự chuyên đề XUẤT HIỆN trong `items`, và thứ tự bài
   * trong chặng giữ nguyên thứ tự của `items` (page truy vấn theo `order_index`).
   * Không sắp xếp lại ở đây: bố cục phải chỉ phụ thuộc dữ liệu gốc, không phụ
   * thuộc bộ lọc đang bật.
   */
  const stages = useMemo(() => {
    const order: string[] = []
    const byGroup = new Map<string, SkillTreeItem[]>()

    for (const item of items) {
      const bucket = byGroup.get(item.group)
      if (bucket) {
        bucket.push(item)
      } else {
        byGroup.set(item.group, [item])
        order.push(item.group)
      }
    }

    return order.map((name) => {
      const list = byGroup.get(name) ?? []
      return {
        name,
        items: list,
        solid: list.filter((item) => item.mastery === 'stable' || item.mastery === 'mastered').length,
        weak: list.filter((item) => item.mastery === 'needs_work' || item.mastery === 'building').length,
        open: list.reduce((sum, item) => sum + item.openAssignments, 0),
        matched: list.filter((item) => item.matched).length,
      }
    })
  }, [items])

  const firstMatchId = useMemo(() => items.find((item) => item.matched)?.id ?? null, [items])

  const onJump = useCallback(
    (prerequisiteId: string) => {
      const target = items.find((item) => item.id === prerequisiteId)
      if (target) onSelect(target)
    },
    [items, onSelect]
  )

  // Bộ lọc: cuộn tới kết quả đầu tiên thay vì dựng lại danh sách.
  useEffect(() => {
    if (!filtering) return
    revealNode(firstMatchId)
  }, [filtering, firstMatchId, revealNode])

  // Deep-link `?theory=` (ví dụ từ "Mảng cần củng cố" ở `/student`) và mọi lần
  // đổi bài đang mở. `items.length` có mặt vì lần tải dữ liệu đầu tiên xảy ra
  // SAU khi `selectedId` đã được đặt từ query string.
  useEffect(() => {
    if (!items.length) return
    revealNode(selectedId)
  }, [items.length, revealNode, selectedId])

  if (!items.length) {
    return (
      <div className="bento-tile p-8 text-center">
        <Route className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
        <p className="mt-3 font-semibold text-slate-700 dark:text-slate-200">Chưa có bài học nào được phát hành</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Khi giáo viên phát hành lý thuyết, lộ trình sẽ hiện ở đây.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {stages.map((stage, stageIndex) => {
        const headingId = `stage-${stageIndex}`

        return (
          <section key={stage.name} aria-labelledby={headingId}>
            {/*
              Header dính. `top-14` khớp chiều cao thanh nav dính của
              `src/app/learn/layout.tsx` — đổi nav thì đổi cả số này.
            */}
            <div
              className="sticky top-14 z-20 -mx-2 mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-2 py-2.5 backdrop-blur"
              style={{ backgroundColor: 'var(--background-overlay)' }}
            >
              <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-600 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
                <Flag className="h-3 w-3" aria-hidden="true" />
                Chặng {stageIndex + 1}
              </span>
              <h3 id={headingId} className="text-lg font-bold text-slate-800 dark:text-slate-100">
                {stage.name}
              </h3>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                <span>{stage.items.length} bài</span>
                {stage.solid > 0 && (
                  <span className="text-emerald-700 dark:text-emerald-400">· {stage.solid} đã vững</span>
                )}
                {stage.weak > 0 && (
                  <span className="text-amber-700 dark:text-amber-400">· {stage.weak} cần củng cố</span>
                )}
                {stage.open > 0 && (
                  <span className="text-teal-700 dark:text-teal-400">· {stage.open} bài tập đang mở</span>
                )}
                {filtering && (
                  <span className="text-slate-500 dark:text-slate-400">· {stage.matched} bài khớp</span>
                )}
              </p>
            </div>

            {/*
              Trục dọc vẽ bằng MỘT phần tử của khung bao, không phải viền của
              `<ol>`: `<ol>` chỉ được chứa `<li>`, và một đường liền mạch dễ căn
              với chấm mốc hơn là ghép viền từng mục.
            */}
            <div className="relative">
              <span
                aria-hidden="true"
                className="absolute bottom-6 left-[7px] top-6 w-0.5 rounded bg-slate-200 dark:bg-slate-700"
              />
              <ol className="space-y-3 pl-8">
                {stage.items.map((item) => (
                  <li
                    key={item.id}
                    ref={(element) => {
                      registerNode(item.id, element)
                    }}
                    className="relative scroll-mt-32"
                  >
                    <span
                      aria-hidden="true"
                      className={`absolute -left-8 top-5 h-4 w-4 rounded-full border-[3px] bg-[var(--background)] ${
                        STATUS_FACE[item.mastery].dot
                      } ${item.matched ? '' : 'opacity-40'}`}
                    />
                    <PathNode
                      item={item}
                      selected={selectedId === item.id}
                      now={now}
                      onSelect={onSelect}
                      onJump={onJump}
                    />
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )
      })}
    </div>
  )
}
