import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Check, Circle, LogOut, ShieldCheck, Mail,
  CalendarCheck, Bot, FileCheck2, Pencil, Camera, X as XIcon, Loader2,
} from 'lucide-react'

import { useAuthStore } from '../../stores/authStore'
import { trustApi, ageApi, usersApi } from '../../api'
import { authApi } from '../../api/auth'
import { useToastStore } from '../../stores/toastStore'
import type { TrustScore } from '../../types'

import Avatar from '../../components/ui/Avatar'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import LanguageSwitcher from '../../components/ui/LanguageSwitcher'

const BAND_TONE: Record<string, 'neutral' | 'accent' | 'success' | 'warning' | 'danger'> = {
  new:        'neutral',
  restricted: 'danger',
  normal:     'accent',
  trusted:    'success',
  elite:      'warning',
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const { user, clearAuth, setAuth, token } = useAuthStore()
  const { showToast } = useToastStore()
  const [trust, setTrust] = useState<TrustScore | null>(null)
  const [ageStatus, setAgeStatus] = useState<any>(null)

  // Inline edit state for username + avatar
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    trustApi.getScore().then((r) => setTrust(r.data.data)).catch(() => {})
    ageApi.getStatus().then((r) => setAgeStatus(r.data.data)).catch(() => {})
  }, [])

  const handleLogout = async () => {
    await authApi.logout().catch(() => {})
    clearAuth()
    navigate('/')
  }

  const startEditName = () => { setNameDraft(user?.username ?? ''); setEditingName(true) }

  const saveName = async () => {
    if (!user || !token) return
    const trimmed = nameDraft.trim()
    if (!trimmed || trimmed === user.username) { setEditingName(false); return }
    setSavingName(true)
    try {
      await usersApi.updateMe({ username: trimmed })
      // Patch local store immediately; the JWT still has the old username but
      // other components read from the store so the change shows right away.
      setAuth({ ...user, username: trimmed }, token)
      showToast({ type: 'success', title: 'Saved', message: 'Username updated.', duration: 2000 })
      setEditingName(false)
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Could not save',
        message: err.response?.data?.error ?? 'Try again.',
        duration: 3000,
      })
    } finally {
      setSavingName(false)
    }
  }

  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      showToast({ type: 'warning', title: 'Too large', message: 'Avatar must be under 5 MB.', duration: 3000 })
      return
    }
    setUploadingAvatar(true)
    try {
      const res = await usersApi.uploadAvatar(file)
      setAvatarUrl(res.data.data?.avatarUrl ?? null)
      showToast({ type: 'success', title: 'Avatar updated', message: '', duration: 2000 })
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Upload failed',
        message: err.response?.data?.error ?? 'Try again.',
        duration: 3000,
      })
    } finally {
      setUploadingAvatar(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const trustPct = trust ? Math.max(0, Math.min(100, trust.score)) : 0

  const verificationSteps: {
    label: string
    Icon: typeof Mail
    done: boolean
    href: string | null
  }[] = [
    { label: 'Email verified',         Icon: Mail,          done: !!ageStatus?.gates?.gate1_emailVerified, href: null },
    { label: 'Age self-declared',      Icon: CalendarCheck, done: !!ageStatus?.gates?.gate2_selfDeclared,  href: '/verify/age' },
    { label: 'AI maturity assessment', Icon: Bot,           done: !!ageStatus?.gates?.gate3_aiPassed,
      href: ageStatus?.gates?.gate2_selfDeclared ? '/verify/ai-quiz' : '/verify/age' },
    { label: 'Tenure or document',     Icon: FileCheck2,
      done: !!ageStatus?.gates?.gate4a_tenureCleared || ageStatus?.gates?.gate4b_docStatus === 'approved',
      href: ageStatus?.gates?.gate3_aiPassed ? '/verify/document' : '/verify/age' },
  ]

  return (
    <div className="h-full overflow-y-auto bg-[var(--color-bg)] text-[var(--color-fg)]">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center gap-2 mb-8">
          <button
            onClick={() => navigate('/chat')}
            className="w-8 h-8 rounded-md text-[var(--color-fg-dim)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface-2)] inline-flex items-center justify-center transition-colors focus-ring"
            aria-label="Back"
          >
            <ArrowLeft size={16} />
          </button>
          <h1 className="text-lg font-semibold tracking-tight">Profile</h1>
        </div>

        {/* User identity */}
        <Card padding="lg" className="mb-5">
          <div className="flex items-center gap-4">
            <div className="relative group">
              {avatarUrl ? (
                <img src={avatarUrl} alt={user?.username ?? 'avatar'} className="w-16 h-16 rounded-full object-cover" />
              ) : (
                <Avatar name={user?.username ?? '?'} size="xl" />
              )}
              {!user?.isGuest && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute inset-0 rounded-full bg-black/60 text-white flex items-center justify-center
                    opacity-0 group-hover:opacity-100 transition-opacity disabled:cursor-not-allowed"
                  aria-label="Change avatar"
                >
                  {uploadingAvatar ? (
                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  ) : (
                    <Camera size={16} />
                  )}
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarFile}
              />
            </div>

            <div className="flex-1 min-w-0">
              {editingName ? (
                <div className="flex items-center gap-1.5">
                  <input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    autoFocus
                    maxLength={50}
                    className="flex-1 min-w-0 h-8 px-2.5 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line)] text-base font-semibold
                      focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)] transition-colors"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveName()
                      if (e.key === 'Escape') setEditingName(false)
                    }}
                  />
                  <button
                    onClick={saveName}
                    disabled={savingName}
                    className="w-8 h-8 rounded-md bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white inline-flex items-center justify-center disabled:opacity-50"
                    aria-label="Save"
                  >
                    {savingName ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />}
                  </button>
                  <button
                    onClick={() => setEditingName(false)}
                    className="w-8 h-8 rounded-md bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-fg-dim)] inline-flex items-center justify-center"
                    aria-label="Cancel"
                  >
                    <XIcon size={13} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-semibold tracking-tight">{user?.username}</h2>
                  {!user?.isGuest && (
                    <button
                      onClick={startEditName}
                      className="text-[var(--color-fg-mute)] hover:text-[var(--color-fg)] transition-colors p-1 rounded-md hover:bg-[var(--color-surface-2)]"
                      aria-label="Edit username"
                      title="Edit username"
                    >
                      <Pencil size={12} />
                    </button>
                  )}
                  {user?.isGuest && <Badge tone="warning" dot>Guest</Badge>}
                  {user?.isEmailVerified && !user?.isGuest && (
                    <Badge tone="success" dot>Verified</Badge>
                  )}
                </div>
              )}
              <p className="text-xs text-[var(--color-fg-faint)] mt-1">
                User ID: <span className="font-mono">{user?.userId?.slice(0, 8)}</span>
              </p>
            </div>
          </div>
        </Card>

        {/* Trust score */}
        <Card padding="lg" className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-medium text-[var(--color-fg)]">Trust score</h3>
              <p className="text-xs text-[var(--color-fg-faint)] mt-0.5">Higher score unlocks more features.</p>
            </div>
            {trust && (
              <Badge tone={BAND_TONE[trust.band] ?? 'neutral'} dot>
                {trust.bandLabel}
              </Badge>
            )}
          </div>

          {trust ? (
            <>
              <div className="flex items-baseline gap-1.5 mb-2.5">
                <span className="text-3xl font-semibold tabular-nums tracking-tight">{trust.score}</span>
                <span className="text-sm text-[var(--color-fg-mute)]">/ 100</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
                <div className="h-full bg-[var(--color-accent)] transition-all duration-500" style={{ width: `${trustPct}%` }} />
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <div className="h-8 w-24 rounded bg-[var(--color-surface-2)] animate-pulse" />
              <div className="h-1.5 w-full rounded-full bg-[var(--color-surface-2)] animate-pulse" />
            </div>
          )}
        </Card>

        {/* Age verification */}
        <Card padding="lg" className="mb-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-medium text-[var(--color-fg)]">Age verification</h3>
              <p className="text-xs text-[var(--color-fg-faint)] mt-0.5">Required to unlock video chat and 18+ rooms.</p>
            </div>
            {ageStatus?.ageVerified && <Badge tone="success" dot>Verified</Badge>}
          </div>

          {ageStatus ? (
            <>
              <ul className="space-y-1.5">
                {verificationSteps.map(({ label, Icon, done, href }) => {
                  const inner = (
                    <>
                      <span
                        className={`w-7 h-7 rounded-md flex items-center justify-center
                          ${done
                            ? 'bg-[var(--color-success-soft)] text-[var(--color-success-fg)]'
                            : 'bg-[var(--color-surface-2)] text-[var(--color-fg-mute)]'
                          }`}
                      >
                        {done ? <Check size={14} /> : <Icon size={14} />}
                      </span>
                      <span className={`text-sm ${done ? 'text-[var(--color-fg)]' : 'text-[var(--color-fg-faint)]'}`}>
                        {label}
                      </span>
                      {!done && <Circle size={6} className="ml-auto text-[var(--color-fg-mute)]" fill="currentColor" />}
                    </>
                  )

                  if (done || !href) {
                    return (
                      <li key={label} className={`flex items-center gap-3 px-2 py-2 rounded-md ${done ? 'bg-[var(--color-surface-2)]/50' : ''}`}>
                        {inner}
                      </li>
                    )
                  }

                  return (
                    <li key={label}>
                      <button
                        onClick={() => navigate(href)}
                        className="w-full flex items-center gap-3 px-2 py-2 rounded-md hover:bg-[var(--color-surface-2)] text-left transition-colors group focus-ring"
                      >
                        {inner}
                        <span className="ml-2 text-[10px] text-[var(--color-fg-mute)] group-hover:text-[var(--color-fg-faint)] transition-colors">
                          Start →
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>

              {ageStatus.ageVerified ? (
                <div className="mt-4 flex items-center gap-2 px-3 py-2.5 rounded-md bg-[var(--color-success-soft)] border border-[var(--color-success-border)] text-[var(--color-success-fg)] text-xs">
                  <ShieldCheck size={14} />
                  Age verified — all features unlocked.
                </div>
              ) : (
                <div className="mt-4 text-xs text-[var(--color-fg-faint)] text-center">
                  Complete all steps to unlock video chat and 18+ rooms.
                </div>
              )}
            </>
          ) : (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-10 rounded-md bg-[var(--color-surface-2)] animate-pulse" />
              ))}
            </div>
          )}
        </Card>

        {/* Preferences */}
        <Card padding="lg" className="mb-5">
          <LanguageSwitcher />
        </Card>

        {/* Sign out */}
        <Button
          variant="subtle"
          fullWidth
          size="lg"
          leftIcon={<LogOut size={15} />}
          onClick={handleLogout}
          className="!text-[var(--color-fg-dim)] hover:!text-[var(--color-danger)]"
        >
          Sign out
        </Button>
      </div>
    </div>
  )
}
