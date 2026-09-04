'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckSquare, Clock, FileText, FolderTree, Loader2, Plus, Square } from 'lucide-react'
import { nanoid } from 'nanoid'
import GlobalHeader from '@/components/GlobalHeader'
import MathContent, { MathProvider } from '@/components/MathContent'
import { createClient } from '@/lib/supabase/client'
import {
  QUESTION_TYPE_LABEL,
  TRUE_FALSE_STATEMENT_COUNT,
  examTotalScore,
  initialQuestionScore,
  requiresMoetScale,
  rubricTotal,
} from '@/lib/exam/scoring'
import type { ScoringProfile } from '@/lib/exam/scoring'
import type { ExamMode } from '@/types'

/**
 * Ba loại đề giáo viên tạo được. Đây là **một lựa chọn cho người dùng** nhưng ghi
 * xuống **hai cột độc lập** — và đó là chỗ dễ hiểu sai nhất của trang này:
 *
 * - `exam_mode` trả lời "làm bài kiểu gì": `simulation` là bài thi có giờ,
 *   `practice` là ôn tập không giới hạn thời gian.
 * - `scoring_profile` trả lời "chấm theo thang nào": `moet_standard` bắt buộc
 *   trọng số của Bộ, `custom` để giáo viên tự đặt.
 *
 * Thi thử và thi học kì **cùng** `exam_mode = 'simulation'` nhưng khác hồ sơ điểm.
 * Vì vậy không nơi nào được suy hồ sơ từ mode — bảng này là chỗ duy nhất hai cột
 * được nối với nhau.
 */
const EXAM_KIND = {
  thi_thu: {
    label: 'Thi thử',
    mode: 'simulation',
    profile: 'moet_standard',
    hint: 'Theo thang Bộ GD&ĐT: trắc nghiệm 0,25 — Đúng/Sai 1,0 — trả lời ngắn 0,5. '
      + 'Câu Đúng/Sai phải đủ 4 ý. Đề chuẩn cộng đúng 10,00.',
  },
  hoc_ki: {
    label: 'Thi học kì',
    mode: 'simulation',
    profile: 'custom',
    hint: 'Giáo viên tự đặt ma trận điểm. Khởi tạo 1 điểm mỗi câu, sửa từng câu ở '
      + 'trang cấu hình điểm của đề. Không bắt buộc tổng 10 và không bắt buộc 4 ý.',
  },
  on_tap: {
    label: 'Ôn tập',
    mode: 'practice',
    profile: 'custom',
    hint: 'Không giới hạn thời gian, tự đặt trọng số. Bản pilot chưa hỗ trợ câu tự luận.',
  },
} as const satisfies Record<string, {
  label: string
  mode: ExamMode
  profile: ScoringProfile
  hint: string
}>

type ExamKind = keyof typeof EXAM_KIND

const examKindOrder = ['thi_thu', 'hoc_ki', 'on_tap'] as const satisfies readonly ExamKind[]

/**
 * Số câu tối đa lấy về một lượt cho khung chọn câu.
 *
 * Có trần thì phải NÓI khi chạm trần: khung chọn hiện luôn "khớp N câu, đang hiện
 * M" để giáo viên biết mình đang nhìn một phần, chứ không im lặng cắt bớt rồi để
 * người dùng tưởng chương chỉ có ngần ấy câu.
 */
const POOL_LIMIT = 300

interface Topic { id: string; name: string }
interface Category { id: string; name: string; topic_id: string }
interface Section { id: string; name: string; category_id: string; topic_id: string }
interface Subsection { id: string; name: string; section_id: string }

/** Một câu ứng viên, đã chuẩn hoá từ PostgREST. Tách khỏi việc tính điểm để đổi
 *  loại đề không phải gọi lại database. */
interface PoolQuestion {
  id: string
  content: string
  questionType: string
  /** Số ý của câu Đúng/Sai (số dòng `answers`). */
  statementCount: number
  /** Tổng thang điểm rubric của câu tự luận; `null` khi chưa cấu hình. */
  essayRubricTotal: number | null
  /** Dùng để xếp thứ tự câu trong đề — giữ đúng thứ tự nhập vào ngân hàng. */
  createdAt: string
}

/** Kết quả kiểm cấu hình điểm của đề gốc, tính trước khi cho bấm "Tạo đề". */
interface ScorePlan {
  /** Hồ sơ đã dùng để tính kế hoạch này. */
  profile: ScoringProfile
  /** Tổng điểm của đề nếu tạo — đề thi thử chuẩn phải ra đúng 10,0. */
  totalScore: number
  /** Trọng số từng câu, khoá theo `questions.id`. */
  scoreByQuestion: Record<string, number>
  /** Số câu theo loại, kể cả câu bị chặn. */
  countByType: Record<string, number>
  /** Tổng điểm theo loại; thiếu khoá khi mọi câu loại đó đều bị chặn. */
  subtotalByType: Record<string, number>
  /** Câu tự luận chưa có rubric dùng được → chặn tạo đề ở **mọi** loại đề, vì đây
   *  là ràng buộc của RPC chấm thi chứ không phải của thang Bộ. */
  essayWithoutRubric: string[]
  /** Câu Đúng/Sai không đúng 4 ý, kèm số ý thực tế → chỉ chặn đề **thi thử**. */
  trueFalseWrongStatementCount: { questionId: string; statementCount: number }[]
}

/** Thứ tự hiển thị trong bảng tổng kết điểm — theo thứ tự phần của đề thi. */
const scoreTableOrder = ['multiple_choice', 'true_false', 'short_answer', 'essay'] as const

/**
 * Tính trọng số và các lỗi chặn tạo đề, theo hồ sơ điểm.
 *
 * Hàm thuần, không gọi database: đổi loại đề chỉ tính lại tại chỗ. Hai lỗi bị chặn
 * đều là loại "phát hiện muộn thì quá muộn" — câu tự luận thiếu rubric làm
 * `submit_exam_attempt` raise `ESSAY_GRADING_CONFIG_MISSING` đúng lúc học sinh nộp
 * bài, còn câu Đúng/Sai khác 4 ý bị trigger
 * `exam_questions_true_false_four_statements` chặn giữa lúc INSERT.
 */
function buildScorePlan(questions: PoolQuestion[], profile: ScoringProfile): ScorePlan {
  const scoreByQuestion: Record<string, number> = {}
  const countByType: Record<string, number> = {}
  const scoresByType: Record<string, number[]> = {}
  const essayWithoutRubric: string[] = []
  const trueFalseWrongStatementCount: { questionId: string; statementCount: number }[] = []

  for (const question of questions) {
    countByType[question.questionType] = (countByType[question.questionType] ?? 0) + 1

    const score = initialQuestionScore(profile, question.questionType, question.essayRubricTotal)
    if (score === null) {
      if (question.questionType === 'essay') essayWithoutRubric.push(question.id)
      continue
    }
    scoreByQuestion[question.id] = score
    const bucket = scoresByType[question.questionType] ?? []
    bucket.push(score)
    scoresByType[question.questionType] = bucket

    // Hàng rào 4 ý chỉ áp cho đề theo thang Bộ. Đề học kì được dùng câu Đúng/Sai
    // 2 hay 3 ý — chấm theo tỷ lệ, xem `trueFalseScore()`.
    if (
      requiresMoetScale(profile)
      && question.questionType === 'true_false'
      && question.statementCount !== TRUE_FALSE_STATEMENT_COUNT
    ) {
      trueFalseWrongStatementCount.push({
        questionId: question.id,
        statementCount: question.statementCount,
      })
    }
  }

  const subtotalByType: Record<string, number> = {}
  for (const [type, scores] of Object.entries(scoresByType)) {
    subtotalByType[type] = examTotalScore(scores)
  }

  return {
    profile,
    totalScore: examTotalScore(Object.values(scoreByQuestion)),
    scoreByQuestion,
    countByType,
    subtotalByType,
    essayWithoutRubric,
    trueFalseWrongStatementCount,
  }
}

export default function CreateExamPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [title, setTitle] = useState('')
  const [duration, setDuration] = useState(90)
  const [grade, setGrade] = useState(12)
  const [kind, setKind] = useState<ExamKind>('thi_thu')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Danh mục để lọc, tải một lần. Cây `topics → categories → sections →
  // subsections` dùng chung với ngân hàng câu hỏi, nên chương của một lớp cũng là
  // một `category` như mọi chuyên đề khác.
  const [sources, setSources] = useState<string[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [subsections, setSubsections] = useState<Subsection[]>([])

  const [source, setSource] = useState('')
  const [topicId, setTopicId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [subsectionId, setSubsectionId] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  const [pool, setPool] = useState<PoolQuestion[]>([])
  const [poolTotal, setPoolTotal] = useState(0)
  /** Khoá bộ lọc đã có kết quả trong `pool`. `null` = chưa lọc lần nào. */
  const [loadedKey, setLoadedKey] = useState<string | null>(null)

  /*
    Câu đã chọn giữ CẢ dữ liệu của câu, không chỉ id.

    Giáo viên ráp đề thi thử phải đổi bộ lọc nhiều lượt: 12 trắc nghiệm ở chương
    này, 4 Đúng/Sai ở chương kia. Nếu chỉ giữ id thì đổi bộ lọc là mất số ý và
    rubric của những câu đã chọn trước đó, và bảng điểm sẽ nói sai ngay khi câu
    rời khỏi khung đang hiện.
  */
  const [picked, setPicked] = useState<Record<string, PoolQuestion>>({})

  const { mode, profile } = EXAM_KIND[kind]

  // Thứ tự câu trong đề = thứ tự nhập vào ngân hàng, không phải thứ tự bấm chọn:
  // bấm nhầm rồi bấm lại không được làm câu đó nhảy xuống cuối đề.
  const pickedQuestions = useMemo(
    () => Object.values(picked).sort((a, b) =>
      a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt)
    ),
    [picked]
  )

  // Tính lại tại chỗ khi đổi loại đề hoặc đổi tập câu, không gọi lại database —
  // trọng số là hàm thuần của (câu hỏi, hồ sơ).
  const scorePlan = useMemo(
    () => (pickedQuestions.length > 0 ? buildScorePlan(pickedQuestions, profile) : null),
    [pickedQuestions, profile]
  )

  const essayCount = scorePlan?.countByType.essay ?? 0
  const unsupportedEssayPractice = mode === 'practice' && essayCount > 0
  const blockedByScoreConfig = Boolean(
    scorePlan
    && (scorePlan.essayWithoutRubric.length > 0 || scorePlan.trueFalseWrongStatementCount.length > 0)
  )

  useEffect(() => {
    const load = async () => {
      const [sourceRes, topicRes, categoryRes, sectionRes, subsectionRes] = await Promise.all([
        supabase.from('questions').select('source_exam').not('source_exam', 'is', null).order('source_exam'),
        supabase.from('topics').select('id, name').order('order_index'),
        supabase.from('categories').select('id, name, topic_id').order('order_index'),
        supabase.from('sections').select('id, name, category_id, topic_id').order('order_index'),
        supabase.from('subsections').select('id, name, section_id').order('order_index'),
      ])
      setSources([...new Set((sourceRes.data || []).map(row => row.source_exam).filter(Boolean))] as string[])
      setTopics(topicRes.data || [])
      setCategories(categoryRes.data || [])
      setSections(sectionRes.data || [])
      setSubsections(subsectionRes.data || [])
      setLoading(false)
    }
    void load()
  }, [supabase])

  const filterActive = Boolean(source || topicId || categoryId || sectionId || subsectionId || typeFilter)
  const filterKey = [source, topicId, categoryId, sectionId, subsectionId, typeFilter].join('|')

  /*
    "Đang lọc" là trạng thái SUY RA, không phải cờ được set tay: nó đúng bằng
    "khoá bộ lọc hiện tại chưa có kết quả tương ứng". Set cờ loading ngay trong
    thân effect là gọi setState đồng bộ giữa effect — chuỗi render dây chuyền mà
    `react-hooks/set-state-in-effect` chặn, và cũng là chỗ dễ để sót cờ bật vĩnh
    viễn khi một nhánh return sớm quên tắt.
  */
  const poolLoading = filterActive && loadedKey !== filterKey

  /*
    Lọc đẩy hết xuống PostgREST, không tải cả ngân hàng về rồi lọc ở trình duyệt —
    cùng lý do với `/admin/questions`: lọc trên một phần dữ liệu là bộ lọc NÓI SAI.
    Lọc theo taxonomy dùng embed `!inner` để biến quan hệ thành phép nối trong.
  */
  useEffect(() => {
    if (!filterActive) return
    let cancelled = false

    const taxonomyActive = Boolean(topicId || categoryId || sectionId || subsectionId)
    const columns = [
      'id', 'content', 'question_type', 'created_at',
      'answers ( id )',
      'question_grading_configs ( rubric )',
      ...(taxonomyActive ? ['question_taxonomy!inner(question_id)'] : []),
    ].join(', ')

    let query = supabase.from('questions')
      .select(columns, { count: 'exact' })
      .order('created_at', { ascending: true })
      .range(0, POOL_LIMIT - 1)

    if (source) query = query.eq('source_exam', source)
    if (typeFilter) query = query.eq('question_type', typeFilter)
    if (topicId) query = query.eq('question_taxonomy.topic_id', topicId)
    if (categoryId) query = query.eq('question_taxonomy.category_id', categoryId)
    if (sectionId) query = query.eq('question_taxonomy.section_id', sectionId)
    if (subsectionId) query = query.eq('question_taxonomy.subsection_id', subsectionId)

    void query.then(({ data, error: loadError, count }) => {
      if (cancelled) return
      if (loadError) {
        setError(loadError.message)
        setPool([])
        setPoolTotal(0)
        setLoadedKey(filterKey)
        return
      }
      const rows = (data ?? []) as unknown as {
        id: string
        content: string
        question_type: string
        created_at: string
        answers?: { id: string }[]
        question_grading_configs?: { rubric: unknown } | { rubric: unknown }[] | null
      }[]
      setPool(rows.map((row) => {
        // question_grading_configs là quan hệ 1-1 nhưng PostgREST trả về mảng
        // hoặc object tuỳ suy luận khoá; xử lý cả hai để không phụ thuộc vào đó.
        const configs = row.question_grading_configs
        const config = Array.isArray(configs) ? configs[0] : configs
        return {
          id: row.id,
          content: row.content,
          questionType: row.question_type,
          statementCount: row.answers?.length ?? 0,
          essayRubricTotal: rubricTotal(config?.rubric),
          createdAt: row.created_at,
        }
      }))
      setPoolTotal(count ?? 0)
      setLoadedKey(filterKey)
    })

    return () => { cancelled = true }
  }, [supabase, filterActive, filterKey, source, typeFilter, topicId, categoryId, sectionId, subsectionId])

  const visibleCategories = useMemo(
    () => (topicId ? categories.filter(item => item.topic_id === topicId) : categories),
    [categories, topicId]
  )
  const visibleSections = useMemo(() => {
    if (categoryId) return sections.filter(item => item.category_id === categoryId)
    return topicId ? sections.filter(item => item.topic_id === topicId) : sections
  }, [sections, topicId, categoryId])
  const visibleSubsections = useMemo(
    () => (sectionId ? subsections.filter(item => item.section_id === sectionId) : []),
    [subsections, sectionId]
  )

  const togglePick = (question: PoolQuestion) => {
    setError(null)
    setPicked((current) => {
      if (!current[question.id]) return { ...current, [question.id]: question }
      const next = { ...current }
      delete next[question.id]
      return next
    })
  }

  /** Chọn mọi câu ĐANG HIỆN, giữ nguyên các câu đã chọn ở bộ lọc trước. */
  const pickAllVisible = () => {
    setError(null)
    setPicked(current => ({ ...current, ...Object.fromEntries(pool.map(item => [item.id, item])) }))
  }

  const create = async () => {
    if (!title.trim() || pickedQuestions.length === 0) return
    if (unsupportedEssayPractice) {
      setError('Bản thử tự luận mới hỗ trợ đề thi thử/kiểm tra, chưa áp dụng cho chế độ ôn tập.')
      return
    }
    if (!scorePlan) {
      setError('Chưa chọn câu nào cho đề. Lọc theo chương hoặc nguồn rồi tích chọn câu.')
      return
    }
    if (scorePlan.essayWithoutRubric.length > 0) {
      setError(
        `Câu tự luận chưa có hướng dẫn chấm rubric: ${scorePlan.essayWithoutRubric.join(', ')}. `
        + 'Điểm câu tự luận lấy từ tổng thang điểm rubric ở mọi loại đề, nên phải thêm rubric ở '
        + '/admin/questions/essay/new trước khi đưa câu vào đề.'
      )
      return
    }
    if (scorePlan.trueFalseWrongStatementCount.length > 0) {
      setError(
        'Đề thi thử chấm theo bậc thang của Bộ nên câu Đúng/Sai phải có đúng 4 ý: '
        + scorePlan.trueFalseWrongStatementCount
          .map(item => `${item.questionId} (${item.statementCount} ý)`)
          .join(', ')
        + '. Sửa câu hỏi cho đủ 4 ý, hoặc chọn loại "Thi học kì" nếu muốn giữ số ý hiện tại.'
      )
      return
    }
    setSaving(true)
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()

    /*
      Đọc lại đúng những câu đã chọn ngay trước khi ghi.

      Bảng điểm ở trên tính trên bản chụp lúc lọc; giữa lúc đó và lúc bấm tạo đề,
      câu có thể bị xoá hoặc bị đổi loại ở tab khác. Ghi theo bản chụp cũ thì đề
      mang trọng số của một loại câu không còn tồn tại — sai lệch chỉ lộ ra lúc
      học sinh nộp bài.
    */
    const pickedIds = pickedQuestions.map(question => question.id)
    const { data: questions, error: questionError } = await supabase.from('questions')
      .select('id, question_type').in('id', pickedIds)
    if (questionError || !questions?.length) {
      setError(questionError?.message || 'Không đọc lại được các câu đã chọn. Tải lại trang rồi thử lại.')
      setSaving(false)
      return
    }
    const freshTypeById = new Map(questions.map(question => [question.id, question.question_type]))
    const changed = pickedQuestions.filter(
      question => freshTypeById.get(question.id) !== question.questionType
    )
    if (changed.length > 0) {
      setError(
        `Ngân hàng đã đổi kể từ lúc chọn câu (${changed.length} câu bị xoá hoặc đổi loại: `
        + `${changed.slice(0, 5).map(question => question.id).join(', ')}`
        + `${changed.length > 5 ? '…' : ''}). Tải lại trang rồi chọn lại.`
      )
      setSaving(false)
      return
    }
    // Trọng số lấy từ scorePlan đã kiểm ở trên, không tính lại tại đây — tính hai
    // lần theo hai đường là cách chắc chắn nhất để hai con số lệch nhau.
    const totalScore = examTotalScore(pickedQuestions.map(question => scorePlan.scoreByQuestion[question.id]))
    const examId = nanoid()
    const { error: examError } = await supabase.from('exams').insert({
      id: examId,
      title: title.trim(),
      subject: 'Toán',
      duration: mode === 'practice' ? 0 : duration,
      // KHÔNG ghi `max_attempts` ở đây — xem khối UPDATE ngay sau INSERT.
      total_score: totalScore,
      passing_score: 5,
      is_published: false,
      // Chỉ ghi khi đề được bốc trong PHẠM VI một nguồn. Đề ráp từ nhiều chương
      // không có "đề gốc" nào cả, và ghi bừa một cái tên vào đây là nói dối về
      // xuất xứ của đề.
      source_exam: source || null,
      grade,
      exam_mode: mode,
      // Chỉ ghi được lúc INSERT: `20260806` cố ý không grant UPDATE cho cột này,
      // vì đổi hồ sơ của đề đã có câu hỏi làm mọi trọng số hiện có thành sai thang.
      scoring_profile: profile,
      /* KHÔNG ghi `session_size`. Cột đó vẫn còn trên `exams` nhưng KHÔNG AI ĐỌC:
         đề ôn tập hiện cả ba phần một lượt rồi nộp một lần (`PracticeRunner` +
         `submit_practice_attempt`), không chia đoạn. Chia đoạn là chuyện của bài
         tập về nhà, và nó đọc `homeworks.session_size`.

         Cột này là di sản từ hồi bài tập về nhà còn là `exam_mode = 'homework'`;
         `20260621` tách miền ra và copy `e.session_size` sang bảng `homeworks`,
         nhưng để lại cột cũ. Ghi 10 vào đây làm người đọc code tưởng đề ôn tập
         cũng chia đoạn — đúng thứ khiến hai tính năng trông như một.

         Cột `NOT NULL DEFAULT 10` nên bỏ dòng ghi không làm INSERT hỏng. */
      created_by: user?.id || null,
    })
    if (examError) {
      setError(examError.message)
      setSaving(false)
      return
    }

    /*
      Đề ôn tập: mở số lượt làm thành không giới hạn (0 = không giới hạn, quy ước
      của `start_exam_attempt` và `20260803`).

      VÌ SAO LÀ UPDATE RIÊNG CHỨ KHÔNG NẰM TRONG INSERT Ở TRÊN.
      `20260722` cấp INSERT trên `exams` theo DANH SÁCH CỘT ĐÓNG, và
      `max_attempts` không có trong danh sách đó — nó chỉ có trong danh sách
      GRANT UPDATE. Đưa cột này vào INSERT làm cả câu lệnh bị từ chối với
      "permission denied for table exams", và thông báo đó KHÔNG nói cột nào có
      lỗi, nên nhìn như mất sạch quyền tạo đề. Đúng cái bẫy mà `20260806` đã phải
      thêm `GRANT INSERT (scoring_profile)` để thoát ra.

      Tách làm hai bước là an toàn ở đây vì đề sinh ra ở trạng thái nháp
      (`is_published: false`): chưa học sinh nào với tới được nó trong lúc giữa
      hai câu lệnh.

      Lỗi ở bước này KHÔNG chặn việc tạo đề. Đề đã tồn tại cùng câu hỏi, và trang
      xuất bản luôn ghi `max_attempts = 0` cho đề ôn tập — mà muốn xuất bản thì
      bắt buộc qua trang đó, nên giá trị sai không thể theo đề ra tới học sinh.
      Dừng cả luồng ở đây chỉ để lại một đề nửa vời, tệ hơn hẳn.
    */
    if (mode === 'practice') {
      const { error: attemptsError } = await supabase
        .from('exams')
        .update({ max_attempts: 0 })
        .eq('id', examId)
      if (attemptsError) {
        console.warn('Không đặt được số lượt không giới hạn cho đề ôn tập:', attemptsError.message)
      }
    }

    const orderByPart: Record<number, number> = { 1: 0, 2: 0, 3: 0 }
    const examQuestions = pickedQuestions.map((question) => {
      const partNumber = question.questionType === 'multiple_choice'
        ? 1
        : question.questionType === 'true_false' ? 2 : 3
      orderByPart[partNumber] += 1
      return {
        exam_id: examId,
        question_id: question.id,
        question_type: question.questionType,
        part_number: partNumber,
        order_in_part: orderByPart[partNumber],
        score: scorePlan.scoreByQuestion[question.id],
      }
    })
    const { error: linkError } = await supabase.from('exam_questions').insert(examQuestions)
    if (linkError) {
      await supabase.from('exams').delete().eq('id', examId)
      setError(
        linkError.message.includes('TRUE_FALSE_MUST_HAVE_FOUR_STATEMENTS')
          ? 'Có câu Đúng/Sai không đúng 4 ý. Sửa câu hỏi cho đủ 4 ý, hoặc chọn loại '
            + '"Thi học kì" — hàng rào 4 ý chỉ áp cho đề thi thử.'
          : linkError.message
      )
      setSaving(false)
      return
    }
    router.push(`/admin/exams/${examId}`)
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
      <GlobalHeader title="Tạo đề thi hoặc bài ôn tập" />
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-8">
        <section className="space-y-5 rounded-2xl border bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <FolderTree className="h-4 w-4 text-slate-500" />
              <label className="text-sm font-medium">Bốc câu từ ngân hàng</label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <select
                value={topicId}
                onChange={(e) => { setTopicId(e.target.value); setCategoryId(''); setSectionId(''); setSubsectionId(''); setError(null) }}
                className="rounded-xl border px-4 py-3 dark:bg-slate-900"
              >
                <option value="">-- Mạch kiến thức / lớp --</option>
                {topics.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>

              <select
                value={categoryId}
                onChange={(e) => { setCategoryId(e.target.value); setSectionId(''); setSubsectionId(''); setError(null) }}
                className="rounded-xl border px-4 py-3 dark:bg-slate-900"
              >
                <option value="">-- Chương / chuyên đề --</option>
                {visibleCategories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>

              <select
                value={sectionId}
                onChange={(e) => { setSectionId(e.target.value); setSubsectionId(''); setError(null) }}
                className="rounded-xl border px-4 py-3 dark:bg-slate-900"
              >
                <option value="">-- Bài --</option>
                {visibleSections.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>

              <select
                value={subsectionId}
                onChange={(e) => { setSubsectionId(e.target.value); setError(null) }}
                disabled={!sectionId}
                className="rounded-xl border px-4 py-3 disabled:opacity-50 dark:bg-slate-900"
              >
                <option value="">-- Dạng câu --</option>
                {visibleSubsections.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>

              <select
                value={typeFilter}
                onChange={(e) => { setTypeFilter(e.target.value); setError(null) }}
                className="rounded-xl border px-4 py-3 dark:bg-slate-900"
              >
                <option value="">-- Loại câu --</option>
                {scoreTableOrder.map(item => (
                  <option key={item} value={item}>{QUESTION_TYPE_LABEL[item]}</option>
                ))}
              </select>

              <select
                value={source}
                onChange={(e) => { setSource(e.target.value); setError(null) }}
                className="rounded-xl border px-4 py-3 dark:bg-slate-900"
              >
                <option value="">-- Nguồn (tuỳ chọn) --</option>
                {sources.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>

            {!filterActive ? (
              <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                Chọn ít nhất một bộ lọc để hiện câu hỏi. Lọc theo <strong>Chương / chuyên đề</strong> là
                cách ráp đề theo chương; các câu đã tích vẫn được giữ khi đổi bộ lọc, nên ráp đề từ
                nhiều chương vẫn được.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <span className="text-slate-600 dark:text-slate-300">
                    {poolLoading ? 'Đang lọc…' : (
                      <>
                        Khớp <strong className="tabular-nums">{poolTotal}</strong> câu
                        {poolTotal > pool.length && (
                          <>, đang hiện <strong className="tabular-nums">{pool.length}</strong> — lọc hẹp hơn để thấy hết</>
                        )}
                      </>
                    )}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={pickAllVisible}
                      disabled={pool.length === 0}
                      className="rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                    >
                      Chọn tất cả đang hiện
                    </button>
                    <button
                      onClick={() => { setPicked({}); setError(null) }}
                      disabled={pickedQuestions.length === 0}
                      className="rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                    >
                      Bỏ chọn tất cả
                    </button>
                  </div>
                </div>

                {poolLoading ? (
                  <Loader2 className="mx-auto my-10 h-7 w-7 animate-spin" />
                ) : pool.length === 0 ? (
                  <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                    Không có câu nào khớp bộ lọc này.
                  </p>
                ) : (
                  <MathProvider>
                    <div className="max-h-[45vh] space-y-2 overflow-y-auto rounded-xl border border-slate-100 p-2 dark:border-slate-700">
                      {pool.map((question) => {
                        const isPicked = Boolean(picked[question.id])
                        return (
                          <button
                            key={question.id}
                            onClick={() => togglePick(question)}
                            className={`flex w-full gap-3 rounded-xl border p-3 text-left ${
                              isPicked
                                ? 'border-teal-500 bg-teal-50/60 dark:bg-teal-900/20'
                                : 'border-slate-200 hover:border-teal-400 dark:border-slate-700'
                            }`}
                          >
                            {isPicked
                              ? <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
                              : <Square className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />}
                            <span className="min-w-0 flex-1 text-sm">
                              <MathContent content={question.content} className="line-clamp-3" />
                            </span>
                            <span className="shrink-0 space-y-1 text-right text-xs text-slate-400">
                              <span className="block">{QUESTION_TYPE_LABEL[question.questionType] ?? question.questionType}</span>
                              {question.questionType === 'true_false' && (
                                <span className="block tabular-nums">{question.statementCount} ý</span>
                              )}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </MathProvider>
                )}
              </>
            )}
          </div>

          {/* Loại đề đặt TRƯỚC bảng điểm: nó quyết định mọi con số trong bảng đó. */}
          <div>
            <label className="mb-2 block text-sm font-medium">Loại đề</label>
            <div className="grid grid-cols-3 gap-3">
              {examKindOrder.map((item) => (
                <button
                  key={item}
                  onClick={() => { setKind(item); setError(null) }}
                  className={`rounded-xl border p-3 font-medium ${
                    kind === item ? 'border-teal-600 bg-teal-600 text-white' : ''
                  }`}
                >
                  {EXAM_KIND[item].label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{EXAM_KIND[kind].hint}</p>
          </div>

          {scorePlan && (
            <div className="rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-900">
              <p className="flex items-center gap-2 font-semibold">
                <FileText className="h-4 w-4" />Đã chọn {pickedQuestions.length} câu
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-300">
                {Object.entries(scorePlan.countByType).map(([type, count]) => (
                  <span key={type} className="rounded-full bg-white px-2.5 py-1 dark:bg-slate-800">
                    {QUESTION_TYPE_LABEL[type] || type}: {count}
                  </span>
                ))}
              </div>
              {essayCount > 0 && (
                <p className="mt-3 rounded-lg bg-amber-50 p-2 text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                  Có {essayCount} câu tự luận: AI đề xuất, giáo viên bắt buộc duyệt trước khi có điểm cuối.
                </p>
              )}
              {unsupportedEssayPractice && (
                <p className="mt-2 text-sm font-medium text-red-600">
                  Hãy chọn “Thi thử” hoặc “Thi học kì” để dùng câu tự luận trong bản pilot này.
                </p>
              )}
            </div>
          )}

          {scorePlan && (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-slate-900">
              <p className="font-semibold">
                {requiresMoetScale(scorePlan.profile)
                  ? 'Điểm theo thang Bộ GD&ĐT'
                  : 'Điểm khởi tạo — giáo viên tự cấu hình'}
              </p>
              <table className="w-full text-left">
                <thead className="text-xs uppercase text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="pb-1 font-medium">Loại câu</th>
                    <th className="pb-1 text-right font-medium">Số câu</th>
                    <th className="pb-1 text-right font-medium">Điểm / câu</th>
                    <th className="pb-1 text-right font-medium">Tổng</th>
                  </tr>
                </thead>
                <tbody>
                  {scoreTableOrder.map((type) => {
                    const count = scorePlan.countByType[type] || 0
                    if (count === 0) return null
                    // Tự luận: mỗi câu một tổng rubric riêng nên không có
                    // "điểm/câu" chung. Trọng số các loại còn lại lấy từ đúng hàm
                    // mà lúc tạo đề dùng, không viết lại con số ở đây.
                    const unit = type === 'essay' ? null : initialQuestionScore(scorePlan.profile, type)
                    const subtotal = scorePlan.subtotalByType[type]
                    return (
                      <tr key={type} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="py-1.5">{QUESTION_TYPE_LABEL[type]}</td>
                        <td className="py-1.5 text-right tabular-nums">{count}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-500 dark:text-slate-400">
                          {unit !== null ? unit.toFixed(2) : 'theo rubric'}
                        </td>
                        <td className="py-1.5 text-right font-medium tabular-nums">
                          {subtotal === undefined ? '—' : subtotal.toFixed(2)}
                        </td>
                      </tr>
                    )
                  })}
                  <tr className="border-t-2 border-slate-200 font-semibold dark:border-slate-700">
                    <td className="py-1.5" colSpan={3}>Tổng điểm đề</td>
                    <td className="py-1.5 text-right tabular-nums">{scorePlan.totalScore.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>

              {scorePlan.essayWithoutRubric.length > 0 && (
                <p className="flex gap-2 rounded-lg bg-red-50 p-2.5 text-red-700 dark:bg-red-900/20 dark:text-red-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {scorePlan.essayWithoutRubric.length} câu tự luận chưa có hướng dẫn chấm rubric
                    ({scorePlan.essayWithoutRubric.join(', ')}). Điểm câu tự luận lấy từ tổng thang điểm
                    rubric ở mọi loại đề, nên phải thêm rubric trước khi đưa vào đề — nếu không, học sinh
                    nộp bài sẽ gặp lỗi và bài không được chấm.
                  </span>
                </p>
              )}

              {scorePlan.trueFalseWrongStatementCount.length > 0 && (
                <p className="flex gap-2 rounded-lg bg-red-50 p-2.5 text-red-700 dark:bg-red-900/20 dark:text-red-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Đề thi thử chấm theo bậc thang của Bộ nên câu Đúng/Sai phải có đúng{' '}
                    {TRUE_FALSE_STATEMENT_COUNT} ý:{' '}
                    {scorePlan.trueFalseWrongStatementCount
                      .map(item => `${item.questionId} (${item.statementCount} ý)`)
                      .join(', ')}
                    . Sửa câu hỏi cho đủ 4 ý, hoặc chọn loại “Thi học kì” để giữ số ý hiện tại.
                  </span>
                </p>
              )}

              {!blockedByScoreConfig && requiresMoetScale(scorePlan.profile) && scorePlan.totalScore !== 10 && (
                <p className="flex gap-2 rounded-lg bg-amber-50 p-2.5 text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Tổng {scorePlan.totalScore.toFixed(2)} điểm, không phải 10,00 — đề không theo cấu trúc
                    chuẩn (12 trắc nghiệm + 4 Đúng/Sai + 6 trả lời ngắn). Vẫn tạo được: điểm học sinh được
                    quy đổi về thang 10, làm đúng hết vẫn là 10,00.
                  </span>
                </p>
              )}

              {!blockedByScoreConfig && !requiresMoetScale(scorePlan.profile) && (
                <p className="rounded-lg bg-slate-50 p-2.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  Đề này không dùng thang Bộ nên tổng {scorePlan.totalScore.toFixed(2)} điểm là hợp lệ —
                  điểm học sinh luôn được quy đổi về thang 10. Sửa trọng số từng câu ở trang cấu hình điểm
                  của đề, khi đề còn nháp và chưa có ai làm.
                </p>
              )}
            </div>
          )}

          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Tên đề" className="w-full rounded-xl border px-4 py-3 dark:bg-slate-900" />
          <div className="grid grid-cols-2 gap-3">
            <select value={grade} onChange={e => setGrade(Number(e.target.value))} className="rounded-xl border px-4 py-3 dark:bg-slate-900">
              <option value={10}>Lớp 10</option><option value={11}>Lớp 11</option><option value={12}>Lớp 12</option>
            </select>
            {mode === 'simulation' && (
              <label className="flex items-center gap-2 rounded-xl border px-4">
                <Clock className="h-4 w-4" />
                <input type="number" min={10} max={300} value={duration} onChange={e => setDuration(Number(e.target.value))} className="w-full bg-transparent py-3 outline-none" />
                <span className="text-sm text-slate-500">phút</span>
              </label>
            )}
          </div>
          {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <button onClick={create} disabled={saving || !title.trim() || pickedQuestions.length === 0 || unsupportedEssayPractice || blockedByScoreConfig} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-medium text-white disabled:opacity-50">
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />} Tạo đề
          </button>
        </section>
      </main>
    </div>
  )
}
