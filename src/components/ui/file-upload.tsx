'use client'

/**
 * File upload component for submittal attachments.
 * Supports drag-and-drop, progress tracking, and files up to 200 MB.
 * Uses Supabase Storage (bucket: submittal-attachments).
 */

import { useCallback, useRef, useState } from 'react'
import { Upload, X, FileText, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/use-supabase'

const MAX_FILE_SIZE = 200 * 1024 * 1024 // 200 MB
const BUCKET = 'submittal-attachments'

interface UploadedFile {
  name: string
  size: number
  path: string // storage path
  url: string  // signed or public URL
}

interface FileUploadProps {
  /** Called when upload completes with the stored file info */
  onUploaded?: (file: UploadedFile) => void
  /** Called when file is removed */
  onRemoved?: () => void
  /** Current uploaded file (for controlled mode) */
  value?: UploadedFile | null
  /** Submittal ID used as folder prefix in storage */
  submittalId?: string
  /** Disable the component */
  disabled?: boolean
}

export function FileUpload({ onUploaded, onRemoved, value, submittalId, disabled }: FileUploadProps) {
  const { t } = useI18n()
  const supabase = useSupabase()
  const inputRef = useRef<HTMLInputElement>(null)

  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(value ?? null)

  const currentFile = value !== undefined ? value : uploadedFile

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const handleFile = useCallback(async (file: File) => {
    setError(null)

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      setError(t('approvalForm.fileUploadMaxSize'))
      return
    }

    setUploading(true)
    setProgress(0)

    try {
      // Generate storage path
      const folder = submittalId || `temp-${Date.now()}`
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const storagePath = `${folder}/${Date.now()}-${safeName}`

      // Upload to Supabase Storage
      // Simulate progress since supabase-js doesn't expose upload progress natively
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 8, 90))
      }, 200)

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
        })

      clearInterval(progressInterval)

      if (uploadError) {
        // If bucket doesn't exist yet, provide a helpful message
        if (uploadError.message?.includes('Bucket not found') || uploadError.message?.includes('not found')) {
          setError('Storage bucket not configured. The file attachment feature requires the "submittal-attachments" bucket to be created in Supabase Storage.')
        } else {
          setError(uploadError.message || t('approvalForm.fileUploadError'))
        }
        setUploading(false)
        setProgress(0)
        return
      }

      setProgress(100)

      // Get the public/signed URL
      const { data: urlData } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(storagePath)

      const result: UploadedFile = {
        name: file.name,
        size: file.size,
        path: storagePath,
        url: urlData?.publicUrl || storagePath,
      }

      setUploadedFile(result)
      onUploaded?.(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('approvalForm.fileUploadError'))
    } finally {
      setUploading(false)
    }
  }, [supabase, submittalId, onUploaded, t])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (disabled || uploading) return
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [disabled, uploading, handleFile])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    // Reset input so re-selecting the same file triggers onChange
    if (inputRef.current) inputRef.current.value = ''
  }, [handleFile])

  const handleRemove = useCallback(async () => {
    if (currentFile?.path) {
      // Best-effort delete from storage
      await supabase.storage.from(BUCKET).remove([currentFile.path]).catch(() => {})
    }
    setUploadedFile(null)
    setProgress(0)
    setError(null)
    onRemoved?.()
  }, [currentFile, supabase, onRemoved])

  // ── Uploaded state ─────────────────────────────────────
  if (currentFile && !uploading) {
    return (
      <div className="border border-gray-200 rounded-lg p-4 bg-gray-50/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-green-50">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{currentFile.name}</p>
            <p className="text-xs text-gray-500">{formatSize(currentFile.size)}</p>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={handleRemove}
              className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded"
              title={t('approvalForm.fileUploadRemove')}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── Upload zone ────────────────────────────────────────
  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); !disabled && setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && !uploading && inputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
          transition-colors
          ${dragOver ? 'border-[#045859] bg-[#e6f2f2]' : 'border-gray-300 hover:border-gray-400 bg-white'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={handleInputChange}
          disabled={disabled || uploading}
          accept=".pdf,.dwg,.rvt,.xls,.xlsx,.doc,.docx,.pptx,.ppt,.ifc,.zip,.png,.jpg,.jpeg,.csv,.txt"
        />

        {uploading ? (
          <div className="space-y-3">
            <Loader2 className="w-8 h-8 mx-auto animate-spin" style={{ color: '#045859' }} />
            <p className="text-sm font-medium text-gray-700">{t('approvalForm.fileUploadProgress')}</p>
            <div className="w-full max-w-xs mx-auto bg-gray-200 rounded-full h-2">
              <div
                className="h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%`, backgroundColor: '#045859' }}
              />
            </div>
            <p className="text-xs text-gray-500">{progress}%</p>
          </div>
        ) : (
          <>
            <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
            <p className="text-sm text-gray-600">{t('approvalForm.fileUploadDrop')}</p>
            <p className="text-xs text-gray-400 mt-1">
              {t('approvalForm.fileUploadHint')}
            </p>
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}
    </div>
  )
}

export type { UploadedFile }
