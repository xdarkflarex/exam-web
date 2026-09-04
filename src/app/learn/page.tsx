'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import gsap from 'gsap'
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  ClipboardList,
  Loader2,
  LockKeyhole,
  Search,
  X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import MathContent, { MathProvider } from '@/components/MathContent'
import { getMasteryStatusLabel, isMasteryAchieved, type MasteryStat } from '@/lib/analytics/knowledge-mastery'
import { loadTheoryMastery, type TheoryAssignmentInfo, type TheoryProgress } from '@/lib/analytics/theory-mastery-data'
import LearningPath from '@/components/theories/LearningPath'
import TheoryStages from '@/components/theories/TheoryStages'
import type { KnowledgeBlock } from '@/types/theories'
import type {
  SkillTreeItem,
  SkillTreeLink,
  SkillTreePrerequisite,
} from '@/types/skill-tree'

interface TheoryRow {
  id: string
  title: string
  description: string | null
  content_md?: string | null
  difficulty_level: number
  /** Thứ tự bài TRONG CHƯƠNG (0..N mỗi chương), không phải thứ tự toàn cục. */
  order_index?: number | null
  section_id: string
  /* `order_index` của lớp và chương được lấy kèm để sắp lại ở client — xem
     khối chú thích ở chỗ `rows.sort(...)`. */
  sections?: {
    name: string
    categories?: {
      name: string
      order_index?: number | null
      topics?: { name: string; order_index?: number | null }
    }
  }
}
interface EdgeRow { from_theory_id: string; to_theory_id: string; relation_type: SkillTreeLink['relation'] }

/**
 * Chế độ Sơ đồ (ReactFlow) bị gỡ ngày 2026-08-11: node rộng 248px không đọc nổi
 * trên màn 375px, và đồ thị phẳng không nói được "học tới khâu nào" — hai trục
 * mà cây mới phải diễn đạt. Xem docs/DESIGN_OVERHAUL_2026-08-09.md mục 3b.
 * `/learn` giờ chỉ còn Lộ trình, nên không còn công tắc chế độ nào để nhớ.
 */

/**
 * Đồng hồ của trang, đọc bằng `useSyncExternalStore`.
 *
 * Thời gian là một hệ thống BÊN NGOÀI React: gọi `Date.now()` lúc render là hàm
 * không thuần, còn `setState` thẳng trong effect thì tạo lượt render dây chuyền
 * — `react-hooks/purity` và `react-hooks/set-state-in-effect` chặn cả hai, và
 * chặn đúng.
 *
 * Snapshot được GIỮ NGUYÊN giữa các lượt render và chỉ đọc lại khi tab quay về
 * tiền cảnh. Hai lý do: `getSnapshot` bắt buộc trả cùng một giá trị trong một
 * lượt render (gọi thẳng `Date.now()` ở đó làm React render vô hạn), và một mốc
 * thời gian đứng yên khiến mọi con số trên trang cùng nói về một thời điểm.
 */
let clockSnapshot: number | null = null

function subscribeToClock(onChange: () => void) {
  // Học sinh hay để tab mở qua đêm. Không đọc lại thì "còn 1 ngày" đứng nguyên
  // trong khi hạn đã trôi qua.
  const refresh = () => {
    if (document.visibilityState !== 'visible') return
    clockSnapshot = Date.now()
    onChange()
  }
  document.addEventListener('visibilitychange', refresh)
  return () => document.removeEventListener('visibilitychange', refresh)
}

function getClockSnapshot(): number | null {
  if (clockSnapshot === null) clockSnapshot = Date.now()
  return clockSnapshot
}

/** Server không có đồng hồ của người dùng; `null` nghĩa là "chưa đo được". */
function getClockServerSnapshot(): number | null {
  return null
}

/**
 * `useSearchParams()` bắt buộc phải nằm trong ranh giới `<Suspense>` — xem chú
 * thích cùng loại ở `src/app/(auth)/login/page.tsx`. Trang này đọc query để mở
 * sẵn một chủ đề, nên `fallback` chỉ cần một khung chờ.
 */
export default function LearnPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
        </div>
      }
    >
      <LearnPageContent />
    </Suspense>
  )
}

function LearnPageContent() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const searchParams = useSearchParams()
  const panelRef = useRef<HTMLElement>(null)
  const [theories, setTheories] = useState<TheoryRow[]>([])
  const [edges, setEdges] = useState<EdgeRow[]>([])
  const [progress, setProgress] = useState<Map<string, TheoryProgress>>(new Map())
  const [masteryByTheory, setMasteryByTheory] = useState<Map<string, MasteryStat>>(new Map())
  const [assignmentsByTheory, setAssignmentsByTheory] = useState<Map<string, TheoryAssignmentInfo[]>>(new Map())
  const [contentCache, setContentCache] = useState<Map<string, TheoryRow>>(new Map())
  const [blockCache, setBlockCache] = useState<Map<string, KnowledgeBlock[]>>(new Map())
  const [loadedGroups, setLoadedGroups] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('')
  /** Mốc thời gian dùng chung để phân loại bài tập còn hạn / hết hạn. */
  const now = useSyncExternalStore(subscribeToClock, getClockSnapshot, getClockServerSnapshot)
  const selectedId = searchParams.get('theory')
  const groupOf = useCallback((theory: TheoryRow) => theory.sections?.categories?.name || theory.sections?.name || 'Khác', [])

  /*
    LỚP của một bài, lấy từ `topics` — tầng trên cùng của cây tri thức
    (`topics` lớp -> `categories` chương -> `sections` bài).

    Trước khi có nó, trang này gom nhóm chỉ theo TÊN CHƯƠNG. Cả ba lớp đều có
    "Chương 1", nên 29 bài đổ ra thành tám chặng trong đó có ba chặng tên gần
    giống nhau và không dấu hiệu nào cho biết đang ở lớp nào.
  */
  const gradeOf = useCallback(
    (theory: TheoryRow) => theory.sections?.categories?.topics?.name || null,
    []
  )

  /*
    Lớp đang chọn nằm ở QUERY STRING, không ở state riêng.

    Trang này đã dùng `?theory=` cho bài đang mở, nên `?grade=` đi cùng chỗ là
    nhất quán. Đổi lại còn được ba thứ miễn phí: nút back của trình duyệt hoạt
    động đúng, đường dẫn chia sẻ được, và không cần `useEffect` đọc
    `localStorage` — cái mà `react-hooks/set-state-in-effect` cấm, và cấm có lý:
    đọc storage rồi `setState` là render một lần bằng giá trị sai rồi sửa lại, tức
    là nháy.
  */
  const grade = searchParams.get('grade') || ''
  const chooseGrade = useCallback((value: string) => {
    const next = new URLSearchParams(searchParams.toString())
    if (value) next.set('grade', value)
    else next.delete('grade')
    // Bỏ bài đang mở khi đổi lớp: bài đó gần như chắc chắn thuộc lớp vừa rời đi.
    next.delete('theory')
    const qs = next.toString()
    router.push(qs ? `/learn?${qs}` : '/learn', { scroll: false })
  }, [router, searchParams])

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const [theoryRes, edgeRes] = await Promise.all([
        supabase.from('theories').select('id, title, description, difficulty_level, order_index, section_id, sections(name, categories(name, order_index, topics(name, order_index)))').eq('is_published', true).order('order_index'),
        supabase.from('theory_edges').select('from_theory_id, to_theory_id, relation_type'),
      ])
      /*
        SẮP LẠI THEO LỚP → CHƯƠNG → BÀI.

        `.order('order_index')` của truy vấn sắp theo thứ tự bài TRONG CHƯƠNG, mà
        cột đó chạy 0..N ở mỗi chương — nên tất cả bài số 0 của tám chương đứng
        cạnh nhau, rồi đến tất cả bài số 1. Các chương bị trộn vào nhau, và vì
        các bài cùng `order_index` không có tiêu chí phá hòa nào nên thứ tự còn
        KHÔNG ỔN ĐỊNH giữa hai lần tải.

        Đo ngày 2026-09-04: bài đầu tiên học sinh nhìn thấy là "HÌNH HỌC THCS CẦN
        NHỚ" — phụ lục lớp 12 — rồi nhảy sang lớp 10, lớp 12, lớp 11.

        `topics.order_index` (110/111/112) và `categories.order_index` (1,2,3,90) đã
        được đặt đúng từ trước; trang này chỉ không đọc tới. Sắp ở client chứ
        không ở PostgREST vì `.order()` không sắp được theo cột của bảng lồng nhau.
      */
      const rows = (theoryRes.data || []) as unknown as TheoryRow[]
      const rank = (theory: TheoryRow) => [
        theory.sections?.categories?.topics?.order_index ?? 9999,
        theory.sections?.categories?.order_index ?? 9999,
        theory.order_index ?? 9999,
      ]
      rows.sort((left, right) => {
        const a = rank(left), b = rank(right)
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]
        // Tiêu chí phá hòa cuối cùng: không có nó thì hai bài trùng hạng vẫn đổi
        // chỗ cho nhau giữa hai lần tải.
        return left.title.localeCompare(right.title, 'vi')
      })
      setTheories(rows)
      setEdges((edgeRes.data || []) as EdgeRow[])

      if (user) {
        // Toàn bộ việc quy gán bằng chứng nằm trong module dùng chung, để `/learn`
        // và `/student/analytics` không còn hai thang đo khác nhau.
        const data = await loadTheoryMastery(user.id)
        setProgress(data.progressByTheory)
        setMasteryByTheory(data.masteryByTheory)
        setAssignmentsByTheory(data.assignmentsByTheory)
      }
      setLoading(false)
    }
    void load()
  }, [supabase])

  const preloadGroup = useCallback(async (groupName: string) => {
    if (!groupName || loadedGroups.has(groupName)) return
    const ids = theories.filter(theory => groupOf(theory) === groupName).map(theory => theory.id)
    if (!ids.length) return
    setLoadedGroups(current => new Set(current).add(groupName))
    const [contentRes, blocksRes] = await Promise.all([
      supabase.from('theories').select('id, title, description, content_md, difficulty_level, section_id').in('id', ids),
      supabase.from('knowledge_blocks').select('*').in('theory_id', ids).order('order_index'),
    ])
    const loadedBlocks = (blocksRes.data || []) as KnowledgeBlock[]
    setContentCache(current => {
      const next = new Map(current)
      for (const row of (contentRes.data || []) as TheoryRow[]) next.set(row.id, row)
      return next
    })
    setBlockCache(current => {
      const next = new Map(current)
      for (const id of ids) next.set(id, [])
      for (const block of loadedBlocks) next.set(block.theory_id, [...(next.get(block.theory_id) || []), block])
      return next
    })
  }, [groupOf, loadedGroups, supabase, theories])

  const selectedTheory = theories.find(theory => theory.id === selectedId) || null
  useEffect(() => {
    if (!selectedTheory) return
    const timer = window.setTimeout(() => void preloadGroup(groupOf(selectedTheory)), 0)
    return () => window.clearTimeout(timer)
  }, [groupOf, preloadGroup, selectedTheory])
  useEffect(() => {
    if (!panelRef.current || !selectedId || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.fromTo(panelRef.current, { x: 30, opacity: 0 }, { x: 0, opacity: 1, duration: 0.28, ease: 'power2.out' })
  }, [selectedId])

  const incoming = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const edge of edges.filter(edge => edge.relation_type === 'prerequisite')) map.set(edge.to_theory_id, [...(map.get(edge.to_theory_id) || []), edge.from_theory_id])
    return map
  }, [edges])

  const theoryById = useMemo(() => new Map(theories.map(theory => [theory.id, theory])), [theories])

  /**
   * Khóa mềm: mô tả tiên quyết, KHÔNG chặn.
   *
   * `met: null` nghĩa là chưa có bằng chứng nào để kết luận (bài tiên quyết chưa
   * được giao bài tập). Chỉ `met === false` mới được tính là "chưa đạt" — giáo
   * viên chưa phủ hết cây là chuyện bình thường, không nên vì thế mà cảnh báo.
   */
  const prerequisitesOf = useCallback((id: string): SkillTreePrerequisite[] => (incoming.get(id) || [])
    .map(prerequisiteId => {
      const theory = theoryById.get(prerequisiteId)
      const stat = masteryByTheory.get(prerequisiteId)
      return {
        id: prerequisiteId,
        title: theory?.title || 'Bài trước',
        group: theory ? groupOf(theory) : 'Khác',
        met: stat ? isMasteryAchieved(stat.status) : null,
      }
    }),
  [groupOf, incoming, masteryByTheory, theoryById])

  const groups = useMemo(() => [...new Set(theories.map(groupOf))].sort(), [groupOf, theories])
  /* Chỉ liệt kê lớp THỰC SỰ có bài đã xuất bản. Hiện sẵn ba tab 10/11/12 rồi
     để hai tab rỗng là mời học sinh bấm vào chỗ không có gì. */
  const grades = useMemo(
    () => [...new Set(theories.map(gradeOf).filter((name): name is string => Boolean(name)))].sort(),
    [gradeOf, theories]
  )

  const matches = useCallback((theory: TheoryRow) => (
    (!grade || gradeOf(theory) === grade) &&
    (!group || groupOf(theory) === group)
    && (!query.trim() || theory.title.toLowerCase().includes(query.trim().toLowerCase()))
  ), [grade, gradeOf, group, groupOf, query])

  /**
   * Dựng TOÀN BỘ node, kể cả node không khớp bộ lọc.
   *
   * Lọc bằng cách bỏ node khiến bố cục nhảy mỗi lần gõ phím, và học sinh không
   * bao giờ xây được bản đồ không gian của cây. Node không khớp chỉ bị làm mờ.
   */
  const items = useMemo<SkillTreeItem[]>(() => {
    return theories.map((theory): SkillTreeItem => {
      const value = progress.get(theory.id)
      const stat = masteryByTheory.get(theory.id)
      const total = value?.total || 0
      const answered = value?.answered || 0
      const completion = total > 0 ? Math.round((answered / total) * 100) : null
      const prerequisites = prerequisitesOf(theory.id)
      const missingCount = prerequisites.filter(prerequisite => prerequisite.met === false).length

      // "Đang mở" = chưa quá hạn. Bài quá hạn vẫn được đếm trong `assignmentCount`
      // nên node phân biệt được ba ca: chưa từng được giao / còn hạn / hết hạn.
      // Chưa đọc được đồng hồ (`now === null`, chỉ xảy ra trước lượt effect đầu)
      // thì coi mọi bài là còn mở — thà thừa một lời mời làm bài còn hơn báo hết
      // hạn oan cho một bài vẫn nộp được.
      const assignments = assignmentsByTheory.get(theory.id) || []
      const open = assignments.filter(assignment => (
        !assignment.deadline || now === null || new Date(assignment.deadline).getTime() >= now
      ))
      const withDeadline = open
        .filter((assignment): assignment is TheoryAssignmentInfo & { deadline: string } => Boolean(assignment.deadline))
        .sort((a, b) => a.deadline.localeCompare(b.deadline))
      const nextAssignment = withDeadline[0] || open[0] || null

      return {
        id: theory.id,
        title: theory.title,
        group: groupOf(theory),
        grade: gradeOf(theory),
        difficulty: theory.difficulty_level,
        progress: completion,
        answered,
        total,
        pending: value?.pending || 0,
        assignmentCount: value?.assignmentCount || 0,
        openAssignments: open.length,
        nextDeadline: withDeadline[0]?.deadline || null,
        nextAssignmentId: nextAssignment?.id || null,
        // Trạng thái hoạt động: chỉ nói về việc đã làm bài tới đâu.
        status: completion === null
          ? 'no_homework'
          : missingCount > 0 && answered === 0
            ? 'locked'
            : completion >= 100
              ? 'completed'
              : completion > 0
                ? 'in_progress'
                : 'available',
        mastery: stat?.status || 'no_data',
        accuracy: stat ? stat.accuracy : null,
        prerequisites,
        matched: matches(theory),
      }
    })
  }, [assignmentsByTheory, gradeOf, groupOf, masteryByTheory, matches, now, prerequisitesOf, progress, theories])

  /* Đóng bài đang mở mà GIỮ bộ lọc lớp. Hai nút đóng trước đây đều
     `router.push('/learn')` trống trơn, tức là xóa luôn `?grade=`. */
  const closeTheory = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString())
    next.delete('theory')
    const qs = next.toString()
    router.push(qs ? `/learn?${qs}` : '/learn', { scroll: false })
  }, [router, searchParams])

  const selectTheory = useCallback((id: string) => {
    // Giữ nguyên `?grade=`: mở một bài rồi đóng lại mà mất bộ lọc lớp thì học sinh
    // bị đẩy về danh sách cả ba lớp — đúng cái vừa dọn đi.
    const next = new URLSearchParams(searchParams.toString())
    next.set('theory', id)
    router.push(`/learn?${next.toString()}`, { scroll: false })
  }, [router, searchParams])

  const content = selectedId ? contentCache.get(selectedId) : null
  const blocks = selectedId ? blockCache.get(selectedId) || [] : []
  const selectedAssignments = selectedId ? assignmentsByTheory.get(selectedId) || [] : []
  const prerequisites = selectedId ? (incoming.get(selectedId) || []).map(id => theories.find(theory => theory.id === id)).filter(Boolean) as TheoryRow[] : []
  const selectedStat = selectedId ? masteryByTheory.get(selectedId) : undefined
  const selectedMissing = selectedId
    ? prerequisitesOf(selectedId).filter(prerequisite => prerequisite.met === false).map(prerequisite => prerequisite.title)
    : []
  const matchedCount = items.filter(item => item.matched).length
  const isFiltering = Boolean(grade || group || query.trim())

  // Số liệu tóm tắt cho hero. Mỗi con số neo vào dữ liệu thật; con số bằng 0 thì
  // KHÔNG hiện dòng đó, thay vì hiện một số 0 trông như thất bại.
  const openAssignmentTotal = items.reduce((sum, item) => sum + item.openAssignments, 0)
  const solidCount = items.filter(item => item.mastery === 'stable' || item.mastery === 'mastered').length
  const weakCount = items.filter(item => item.mastery === 'needs_work' || item.mastery === 'building').length

  return (
    <MathProvider>
      <div className="space-y-5">
        <header className="soft-shadow relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-teal-950 to-slate-900 p-5 text-white sm:p-7">
          {/* Hoạ tiết giấy kẻ ô — chất liệu lấy từ chính môn học (mục 7.2). Vẽ
              bằng gradient nên không thêm request ảnh nào. Đây là bề mặt gradient
              DUY NHẤT của trang. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                'repeating-linear-gradient(to right, rgba(226,232,240,0.06) 0 1px, transparent 1px 100%), repeating-linear-gradient(to bottom, rgba(226,232,240,0.06) 0 1px, transparent 1px 100%)',
              backgroundSize: '28px 28px',
            }}
          />
          <div className="relative">
            <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-teal-300">
              <BrainCircuit className="h-5 w-5" aria-hidden="true" />
              Lộ trình Toán học
            </p>
            <h1 className="font-baloo text-2xl font-bold sm:text-3xl">Tri thức và bài tập</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Đọc lý thuyết và làm bài tập được giao trong cùng một chỗ. Màu trên lộ trình là tỷ lệ trả lời
              <span className="font-semibold text-white"> đúng</span>, không phải số câu đã làm.
            </p>

            {!loading && (
              <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <div className="flex items-baseline gap-1.5">
                  <dt className="sr-only">Số bài học</dt>
                  <dd className="font-baloo text-2xl font-bold text-white">{items.length}</dd>
                  <span className="text-slate-300">bài học</span>
                </div>
                {openAssignmentTotal > 0 && (
                  <div className="flex items-baseline gap-1.5">
                    <dt className="sr-only">Bài tập đang mở</dt>
                    <dd className="font-baloo text-2xl font-bold text-teal-300">{openAssignmentTotal}</dd>
                    <span className="text-slate-300">bài tập đang mở</span>
                  </div>
                )}
                {solidCount > 0 && (
                  <div className="flex items-baseline gap-1.5">
                    <dt className="sr-only">Bài đã vững</dt>
                    <dd className="font-baloo text-2xl font-bold text-emerald-300">{solidCount}</dd>
                    <span className="text-slate-300">bài đã vững</span>
                  </div>
                )}
                {weakCount > 0 && (
                  <div className="flex items-baseline gap-1.5">
                    <dt className="sr-only">Mảng cần củng cố</dt>
                    <dd className="font-baloo text-2xl font-bold text-amber-300">{weakCount}</dd>
                    <span className="text-slate-300">cần củng cố</span>
                  </div>
                )}
              </dl>
            )}

            {/* `<dl>` chỉ nhận `<dt>`/`<dd>`/`<div>`, nên câu này phải nằm NGOÀI
                danh sách định nghĩa chứ không lồng vào trong. */}
            {!loading && openAssignmentTotal === 0 && solidCount === 0 && weakCount === 0 && (
              <p className="mt-2 text-sm text-slate-300">
                Chưa có bài tập nào được giao — bạn vẫn đọc được toàn bộ lý thuyết.
              </p>
            )}
          </div>
        </header>

        {/*
          THANH CHỌN LỚP.

          Đặt trên ô tìm kiếm và trên bộ lọc chương, vì lớp là câu hỏi đầu tiên học
          sinh tự hỏi khi mở trang. Trước đây 29 bài của ba lớp đổ chung một
          danh sách, mà cả ba lớp đều có "Chương 1" — không ai biết mình đang xem lớp nào.

          Dùng nút chứ không dùng ô xổ: ba lựa chọn cố định và học sinh đổi rất
          thường xuyên; ô xổ bắt hai thao tác cho một việc mỗi lần.
        */}
        {grades.length > 1 && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Chọn lớp">
            <button
              type="button"
              onClick={() => chooseGrade('')}
              aria-pressed={grade === ''}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                grade === ''
                  ? 'bg-teal-600 text-white'
                  : 'bg-[var(--background-raised)] text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              Tất cả lớp
            </button>
            {grades.map(name => (
              <button
                key={name}
                type="button"
                onClick={() => chooseGrade(name)}
                aria-pressed={grade === name}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                  grade === name
                    ? 'bg-teal-600 text-white'
                    : 'bg-[var(--background-raised)] text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <span className="sr-only">Tìm bài học</span>
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Tìm bài học..."
              className="w-full rounded-xl border border-slate-200 bg-[var(--background-raised)] py-2.5 pl-9 pr-3 text-sm text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
          <label className="sm:w-56">
            <span className="sr-only">Lọc theo chuyên đề</span>
            <select
              value={group}
              onChange={event => { setGroup(event.target.value); void preloadGroup(event.target.value) }}
              className="w-full rounded-xl border border-slate-200 bg-[var(--background-raised)] px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">Tất cả chuyên đề</option>
              {groups.map(name => <option key={name}>{name}</option>)}
            </select>
          </label>
        </div>

        {isFiltering && (
          <p className="text-xs text-slate-500 dark:text-slate-400" role="status">
            {matchedCount > 0
              ? `${matchedCount}/${items.length} bài khớp — các bài còn lại được làm mờ, vị trí giữ nguyên`
              : 'Không có bài nào khớp'}
          </p>
        )}

        <div className={`grid gap-5 ${selectedTheory ? 'lg:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.65fr)]' : ''}`}>
          <div className="min-w-0">
            {loading ? (
              <div className="flex min-h-[50vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
              </div>
            ) : (
              <LearningPath
                items={items}
                selectedId={selectedId}
                filtering={isFiltering}
                now={now}
                onSelect={item => selectTheory(item.id)}
              />
            )}
          </div>

          {selectedTheory && (
            <>
              <button aria-label="Đóng nội dung" onClick={closeTheory} className="fixed inset-0 z-40 bg-black/40 lg:hidden" />
              {/*
                Panel trước đây hardcode `bg-slate-950 text-slate-100`, tức ép dark
                mode ngay cả khi cả trang đang sáng. Chuyển sang token nền/viền để
                light mode là light mode thật (docs/DESIGN_TODO.md mục 0).
              */}
              <aside
                ref={panelRef}
                className="fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto overflow-x-hidden rounded-t-3xl border border-slate-200 bg-[var(--background-card)] p-5 text-slate-700 shadow-2xl dark:border-slate-700/70 dark:bg-slate-900 dark:text-slate-200 lg:sticky lg:top-20 lg:inset-x-auto lg:bottom-auto lg:z-auto lg:max-h-[calc(100vh-6rem)] lg:rounded-2xl"
              >
                <div
                  className="sticky -top-5 z-10 -mx-5 mb-4 border-b border-slate-200 px-5 py-4 backdrop-blur dark:border-slate-700"
                  style={{ backgroundColor: 'var(--background-overlay)' }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">{groupOf(selectedTheory)}</p>
                      <h2 className="mt-1 text-xl font-black tracking-tight text-slate-900 dark:text-white">{selectedTheory.title}</h2>
                    </div>
                    <button
                      aria-label="Đóng nội dung bài học"
                      onClick={closeTheory}
                      className="rounded-lg p-2 text-slate-500 hover:bg-slate-200 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                    >
                      <X className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                {selectedTheory.description && <p className="mb-4 rounded-2xl border border-slate-200 bg-[var(--background)] p-4 text-sm leading-relaxed text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">{selectedTheory.description}</p>}
                {selectedStat && (
                  <div className="mb-4 rounded-2xl border border-slate-200 bg-[var(--background)] p-4 dark:border-white/10 dark:bg-white/[0.03]">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Năng lực của bạn ở bài này</p>
                    <p className="mt-1.5 text-lg font-black text-slate-900 dark:text-white">
                      {getMasteryStatusLabel(selectedStat.status)}
                      <span className="ml-2 text-sm font-semibold text-slate-500 dark:text-slate-400">{selectedStat.accuracy}% đúng</span>
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Tính trên {selectedStat.answeredCount} câu đã được chấm ({selectedStat.correctCount} câu đúng).
                    </p>
                  </div>
                )}
                {prerequisites.length > 0 && (
                  <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
                    <p className="mb-1 font-semibold text-amber-800 dark:text-amber-200">Tiên quyết</p>
                    {prerequisites.map(item => (
                      <button key={item.id} onClick={() => selectTheory(item.id)} className="mr-2 font-medium underline-offset-2 hover:underline">{item.title}</button>
                    ))}
                  </div>
                )}
                {!content ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-teal-600" /></div> : (
                  <div key={selectedId} className="space-y-4">
                    {content.content_md && !blocks.length && (
                      <div className="min-w-0 overflow-x-auto rounded-2xl border border-slate-200 bg-[var(--background)] p-4 dark:border-white/10 dark:bg-white/[0.03]">
                        <MathContent content={content.content_md} format="markdown" className="max-w-full" />
                      </div>
                    )}
                    {/* Khối lý thuyết đọc theo khâu học (ĐỊNH NGHĨA → … → BÀI TẬP),
                        xem docs/DESIGN_OVERHAUL_2026-08-09.md mục 3b. */}
                    <TheoryStages blocks={blocks} />
                  </div>
                )}
                <div className="mt-5 border-t border-slate-200 pt-4 dark:border-white/10">
                  <h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-900 dark:text-white"><ClipboardList className="h-4 w-4 text-teal-600 dark:text-teal-300" aria-hidden="true" />Bài tập được giao</h3>
                  {selectedAssignments.map(assignment => (
                    <div key={assignment.id} className="mb-2 rounded-xl border border-teal-600/25 bg-teal-50 p-3 dark:border-teal-300/20 dark:bg-teal-400/10">
                      <p className="font-medium text-slate-800 dark:text-slate-100">{assignment.title || assignment.homeworkTitle}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{assignment.deadline ? `Hạn ${new Date(assignment.deadline).toLocaleString('vi-VN')}` : 'Không hạn nộp'}</p>
                      <Link href={`/homework/prepare/${assignment.id}`} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-teal-700 hover:underline dark:text-teal-300">Làm bài <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
                    </div>
                  ))}
                  {!selectedAssignments.length && (
                    <p className="rounded-xl border border-slate-200 bg-[var(--background)] p-3 text-sm text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400">
                      Chưa có bài tập được giao cho bài học này — bạn vẫn đọc lý thuyết được.
                    </p>
                  )}
                </div>
                {selectedMissing.length > 0 && (
                  <p className="mt-4 flex gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
                    <LockKeyhole className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>
                      Nên học vững {selectedMissing.join(', ')} trước. Bài này vẫn mở — bạn có thể đọc và làm ngay nếu muốn.
                    </span>
                  </p>
                )}
              </aside>
            </>
          )}
        </div>

        <p className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
          <BookOpen className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Màu và phần trăm là tỷ lệ trả lời <strong>đúng</strong> ở các bài tập được giao, không phải số câu đã làm.
            Bài chưa được giao bài tập vẫn đọc lý thuyết được, và không bài nào bị khoá.
          </span>
        </p>
      </div>
    </MathProvider>
  )
}
