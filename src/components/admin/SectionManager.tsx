'use client'

import { useState } from 'react'
import { ArrowUp, ArrowDown, Eye, EyeOff, GripVertical, Trash2, Plus, ChevronDown } from 'lucide-react'

export interface SectionConfig {
  id: string
  label: string
  visible: boolean
}

interface SectionManagerProps {
  sections: SectionConfig[]
  onChange: (sections: SectionConfig[]) => void
  availableSections?: { id: string; label: string }[]
}

export default function SectionManager({ sections, onChange, availableSections = [] }: SectionManagerProps) {
  const [showAddMenu, setShowAddMenu] = useState(false)

  const toggle = (id: string) => {
    onChange(sections.map(s => s.id === id ? { ...s, visible: !s.visible } : s))
  }

  const moveUp = (index: number) => {
    if (index === 0) return
    const arr = [...sections]
    ;[arr[index - 1], arr[index]] = [arr[index], arr[index - 1]]
    onChange(arr)
  }

  const moveDown = (index: number) => {
    if (index === sections.length - 1) return
    const arr = [...sections]
    ;[arr[index], arr[index + 1]] = [arr[index + 1], arr[index]]
    onChange(arr)
  }

  const remove = (id: string) => {
    onChange(sections.filter(s => s.id !== id))
  }

  const add = (item: { id: string; label: string }) => {
    onChange([...sections, { ...item, visible: true }])
    setShowAddMenu(false)
  }

  const addable = availableSections.filter(a => !sections.find(s => s.id === a.id))

  return (
    <div className="space-y-2">
      {sections.map((section, i) => (
        <div
          key={section.id}
          className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
            section.visible
              ? 'bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600'
              : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/50 opacity-60'
          }`}
        >
          <GripVertical className="w-4 h-4 text-slate-400 flex-shrink-0 cursor-grab" />

          <span className={`flex-1 text-sm font-medium ${
            section.visible
              ? 'text-slate-800 dark:text-slate-100'
              : 'text-slate-400 dark:text-slate-500 line-through'
          }`}>
            {section.label}
          </span>

          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => moveUp(i)}
              disabled={i === 0}
              className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Di chuyển lên"
            >
              <ArrowUp className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
            </button>
            <button
              onClick={() => moveDown(i)}
              disabled={i === sections.length - 1}
              className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Di chuyển xuống"
            >
              <ArrowDown className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
            </button>
            <button
              onClick={() => toggle(section.id)}
              className={`p-1.5 rounded-lg transition-colors ${
                section.visible
                  ? 'hover:bg-slate-200 dark:hover:bg-slate-600 text-teal-600 dark:text-teal-400'
                  : 'hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-400 dark:text-slate-500'
              }`}
              title={section.visible ? 'Ẩn section' : 'Hiện section'}
            >
              {section.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => remove(section.id)}
              className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
              title="Xóa section"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}

      {/* Add section */}
      {addable.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setShowAddMenu(v => !v)}
            className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-teal-500 dark:hover:border-teal-500 hover:text-teal-600 dark:hover:text-teal-400 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Thêm section
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAddMenu ? 'rotate-180' : ''}`} />
          </button>
          {showAddMenu && (
            <div className="absolute top-full left-0 right-0 mt-1 z-10 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-600 shadow-lg overflow-hidden">
              {addable.map(item => (
                <button
                  key={item.id}
                  onClick={() => add(item)}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-teal-50 dark:hover:bg-teal-900/20 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
