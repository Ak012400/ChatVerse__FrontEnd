import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, FileCheck2, Upload, CheckCircle2, AlertCircle, X,
} from 'lucide-react'
import { ageApi } from '../../api'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'

type DocType = 'aadhaar' | 'passport' | 'driving_license'

const DOC_OPTIONS: { id: DocType; label: string; desc: string }[] = [
  { id: 'aadhaar',         label: 'Aadhaar',         desc: 'Front side. Mask the last 8 digits if you wish.' },
  { id: 'passport',        label: 'Passport',        desc: 'The page with your photo.' },
  { id: 'driving_license', label: 'Driving licence', desc: 'The card or the digital DigiLocker copy.' },
]

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

export default function DocumentUploadPage() {
  const navigate = useNavigate()
  const [docType, setDocType] = useState<DocType | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const pickFile = (f: File) => {
    setError(null)
    if (f.size > MAX_BYTES) {
      setError('File is too large (max 10 MB).')
      return
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowed.includes(f.type)) {
      setError('Use JPG, PNG, WEBP, or PDF.')
      return
    }
    setFile(f)
    if (f.type.startsWith('image/')) {
      setPreview(URL.createObjectURL(f))
    } else {
      setPreview(null)
    }
  }

  const handleSubmit = async () => {
    if (!docType || !file) {
      setError('Pick a document type and a file.')
      return
    }
    setUploading(true)
    setError(null)
    try {
      await ageApi.uploadDocFile(file, docType)
      setDone(true)
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Upload failed. Try again.')
    } finally {
      setUploading(false)
    }
  }

  if (done) {
    return (
      <div className="h-full overflow-y-auto bg-[var(--color-bg)] text-[var(--color-fg)]">
        <div className="max-w-md mx-auto px-6 py-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--color-success-soft)] border border-[var(--color-success-border)] text-[var(--color-success-fg)] mb-5">
            <CheckCircle2 size={26} />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight mb-2">Submitted</h2>
          <p className="text-sm text-[var(--color-fg-faint)] mb-6 leading-relaxed">
            We'll review your document within 24-48 hours and notify you on this account.
            Until then, the tenure path (7 active days) is also still active in the background.
          </p>
          <Button fullWidth size="lg" onClick={() => navigate('/profile')}>
            Back to profile
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-[var(--color-bg)] text-[var(--color-fg)]">
      <div className="max-w-md mx-auto px-6 py-10">
        <button
          onClick={() => navigate('/profile')}
          className="inline-flex items-center gap-1.5 text-xs text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] mb-6 transition-colors"
        >
          <ArrowLeft size={13} />
          Back to profile
        </button>

        <div className="mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[var(--color-accent-soft)] border border-[rgba(99,102,241,0.3)] mb-4">
            <FileCheck2 size={20} className="text-[var(--color-accent-fg)]" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Document verification</h1>
          <p className="text-sm text-[var(--color-fg-faint)] mt-1.5 leading-relaxed">
            Fast-track your age verification — usually approved in 24-48 hours.
            Files are stored privately, never shown publicly.
          </p>
        </div>

        <Card padding="lg" className="space-y-5">
          {/* Doc type picker */}
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-fg-faint)] mb-2">
              Document type
            </p>
            <div className="space-y-2">
              {DOC_OPTIONS.map((opt) => (
                <label
                  key={opt.id}
                  className={`flex items-start gap-2.5 p-3 rounded-md border cursor-pointer transition-colors
                    ${
                      docType === opt.id
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                        : 'border-[var(--color-line)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)]'
                    }`}
                >
                  <input
                    type="radio"
                    name="docType"
                    className="mt-0.5 w-4 h-4 accent-[var(--color-accent)]"
                    checked={docType === opt.id}
                    onChange={() => setDocType(opt.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--color-fg)]">{opt.label}</p>
                    <p className="text-[11px] text-[var(--color-fg-faint)] mt-0.5 leading-relaxed">
                      {opt.desc}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* File picker */}
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-fg-faint)] mb-2">
              File
            </p>
            {file ? (
              <div className="flex items-start gap-3 p-3 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line)]">
                {preview ? (
                  <img
                    src={preview}
                    alt="Preview"
                    className="w-16 h-16 rounded-md object-cover border border-[var(--color-line)]"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-md bg-[var(--color-surface-3)] flex items-center justify-center text-[var(--color-fg-faint)]">
                    <FileCheck2 size={20} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-[11px] text-[var(--color-fg-faint)]">
                    {(file.size / 1024).toFixed(0)} KB · {file.type}
                  </p>
                  <button
                    onClick={() => {
                      setFile(null)
                      setPreview(null)
                    }}
                    className="text-[11px] text-[var(--color-danger)] hover:text-[#f87171] mt-1 inline-flex items-center gap-1 transition-colors"
                  >
                    <X size={11} />
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full p-6 rounded-md border border-dashed border-[var(--color-line-strong)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-center transition-colors"
              >
                <Upload size={20} className="mx-auto text-[var(--color-fg-faint)] mb-2" />
                <p className="text-sm font-medium">Click to upload</p>
                <p className="text-[11px] text-[var(--color-fg-faint)] mt-0.5">
                  JPG, PNG, WEBP, or PDF — max 10 MB
                </p>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) pickFile(f)
              }}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-[var(--color-danger-soft)] border border-[var(--color-danger-border)] text-[var(--color-danger-fg)] text-xs">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          <Button
            fullWidth
            size="lg"
            loading={uploading}
            onClick={handleSubmit}
            disabled={!docType || !file}
          >
            {uploading ? 'Uploading…' : 'Submit for review'}
          </Button>
        </Card>

        <div className="mt-5 flex items-start gap-2.5 px-4 py-3 rounded-md bg-[var(--color-surface-1)] border border-[var(--color-line)]">
          <Badge tone="neutral" size="sm">Privacy</Badge>
          <p className="text-[11px] text-[var(--color-fg-dim)] leading-relaxed">
            Uploads use Cloudinary's authenticated storage — your document can only be
            opened by reviewers with a signed link. We never display it publicly.
          </p>
        </div>
      </div>
    </div>
  )
}
