'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Copy,
  ExternalLink,
  FolderTree,
  PenLine,
  Loader2,
  Play,
  RefreshCw,
  ScanSearch,
  ShieldAlert,
  Square,
  XCircle,
} from 'lucide-react'
import { AdminHeader } from '@/components/admin'
import MathContent, { MathProvider } from '@/components/MathContent'
import QuestionEditModal, {
  type EditableQuestion,
} from '@/components/admin/QuestionEditModal'
import { createClient } from '@/lib/supabase/client'

/**
 * Rà soát ngân hàng câu hỏi bằng AI — trang xem tiến trình và duyệt đề xuất.
 *
 * Thiết kế: `docs/QUESTION_AUDIT_PLAN.md` mục 7.
 *
 * BA ĐIỀU TRANG NÀY PHẢI LÀM ĐÚNG, không phải ba điều "nên có":
 *
 * 1. **Không có nút ghi thẳng.** Mọi thay đổi đi qua
 *    `POST /api/admin/questions/audit/decide`, và route đó gọi RPC. Trang không
 *    bao giờ `UPDATE` vào `answers`/`questions`.
 *
 * 2. **Số bài đã nộp bị ảnh hưởng nằm NGAY CẠNH nút áp dụng**, và khi nó lớn
 *    hơn 0 thì phải bấm hai lần. Đổi đáp án của một câu đã có người làm khiến
 *    bài đã chấm và bài chấm sau không còn cùng một chuẩn.
 *
 * 3. **Hiện song song đang lưu ↔ đề xuất, render bằng `MathContent`.** Lỗi
 *    LaTeX chỉ nhìn ra bằng mắt trên bản đã render; đọc mã nguồn thì không thấy.
 *
 * Tiến trình chạy bằng cách gọi `/step` lặp lại từ trình duyệt. Con trỏ nằm ở
 * database, nên đóng tab giữa chừng thì mở lại là chạy tiếp.
 */

interface TaxonomyNode {
  id: string
  name: string
  topic_id?: string
  category_id?: string
  section_id?: string
}

interface Progress {
  runId: string
  status: 'dang_chay' | 'xong' | 'loi' | 'da_huy'
  total: number
  processed: number
  skipped: number
  findings: number
  errors: number
  costUsd: number
  promptTokens: number
  completionTokens: number
  done: boolean
  lastError: string | null
}

interface RuleIssue {
  code: string
  severity: 'loi' | 'canh_bao'
  field: string
  message: string
}

interface AnswerRow {
  id: string
  content: string
  is_correct: boolean
  order_index: number
}

interface Finding {
  id: string
  question_id: string
  question_type: string
  nguon: 'luat' | 'ai'
  ket_luan: string | null
  khop_dap_an_dang_luu: boolean | null
  loi_giai_tu_lam: string | null
  dap_an_tu_lam: string | null
  /** Mô tả lỗi theo từng phần. Lượt quét trước 2026-08-30 không có ba cột này. */
  loi_de: string | null
  mo_ta_dap_an: string | null
  mo_ta_loi_giai: string | null
  de_xuat_dap_an: string | null
  de_xuat_explanation: string | null
  de_xuat_solution: string | null
  /** CŨ (v1). Chỉ để đọc lại lượt quét trước khi tách hai ô lời giải. */
  de_xuat_loi_giai: string | null
  loi_latex: string[] | null
  do_tin_cay: number | string | null
  rule_issues: RuleIssue[] | null
  ghi_chu: string | null
  affected_attempts: number
  trang_thai: 'cho_duyet' | 'da_ap_dung' | 'da_bo_qua'
  question: {
    id: string
    content: string
    question_type: string
    explanation: string | null
    solution: string | null
    tikz_code: string | null
    tikz_image_url: string | null
    solution_tikz_image_url: string | null
    solution_tikz_image_url_2: string | null
    answers: AnswerRow[] | null
  } | null
}

type ScopeMode = 'taxonomy' | 'chua_phan_loai' | 'tat_ca'

interface ScopePreview {
  mode: ScopeMode
  /** Số câu của phạm vi, đã trừ nhóm bỏ qua. */
  total: number
  /** Số câu lượt quét này sẽ thực sự chạy (đã cắt theo trần). */
  willScan: number
  /** Còn lại sau lượt này. */
  remaining: number
  truncated: boolean
  maxPerRun?: number
  cost: {
    perQuestionUsd: number | null
    sampleSize: number
    estimatedUsd: number | null
  } | null
}

const SCOPE_MODES: ReadonlyArray<readonly [ScopeMode, string, string]> = [
  ['taxonomy', 'Theo chương / bài', 'Chọn một nhánh trong cây chủ đề.'],
  [
    'chua_phan_loai',
    'Câu chưa phân loại',
    'Nhóm không nằm trong cây chủ đề — trước đây không lượt quét nào chạm tới được.',
  ],
  ['tat_ca', 'Toàn bộ ngân hàng', 'Mọi câu, bỏ qua phân loại. Xem số câu và chi phí trước khi chạy.'],
]

interface RunSummaryRow {
  id: string
  scope_label: string
  status: string
  total_questions: number
  processed: number
  findings: number
  errors: number
  cost_usd: number | string
  created_at: string
}

const CONCLUSION_LABELS: Record<string, string> = {
  dung: 'Đề, đáp án và lời giải đều đúng',
  de_sai: 'ĐỀ BÀI sai — người soạn viết lại',
  dap_an_sai: 'Đáp án đang lưu SAI',
  loi_giai_sai: 'Lời giải SAI (đáp án đúng)',
  ca_hai_sai: 'Sai cả đáp án lẫn lời giải',
  khong_kiem_duoc: 'Không kiểm được',
}

const CONCLUSION_TONE: Record<string, string> = {
  dung: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  de_sai: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200',
  dap_an_sai: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  loi_giai_sai: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  ca_hai_sai: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  khong_kiem_duoc: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
}

/** Tên ô mà RPC báo là đã ghi. */
const APPLIED_LABELS: Record<string, string> = {
  dap_an: 'đáp án',
  explanation: 'ô Giải thích',
  solution: 'ô Lời giải',
}

const FILTERS: ReadonlyArray<readonly [string, string]> = [
  ['can_sua', 'Có đề xuất sửa'],
  ['de_sai', 'Đề bài sai'],
  ['khong_kiem_duoc', 'Không kiểm được'],
  ['all', 'Tất cả'],
]

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export default function QuestionAuditPage() {
  const supabase = useMemo(() => createClient(), [])

  const [topics, setTopics] = useState<TaxonomyNode[]>([])
  const [categories, setCategories] = useState<TaxonomyNode[]>([])
  const [sections, setSections] = useState<TaxonomyNode[]>([])
  const [subsections, setSubsections] = useState<TaxonomyNode[]>([])

  const [mode, setMode] = useState<ScopeMode>('taxonomy')
  const [topicId, setTopicId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [subsectionId, setSubsectionId] = useState('')

  const [preview, setPreview] = useState<ScopePreview | null>(null)
  /** Chờ bấm lần hai. Chỉ dùng cho hai chế độ có thể rất lớn. */
  const [confirmStart, setConfirmStart] = useState(false)

  const [runId, setRunId] = useState<string | null>(null)
  const [scopeLabel, setScopeLabel] = useState('')
  const [progress, setProgress] = useState<Progress | null>(null)
  const [running, setRunning] = useState(false)
  const stopRef = useRef(false)

  const [filter, setFilter] = useState('can_sua')
  const [findings, setFindings] = useState<Finding[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loadedCount, setLoadedCount] = useState(0)
  /** Bỏ qua câu đã quét ở lượt trước — để bấm quét lại là chạy TIẾP. */
  const [skipScanned, setSkipScanned] = useState(true)
  const [summary, setSummary] = useState<Record<string, number>>({})
  const [recentRuns, setRecentRuns] = useState<RunSummaryRow[]>([])

  const [error, setError] = useState<string | null>(null)
  const [busyFinding, setBusyFinding] = useState<string | null>(null)
  /**
   * Lỗi của TỪNG dòng, hiện ngay tại thẻ đó.
   *
   * Trước đây lỗi khi bấm Áp dụng chỉ đổ vào banner đầu trang — cách nút vài
   * trăm pixel và ngoài màn hình khi danh sách dài. Người dùng bấm, không thấy
   * gì xảy ra, và không có cách nào biết vì sao.
   */
  const [findingError, setFindingError] = useState<Record<string, string>>({})
  /**
   * Những ô đã ghi cho từng dòng, theo báo cáo của RPC.
   *
   * Bấm Áp dụng xong thì nút biến mất — đúng, vì dòng đã xử lý — nhưng nếu chỉ
   * biến mất thì trông y hệt "bấm hụt". Cần nói rõ nó vừa ghi vào những ô nào.
   */
  const [appliedParts, setAppliedParts] = useState<Record<string, string[]>>({})
  /** Chỉ hiện dòng chưa xử lý. Bật lên là danh sách ngắn dần theo tiến độ duyệt. */
  const [pendingOnly, setPendingOnly] = useState(false)
  const [handled, setHandled] = useState(0)

  /**
   * Câu đang mở trong trình sửa, ngay trên trang này.
   *
   * Dữ liệu lấy từ chính dòng finding đã tải — `/run` trả kèm đủ nội dung câu,
   * phương án và hình. Không gọi thêm request nào, và không rời trang: mở tab
   * mới thì mất chỗ đang đọc trong một danh sách vài trăm dòng.
   */
  const [editing, setEditing] = useState<EditableQuestion | null>(null)

  const openEditor = useCallback((finding: Finding) => {
    const source = finding.question
    if (!source) return
    setEditing({
      id: source.id,
      content: source.content ?? '',
      // Dạng câu quyết định hình dạng trình sửa. Lấy từ bảng `questions`, và
      // lùi về dạng ghi trên dòng finding nếu lượt quét cũ chưa trả trường đó.
      question_type: source.question_type || finding.question_type,
      explanation: source.explanation,
      solution: source.solution,
      answers: (source.answers ?? [])
        .slice()
        .sort((left, right) => left.order_index - right.order_index)
        .map((answer) => ({
          id: answer.id,
          content: answer.content,
          is_correct: answer.is_correct,
        })),
      tikz_code: source.tikz_code,
      tikz_image_url: source.tikz_image_url,
      solution_tikz_image_url: source.solution_tikz_image_url,
      solution_tikz_image_url_2: source.solution_tikz_image_url_2,
    })
  }, [])
  /** Finding đang chờ bấm xác nhận lần hai (vì có bài đã nộp bị ảnh hưởng). */
  const [confirming, setConfirming] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [topicRes, categoryRes, sectionRes, subsectionRes] = await Promise.all([
        supabase.from('topics').select('id, name').order('order_index'),
        supabase.from('categories').select('id, name, topic_id').order('order_index'),
        supabase.from('sections').select('id, name, category_id, topic_id').order('order_index'),
        supabase.from('subsections').select('id, name, section_id').order('order_index'),
      ])
      if (cancelled) return
      setTopics(topicRes.data ?? [])
      setCategories(categoryRes.data ?? [])
      setSections(sectionRes.data ?? [])
      setSubsections(subsectionRes.data ?? [])
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [supabase])

  const loadRecentRuns = useCallback(async () => {
    const response = await fetch('/api/admin/questions/audit/run')
    const data = await response.json()
    if (response.ok) setRecentRuns(data.runs ?? [])
    else setError(data.error ?? 'Không tải được danh sách lượt quét.')
  }, [])

  useEffect(() => {
    void loadRecentRuns()
  }, [loadRecentRuns])

  /**
   * Nạp MỘT trang kết quả.
   *
   * `append` = true thì nối vào cuối (nút "Tải thêm"); false thì thay hẳn (đổi
   * bộ lọc, hoặc làm mới).
   *
   * Phân trang là bản sửa cho việc trang đứng hình: trước đây nạp tới 400 dòng
   * một lần, mỗi dòng kèm nội dung câu và toàn bộ phương án, rồi render tất cả
   * bằng MathJax — với một lượt quét cả ngân hàng thì đó là vài trăm khối công
   * thức dựng lại sau MỖI lô.
   */
  const loadFindings = useCallback(
    async (
      id: string,
      which: string,
      offset = 0,
      append = false,
      /*
        Nhận tường minh chứ không đọc từ state.

        Ô tick "chỉ dòng chưa xử lý" phải nạp lại NGAY khi bấm, mà `setState` thì
        chưa có hiệu lực trong cùng lượt xử lý sự kiện — gọi `loadFindings` ở đó
        sẽ dùng đúng giá trị CŨ và danh sách không đổi. Truyền thẳng giá trị mới
        vào là hết chuyện.
      */
      pending = pendingOnly
    ) => {
      const response = await fetch(
        `/api/admin/questions/audit/run?runId=${encodeURIComponent(id)}&filter=${which}` +
          `&offset=${offset}&pending=${pending ? '1' : '0'}`
      )
      const data = await response.json()
      if (!response.ok) {
        setError(data.error ?? 'Không tải được kết quả.')
        return
      }
      setHandled(data.handled ?? 0)
      setFindings((prev) =>
        append ? [...prev, ...(data.findings ?? [])] : (data.findings ?? [])
      )
      setHasMore(Boolean(data.hasMore))
      setLoadedCount(offset + (data.findings?.length ?? 0))
      setSummary(data.summary ?? {})
      setScopeLabel(data.run?.scope_label ?? '')
    },
    [pendingOnly]
  )

  /**
   * Đếm trước phạm vi mỗi khi người dùng đổi lựa chọn.
   *
   * Chỉ ĐỌC, không tạo lượt quét. Đây là thứ đứng giữa "bấm nhầm Toàn bộ ngân
   * hàng" và một hoá đơn bất ngờ — con số phải hiện ra TRƯỚC khi bấm, không
   * phải sau.
   */
  useEffect(() => {
    let cancelled = false
    setConfirmStart(false)

    if (mode === 'taxonomy' && !topicId && !categoryId && !sectionId && !subsectionId) {
      setPreview(null)
      return
    }

    async function loadPreview() {
      const params = new URLSearchParams({ mode, skipScanned: String(skipScanned) })
      if (mode === 'taxonomy') {
        if (topicId) params.set('topicId', topicId)
        if (categoryId) params.set('categoryId', categoryId)
        if (sectionId) params.set('sectionId', sectionId)
        if (subsectionId) params.set('subsectionId', subsectionId)
      }
      const response = await fetch(`/api/admin/questions/audit/scope?${params}`)
      const data = await response.json()
      if (cancelled) return
      setPreview(response.ok ? (data as ScopePreview) : null)
    }
    void loadPreview()

    return () => {
      cancelled = true
    }
  }, [mode, topicId, categoryId, sectionId, subsectionId, skipScanned])

  const visibleCategories = useMemo(
    () => (topicId ? categories.filter((item) => item.topic_id === topicId) : categories),
    [categories, topicId]
  )
  const visibleSections = useMemo(() => {
    if (categoryId) return sections.filter((item) => item.category_id === categoryId)
    return topicId ? sections.filter((item) => item.topic_id === topicId) : sections
  }, [sections, topicId, categoryId])
  const visibleSubsections = useMemo(
    () => (sectionId ? subsections.filter((item) => item.section_id === sectionId) : []),
    [subsections, sectionId]
  )

  /**
   * Vòng lặp tiến trình: gọi `/step` cho tới khi xong.
   *
   * Dừng lại ngay khi `stopRef` bật hoặc route trả lỗi — không thử lại vô hạn.
   * Một lỗi cấu hình (thiếu key) sẽ lặp lại ở mọi lô, và quay vòng chỉ đốt tiền.
   */
  const pump = useCallback(
    async (id: string) => {
      stopRef.current = false
      setRunning(true)
      setError(null)
      let batchCount = 0

      try {
        for (;;) {
          if (stopRef.current) break

          const response = await fetch('/api/admin/questions/audit/step', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ runId: id }),
          })
          const data = await response.json()

          if (!response.ok) {
            setError(data.error ?? 'Lượt quét dừng vì lỗi.')
            break
          }

          setProgress(data.progress as Progress)

          /*
            Làm mới danh sách THƯA thôi, không phải sau mỗi lô.

            Mỗi lần làm mới là dựng lại cả trang kết quả bằng MathJax. Với lượt
            quét cả ngân hàng, làm việc đó sau mỗi 5 câu khiến trình duyệt đứng
            hình trong khi chính lượt quét vẫn đang chạy — người dùng thấy "lag"
            chứ không thấy tiến trình.

            Thanh tiến trình và các con số vẫn nhích sau MỖI lô; chỉ phần nặng là
            thưa ra. Xong lượt thì làm mới một lần cuối.
          */
          batchCount++
          if (data.progress?.done || batchCount % 6 === 0) {
            await loadFindings(id, filter)
          }
          if (data.progress?.done) break
        }
      } finally {
        setRunning(false)
        void loadRecentRuns()
      }
    },
    [filter, loadFindings, loadRecentRuns]
  )

  async function startRun() {
    // Hai chế độ mới có thể quét hàng nghìn câu. Bắt bấm lần hai sau khi đã
    // nhìn thấy số câu và ước tính chi phí ngay trên nút.
    if (mode !== 'taxonomy' && !confirmStart) {
      setConfirmStart(true)
      return
    }

    setError(null)
    setFindings([])
    setSummary({})
    setProgress(null)
    setConfirmStart(false)

    const response = await fetch('/api/admin/questions/audit/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, topicId, categoryId, sectionId, subsectionId, skipScanned }),
    })
    const data = await response.json()
    if (!response.ok) {
      setError(data.error ?? 'Không bắt đầu được lượt quét.')
      return
    }

    setRunId(data.runId)
    setScopeLabel(data.scopeLabel ?? '')
    setProgress({
      runId: data.runId,
      status: 'dang_chay',
      total: data.total,
      processed: 0,
      skipped: 0,
      findings: 0,
      errors: 0,
      costUsd: 0,
      promptTokens: 0,
      completionTokens: 0,
      done: false,
      lastError: null,
    })
    if (data.truncated) {
      setError(
        `Phạm vi này có ${data.scopeTotal} câu nhưng lượt quét chỉ lấy ${data.total} câu đầu (trần mỗi lượt). ` +
          'Chạy xong lượt này rồi quét lại để lấy phần còn lại, hoặc nâng QUESTION_AUDIT_MAX_QUESTIONS.'
      )
    }
    await pump(data.runId)
  }

  async function openRun(id: string) {
    setRunId(id)
    setError(null)
    const response = await fetch(`/api/admin/questions/audit/run?runId=${encodeURIComponent(id)}`)
    const data = await response.json()
    if (!response.ok) {
      setError(data.error ?? 'Không mở được lượt quét.')
      return
    }
    setScopeLabel(data.run?.scope_label ?? '')
    setProgress({
      runId: id,
      status: data.run?.status,
      total: data.run?.total_questions ?? 0,
      processed: data.run?.processed ?? 0,
      skipped: data.run?.skipped ?? 0,
      findings: data.run?.findings ?? 0,
      errors: data.run?.errors ?? 0,
      costUsd: toNumber(data.run?.cost_usd),
      promptTokens: data.run?.prompt_tokens ?? 0,
      completionTokens: data.run?.completion_tokens ?? 0,
      done: data.run?.status !== 'dang_chay',
      lastError: data.run?.last_error ?? null,
    })
    await loadFindings(id, filter)
  }

  async function decide(finding: Finding, action: 'ap_dung' | 'bo_qua') {
    // Xác nhận lần hai khi câu đã có người làm. Bấm nhầm ở đây làm lệch chuẩn
    // giữa bài đã chấm và bài chấm sau, và không có nút hoàn tác trên trang này.
    if (action === 'ap_dung' && finding.affected_attempts > 0 && confirming !== finding.id) {
      setConfirming(finding.id)
      return
    }

    setBusyFinding(finding.id)
    setError(null)
    setFindingError((prev) => {
      const next = { ...prev }
      delete next[finding.id]
      return next
    })
    try {
      const response = await fetch('/api/admin/questions/audit/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          findingId: finding.id,
          action,
          expectedAttempts: finding.affected_attempts,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        // Số bài đã nộp vừa đổi: nhận con số MỚI từ server và ghi đè vào dòng,
        // để lần bấm sau gửi đúng số thật. Không làm bước này thì dòng đó kẹt
        // vĩnh viễn — số cũ không bao giờ tự đổi.
        if (data.code === 'ATTEMPTS_CHANGED' && typeof data.currentAttempts === 'number') {
          setFindings((current) =>
            current.map((item) =>
              item.id === finding.id
                ? { ...item, affected_attempts: data.currentAttempts as number }
                : item
            )
          )
        }

        // Kèm mã lỗi thô của RPC: câu tiếng Việt cho người đọc, mã để tra khi
        // câu đó chưa đủ nói lên chuyện gì.
        const code =
          typeof data.detail === 'string' ? data.detail.split(':')[0].trim() : data.code
        setFindingError((prev) => ({
          ...prev,
          [finding.id]: `${data.error ?? 'Không thực hiện được.'}${code ? ` (${code})` : ''}`,
        }))
        return
      }
      setFindings((current) =>
        current.map((item) =>
          item.id === finding.id
            ? {
                ...item,
                trang_thai: data.trangThai,
                // Thay luôn bản chụp câu bằng bản VỪA GHI. Giữ bản cũ ở đây là
                // lý do mở trình sửa ngay sau khi áp dụng lại thấy nội dung cũ.
                question: data.question ?? item.question,
              }
            : item
        )
      )
      if (action === 'ap_dung') {
        const applied = Array.isArray(data.result?.applied) ? data.result.applied : []
        setAppliedParts((prev) => ({ ...prev, [finding.id]: applied }))
      }
    } finally {
      setBusyFinding(null)
      setConfirming(null)
    }
  }

  const percent =
    progress && progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0

  return (
    <MathProvider>
      <AdminHeader
        title="Rà soát ngân hàng câu hỏi"
        subtitle="DeepSeek tự giải lại từng câu rồi so với đáp án và lời giải đang lưu"
      />

      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        {/* --- Chọn phạm vi ------------------------------------------------ */}
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center gap-2">
            <FolderTree className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Quét một chương hoặc một bài
            </h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {SCOPE_MODES.map(([value, label, hint]) => (
              <button
                key={value}
                onClick={() => setMode(value)}
                disabled={running}
                className={`rounded-xl border p-3 text-left transition disabled:opacity-50 ${
                  mode === value
                    ? 'border-teal-500 bg-teal-50 dark:border-teal-500 dark:bg-teal-900/20'
                    : 'border-slate-300 hover:border-slate-400 dark:border-slate-600'
                }`}
              >
                <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">
                  {label}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{hint}</span>
              </button>
            ))}
          </div>

          <div
            className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-4 ${
              mode === 'taxonomy' ? '' : 'pointer-events-none opacity-40'
            }`}
          >
            <select
              value={topicId}
              onChange={(event) => {
                setTopicId(event.target.value)
                setCategoryId('')
                setSectionId('')
                setSubsectionId('')
              }}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm dark:border-slate-600 dark:bg-slate-900"
            >
              <option value="">-- Mạch kiến thức / lớp --</option>
              {topics.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>

            <select
              value={categoryId}
              onChange={(event) => {
                setCategoryId(event.target.value)
                setSectionId('')
                setSubsectionId('')
              }}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm dark:border-slate-600 dark:bg-slate-900"
            >
              <option value="">-- Chương / chuyên đề --</option>
              {visibleCategories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>

            <select
              value={sectionId}
              onChange={(event) => {
                setSectionId(event.target.value)
                setSubsectionId('')
              }}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm dark:border-slate-600 dark:bg-slate-900"
            >
              <option value="">-- Bài --</option>
              {visibleSections.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>

            <select
              value={subsectionId}
              onChange={(event) => setSubsectionId(event.target.value)}
              disabled={!sectionId}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900"
            >
              <option value="">-- Dạng câu --</option>
              {visibleSubsections.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={skipScanned}
              onChange={(event) => setSkipScanned(event.target.checked)}
              disabled={running}
              className="mt-0.5 h-4 w-4 accent-teal-600"
            />
            <span className="text-slate-700 dark:text-slate-300">
              Bỏ qua câu đã quét ở lượt trước
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                Đây là thứ biến &quot;bấm lại lần nữa&quot; thành &quot;quét tiếp phần còn
                lại&quot;. Tắt đi thì lượt nào cũng lấy đúng {preview?.maxPerRun ?? 300} câu đầu của
                phạm vi — quét mãi không hết.
              </span>
            </span>
          </label>

          {/* Xem trước: số câu và tiền, TRƯỚC khi bấm. */}
          {preview && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-slate-100 px-4 py-3 text-sm dark:bg-slate-900/50">
              <span className="text-slate-700 dark:text-slate-200">
                Phạm vi có <strong>{preview.total}</strong> câu
              </span>
              {preview.truncated && (
                <span className="text-amber-600 dark:text-amber-400">
                  lượt này chạy <strong>{preview.willScan}</strong> câu, còn{' '}
                  <strong>{preview.remaining}</strong> câu
                  {skipScanned ? ' — bấm quét lại là chạy tiếp phần đó' : ' chưa tới lượt'}
                </span>
              )}
              {preview.cost?.estimatedUsd !== null && preview.cost !== null ? (
                <span className="text-slate-700 dark:text-slate-200">
                  ước tính <strong>{preview.cost.estimatedUsd?.toFixed(3)} USD</strong>
                  <span className="text-slate-500 dark:text-slate-400">
                    {' '}
                    (đo từ {preview.cost.sampleSize} câu đã quét)
                  </span>
                </span>
              ) : (
                <span className="text-slate-500 dark:text-slate-400">
                  chưa đo được chi phí — quét thử một bài nhỏ trước
                </span>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={startRun}
              disabled={
                running ||
                (mode === 'taxonomy' && !topicId && !categoryId && !sectionId && !subsectionId) ||
                preview?.willScan === 0
              }
              className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
                confirmStart ? 'bg-red-600 hover:bg-red-700' : 'bg-teal-600 hover:bg-teal-700'
              }`}
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
              {running
                ? 'Đang quét...'
                : confirmStart
                  ? `Bấm lần nữa để quét ${preview?.willScan ?? 0} câu`
                  : preview
                    ? `Bắt đầu quét ${preview.willScan} câu`
                    : 'Bắt đầu quét'}
            </button>

            {running && (
              <button
                onClick={() => {
                  stopRef.current = true
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm dark:border-slate-600"
              >
                <Square className="h-4 w-4" />
                Tạm dừng
              </button>
            )}

            {!running && runId && progress && !progress.done && (
              <button
                onClick={() => void pump(runId)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm dark:border-slate-600"
              >
                <Play className="h-4 w-4" />
                Chạy tiếp
              </button>
            )}
          </div>
        </section>

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* --- Tiến trình --------------------------------------------------- */}
        {progress && (
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {scopeLabel || 'Lượt quét'}
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {progress.processed}/{progress.total} câu · {percent}%
              </span>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full rounded-full bg-teal-500 transition-all duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
              <Stat label="Cần xem" value={progress.findings} tone="text-amber-600 dark:text-amber-400" />
              <Stat label="Bỏ qua (lớp luật)" value={progress.skipped} />
              <Stat label="Lỗi" value={progress.errors} tone={progress.errors > 0 ? 'text-red-600 dark:text-red-400' : undefined} />
              <Stat label="Token" value={progress.promptTokens + progress.completionTokens} />
              <Stat label="Chi phí (USD)" value={progress.costUsd.toFixed(4)} />
            </div>

            {progress.lastError && (
              <p className="text-xs text-red-600 dark:text-red-400">
                Lỗi gần nhất: {progress.lastError}
              </p>
            )}

            {progress.done && progress.status === 'xong' && (
              <p className="inline-flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" /> Đã quét xong.
              </p>
            )}
          </section>
        )}

        {/* --- Kết quả ------------------------------------------------------ */}
        {runId && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {FILTERS.map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => {
                    setFilter(value)
                    void loadFindings(runId, value)
                  }}
                  className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                    filter === value
                      ? 'bg-teal-600 text-white'
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
              <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={pendingOnly}
                  onChange={(event) => {
                    setPendingOnly(event.target.checked)
                    void loadFindings(runId, filter, 0, false, event.target.checked)
                  }}
                  className="h-3.5 w-3.5 accent-teal-600"
                />
                Chỉ dòng chưa xử lý
              </label>
              <button
                onClick={() => void loadFindings(runId, filter)}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-3 py-1.5 text-xs dark:border-slate-600"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Tải lại
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              {/* Tiến độ DUYỆT, khác tiến độ QUÉT. Nó trả lời câu hỏi "mở lại
                  lượt cũ thì mình đã xử tới đâu rồi" — trạng thái nằm ở database
                  nên nó sống qua việc đóng tab, đổi máy, hay quét lượt khác. */}
              <span className="rounded-full bg-slate-200 px-3 py-1 font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                Đã xử lý {handled}
                {Object.values(summary).length > 0 &&
                  ` / ${Object.values(summary).reduce((sum, count) => sum + count, 0)}`}
              </span>
              {Object.entries(summary).map(([key, count]) => (
                <span
                  key={key}
                  className={`rounded-full px-3 py-1 ${CONCLUSION_TONE[key] ?? CONCLUSION_TONE.khong_kiem_duoc}`}
                >
                  {CONCLUSION_LABELS[key] ?? key}: {count}
                </span>
              ))}
            </div>

            {findings.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
                Chưa có dòng nào trong bộ lọc này.
              </p>
            )}

            {findings.map((finding) => (
              <FindingCard
                key={finding.id}
                finding={finding}
                busy={busyFinding === finding.id}
                confirming={confirming === finding.id}
                failure={findingError[finding.id]}
                applied={appliedParts[finding.id]}
                onDecide={decide}
                onEdit={openEditor}
              />
            ))}

            {/* Tải thêm thay vì đổ hết một lúc: mỗi dòng là một khối MathJax,
                và vài trăm khối cùng lúc là thứ làm trình duyệt đứng hình. */}
            {hasMore && (
              <button
                onClick={() => void loadFindings(runId, filter, loadedCount, true)}
                className="w-full rounded-xl border border-dashed border-slate-300 py-3 text-sm text-slate-600 transition hover:border-slate-400 dark:border-slate-600 dark:text-slate-300"
              >
                Tải thêm (đang hiện {loadedCount})
              </button>
            )}
          </section>
        )}

        {/* --- Lượt quét gần đây -------------------------------------------- */}
        {recentRuns.length > 0 && (
          <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
            <h2 className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Lượt quét gần đây
            </h2>
            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              {recentRuns.map((run) => (
                <button
                  key={run.id}
                  onClick={() => void openRun(run.id)}
                  className="flex w-full items-center justify-between gap-4 py-3 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700/40"
                >
                  <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">
                    {run.scope_label || '(không rõ phạm vi)'}
                  </span>
                  <span className="flex-shrink-0 text-xs text-slate-500 dark:text-slate-400">
                    {run.processed}/{run.total_questions} · {run.findings} cần xem ·{' '}
                    {toNumber(run.cost_usd).toFixed(4)} USD
                  </span>
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-400" />
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      <QuestionEditModal
        question={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          // Nạp lại đúng trang đang xem để dòng vừa sửa hiện nội dung mới.
          if (runId) void loadFindings(runId, filter)
        }}
      />
    </MathProvider>
  )
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`text-lg font-semibold ${tone ?? 'text-slate-800 dark:text-slate-100'}`}>
        {value}
      </p>
    </div>
  )
}

function FindingCard({
  finding,
  busy,
  confirming,
  failure,
  applied,
  onDecide,
  onEdit,
}: {
  finding: Finding
  busy: boolean
  confirming: boolean
  /** Lỗi của riêng dòng này, hiện ngay cạnh nút đã bấm. */
  failure?: string
  /** Những ô RPC vừa ghi, để nói rõ đã áp cái gì thay vì chỉ ẩn nút đi. */
  applied?: string[]
  onDecide: (finding: Finding, action: 'ap_dung' | 'bo_qua') => void
  onEdit: (finding: Finding) => void
}) {
  const question = finding.question
  const answers = question?.answers ?? []
  const conclusion = finding.ket_luan ?? 'khong_kiem_duoc'

  // Đề xuất đáp án là id (một id với trắc nghiệm, danh sách id với Đúng/Sai) —
  // đổi sang nội dung để người duyệt đọc được mà không phải tra id.
  const proposedIds = new Set(
    (finding.de_xuat_dap_an ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
  )
  const proposedIsIdBased =
    finding.question_type === 'multiple_choice' || finding.question_type === 'true_false'

  const handled = finding.trang_thai !== 'cho_duyet'
  /**
   * Nút Áp dụng bám vào việc CÓ BẢN SỬA hay không, không bám vào nhãn kết luận.
   * `ca_hai_sai` giờ cũng có bản sửa (v2 áp cả hai trong một transaction), và
   * `de_sai` thì không bao giờ có — nên đọc thẳng ba trường đề xuất là đúng
   * nhất, không phải liệt kê nhãn nào được bấm.
   */
  const hasFix =
    finding.de_xuat_dap_an !== null ||
    Boolean(finding.de_xuat_explanation) ||
    Boolean(finding.de_xuat_solution)
  const canApply = !handled && hasFix

  return (
    <article className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${CONCLUSION_TONE[conclusion]}`}>
          {CONCLUSION_LABELS[conclusion] ?? conclusion}
        </span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
          {finding.question_type}
        </span>
        {finding.nguon === 'luat' && (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            lớp luật, chưa gửi AI
          </span>
        )}
        {finding.do_tin_cay !== null && finding.nguon === 'ai' && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            độ tin cậy {toNumber(finding.do_tin_cay).toFixed(2)}
          </span>
        )}
        {handled && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            {finding.trang_thai === 'da_ap_dung' ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" /> đã áp dụng
              </>
            ) : (
              <>
                <XCircle className="h-3.5 w-3.5" /> đã bỏ qua
              </>
            )}
          </span>
        )}
      </div>

      {question && (
        <div className="rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-900/50">
          <MathContent content={question.content} />
          {question.tikz_image_url && (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Câu này có hình. Nếu không có mã TikZ thì AI không nhìn thấy hình.
            </p>
          )}
        </div>
      )}

      {(finding.rule_issues?.length ?? 0) > 0 && (
        <ul className="space-y-1 text-xs">
          {finding.rule_issues?.map((issue, index) => (
            <li
              key={`${issue.code}-${index}`}
              className={
                issue.severity === 'loi'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-amber-600 dark:text-amber-400'
              }
            >
              [{issue.field}] {issue.message}
            </li>
          ))}
        </ul>
      )}

      {finding.ghi_chu && (
        <p className="text-xs text-slate-500 dark:text-slate-400">{finding.ghi_chu}</p>
      )}

      {/* Song song: đang lưu ↔ đề xuất. Render bằng MathContent để nhìn ra lỗi
          LaTeX bằng mắt — đọc mã nguồn thì không thấy. */}
      {finding.nguon === 'ai' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Đang lưu
            </p>
            <ul className="space-y-1 text-sm">
              {answers.map((answer) => (
                <li
                  key={answer.id}
                  className={answer.is_correct ? 'font-semibold text-emerald-700 dark:text-emerald-300' : ''}
                >
                  {answer.is_correct ? '✓ ' : '· '}
                  <MathContent content={answer.content} className="inline" />
                </li>
              ))}
            </ul>
            {question?.explanation && (
              <div className="mt-2 border-t border-slate-200 pt-2 text-sm dark:border-slate-700">
                <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">Giải thích</p>
                <MathContent content={question.explanation} />
              </div>
            )}
            {question?.solution && (
              <div className="mt-2 border-t border-slate-200 pt-2 text-sm dark:border-slate-700">
                <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">Lời giải</p>
                <MathContent content={question.solution} />
              </div>
            )}
          </div>

          <div className="space-y-2 rounded-xl border border-teal-300 bg-teal-50/50 p-4 dark:border-teal-700 dark:bg-teal-900/20">
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">
              AI đề xuất
            </p>

            {finding.dap_an_tu_lam && (
              <p className="text-sm">
                <span className="text-slate-500 dark:text-slate-400">AI tự giải ra: </span>
                <MathContent content={finding.dap_an_tu_lam} className="inline" />
              </p>
            )}

            {/* Ba phần độc lập. Mỗi phần chỉ hiện khi AI thật sự báo lỗi ở đó —
                một câu có thể sai đề, sai đáp án, sai lời giải, hoặc nhiều
                phần cùng lúc. */}
            {finding.loi_de && (
              <div className="rounded-lg bg-purple-100 p-3 text-sm dark:bg-purple-900/30">
                <p className="mb-1 text-xs font-semibold uppercase text-purple-700 dark:text-purple-300">
                  Đề bài sai
                </p>
                <p className="text-slate-700 dark:text-slate-200">{finding.loi_de}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Không có nút sửa cho phần này: viết lại đề là đổi thứ đang được đo, không phải sửa
                  lỗi. Người soạn tự xử.
                </p>
              </div>
            )}

            {finding.mo_ta_dap_an && (
              <p className="text-sm text-red-700 dark:text-red-300">
                <span className="font-semibold">Đáp án sai: </span>
                {finding.mo_ta_dap_an}
              </p>
            )}

            {finding.de_xuat_dap_an !== null && (
              <div className="text-sm">
                <p className="text-slate-500 dark:text-slate-400">Đáp án đúng mới:</p>
                {proposedIsIdBased ? (
                  <ul className="space-y-1">
                    {answers.map((answer) => (
                      <li
                        key={answer.id}
                        className={
                          proposedIds.has(answer.id)
                            ? 'font-semibold text-teal-700 dark:text-teal-300'
                            : 'text-slate-500 dark:text-slate-400'
                        }
                      >
                        {proposedIds.has(answer.id) ? '✓ ' : '· '}
                        <MathContent content={answer.content} className="inline" />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <MathContent content={finding.de_xuat_dap_an} />
                )}
              </div>
            )}

            {finding.mo_ta_loi_giai && (
              <p className="border-t border-teal-200 pt-2 text-sm text-amber-700 dark:border-teal-800 dark:text-amber-300">
                <span className="font-semibold">Lời giải sai: </span>
                {finding.mo_ta_loi_giai}
              </p>
            )}

            {finding.de_xuat_explanation && (
              <div className="text-sm">
                <p className="mb-1 text-slate-500 dark:text-slate-400">Ô &quot;Giải thích&quot; viết lại:</p>
                <MathContent content={finding.de_xuat_explanation} />
              </div>
            )}

            {finding.de_xuat_solution && (
              <div className="text-sm">
                <p className="mb-1 text-slate-500 dark:text-slate-400">Ô &quot;Lời giải&quot; viết lại:</p>
                <MathContent content={finding.de_xuat_solution} />
              </div>
            )}

            {/* Lượt quét trước 2026-08-30 chỉ có một trường lời giải chung. */}
            {!finding.de_xuat_explanation &&
              !finding.de_xuat_solution &&
              finding.de_xuat_loi_giai && (
                <div className="border-t border-teal-200 pt-2 text-sm dark:border-teal-800">
                  <p className="mb-1 text-slate-500 dark:text-slate-400">
                    Lời giải mới (lượt quét cũ):
                  </p>
                  <MathContent content={finding.de_xuat_loi_giai} />
                </div>
              )}

            {finding.loi_giai_tu_lam && (
              <details className="text-sm">
                <summary className="cursor-pointer text-xs text-slate-500 dark:text-slate-400">
                  Xem AI giải thế nào
                </summary>
                <div className="mt-2">
                  <MathContent content={finding.loi_giai_tu_lam} />
                </div>
              </details>
            )}
          </div>
        </div>
      )}

      {(finding.loi_latex?.length ?? 0) > 0 && (
        <ul className="space-y-1 text-xs text-amber-600 dark:text-amber-400">
          {finding.loi_latex?.map((item, index) => <li key={index}>LaTeX: {item}</li>)}
        </ul>
      )}

      {/* Trỏ thẳng vào câu. Công cụ này CHỈ áp được những bản sửa nó tự sinh ra;
          mọi thứ khác — đề sai, câu tự luận, trường hợp RPC từ chối — phải sửa
          tay, và lúc đó thứ cần nhất là biết chính xác câu nào. */}
      <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-3 text-xs dark:border-slate-700">
        {/* Sửa NGAY TẠI ĐÂY. Mở tab mới thì mất chỗ đang đọc trong danh sách,
            và người soạn phải tự nhớ mình đang xem dòng nào khi quay lại. */}
        <button
          onClick={() => onEdit(finding)}
          disabled={!question}
          className="inline-flex items-center gap-1.5 font-medium text-teal-700 hover:underline disabled:cursor-not-allowed disabled:opacity-40 dark:text-teal-300"
          title={question ? undefined : 'Không tải được nội dung câu này'}
        >
          <PenLine className="h-3.5 w-3.5" />
          Sửa câu này
        </button>
        <a
          href={`/admin/questions?question=${encodeURIComponent(finding.question_id)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-slate-500 hover:underline dark:text-slate-400"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Mở trang câu hỏi
        </a>
        <button
          onClick={() => void navigator.clipboard?.writeText(finding.question_id)}
          className="inline-flex items-center gap-1.5 font-mono text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
          title="Chép mã câu để tìm trong question-bank"
        >
          <Copy className="h-3.5 w-3.5" />
          {finding.question_id}
        </button>
      </div>

      {failure && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200">
          {failure}
        </p>
      )}

      {/* Dòng đã xử lý: nói rõ ĐÃ LÀM GÌ, ngay chỗ nút vừa biến mất. Chỉ ẩn nút
          đi thì trông y hệt "bấm hụt". */}
      {handled && (
        <div
          className={`flex flex-wrap items-center gap-2 rounded-lg p-3 text-sm ${
            finding.trang_thai === 'da_ap_dung'
              ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-900/50 dark:text-slate-300'
          }`}
        >
          {finding.trang_thai === 'da_ap_dung' ? (
            <>
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              <span>
                Đã ghi vào ngân hàng
                {APPLIED_LABELS && applied && applied.length > 0
                  ? `: ${applied.map((part) => APPLIED_LABELS[part] ?? part).join(' + ')}`
                  : ''}
                . Phần &quot;Đang lưu&quot; ở trên đã là nội dung mới.
              </span>
            </>
          ) : (
            <>
              <XCircle className="h-4 w-4 flex-shrink-0" />
              <span>Đã bỏ qua. Dòng này sẽ không hiện ở bộ lọc &quot;chưa xử lý&quot;.</span>
            </>
          )}
        </div>
      )}

      {!handled && (
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-3 dark:border-slate-700">
          {/* Số bài đã nộp NẰM NGAY CẠNH nút áp dụng. Đây là thông tin quyết
              định, không phải chú thích. */}
          {finding.affected_attempts > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
              <ShieldAlert className="h-4 w-4" />
              {finding.affected_attempts} bài đã nộp có câu này — đổi đáp án sẽ làm bài đã chấm và
              bài chấm sau không cùng một chuẩn. Bài cũ KHÔNG được tự chấm lại.
            </span>
          )}

          {canApply && (
            <button
              onClick={() => onDecide(finding, 'ap_dung')}
              disabled={busy}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50 ${
                confirming ? 'bg-red-600 hover:bg-red-700' : 'bg-teal-600 hover:bg-teal-700'
              }`}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {confirming
                ? 'Bấm lần nữa để xác nhận'
                : /* Nói rõ nút này sẽ ghi vào những ô nào — một câu sai cả đáp
                     án lẫn lời giải sẽ ghi cả hai trong một lần bấm. */
                  `Áp dụng (${[
                    finding.de_xuat_dap_an !== null && 'đáp án',
                    finding.de_xuat_explanation && 'giải thích',
                    finding.de_xuat_solution && 'lời giải',
                  ]
                    .filter(Boolean)
                    .join(' + ')})`}
            </button>
          )}

          <button
            onClick={() => onDecide(finding, 'bo_qua')}
            disabled={busy}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm disabled:opacity-50 dark:border-slate-600"
          >
            Bỏ qua
          </button>
        </div>
      )}
    </article>
  )
}
