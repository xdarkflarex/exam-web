'use client'

import { useEffect, useMemo, useState } from 'react'
import { BrainCircuit, Loader2, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getBlockStyle } from '@/lib/theories/block-style'
import type { BlockType } from '@/types/theories'

interface TheoryOption { id: string; title: string }
interface BlockOption { id: string; theory_id: string; title: string | null; block_type: BlockType }
interface TargetRow {
  id: string
  homework_id: string
  theory_id: string
  knowledge_block_id: string | null
  weight: number
}

export default function HomeworkKnowledgeTargets({ homeworkId }: { homeworkId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [theories, setTheories] = useState<TheoryOption[]>([])
  const [blocks, setBlocks] = useState<BlockOption[]>([])
  const [targets, setTargets] = useState<TargetRow[]>([])
  const [theoryId, setTheoryId] = useState('')
  const [blockId, setBlockId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const [theoryRes, blockRes, targetRes] = await Promise.all([
      supabase.from('theories').select('id, title').eq('is_published', true).order('title'),
      supabase.from('knowledge_blocks').select('id, theory_id, title, block_type').order('order_index'),
      supabase.from('homework_knowledge_targets').select('*').eq('homework_id', homeworkId).order('created_at'),
    ])
    const firstError = theoryRes.error || blockRes.error || targetRes.error
    setError(firstError?.message || null)
    setTheories((theoryRes.data || []) as TheoryOption[])
    setBlocks((blockRes.data || []) as BlockOption[])
    setTargets((targetRes.data || []) as TargetRow[])
    setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeworkId])

  const add = async () => {
    if (!theoryId) return
    setSaving(true)
    const payload = { homework_id: homeworkId, theory_id: theoryId, knowledge_block_id: blockId || null, weight: 1 }
    let query = supabase.from('homework_knowledge_targets').select('id').eq('homework_id', homeworkId).eq('theory_id', theoryId)
    query = blockId ? query.eq('knowledge_block_id', blockId) : query.is('knowledge_block_id', null)
    const { data: existing } = await query.maybeSingle()
    const result = existing
      ? await supabase.from('homework_knowledge_targets').update(payload).eq('id', existing.id)
      : await supabase.from('homework_knowledge_targets').insert(payload)
    setError(result.error?.message || null)
    if (!result.error) {
      setBlockId('')
      await load()
    }
    setSaving(false)
  }

  const remove = async (id: string) => {
    setSaving(true)
    const { error: deleteError } = await supabase.from('homework_knowledge_targets').delete().eq('id', id)
    if (deleteError) setError(deleteError.message)
    else setTargets(current => current.filter(target => target.id !== id))
    setSaving(false)
  }

  const filteredBlocks = blocks.filter(block => block.theory_id === theoryId)
  const theoryName = (id: string) => theories.find(theory => theory.id === id)?.title || id

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-4 flex items-center gap-2">
        <BrainCircuit className="h-5 w-5 text-teal-600" />
        <div>
          <h2 className="font-semibold">Mục tiêu kiến thức</h2>
          <p className="text-xs text-slate-500">Gắn homework với node bài học; block con cũng đóng góp vào node cha.</p>
        </div>
      </div>
      {error && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading ? <Loader2 className="mx-auto my-8 h-6 w-6 animate-spin" /> : (
        <>
          <div className="grid gap-2 lg:grid-cols-[1fr_1fr_auto]">
            <select value={theoryId} onChange={event => { setTheoryId(event.target.value); setBlockId('') }} className="rounded-lg border px-3 py-2 text-sm dark:bg-slate-900">
              <option value="">Chọn bài lý thuyết</option>
              {theories.map(theory => <option key={theory.id} value={theory.id}>{theory.title}</option>)}
            </select>
            <select value={blockId} onChange={event => setBlockId(event.target.value)} disabled={!theoryId} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50 dark:bg-slate-900">
              <option value="">Toàn bài lý thuyết</option>
              {filteredBlocks.map(block => <option key={block.id} value={block.id}>{block.title || '(Không tiêu đề)'}</option>)}
            </select>
            <button onClick={add} disabled={!theoryId || saving} className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm text-white disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Thêm
            </button>
          </div>
          <div className="mt-4 space-y-2">
            {targets.map(target => {
              const block = target.knowledge_block_id ? blocks.find(item => item.id === target.knowledge_block_id) : null
              const style = block ? getBlockStyle(block.block_type) : null
              return (
                <div key={target.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{theoryName(target.theory_id)}</p>
                    <p className={`text-xs ${style?.text || 'text-slate-500'}`}>{block ? `${style?.icon} ${block.title || style?.label}` : 'Toàn bài lý thuyết'}</p>
                  </div>
                  <button onClick={() => remove(target.id)} disabled={saving} className="rounded-lg p-2 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                </div>
              )
            })}
            {!targets.length && <p className="py-4 text-center text-sm text-slate-500">Chưa có mục tiêu kiến thức.</p>}
          </div>
        </>
      )}
    </section>
  )
}
