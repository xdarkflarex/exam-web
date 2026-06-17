'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getMasteryByLevel } from '@/lib/theories/actions'
import {
  COGNITIVE_LEVELS, COGNITIVE_LABELS, CognitiveLevel
} from '@/lib/theories/cognitive'
import { BarChart3, Loader2, TrendingUp, AlertTriangle } from 'lucide-react'

interface LevelRow {
  theory_id: string
  cognitive_level: CognitiveLevel
  questions_attempted: number
  questions_correct: number
  mastery_score: number
}

interface LevelAgg {
  attempted: number
  correct: number
  score: number
}

const LEVEL_BAR: Record<CognitiveLevel, string> = {
  NB: 'bg-green-500',
  TH: 'bg-blue-500',
  VD: 'bg-amber-500',
  VDC: 'bg-red-500',
}

export default function StudentAnalyticsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<LevelRow[]>([])
  const [theoryNames, setTheoryNames] = useState<Record<string, string>>({})

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const data = (await getMasteryByLevel(user.id)) as LevelRow[]
      setRows(data || [])

      const theoryIds = [...new Set((data || []).map(r => r.theory_id))]
      if (theoryIds.length > 0) {
        const { data: theories } = await supabase
          .from('theories')
          .select('id, title')
          .in('id', theoryIds)
        const map: Record<string, string> = {}
        for (const t of theories || []) map[t.id] = t.title
        setTheoryNames(map)
      }
    } catch (err) {
      console.error('load analytics', err)
    } finally {
      setLoading(false)
    }
  }

  // Tổng hợp theo mức nhận thức
  const aggByLevel: Record<CognitiveLevel, LevelAgg> = {
    NB: { attempted: 0, correct: 0, score: 0 },
    TH: { attempted: 0, correct: 0, score: 0 },
    VD: { attempted: 0, correct: 0, score: 0 },
    VDC: { attempted: 0, correct: 0, score: 0 },
  }
  for (const r of rows) {
    const a = aggByLevel[r.cognitive_level]
    if (!a) continue
    a.attempted += r.questions_attempted
    a.correct += r.questions_correct
  }
  for (const lv of COGNITIVE_LEVELS) {
    const a = aggByLevel[lv]
    a.score = a.attempted > 0 ? Math.round((a.correct / a.attempted) * 100) : 0
  }

  // Điểm yếu: theory × level có mastery thấp nhất (đã làm > 0)
  const weakest = [...rows]
    .filter(r => r.questions_attempted > 0)
    .sort((a, b) => a.mastery_score - b.mastery_score)
    .slice(0, 5)

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto pt-16 lg:pt-6">
      <div className="flex items-center gap-3 mb-6">
        <BarChart3 className="w-7 h-7 text-teal-600 dark:text-teal-400" />
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Phân tích năng lực</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Mức độ thành thạo theo từng cấp độ nhận thức</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-teal-600 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-12 text-center">
          <TrendingUp className="w-12 h-12 mx-auto mb-4 text-slate-300 dark:text-slate-600" />
          <p className="text-slate-500 dark:text-slate-400">Chưa có dữ liệu. Hãy làm vài bài luyện tập để xem phân tích.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Per-level bars */}
          <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-5">
            <h2 className="font-semibold text-slate-800 dark:text-slate-100 mb-4">Thành thạo theo cấp độ</h2>
            <div className="space-y-4">
              {COGNITIVE_LEVELS.map(lv => {
                const a = aggByLevel[lv]
                return (
                  <div key={lv}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium text-slate-700 dark:text-slate-200">
                        {COGNITIVE_LABELS[lv]} <span className="text-slate-400">({lv})</span>
                      </span>
                      <span className="text-slate-500 dark:text-slate-400">
                        {a.correct}/{a.attempted} câu · {a.score}%
                      </span>
                    </div>
                    <div className="h-3 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                      <div className={`h-full ${LEVEL_BAR[lv]} transition-all`} style={{ width: `${a.score}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Weakest areas */}
          <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-5">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <h2 className="font-semibold text-slate-800 dark:text-slate-100">Cần cải thiện nhất</h2>
            </div>
            {weakest.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Chưa đủ dữ liệu.</p>
            ) : (
              <div className="space-y-2">
                {weakest.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-slate-900/40 border border-slate-100 dark:border-slate-700">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                        {theoryNames[r.theory_id] || 'Chuyên đề'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {COGNITIVE_LABELS[r.cognitive_level]} · {r.questions_correct}/{r.questions_attempted} câu đúng
                      </p>
                    </div>
                    <span className="text-sm font-bold text-amber-600 dark:text-amber-400 flex-shrink-0">
                      {Math.round(r.mastery_score)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
