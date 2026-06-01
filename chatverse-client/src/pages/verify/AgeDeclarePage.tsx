import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, AlertCircle, CalendarCheck } from 'lucide-react'
import { ageApi } from '../../api'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Card from '../../components/ui/Card'

export default function AgeDeclarePage() {
  const navigate = useNavigate()
  const [dob, setDob] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const computedAge = (() => {
    if (!dob) return null
    const d = new Date(dob)
    if (Number.isNaN(d.getTime())) return null
    const now = new Date()
    let age = now.getFullYear() - d.getFullYear()
    const m = now.getMonth() - d.getMonth()
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--
    return age
  })()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!dob) {
      setError('Pick your date of birth.')
      return
    }
    if (computedAge !== null && computedAge < 13) {
      setError('You must be at least 13 to use ChatVerse.')
      return
    }
    if (!confirmed) {
      setError('Confirm you are 18 or older to continue.')
      return
    }

    setLoading(true)
    setError(null)
    try {
      await ageApi.declare(dob)
      navigate('/verify/ai-quiz')
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Could not save your declaration.')
    } finally {
      setLoading(false)
    }
  }

  const maxDob = new Date()
  maxDob.setFullYear(maxDob.getFullYear() - 13)

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
            <CalendarCheck size={20} className="text-[var(--color-accent-fg)]" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Confirm your age</h1>
          <p className="text-sm text-[var(--color-fg-faint)] mt-1.5 leading-relaxed">
            We need this to unlock 18+ rooms and to keep minors safely separated.
            Your date of birth is private — we only show pass/fail.
          </p>
        </div>

        <Card padding="lg">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Date of birth"
              type="date"
              max={maxDob.toISOString().split('T')[0]}
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              required
            />
            {computedAge !== null && (
              <p className="text-xs text-[var(--color-fg-faint)]">
                You will be {computedAge} years old.
              </p>
            )}

            <label className="flex items-start gap-2.5 cursor-pointer select-none p-3 rounded-md bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] transition-colors">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[var(--color-accent)]"
              />
              <span className="text-xs text-[var(--color-fg-dim)] leading-relaxed">
                I confirm I am 18 years of age or older and the date above is accurate.
                Providing false information may result in account suspension.
              </span>
            </label>

            {error && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-[var(--color-danger-soft)] border border-[rgba(239,68,68,0.3)] text-[#fca5a5] text-xs">
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" fullWidth size="lg" loading={loading}>
              {loading ? 'Saving…' : 'Continue'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
