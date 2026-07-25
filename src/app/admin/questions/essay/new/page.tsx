'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Plus, Save, Trash2 } from 'lucide-react'
import { nanoid } from 'nanoid'
import GlobalHeader from '@/components/GlobalHeader'
import MathContent from '@/components/MathContent'
import { createClient } from '@/lib/supabase/client'

interface RubricCriterion {
  criterion_id: string
  title: string
  description: string
  max_score: number
}

const initialRubric: RubricCriterion[] = [
  {
    criterion_id: 'strategy',
    title: 'Phương pháp và lập luận',
    description: 'Chọn hướng giải phù hợp, các bước suy luận có căn cứ.',
    max_score: 1.5,
  },
  {
    criterion_id: 'calculation',
    title: 'Biến đổi và tính toán',
    description: 'Các phép biến đổi, tính toán và ký hiệu toán học chính xác.',
    max_score: 1,
  },
  {
    criterion_id: 'conclusion',
    title: 'Kết luận và trình bày',
    description: 'Kết luận đúng yêu cầu, trình bày đủ để kiểm tra được.',
    max_score: 0.5,
  },
]

export default function NewEssayQuestionPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [content, setContent] = useState('')
  const [sourceExam, setSourceExam] = useState('Đề thử tự luận')
  const [difficulty, setDifficulty] = useState(3)
  const [maxScore, setMaxScore] = useState(3)
  const [referenceAnswer, setReferenceAnswer] = useState('')
  const [rubric, setRubric] = useState<RubricCriterion[]>(initialRubric)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rubricTotal = rubric.reduce((sum, criterion) => sum + (Number(criterion.max_score) || 0), 0)
  const rubricMatches = Math.abs(rubricTotal - maxScore) < 0.0001

  const updateCriterion = <K extends keyof RubricCriterion>(
    index: number,
    key: K,
    value: RubricCriterion[K]
  ) => {
    setRubric((current) => current.map((criterion, criterionIndex) => (
      criterionIndex === index ? { ...criterion, [key]: value } : criterion
    )))
  }

  const addCriterion = () => {
    setRubric((current) => [
      ...current,
      {
        criterion_id: `criterion_${nanoid(6)}`,
        title: 'Tiêu chí mới',
        description: '',
        max_score: 0.5,
      },
    ])
  }

  const removeCriterion = (index: number) => {
    setRubric((current) => current.filter((_, criterionIndex) => criterionIndex !== index))
  }

  const save = async () => {
    setError(null)
    if (content.trim().length < 5) {
      setError('Nội dung câu hỏi cần ít nhất 5 ký tự.')
      return
    }
    if (referenceAnswer.trim().length < 3) {
      setError('Cần có đáp án tham chiếu để AI và giáo viên đối chiếu.')
      return
    }
    if (!rubric.length || rubric.some((criterion) => !criterion.title.trim() || criterion.max_score <= 0)) {
      setError('Mỗi tiêu chí phải có tên và điểm lớn hơn 0.')
      return
    }
    if (!rubricMatches) {
      setError('Tổng điểm các tiêu chí phải bằng điểm tối đa của câu.')
      return
    }

    setSaving(true)
    const { error: saveError } = await supabase.rpc('create_essay_question', {
      p_question_id: nanoid(),
      p_content: content.trim(),
      p_source_exam: sourceExam.trim(),
      p_difficulty: difficulty,
      p_max_score: maxScore,
      p_reference_answer: referenceAnswer.trim(),
      p_rubric: rubric,
    })

    if (saveError) {
      console.error('Create essay question error:', saveError.message)
      setError(
        saveError.message.includes('create_essay_question')
          ? 'Chưa áp dụng migration chấm tự luận trên Supabase.'
          : `Không thể tạo câu tự luận: ${saveError.message}`
      )
      setSaving(false)
      return
    }

    router.push('/admin/questions')
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
      <GlobalHeader title="Tạo câu tự luận thử" />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <button
          type="button"
          onClick={() => router.push('/admin/questions')}
          className="flex items-center gap-2 text-sm text-slate-600 hover:text-indigo-600 dark:text-slate-300"
        >
          <ArrowLeft className="h-4 w-4" /> Quay lại ngân hàng câu hỏi
        </button>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100">
            Bản thử chỉ nhận bài làm dạng văn bản/LaTeX. AI tạo đề xuất ẩn danh; giáo viên luôn là người duyệt và chốt điểm.
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Nội dung câu hỏi</span>
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value.slice(0, 20000))}
                rows={6}
                className="w-full rounded-xl border border-slate-300 bg-white p-3 outline-none focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-900"
                placeholder="Nhập đề bài tự luận..."
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Nguồn đề</span>
              <input
                value={sourceExam}
                onChange={(event) => setSourceExam(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-900"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Độ khó</span>
                <select
                  value={difficulty}
                  onChange={(event) => setDifficulty(Number(event.target.value))}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-600 dark:bg-slate-900"
                >
                  {[1, 2, 3, 4, 5].map((level) => <option key={level} value={level}>{level}</option>)}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Điểm tối đa</span>
                <input
                  type="number"
                  min={0.25}
                  max={10}
                  step={0.25}
                  value={maxScore}
                  onChange={(event) => setMaxScore(Number(event.target.value))}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-600 dark:bg-slate-900"
                />
              </label>
            </div>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Đáp án tham chiếu riêng cho người chấm</span>
              <textarea
                value={referenceAnswer}
                onChange={(event) => setReferenceAnswer(event.target.value.slice(0, 30000))}
                rows={8}
                className="w-full rounded-xl border border-slate-300 bg-white p-3 outline-none focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-900"
                placeholder="Trình bày một lời giải chuẩn và các phương pháp tương đương có thể chấp nhận..."
              />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-white">Rubric chấm điểm</h2>
              <p className={`text-sm ${rubricMatches ? 'text-green-600' : 'text-red-600'}`}>
                Tổng tiêu chí: {rubricTotal.toFixed(2)} / {maxScore.toFixed(2)} điểm
              </p>
            </div>
            <button
              type="button"
              onClick={addCriterion}
              className="flex items-center gap-2 rounded-lg border border-indigo-200 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-300"
            >
              <Plus className="h-4 w-4" /> Thêm tiêu chí
            </button>
          </div>

          <div className="space-y-4">
            {rubric.map((criterion, index) => (
              <div key={criterion.criterion_id} className="grid gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700 md:grid-cols-[1fr_140px_auto]">
                <div className="space-y-3">
                  <input
                    value={criterion.title}
                    onChange={(event) => updateCriterion(index, 'title', event.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-medium dark:border-slate-600 dark:bg-slate-900"
                    placeholder="Tên tiêu chí"
                  />
                  <textarea
                    value={criterion.description}
                    onChange={(event) => updateCriterion(index, 'description', event.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                    placeholder="Mô tả bằng chứng cần có..."
                    rows={2}
                  />
                </div>
                <label className="space-y-2">
                  <span className="text-xs text-slate-500">Điểm tiêu chí</span>
                  <input
                    type="number"
                    min={0.25}
                    max={maxScore}
                    step={0.25}
                    value={criterion.max_score}
                    onChange={(event) => updateCriterion(index, 'max_score', Number(event.target.value))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-900"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removeCriterion(index)}
                  disabled={rubric.length <= 1}
                  className="self-start rounded-lg p-2 text-red-500 hover:bg-red-50 disabled:opacity-30 dark:hover:bg-red-900/20"
                  aria-label="Xóa tiêu chí"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </section>

        {(content || referenceAnswer) && (
          <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-500">Xem trước đề bài</h3>
              <MathContent content={content || 'Chưa nhập đề bài'} />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-500">Xem trước đáp án tham chiếu</h3>
              <MathContent content={referenceAnswer || 'Chưa nhập đáp án'} />
            </div>
          </section>
        )}

        {error && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">{error}</p>}

        <button
          type="button"
          onClick={save}
          disabled={saving || !rubricMatches}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
          Lưu câu tự luận thử
        </button>
      </main>
    </div>
  )
}
