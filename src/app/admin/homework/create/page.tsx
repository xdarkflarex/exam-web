'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Loader2, Search } from 'lucide-react'
import { nanoid } from 'nanoid'
import { AdminHeader } from '@/components/admin'
import { createClient } from '@/lib/supabase/client'
import {
  CUSTOM_DEFAULT_SCORE,
  QUESTION_TYPE_LABEL,
  examTotalScore,
  formatScoreInput,
  parseScoreInput,
} from '@/lib/exam/scoring'

interface QuestionRow {
  id: string
  content: string
  question_type: string
  /** Số ý/phương án của câu. Chỉ để hiển thị. Bài tập về nhà **không** ràng buộc
   *  câu Đúng/Sai phải đúng 4 ý — thang Bộ chỉ áp cho đề thi thử, và migration
   *  `20260806` cố ý không tạo trigger 4 ý trên `homework_questions`. Câu 2 hay 3
   *  ý vẫn chấm được: `moet_true_false_score` rơi về tỷ lệ tuyến tính, nhánh hợp
   *  lệ cho domain này. */
  statementCount: number
}

export default function CreateHomeworkPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [grade, setGrade] = useState(12)
  const [sessionSize, setSessionSize] = useState(10)
  const [query, setQuery] = useState('')
  const [questions, setQuestions] = useState<QuestionRow[]>([])
  const [selected, setSelected] = useState<string[]>([])
  /** Câu thuộc đoạn kiểm tra cuối bài. Rỗng = bài tập thường, chấm như trước. */
  const [testIds, setTestIds] = useState<string[]>([])
  /** Trọng số từng câu, giữ nguyên dạng chuỗi người nhập. Không parse ngay: nhập
   *  "0," giữa lúc gõ "0,5" mà parse mỗi ký tự thì con trỏ nhảy về đầu ô. */
  const [scoreDraft, setScoreDraft] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('questions')
        .select('id, content, question_type, answers ( id )')
        .in('question_type', ['multiple_choice', 'true_false', 'short_answer'])
        .order('created_at', { ascending: false })
        .limit(200)
      setQuestions((data || []).map(row => ({
        id: row.id,
        content: row.content,
        question_type: row.question_type,
        statementCount: row.answers?.length ?? 0,
      })))
      setLoading(false)
    }
    void load()
  }, [supabase])

  const filtered = questions.filter(question =>
    !query.trim() || question.content.toLowerCase().includes(query.trim().toLowerCase())
  )

  const selectedQuestions = questions.filter(question => selected.includes(question.id))

  /** Trọng số đã parse của từng câu đã chọn. `null` = ô nhập không phải số dương,
   *  chặn lưu. Câu chưa có bản nháp thì lấy mặc định 1 điểm.
   *
   *  Không bọc `useMemo`: `selectedQuestions` là mảng mới mỗi lần render nên memo
   *  sẽ miss mọi lần — chỉ thêm chi phí. Danh sách tối đa 200 câu. */
  const parsedScores = new Map<string, number | null>(
    selectedQuestions.map((question) => {
      const raw = scoreDraft[question.id]
      return [question.id, raw === undefined ? CUSTOM_DEFAULT_SCORE : parseScoreInput(raw)]
    })
  )

  const invalidScores = selectedQuestions.filter(question => parsedScores.get(question.id) == null)

  const totalScore = examTotalScore(
    selectedQuestions.map(question => parsedScores.get(question.id) ?? 0)
  )

  /** Tổng điểm của riêng đoạn kiểm tra — con số thật sự quyết định điểm bài này
   *  khi `testIds` không rỗng. */
  const testTotalScore = examTotalScore(
    selectedQuestions
      .filter(question => testIds.includes(question.id))
      .map(question => parsedScores.get(question.id) ?? 0)
  )

  const toggle = (id: string) => {
    setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
    // Bỏ câu khỏi đề thì bỏ luôn khỏi đoạn kiểm tra: để sót lại, câu đã gỡ vẫn
    // đếm vào "N câu ở đoạn kiểm tra" và con số trên màn hình sẽ nói dối.
    setTestIds(current => current.filter(item => item !== id))
  }

  const toggleTestPhase = (id: string) => {
    setError(null)
    setTestIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  }

  const setScore = (questionId: string, raw: string) => {
    setScoreDraft(current => ({ ...current, [questionId]: raw }))
    setError(null)
  }

  /** Đưa mọi câu đã chọn về 1 điểm — lối ra nhanh khi giáo viên sửa lung tung rồi
   *  muốn bắt đầu lại, thay vì phải xoá từng ô. */
  const resetScores = () => {
    setScoreDraft(Object.fromEntries(
      selectedQuestions.map(question => [question.id, formatScoreInput(CUSTOM_DEFAULT_SCORE)])
    ))
    setError(null)
  }

  const save = async () => {
    if (!title.trim() || selected.length === 0) return
    // Trọng số phải ghi tường minh. Trước 2026-08-06 phần này bỏ trắng cột `score`
    // và dựa vào DEFAULT 1 của homework_questions; ghi tường minh để con số trên UI
    // đúng bằng con số máy chấm dùng, kể cả khi DEFAULT của schema đổi về sau.
    const scoreByQuestion = new Map<string, number>()
    for (const question of selectedQuestions) {
      const score = parsedScores.get(question.id)
      if (score == null) {
        setError(`Trọng số của câu ${question.id} phải là số lớn hơn 0.`)
        return
      }
      scoreByQuestion.set(question.id, score)
    }

    setSaving(true)
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    const homeworkId = nanoid()
    const { error } = await supabase.from('homeworks').insert({
      id: homeworkId,
      title: title.trim(),
      description: description.trim() || null,
      grade,
      session_size: sessionSize,
      created_by: user?.id || null,
      is_published: false,
    })
    if (!error) {
      const { error: questionError } = await supabase.from('homework_questions').insert(
        selected.map((questionId, index) => ({
          homework_id: homeworkId,
          question_id: questionId,
          order_index: index,
          score: scoreByQuestion.get(questionId),
          phase: testIds.includes(questionId) ? 'test' : 'practice',
        }))
      )
      if (!questionError) {
        const { error: publishError } = await supabase
          .from('homeworks')
          .update({ is_published: true })
          .eq('id', homeworkId)
        if (!publishError) {
          router.push(`/admin/homework/${homeworkId}`)
          return
        }
        console.error('Publish homework:', publishError)
        setError(publishError.message)
      } else {
        console.error('Link homework questions:', questionError)
        setError(
          questionError.message.includes('homework_questions_positive_score')
            ? 'Có câu mang trọng số ≤ 0. Điểm mỗi câu phải là số lớn hơn 0.'
            : questionError.message
        )
      }
      await supabase.from('homeworks').delete().eq('id', homeworkId)
    } else {
      console.error('Create homework:', error)
      setError(error.message)
    }
    setSaving(false)
  }

  return (
    <div className="min-h-screen">
      <AdminHeader title="Tạo bài tập về nhà" subtitle="Tạo template độc lập, không tạo đề thi hoặc exam attempt" />
      <main className="space-y-5 p-6">
        <section className="grid gap-4 rounded-2xl border bg-white p-5 dark:border-slate-700 dark:bg-slate-800 md:grid-cols-2">
          <label className="md:col-span-2">
            <span className="mb-1 block text-sm font-medium">Tên bài tập</span>
            <input value={title} onChange={e => setTitle(e.target.value)} className="w-full rounded-xl border px-3 py-2.5 dark:bg-slate-900" />
          </label>
          <label className="md:col-span-2">
            <span className="mb-1 block text-sm font-medium">Mô tả</span>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="w-full rounded-xl border px-3 py-2.5 dark:bg-slate-900" />
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium">Lớp</span>
            <select value={grade} onChange={e => setGrade(Number(e.target.value))} className="w-full rounded-xl border px-3 py-2.5 dark:bg-slate-900">
              <option value={10}>10</option><option value={11}>11</option><option value={12}>12</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium">Số câu mỗi phiên</span>
            <input type="number" min={1} value={sessionSize} onChange={e => setSessionSize(Number(e.target.value))} className="w-full rounded-xl border px-3 py-2.5 dark:bg-slate-900" />
          </label>
        </section>

        <section className="rounded-2xl border bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-semibold">Chọn câu hỏi ({selected.length})</h2>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm nội dung..." className="rounded-xl border py-2 pl-9 pr-3 text-sm dark:bg-slate-900" />
            </div>
          </div>
          {loading ? <Loader2 className="mx-auto my-12 h-7 w-7 animate-spin" /> : (
            <div className="max-h-[45vh] space-y-2 overflow-y-auto">
              {filtered.map(question => (
                <label key={question.id} className="flex cursor-pointer gap-3 rounded-xl border p-3 hover:border-teal-400">
                  <input type="checkbox" checked={selected.includes(question.id)} onChange={() => toggle(question.id)} />
                  <span className="line-clamp-2 flex-1 text-sm">{question.content.replace(/<[^>]*>/g, ' ')}</span>
                  {question.question_type === 'true_false' && (
                    <span className="shrink-0 text-xs tabular-nums text-slate-400">{question.statementCount} ý</span>
                  )}
                  <span className="shrink-0 text-xs text-slate-400">{QUESTION_TYPE_LABEL[question.question_type] ?? question.question_type}</span>
                </label>
              ))}
            </div>
          )}
        </section>

        {selected.length > 0 && (
          <section className="space-y-3 rounded-2xl border bg-white p-5 text-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">Điểm mỗi câu</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Bài tập về nhà không dùng thang Bộ GD&amp;ĐT — thang đó là quy định của kỳ thi tốt
                  nghiệp THPT. Mặc định {CUSTOM_DEFAULT_SCORE} điểm mỗi câu; sửa được từng câu.
                </p>
              </div>
              <button
                type="button"
                onClick={resetScores}
                className="shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
              >
                Đặt lại {CUSTOM_DEFAULT_SCORE} điểm mỗi câu
              </button>
            </div>

            <ul className="max-h-[30vh] space-y-1.5 overflow-y-auto">
              {selectedQuestions.map((question) => {
                const raw = scoreDraft[question.id] ?? formatScoreInput(CUSTOM_DEFAULT_SCORE)
                const invalid = parsedScores.get(question.id) == null
                return (
                  <li key={question.id} className="flex items-center gap-2.5">
                    <span className="line-clamp-1 flex-1 text-xs text-slate-600 dark:text-slate-300">
                      {question.content.replace(/<[^>]*>/g, ' ')}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleTestPhase(question.id)}
                      aria-pressed={testIds.includes(question.id)}
                      className={`shrink-0 rounded-lg border px-2 py-1 text-xs font-medium ${
                        testIds.includes(question.id)
                          ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300'
                          : 'text-slate-500 dark:border-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {testIds.includes(question.id) ? 'Kiểm tra' : 'Luyện'}
                    </button>
                    <span className="shrink-0 text-xs text-slate-400">
                      {QUESTION_TYPE_LABEL[question.question_type] ?? question.question_type}
                    </span>
                    <input
                      value={raw}
                      onChange={e => setScore(question.id, e.target.value)}
                      inputMode="decimal"
                      aria-label={`Điểm câu ${question.id}`}
                      className={`w-20 shrink-0 rounded-lg border px-2 py-1 text-right text-xs tabular-nums dark:bg-slate-900 ${
                        invalid ? 'border-red-400 dark:border-red-700' : ''
                      }`}
                    />
                  </li>
                )
              })}
            </ul>

            {testIds.length === 0 ? (
              <p className="tabular-nums">
                Tổng <span className="font-semibold">{totalScore.toFixed(2)}</span> điểm.
                Điểm học sinh được quy đổi về thang 10, nên làm đúng hết vẫn là 10,00.
              </p>
            ) : (
              <p className="rounded-lg bg-amber-50 p-2.5 text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                Bài này có <span className="font-semibold tabular-nums">{testIds.length}</span> câu ở
                đoạn kiểm tra, tổng{' '}
                <span className="font-semibold tabular-nums">{testTotalScore.toFixed(2)}</span> điểm.
                <strong> Chỉ đoạn kiểm tra tính điểm</strong> — các câu luyện vẫn bắt buộc làm và vẫn
                hiện lời giải, nhưng không vào điểm. Đoạn kiểm tra luôn nằm cuối, gom thành một phần
                riêng dù nhiều hay ít câu.
                <br />
                Lúc giao bài nhớ bật <strong>“Hiện phản hồi ngay”</strong>: đó là công tắc cho lời
                giải ở đoạn luyện. Đoạn kiểm tra không bị nó ảnh hưởng — vẫn giấu đáp án khi đang làm.
              </p>
            )}

            {invalidScores.length > 0 && (
              <p className="flex gap-2 rounded-lg bg-red-50 p-2.5 text-red-700 dark:bg-red-900/20 dark:text-red-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {invalidScores.length} câu có điểm không hợp lệ. Điểm mỗi câu phải là số lớn hơn 0
                  — đây là ràng buộc `homework_questions_positive_score` ở lớp database, không phải
                  quy ước của trang này.
                </span>
              </p>
            )}
          </section>
        )}

        {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-200">{error}</p>}
        <div className="flex justify-end">
          <button onClick={save} disabled={saving || !title.trim() || !selected.length || invalidScores.length > 0} className="rounded-xl bg-teal-600 px-5 py-3 font-medium text-white disabled:opacity-50">
            {saving ? 'Đang tạo...' : 'Tạo bài tập'}
          </button>
        </div>
      </main>
    </div>
  )
}
