'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AdminHeader } from '@/components/admin'
import { logger } from '@/lib/logger'
import {
  ShieldCheck, Search, RefreshCw, Loader2, Check, AlertCircle,
  ToggleLeft, ToggleRight, Crown, GraduationCap, Users
} from 'lucide-react'
import {
  getFeatureFlags, saveFeatureFlags, FeatureFlags, FeatureKey,
  FEATURE_LABELS, DEFAULT_FEATURE_FLAGS
} from '@/lib/auth/access'

interface StudentRow {
  id: string
  full_name: string | null
  email: string | null
  class_id: string | null
  access_tier: string | null
}

export default function AdminAccessPage() {
  const supabase = createClient()

  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FEATURE_FLAGS)
  const [flagsLoading, setFlagsLoading] = useState(true)
  const [flagsSaving, setFlagsSaving] = useState(false)

  const [students, setStudents] = useState<StudentRow[]>([])
  const [studentsLoading, setStudentsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [onlyMine, setOnlyMine] = useState(false)
  const [myClassIds, setMyClassIds] = useState<string[]>([])
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [bulkWorking, setBulkWorking] = useState(false)

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    loadFlags()
    loadStudents()
  }, [])

  const loadFlags = async () => {
    setFlagsLoading(true)
    try {
      setFlags(await getFeatureFlags())
    } catch (err) {
      logger.error('load flags', err)
    } finally {
      setFlagsLoading(false)
    }
  }

  const loadStudents = async () => {
    setStudentsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: classes } = await supabase
          .from('classes')
          .select('id')
          .eq('teacher_id', user.id)
        setMyClassIds((classes || []).map(c => c.id))
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, class_id, access_tier')
        .eq('role', 'student')
        .order('full_name')

      if (error) {
        logger.supabaseError('load students', error)
        setMessage({ type: 'error', text: 'Không thể tải danh sách học sinh' })
        return
      }
      setStudents((data || []) as StudentRow[])
    } catch (err) {
      logger.error('load students', err)
    } finally {
      setStudentsLoading(false)
    }
  }

  const toggleFlag = (key: FeatureKey) => {
    setFlags(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSaveFlags = async () => {
    setFlagsSaving(true)
    setMessage(null)
    try {
      await saveFeatureFlags(flags)
      setMessage({ type: 'success', text: 'Đã lưu cấu hình tính năng cho HS thường.' })
    } catch (err) {
      logger.error('save flags', err)
      setMessage({ type: 'error', text: 'Lưu cấu hình thất bại.' })
    } finally {
      setFlagsSaving(false)
    }
  }

  const setTier = async (studentId: string, tier: 'basic' | 'full') => {
    setUpdatingId(studentId)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ access_tier: tier, updated_at: new Date().toISOString() })
        .eq('id', studentId)
      if (error) {
        setMessage({ type: 'error', text: logger.supabaseError('update tier', error) })
        return
      }
      setStudents(prev => prev.map(s => s.id === studentId ? { ...s, access_tier: tier } : s))
    } finally {
      setUpdatingId(null)
    }
  }

  const filtered = useMemo(() => {
    let list = students
    if (onlyMine) list = list.filter(s => s.class_id && myClassIds.includes(s.class_id))
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(s =>
        s.full_name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q))
    }
    return list
  }, [students, onlyMine, myClassIds, search])

  const grantAllMineFull = async () => {
    const targets = students.filter(s => s.class_id && myClassIds.includes(s.class_id))
    if (targets.length === 0) {
      setMessage({ type: 'error', text: 'Bạn chưa được gán lớp nào (classes.teacher_id).' })
      return
    }
    setBulkWorking(true)
    setMessage(null)
    try {
      const ids = targets.map(t => t.id)
      const { error } = await supabase
        .from('profiles')
        .update({ access_tier: 'full', updated_at: new Date().toISOString() })
        .in('id', ids)
      if (error) {
        setMessage({ type: 'error', text: logger.supabaseError('bulk grant', error) })
        return
      }
      setStudents(prev => prev.map(s => ids.includes(s.id) ? { ...s, access_tier: 'full' } : s))
      setMessage({ type: 'success', text: `Đã cấp full access cho ${ids.length} HS của bạn.` })
    } finally {
      setBulkWorking(false)
    }
  }

  return (
    <div className="min-h-screen">
      <AdminHeader title="Phân quyền tính năng" subtitle="Bật/tắt tính năng cho HS thường & cấp full-access" />

      <div className="p-6 space-y-6">
        {message && (
          <div className={`flex items-center gap-2 rounded-lg p-3 text-sm ${
            message.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
              : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
          }`}>
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {message.text}
          </div>
        )}

        {/* Feature flags */}
        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-5 border border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Tính năng cho HS thường (basic)</h2>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            HS có access tier <span className="font-medium">full</span> luôn dùng được mọi tính năng, không bị ảnh hưởng bởi các công tắc dưới đây.
          </p>

          {flagsLoading ? (
            <div className="flex items-center gap-2 text-slate-500 py-4"><Loader2 className="w-4 h-4 animate-spin" /> Đang tải...</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(Object.keys(FEATURE_LABELS) as FeatureKey[]).map(key => (
                <button
                  key={key}
                  onClick={() => toggleFlag(key)}
                  className={`flex items-center justify-between gap-3 p-3 rounded-xl border text-left transition-all ${
                    flags[key]
                      ? 'border-teal-300 bg-teal-50 dark:border-teal-600 dark:bg-teal-900/20'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40'
                  }`}
                >
                  <span className="text-sm text-slate-700 dark:text-slate-200">{FEATURE_LABELS[key]}</span>
                  {flags[key]
                    ? <ToggleRight className="w-6 h-6 text-teal-600 dark:text-teal-400 flex-shrink-0" />
                    : <ToggleLeft className="w-6 h-6 text-slate-400 flex-shrink-0" />}
                </button>
              ))}
            </div>
          )}

          <div className="flex justify-end mt-4">
            <button
              onClick={handleSaveFlags}
              disabled={flagsSaving || flagsLoading}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors disabled:opacity-50"
            >
              {flagsSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Lưu cấu hình
            </button>
          </div>
        </div>

        {/* Students access tier */}
        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-5 border border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Cấp quyền theo học sinh</h2>
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm học sinh..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-100"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
              <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} className="accent-teal-600" />
              Chỉ HS của tôi đang dạy
            </label>
            <button
              onClick={grantAllMineFull}
              disabled={bulkWorking}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-amber-300 dark:border-amber-600 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors disabled:opacity-50"
            >
              {bulkWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
              Cấp full cho HS của tôi
            </button>
            <button
              onClick={loadStudents}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${studentsLoading ? 'animate-spin' : ''}`} />
              Làm mới
            </button>
          </div>

          {studentsLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-7 h-7 text-teal-600 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-slate-500 dark:text-slate-400 py-8">Không có học sinh phù hợp.</p>
          ) : (
            <div className="space-y-2">
              {filtered.map(s => {
                const isFull = s.access_tier === 'full'
                const mine = !!(s.class_id && myClassIds.includes(s.class_id))
                return (
                  <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-900/40">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                      {s.full_name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate flex items-center gap-2">
                        {s.full_name || 'Chưa đặt tên'}
                        {mine && <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400">HS của tôi</span>}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{s.email}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${
                      isFull
                        ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}>
                      {isFull ? <Crown className="w-3 h-3" /> : <GraduationCap className="w-3 h-3" />}
                      {isFull ? 'Full' : 'Basic'}
                    </span>
                    <button
                      onClick={() => setTier(s.id, isFull ? 'basic' : 'full')}
                      disabled={updatingId === s.id}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0"
                    >
                      {updatingId === s.id && <Loader2 className="w-3 h-3 animate-spin" />}
                      {isFull ? 'Chuyển Basic' : 'Cấp Full'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
