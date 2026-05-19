'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Upload, Search, CheckCircle, Image as ImageIcon } from 'lucide-react'

interface MediaFile {
  name: string
  url: string
  size: number
}

interface MediaPickerModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (url: string) => void
  bucket?: string
}

export default function MediaPickerModal({ isOpen, onClose, onSelect, bucket = 'media' }: MediaPickerModalProps) {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [files, setFiles] = useState<MediaFile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      fetchFiles()
      setSelected(null)
      setSearch('')
    }
  }, [isOpen])

  const fetchFiles = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list('', { limit: 200, sortBy: { column: 'created_at', order: 'desc' } })

      if (error) throw error

      const mediaFiles: MediaFile[] = (data || [])
        .filter(f => !f.name.startsWith('.') && isImage(f.name))
        .map(f => {
          const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(f.name)
          return {
            name: f.name,
            url: urlData.publicUrl,
            size: (f.metadata as any)?.size || 0,
          }
        })

      setFiles(mediaFiles)
    } catch (err) {
      console.error('MediaPicker fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadFiles = e.target.files
    if (!uploadFiles || uploadFiles.length === 0) return

    setUploading(true)
    for (const file of Array.from(uploadFiles)) {
      const ext = file.name.split('.').pop()
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`

      await supabase.storage.from(bucket).upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      })
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    fetchFiles()
  }

  const isImage = (name: string) => /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(name)

  const filtered = files.filter(f =>
    !search || f.name.toLowerCase().includes(search.toLowerCase())
  )

  const handleConfirm = () => {
    if (selected) {
      onSelect(selected)
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-3xl max-h-[80vh] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-300 dark:border-slate-600"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            Chọn ảnh từ Media
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-700">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm kiếm..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm outline-none focus:border-teal-500"
            />
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleUpload} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-400 text-white text-sm font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50 flex-shrink-0"
          >
            {uploading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Upload className="w-4 h-4" />}
            Upload
          </button>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-7 h-7 border-3 border-teal-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <ImageIcon className="w-10 h-10 text-slate-400 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Chưa có ảnh nào. Upload ảnh để bắt đầu.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
              {filtered.map(file => (
                <button
                  key={file.name}
                  onClick={() => setSelected(file.url)}
                  className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all group ${
                    selected === file.url
                      ? 'border-teal-500 dark:border-teal-400 ring-2 ring-teal-500/30'
                      : 'border-slate-200 dark:border-slate-600 hover:border-teal-300 dark:hover:border-teal-600'
                  }`}
                >
                  <img src={file.url} alt={file.name} className="w-full h-full object-cover" loading="lazy" />
                  {selected === file.url && (
                    <div className="absolute inset-0 bg-teal-500/20 flex items-center justify-center">
                      <CheckCircle className="w-8 h-8 text-teal-600 dark:text-teal-400 drop-shadow-lg" />
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-[10px] text-white truncate">{file.name}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
          <p className="text-xs text-slate-500">{filtered.length} ảnh</p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              Huỷ
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selected}
              className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-400 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Chọn ảnh
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
