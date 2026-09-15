'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, Loader2, Sparkles, X } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import type { ClassifySuggestion } from '@/lib/questions/classify-ai'

/**
 * Phân loại lại hàng loạt cho các câu đang được chọn ở `/admin/questions`.
 *
 * Hai chế độ, dùng cho hai tình huống khác nhau:
 *
 *  - GÁN THỦ CÔNG — người soạn đã biết chính xác nhánh đúng. Tất định tuyệt
 *    đối, nhanh nhất, và là đường nên đi khi đã biết mình muốn gì.
 *  - GỢI Ý THEO LUẬT — máy đọc nội dung và đối chiếu bảng luật. Miễn phí, tất
 *    định. Dùng khi cần rà một mớ câu mà chưa biết câu nào sai.
 *  - GỢI Ý AI — thêm 2026-08-31. Luật vẫn chạy TRƯỚC; DeepSeek chỉ được hỏi
 *    những câu luật bó tay. Xem ghi chú dưới.
 *
 * HAI CHẾ ĐỘ GỢI Ý ĐI CHUNG MỘT ĐƯỜNG (sửa 2026-09-08). Trước đó chế độ luật
 * tự gọi `suggestTopic` ngay tại client — và quên truyền `categories`, nên phần
 * lớn luật không khớp được với cây thật: tên môn học ("Cấp số cộng", "Lượng
 * giác (Lớp 11)") nằm ở tầng CHƯƠNG, không phải tầng chủ đề. Cùng một câu cho
 * hai kết quả khác nhau tuỳ người soạn bấm tab nào.
 *
 * Giờ cả hai gọi `POST /api/admin/questions/classify`, khác đúng một cờ
 * `rulesOnly`. Ở đó luật đọc được cả các Ý của câu Đúng/Sai và cây đã lọc bỏ
 * nhánh `sgk-*` — hai thứ client không tự làm được.
 * `docs/CLASSIFICATION_RULES.md` mục 9 gọi đây là luật "một hàm cho mọi bề mặt".
 *
 * VỀ CHẾ ĐỘ AI. Bản đầu của file này ghi "KHÔNG DÙNG AI", vì công cụ này ra đời
 * để đi SỬA những câu mà AI đã phân loại sai, và hỏi lại cùng một mô hình phần
 * lớn sẽ ra lại cùng kết quả sai. Điều đó VẪN ĐÚNG và là lý do thứ tự không
 * được đảo: luật chạy trước, AI chỉ nhận phần luật trả `null`.
 *
 * Cái đã đổi là phạm vi. Lớp luật ra tới tầng **Chuyên đề**; AI gợi ý được cả
 * đường đi tới Mục con. Với hàng trăm câu chưa phân loại thì gán tay từng câu
 * là việc không làm nổi, còn một gợi ý sâu có người duyệt thì làm nổi.
 *
 * MỌI THAY ĐỔI ĐỀU QUA MÀN XEM TRƯỚC. Ghi đè taxonomy hàng loạt không có
 * đường lùi tự động, nên số câu bị ảnh hưởng phải hiện ra trước khi bấm — và
 * gợi ý AI cũng đi qua đúng màn tick đó, không có đường tắt nào ghi thẳng.
 */

interface Topic {
  id: string
  name: string
}
interface Category {
  id: string
  name: string
  topic_id: string
}
interface Section {
  id: string
  name: string
  category_id: string
  topic_id: string
}
interface Subsection {
  id: string
  name: string
  section_id: string
}

export interface BulkQuestion {
  id: string
  content: string
}

interface Props {
  open: boolean
  onClose: () => void
  questions: BulkQuestion[]
  topics: Topic[]
  categories: Category[]
  sections: Section[]
  subsections: Subsection[]
  /** Gọi sau khi ghi xong để trang tải lại danh sách. */
  onApplied: () => void
}

type Mode = 'manual' | 'auto' | 'ai'

interface AiState {
  suggestions: ClassifySuggestion[]
  byRule: number
  askedAi: number
  unresolved: string[]
  estimatedCostUsd: number
  warnings: string[]
  /** Đã xử lý bao nhiêu / tổng phạm vi. Dùng cho thanh tiến trình. */
  done: number
  total: number
}

/**
 * Nguồn câu cho chế độ AI.
 *
 * `selection` là hành vi cũ — chỉ những câu người dùng đã tick ở trang danh
 * sách. Hai cái sau lấy id từ server nên không phải tick tay 297 câu.
 */
type AiScope = 'selection' | 'chua_phan_loai' | 'tat_ca'

const AI_SCOPES: ReadonlyArray<readonly [AiScope, string]> = [
  ['selection', 'Câu đang chọn'],
  ['chua_phan_loai', 'Toàn bộ câu chưa phân loại'],
  ['tat_ca', 'Toàn bộ ngân hàng'],
]

/** Nội dung câu để hiện kèm gợi ý khi id đến từ server, không từ props. */
interface FetchedContent {
  [questionId: string]: string
}

/** Ghi theo lô: PostgREST có trần kích thước body, và lô nhỏ thì lỗi cũng nhỏ. */
const CHUNK = 200

export default function BulkTaxonomyDialog({
  open,
  onClose,
  questions,
  topics,
  categories,
  sections,
  subsections,
  onApplied,
}: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [mode, setMode] = useState<Mode>('manual')
  const [topicId, setTopicId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [subsectionId, setSubsectionId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<number | null>(null)
  /** Câu bị người dùng bỏ tick ở chế độ gợi ý. */
  const [skipped, setSkipped] = useState<Set<string>>(new Set())

  const [ai, setAi] = useState<AiState | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiScope, setAiScope] = useState<AiScope>('selection')
  const [fetchedContent, setFetchedContent] = useState<FetchedContent>({})
  /** Bấm "Dừng" giữa chừng: vòng gọi trang dừng sau trang đang chạy. */
  const stopAiRef = useRef(false)
  /**
   * Hỏi AI cả những câu luật đã đoán được.
   *
   * Mặc định TẮT, đúng thứ tự mà kế hoạch mục 8 đặt ra: luật trước, AI chỉ cho
   * phần luật bó tay. Bật lên khi cần đường đi sâu hơn tầng Chủ đề — đổi lại
   * tốn API cho cả những câu vốn đã xử lý được miễn phí.
   */
  const [deepSuggest, setDeepSuggest] = useState(false)

  const visibleCategories = useMemo(
    () => (topicId ? categories.filter((item) => item.topic_id === topicId) : []),
    [categories, topicId]
  )
  const visibleSections = useMemo(
    () => (categoryId ? sections.filter((item) => item.category_id === categoryId) : []),
    [sections, categoryId]
  )
  const visibleSubsections = useMemo(
    () => (sectionId ? subsections.filter((item) => item.section_id === sectionId) : []),
    [subsections, sectionId]
  )

  /** Gợi ý máy tìm được nhánh — đúng danh sách đang hiện, kể cả dòng bị bỏ tick. */
  const proposed = useMemo(
    () => (ai?.suggestions ?? []).filter((item) => item.topic_id !== null),
    [ai]
  )

  /** Gợi ý còn được tick — đúng những dòng nút Áp dụng sẽ ghi. */
  const applicable = useMemo(
    () => proposed.filter((item) => !skipped.has(item.question_id)),
    [proposed, skipped]
  )

  /*
    CHỌN TẤT CẢ / BỎ CHỌN TẤT CẢ.

    Chỉ đụng tới những dòng ĐANG HIỆN. `skipped` sống xuyên qua nhiều trang kết
    quả (chế độ phạm vi gọi route nhiều lần), nên `setSkipped(new Set())` sẽ bật
    lại cả những dòng người soạn đã cố ý bỏ ở trang trước — một nút "chọn tất
    cả" mà lặng lẽ hoàn tác quyết định cũ thì tệ hơn không có nút.
  */
  const selectAll = useCallback(() => {
    setSkipped((prev) => {
      const next = new Set(prev)
      for (const item of proposed) next.delete(item.question_id)
      return next
    })
  }, [proposed])

  const clearAll = useCallback(() => {
    setSkipped((prev) => new Set([...prev, ...proposed.map((item) => item.question_id)]))
  }, [proposed])

  /**
   * Nội dung câu theo id.
   *
   * Ưu tiên props (câu người dùng đã tick), rồi tới nội dung server trả kèm ở
   * chế độ phạm vi — ở đó id do server chọn nên props không có gì.
   */
  const contentOf = useCallback(
    (questionId: string): string =>
      questions.find((question) => question.id === questionId)?.content ??
      fetchedContent[questionId] ??
      '',
    [questions, fetchedContent]
  )

  /**
   * Tên đọc được của một đường đi. Người duyệt không tick theo id — họ tick
   * theo tên nhánh, nên id phải được dịch trước khi hiện.
   */
  const pathLabel = useCallback(
    (item: ClassifySuggestion): string => {
      const parts = [
        topics.find((node) => node.id === item.topic_id)?.name,
        categories.find((node) => node.id === item.category_id)?.name,
        sections.find((node) => node.id === item.section_id)?.name,
        subsections.find((node) => node.id === item.subsection_id)?.name,
      ].filter(Boolean)
      return parts.join(' › ')
    },
    [topics, categories, sections, subsections]
  )

  const manualReady = topicId !== ''
  const targetCount = mode === 'manual' ? questions.length : applicable.length

  /**
   * Lấy gợi ý, gọi TỪNG TRANG một.
   *
   * Không gộp cả 297 câu vào một request: mỗi trang là 50 câu = 5 lượt gọi
   * DeepSeek nối nhau trong một request HTTP, và ở kích thước lớn hơn thì trần
   * thời gian của route sẽ cắt ngang — mất trắng cả lượt thay vì mất một trang.
   *
   * Kết quả dồn dần vào `ai.suggestions` để người duyệt đọc được ngay trong lúc
   * chạy, và bấm "Dừng" là giữ lại phần đã có.
   */
  async function runSuggest(rulesOnly: boolean) {
    stopAiRef.current = false
    setAiLoading(true)
    setError(null)
    setSkipped(new Set())

    const accumulated: AiState = {
      suggestions: [],
      byRule: 0,
      askedAi: 0,
      unresolved: [],
      estimatedCostUsd: 0,
      warnings: [],
      done: 0,
      total: aiScope === 'selection' ? questions.length : 0,
    }
    setAi({ ...accumulated })

    try {
      let offset = 0
      for (;;) {
        if (stopAiRef.current) break

        const payload =
          aiScope === 'selection'
            ? { questionIds: questions.map((question) => question.id), deepSuggest, rulesOnly }
            : { scopeMode: aiScope, offset, deepSuggest, rulesOnly }

        const response = await fetch('/api/admin/questions/classify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await response.json()

        if (!response.ok) {
          // Trang đầu hỏng thì coi như không có gì; trang giữa hỏng thì giữ
          // phần đã lấy được và báo — bắt chạy lại từ đầu là vứt tiền đã tiêu.
          setError(data.error ?? 'Không lấy được gợi ý.')
          break
        }

        accumulated.suggestions.push(...(data.suggestions ?? []))
        accumulated.byRule += data.byRule ?? 0
        accumulated.askedAi += data.askedAi ?? 0
        accumulated.unresolved.push(...(data.unresolved ?? []))
        accumulated.estimatedCostUsd += data.usage?.estimatedCostUsd ?? 0
        accumulated.warnings.push(...(data.warnings ?? []))
        accumulated.done += data.total ?? 0
        if (aiScope !== 'selection') accumulated.total = data.scopeTotal ?? accumulated.done

        setFetchedContent((prev) => ({ ...prev, ...(data.contents ?? {}) }))

        // "Toàn bộ ngân hàng" GHI ĐÈ lên phân loại tay đã có. Bỏ tick sẵn để
        // việc đè là một hành động có chủ đích trên từng câu, không phải hệ quả
        // của việc bấm Áp dụng cho nhanh.
        if (aiScope === 'tat_ca') {
          const newIds = ((data.suggestions ?? []) as ClassifySuggestion[]).map(
            (item) => item.question_id
          )
          setSkipped((prev) => new Set([...prev, ...newIds]))
        }

        setAi({ ...accumulated, suggestions: [...accumulated.suggestions] })

        if (aiScope === 'selection') break
        if (!data.remaining || data.remaining <= 0) break
        offset += data.total ?? 0
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không gọi được dịch vụ gợi ý.')
    } finally {
      stopAiRef.current = false
      setAiLoading(false)
    }
  }

  async function apply() {
    setSaving(true)
    setError(null)

    /*
      Gán tới tầng nào thì XOÁ các tầng dưới.

      `question_taxonomy` là một đường đi trong cây. Đổi chủ đề mà giữ nguyên
      `section_id` cũ sẽ tạo ra một dòng mà section không thuộc topic — dữ liệu
      tự mâu thuẫn, và mọi bộ lọc theo cây sẽ đọc sai từ đó trở đi.
    */
    let rows: Array<{
      question_id: string
      topic_id: string | null
      category_id: string | null
      section_id: string | null
      subsection_id: string | null
    }>

    if (mode === 'manual') {
      rows = questions.map((question) => ({
        question_id: question.id,
        topic_id: topicId || null,
        category_id: categoryId || null,
        section_id: sectionId || null,
        subsection_id: subsectionId || null,
      }))
    } else {
      /*
        Đường đi đã được validator phía server kiểm là có thật VÀ đúng quan hệ
        cha–con trước khi tới đây (`assertPathInTree`), nên ghi thẳng bốn tầng
        là an toàn.

        Dùng CHUNG cho cả chế độ luật lẫn chế độ AI: sau khi hai chế độ đi chung
        route, gợi ý của luật cũng mang `category_id` khi tên chương đủ rõ, và
        `null` ở ba tầng dưới. Nhánh riêng cho chế độ luật chỉ còn là một cách
        để hai đường ghi lệch nhau.
      */
      rows = applicable.map((item) => ({
        question_id: item.question_id,
        topic_id: item.topic_id,
        category_id: item.category_id,
        section_id: item.section_id,
        subsection_id: item.subsection_id,
      }))
    }

    try {
      let written = 0
      for (let i = 0; i < rows.length; i += CHUNK) {
        const batch = rows.slice(i, i + CHUNK)
        const { error: upsertError } = await supabase
          .from('question_taxonomy')
          .upsert(batch, { onConflict: 'question_id' })
        if (upsertError) throw upsertError
        written += batch.length
      }
      setDone(written)
      onApplied()
    } catch (caught) {
      console.error('Bulk taxonomy update failed:', caught)
      const message = caught instanceof Error ? caught.message : String(caught)
      setError(
        `Không ghi được phân loại: ${message}. Nếu lỗi nhắc tới quyền (RLS), tài khoản của bạn có thể chưa đủ quyền ghi bảng question_taxonomy.`
      )
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-300 bg-[var(--background-card)] shadow-2xl dark:border-slate-700">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 dark:border-slate-700">
          <div>
            <h2 className="font-baloo text-lg font-bold text-slate-800 dark:text-white">
              Phân loại lại {questions.length} câu đã chọn
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Ghi đè phân loại hiện tại. Không có nút hoàn tác — xem kỹ số ở nút áp dụng.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {done !== null ? (
          <div className="p-8 text-center">
            <Check className="mx-auto mb-3 h-12 w-12 text-emerald-600 dark:text-emerald-400" />
            <p className="font-semibold text-slate-800 dark:text-white">
              Đã cập nhật phân loại cho {done} câu.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="btn-action mt-5 rounded-xl bg-teal-600 px-5 py-2.5 font-semibold text-white hover:bg-teal-700"
            >
              Xong
            </button>
          </div>
        ) : (
          <>
            <div className="flex gap-2 border-b border-slate-200 px-5 pt-4 dark:border-slate-700">
              {(
                [
                  ['manual', 'Gán vào một nhánh'],
                  ['auto', 'Gợi ý theo luật'],
                  ['ai', 'Gợi ý AI'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    // Đổi tab là đổi cách máy đọc câu, nên kết quả cũ không còn
                    // nói về việc đang làm. Giữ lại là để người soạn bấm Áp dụng
                    // lên một danh sách sinh ra bởi chế độ khác.
                    if (value !== mode) {
                      setAi(null)
                      setSkipped(new Set())
                      setError(null)
                    }
                    setMode(value)
                  }}
                  className={`rounded-t-lg border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
                    mode === value
                      ? 'border-teal-600 text-teal-700 dark:border-teal-400 dark:text-teal-300'
                      : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {mode !== 'manual' ? (
                <div className="space-y-3">
                  {mode === 'ai' ? (
                    <p className="flex items-start gap-2 rounded-lg bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-teal-600 dark:text-teal-400" />
                      <span>
                        Bảng luật chạy <strong>trước</strong>; DeepSeek chỉ được hỏi những câu
                        luật bó tay. AI gợi ý được cả đường đi tới <strong>Mục con</strong>, và
                        chỉ được chọn trong cây có thật — không khớp thì nó trả về &quot;không
                        xếp được&quot; chứ không bịa nhánh mới.
                      </span>
                    </p>
                  ) : (
                    <p className="flex items-start gap-2 rounded-lg bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-teal-600 dark:text-teal-400" />
                      <span>
                        Máy đối chiếu bảng luật, <strong>không gọi AI</strong> — miễn phí, và
                        chạy lại luôn ra cùng kết quả. Luật ra tới tầng <strong>Chuyên đề</strong>{' '}
                        khi tên chương đủ rõ, còn Mục / Mục con thì để trống chứ không đoán.
                      </span>
                    </p>
                  )}

                  {mode === 'ai' && (
                    <label className="flex items-start gap-2 rounded-lg border border-slate-300 p-3 text-sm dark:border-slate-600">
                      <input
                        type="checkbox"
                        checked={deepSuggest}
                        onChange={(event) => setDeepSuggest(event.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-teal-600"
                      />
                      <span className="text-slate-700 dark:text-slate-300">
                        Hỏi AI cả những câu luật đã đoán được
                        <span className="block text-xs text-slate-500 dark:text-slate-400">
                          Luật dừng ở tầng Chuyên đề. Bật cái này để lấy cả Mục / Mục con — đổi
                          lại tốn API cho cả những câu vốn xử lý được miễn phí.
                        </span>
                      </span>
                    </label>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {AI_SCOPES.map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          setAiScope(value)
                          setAi(null)
                          setSkipped(new Set())
                        }}
                        disabled={aiLoading || (value === 'selection' && questions.length === 0)}
                        className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
                          aiScope === value
                            ? 'bg-teal-600 text-white'
                            : 'bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200'
                        }`}
                      >
                        {label}
                        {value === 'selection' && ` (${questions.length})`}
                      </button>
                    ))}
                  </div>

                  {aiScope === 'tat_ca' && (
                    <p className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200">
                      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      <span>
                        Chế độ này chạm cả những câu <strong>đã phân loại tay</strong>, và áp dụng
                        là ghi đè. Mọi dòng được <strong>bỏ tick sẵn</strong> — tự tick từng câu
                        thầy thật sự muốn đổi.
                      </span>
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void runSuggest(mode === 'auto')}
                      disabled={aiLoading}
                      className="btn-action inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                    >
                      {aiLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                      {ai && !aiLoading
                        ? 'Gợi ý lại'
                        : aiScope === 'selection'
                          ? `Lấy gợi ý cho ${questions.length} câu`
                          : 'Lấy gợi ý'}
                    </button>

                    {aiLoading && (
                      <button
                        type="button"
                        onClick={() => {
                          stopAiRef.current = true
                        }}
                        className="rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
                      >
                        Dừng
                      </button>
                    )}
                  </div>

                  {ai && ai.total > 0 && (
                    <div className="space-y-1">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                        <div
                          className="h-full rounded-full bg-teal-500 transition-all duration-300"
                          style={{ width: `${Math.round((ai.done / ai.total) * 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {ai.done}/{ai.total} câu · luật xử được {ai.byRule}
                        {mode === 'ai' &&
                          ` · hỏi AI ${ai.askedAi} · ước tính ${ai.estimatedCostUsd.toFixed(4)} USD`}
                      </p>
                    </div>
                  )}

                  {ai && ai.warnings.length > 0 && (
                    <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      <span>
                        {ai.warnings.length} lô bị lỗi và không có gợi ý. Bấm &quot;Gợi ý lại&quot;
                        để thử phần đó.
                      </span>
                    </p>
                  )}

                  {ai && ai.unresolved.length > 0 && (
                    <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      {/* Cùng con số, hai nghĩa khác hẳn. Ở chế độ luật nó là
                          "luật chịu, CHƯA hỏi AI" — còn đường đi tiếp. Ở chế độ
                          AI thì cả hai tầng đều chịu, hết đường máy. */}
                      <span>
                        {mode === 'ai' ? (
                          <>
                            {ai.unresolved.length} câu không xếp được vào nhánh nào, kể cả sau khi
                            hỏi AI. Máy không đoán bừa — những câu này cần gán tay, hoặc cây
                            chuyên đề còn thiếu nhánh.
                          </>
                        ) : (
                          <>
                            {ai.unresolved.length} câu luật không đủ dấu hiệu để kết luận. Máy
                            không đoán bừa — thử tab <strong>Gợi ý AI</strong>, hoặc gán tay.
                          </>
                        )}
                      </span>
                    </p>
                  )}

                  {ai && proposed.length === 0 && (
                    <p className="py-8 text-center text-slate-500 dark:text-slate-400">
                      Chưa có gợi ý nào.
                    </p>
                  )}

                  {proposed.length > 0 && (
                    <SelectAllBar
                      selected={applicable.length}
                      total={proposed.length}
                      onSelectAll={selectAll}
                      onClearAll={clearAll}
                      warnOverwrite={aiScope === 'tat_ca'}
                    />
                  )}

                  {ai && (
                    <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                      {proposed
                        .map((item) => {
                          const isSkipped = skipped.has(item.question_id)
                          return (
                            <li key={item.question_id} className="flex items-start gap-3 py-3">
                              <input
                                type="checkbox"
                                checked={!isSkipped}
                                onChange={() =>
                                  setSkipped((prev) => {
                                    const next = new Set(prev)
                                    if (next.has(item.question_id)) next.delete(item.question_id)
                                    else next.add(item.question_id)
                                    return next
                                  })
                                }
                                className="mt-1 h-4 w-4 accent-teal-600"
                                aria-label={`Áp dụng gợi ý cho câu ${item.question_id}`}
                              />
                              <div className="min-w-0 flex-1">
                                <p className="line-clamp-2 text-sm text-slate-700 dark:text-slate-300">
                                  {contentOf(item.question_id).replace(/\s+/g, ' ').slice(0, 160)}
                                </p>
                                <p className="mt-1 text-xs">
                                  <span className="font-semibold text-teal-700 dark:text-teal-300">
                                    {pathLabel(item)}
                                  </span>
                                  <span className="text-slate-500 dark:text-slate-400">
                                    {' '}
                                    · {item.ly_do}
                                    {item.do_tin_cay < 1 && ` · ${item.do_tin_cay.toFixed(2)}`}
                                  </span>
                                </p>
                              </div>
                            </li>
                          )
                        })}
                    </ul>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    Chọn tới tầng nào thì các tầng dưới bị xoá. Ví dụ chỉ chọn Chủ đề thì
                    Chuyên đề / Mục / Mục con của các câu này sẽ trống — để nhánh cũ không
                    còn trỏ sang một chủ đề khác.
                  </p>

                  <Field label="Chủ đề" required>
                    <select
                      value={topicId}
                      onChange={(event) => {
                        setTopicId(event.target.value)
                        setCategoryId('')
                        setSectionId('')
                        setSubsectionId('')
                      }}
                      className={selectClass}
                    >
                      <option value="">— Chọn chủ đề —</option>
                      {topics.map((topic) => (
                        <option key={topic.id} value={topic.id}>
                          {topic.name}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Chuyên đề">
                    <select
                      value={categoryId}
                      onChange={(event) => {
                        setCategoryId(event.target.value)
                        setSectionId('')
                        setSubsectionId('')
                      }}
                      disabled={!topicId}
                      className={selectClass}
                    >
                      <option value="">— Không đặt —</option>
                      {visibleCategories.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Mục">
                    <select
                      value={sectionId}
                      onChange={(event) => {
                        setSectionId(event.target.value)
                        setSubsectionId('')
                      }}
                      disabled={!categoryId}
                      className={selectClass}
                    >
                      <option value="">— Không đặt —</option>
                      {visibleSections.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Mục con">
                    <select
                      value={subsectionId}
                      onChange={(event) => setSubsectionId(event.target.value)}
                      disabled={!sectionId}
                      className={selectClass}
                    >
                      <option value="">— Không đặt —</option>
                      {visibleSubsections.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              )}

              {error && (
                <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200">
                  {error}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-200 p-5 dark:border-slate-700">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={() => void apply()}
                disabled={saving || targetCount === 0 || (mode === 'manual' && !manualReady)}
                className="btn-action inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Áp dụng cho {targetCount} câu
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const selectClass =
  'w-full rounded-xl border border-slate-300 bg-[var(--background-raised)] px-3 py-2.5 text-sm text-slate-800 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100'

/**
 * Thanh "chọn tất cả" đứng ngay trên danh sách gợi ý.
 *
 * VÌ SAO CÓ. Một lượt "Toàn bộ câu chưa phân loại" trả về hàng trăm dòng, và
 * người soạn đọc lướt rồi muốn áp dụng cả loạt — bấm từng ô là công việc thuần
 * cơ học, đúng loại việc mà máy phải gánh.
 *
 * Ô tick ở đây là BA TRẠNG THÁI: tick khi chọn hết, gạch ngang khi chọn một
 * phần, trống khi không chọn gì. Trạng thái giữa quan trọng — nếu không có nó
 * thì người soạn bỏ tick vài dòng xong nhìn lên thấy ô header trống, tưởng vừa
 * mất hết lựa chọn.
 */
function SelectAllBar({
  selected,
  total,
  onSelectAll,
  onClearAll,
  warnOverwrite,
}: {
  selected: number
  total: number
  onSelectAll: () => void
  onClearAll: () => void
  /** Phạm vi "Toàn bộ ngân hàng": áp dụng là ghi đè lên phân loại tay đã có. */
  warnOverwrite: boolean
}) {
  const allSelected = selected === total && total > 0
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-300 bg-[var(--background-raised)] px-3 py-2 dark:border-slate-600">
      <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
        <input
          type="checkbox"
          checked={allSelected}
          ref={(node) => {
            // `indeterminate` không có thuộc tính JSX tương ứng — chỉ đặt được
            // bằng tay trên phần tử DOM.
            if (node) node.indeterminate = selected > 0 && !allSelected
          }}
          onChange={() => (allSelected ? onClearAll() : onSelectAll())}
          className="h-4 w-4 accent-teal-600"
        />
        Chọn tất cả
      </label>

      <span className="text-sm text-slate-500 dark:text-slate-400">
        đang chọn {selected}/{total}
      </span>

      {selected > 0 && (
        <button
          type="button"
          onClick={onClearAll}
          className="ml-auto rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          Bỏ chọn tất cả
        </button>
      )}

      {warnOverwrite && selected > 0 && (
        <p className="w-full text-xs text-red-700 dark:text-red-300">
          Phạm vi này chạm cả câu đã phân loại tay — {selected} dòng đang chọn sẽ bị{' '}
          <strong>ghi đè</strong>, không có nút hoàn tác.
        </p>
      )}
    </div>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-slate-300">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
    </label>
  )
}
