'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Image as ImageIcon, Upload, Trash2, Copy, CheckCircle, Search, Grid, List } from 'lucide-react'

interface MediaFile {
  name: string
  url: string
  created_at: string
  size: number
}

export default function MediaLibraryPage() {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [files, setFiles] = useState<MediaFile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetchFiles()
  }, [])

  const fetchFiles = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.storage
        .from('Landingpage')
        .list('', { limit: 200, sortBy: { column: 'created_at', order: 'desc' } })

      if (error) throw error

      const mediaFiles: MediaFile[] = (data || [])
        .filter(f => !f.name.startsWith('.'))
        .map(f => {
          const { data: urlData } = supabase.storage.from('Landingpage').getPublicUrl(f.name)
          return {
            name: f.name,
            url: urlData.publicUrl,
            created_at: f.created_at || '',
            size: (f.metadata as any)?.size || 0,
          }
        })

      setFiles(mediaFiles)
    } catch (err) {
      console.error('Error fetching media:', err)
      setMessage({ type: 'error', text: 'Lỗi khi tải thư viện media. Hãy đảm bảo bucket "Landingpage" đã được tạo trong Supabase Storage.' })
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadFiles = e.target.files
    if (!uploadFiles || uploadFiles.length === 0) return

    setUploading(true)
    setMessage(null)
    let successCount = 0

    for (const file of Array.from(uploadFiles)) {
      const ext = file.name.split('.').pop()
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`

      const { error } = await supabase.storage.from('Landingpage').upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      })

      if (!error) successCount++
    }

    if (successCount > 0) {
      setMessage({ type: 'success', text: `Đã upload ${successCount} file thành công!` })
      fetchFiles()
    } else {
      setMessage({ type: 'error', text: 'Lỗi khi upload. Kiểm tra bucket "Landingpage" và policy.' })
    }

    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDelete = async (name: string) => {
    if (!confirm('Xóa file này?')) return
    const { error } = await supabase.storage.from('Landingpage').remove([name])
    if (!error) {
      setFiles(files.filter(f => f.name !== name))
      setMessage({ type: 'success', text: 'Đã xóa file' })
    }
  }

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url)
    setCopiedUrl(url)
    setTimeout(() => setCopiedUrl(null), 2000)
  }

  const formatSize = (bytes: number) => {
    if (bytes === 0) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const filteredFiles = files.filter(f => 
    !searchQuery || f.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const isImage = (name: string) => /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(name)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3">
              <ImageIcon className="w-7 h-7 text-teal-600 dark:text-teal-400" />
              Thư viện Media
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              {files.length} file
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-400 text-white font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {uploading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              Upload ảnh
            </button>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className={`mb-4 p-3 rounded-xl text-sm ${
            message.type === 'success'
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-700'
              : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700'
          }`}>
            {message.text}
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm kiếm file..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:border-teal-500 dark:focus:border-teal-400 outline-none transition-colors text-sm"
            />
          </div>
          <div className="flex bg-slate-200 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-300 dark:border-slate-600">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'text-slate-500'}`}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'text-slate-500'}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Files */}
        {filteredFiles.length === 0 ? (
          <div className="text-center py-16">
            <ImageIcon className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <p className="text-slate-600 dark:text-slate-400">Chưa có file nào</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredFiles.map(file => (
              <div key={file.name} className="group bg-slate-200 dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 overflow-hidden hover:border-teal-500/50 dark:hover:border-teal-400/50 transition-colors">
                <div className="aspect-square relative bg-slate-300 dark:bg-slate-700">
                  {isImage(file.name) ? (
                    <img src={file.url} alt={file.name} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="w-10 h-10 text-slate-400" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    <button
                      onClick={() => copyUrl(file.url)}
                      className="p-2 rounded-lg bg-white/90 text-slate-700 hover:bg-white transition-colors"
                      title="Copy URL"
                    >
                      {copiedUrl === file.url ? <CheckCircle className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleDelete(file.name)}
                      className="p-2 rounded-lg bg-white/90 text-red-500 hover:bg-white transition-colors"
                      title="Xóa"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="p-2">
                  <p className="text-xs text-slate-600 dark:text-slate-400 truncate">{file.name}</p>
                  {file.size > 0 && <p className="text-xs text-slate-400 dark:text-slate-500">{formatSize(file.size)}</p>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredFiles.map(file => (
              <div key={file.name} className="flex items-center gap-4 bg-slate-200 dark:bg-slate-800 rounded-xl p-3 border border-slate-300 dark:border-slate-700 hover:border-teal-500/50 dark:hover:border-teal-400/50 transition-colors">
                <div className="w-12 h-12 rounded-lg bg-slate-300 dark:bg-slate-700 overflow-hidden flex-shrink-0">
                  {isImage(file.name) ? (
                    <img src={file.url} alt={file.name} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="w-5 h-5 text-slate-400" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-800 dark:text-slate-100 truncate">{file.name}</p>
                  <p className="text-xs text-slate-400">{formatSize(file.size)}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => copyUrl(file.url)}
                    className="p-2 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
                    title="Copy URL"
                  >
                    {copiedUrl === file.url ? <CheckCircle className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-slate-500" />}
                  </button>
                  <button
                    onClick={() => handleDelete(file.name)}
                    className="p-2 rounded-lg text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                    title="Xóa"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
