import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Check, Circle, LogOut, ShieldCheck, Mail,
  CalendarCheck, Bot, FileCheck2,
} from 'lucide-react'

import { useAuthStore } from '../../stores/authStore'
import { trustApi, ageApi } from '../../api'
import { authApi } from '../../api/auth'
import type { TrustScore } from '../../types'

import Avatar from '../../components/ui/Avatar'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'

const BAND_TONE: Record<string, 'neutral' | 'accent' | 'success' | 'warning' | 'danger'> = {
  new:        'neutral',
  restricted: 'danger',
  normal:     'accent',
  trusted:    'success',
  elite:      'warning',
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const { user, clearAuth } = useAuthStore()
  const [trust, setTrust] = useState<TrustScore | null>(null)
  const [ageStatus, setAgeStatus] = useState<any>(null)

  useEffect(() => {
    trustApi.getScore().then((r) => setTrust(r.data.data)).catch(() => {})
    ageApi.getStatus().then((r) => setAgeStatus(r.data.data)).catch(() => {})
  }, [])

  const handleLogout = async () => {
    await authApi.logout().catch(() => {})
    clearAuth()
    navigate('/')
  }

  const trustPct = trust ? Math.max(0, Math.min(100, trust.score)) : 0

  const verificationSteps: {
    label: string
    Icon: typeof Mail
    done: boolean
    /** What clicking the step opens (or null if it can't be acted on). */
    href: string | null
  }[] = [
    {
      label: 'Email verified',
      Icon: Mail,
      done: !!ageStatus?.gates?.gate1_emailVerified,
      href: null,
    },
    {
      label: 'Age self-declared',
      Icon: CalendarCheck,
      done: !!ageStatus?.gates?.gate2_selfDeclared,
      href: '/verify/age',
    },
    {
      label: 'AI maturity assessment',
      Icon: Bot,
      done: !!ageStatus?.gates?.gate3_aiPassed,
      // Quiz requires age declaration first
      href: ageStatus?.gates?.gate2_selfDeclared ? '/verify/ai-quiz' : '/verify/age',
    },
    {
      label: 'Tenure or document',
      Icon: FileCheck2,
      done:
        !!ageStatus?.gates?.gate4a_tenureCleared ||
        ageStatus?.gates?.gate4b_docStatus === 'approved',
      href: ageStatus?.gates?.gate3_aiPassed ? '/verify/document' : '/verify/age',
    },
  ]

  return (
    <div className="h-full overflow-y-auto bg-[var(--color-bg)] text-[var(--color-fg)]">
      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Top bar */}
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
            <Avatar name={user?.username ?? '?'} size="xl" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-semibold tracking-tight">{user?.username}</h2>
                {user?.isGuest && <Badge tone="warning" dot>Guest</Badge>}
                {user?.isEmailVerified && !user?.isGuest && (
                  <Badge tone="success" dot>Verified</Badge>
                )}
              </div>
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
              <p className="text-xs text-[var(--color-fg-faint)] mt-0.5">
                Higher score unlocks more features.
              </p>
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
                <span className="text-3xl font-semibold tabular-nums tracking-tight">
                  {trust.score}
                </span>
                <span className="text-sm text-[var(--color-fg-mute)]">/ 100</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
                <div
                  className="h-full bg-[var(--color-accent)] transition-all duration-500"
                  style={{ width: `${trustPct}%` }}
                />
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
              <p className="text-xs text-[var(--color-fg-faint)] mt-0.5">
                Required to unlock video chat and 18+ rooms.
              </p>
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
                          ${
                            done
                              ? 'bg-[var(--color-success-soft)] text-[#86efac]'
                              : 'bg-[var(--color-surface-2)] text-[var(--color-fg-mute)]'
                          }`}
                      >
                        {done ? <Check size={14} /> : <Icon size={14} />}
                      </span>
                      <span
                        className={`text-sm ${
                          done ? 'text-[var(--color-fg)]' : 'text-[var(--color-fg-faint)]'
                        }`}
                      >
                        {label}
                      </span>
                      {!done && (
                        <Circle
                          size={6}
                          className="ml-auto text-[var(--color-fg-mute)]"
                          fill="currentColor"
                        />
                      )}
                    </>
                  )

                  if (done || !href) {
                    return (
                      <li
                        key={label}
                        className={`flex items-center gap-3 px-2 py-2 rounded-md ${
                          done ? 'bg-[var(--color-surface-2)]/50' : ''
                        }`}
                      >
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
                <div className="mt-4 flex items-center gap-2 px-3 py-2.5 rounded-md bg-[var(--color-success-soft)] border border-[rgba(34,197,94,0.3)] text-[#86efac] text-xs">
                  <ShieldCheck size={14} />
                  Age verified — all features unlocked.
                </div>
              ) : (
                <div className="mt-4 text-xs text-[var(--color-fg-faint)] text-center">
                  Complete all steps to unlock video chat.
                </div>
              )}
            </>
          ) : (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-10 rounded-md bg-[var(--color-surface-2)] animate-pulse"
                />
              ))}
            </div>
          )}
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
