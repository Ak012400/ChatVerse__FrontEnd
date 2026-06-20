import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Key, BookOpen, Send, Crown, Trophy, Library, Eye, EyeOff, X,
} from 'lucide-react'

import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Loader from '../../components/ui/Loader'
import { useToastStore } from '../../stores/toastStore'
import { useCipherStore } from '../../stores/cipherStore'
import { useCipherHub } from '../../hooks/useCipherHub'

// ============================================================
//  /cipher — The Cipher (weekly community ARG)
//
//  Three tabs:
//    • Now        — current round; member or hunter view
//    • Leaderboard
//    • Archive    — past rounds with the phrase + members revealed
// ============================================================

type Tab = 'now' | 'leaderboard' | 'archive'

export default function CipherPage() {
  const { showToast } = useToastStore()
  const {
    current, fragment, archive, leaderboard,
    setCurrent, setFragment, setArchive, setLeaderboard,
  } = useCipherStore()
  const {
    isConnected,
    getCurrentRound, getMyFragment, submitGuess, getMySubmission,
    getLeaderboard, getArchive,
  } = useCipherHub()

  const [tab, setTab] = useState<Tab>('now')
  const [loading, setLoading] = useState(false)
  const [phraseGuess, setPhraseGuess] = useState('')
  const [namedIds, setNamedIds] = useState('')   // comma-separated for MVP
  const [submitting, setSubmitting] = useState(false)
  const [showFragment, setShowFragment] = useState(false)

  useEffect(() => {
    if (!isConnected) return
    setLoading(true)
    Promise.all([getCurrentRound(), getMyFragment()])
      .then(([c, f]) => {
        setCurrent(c)
        setFragment(f)
        if (c.mySubmission) {
          setPhraseGuess(c.mySubmission.guessedPhrase)
          setNamedIds(c.mySubmission.namedUserIds.join(', '))
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected])

  useEffect(() => {
    if (!isConnected) return
    if (tab === 'leaderboard') {
      getLeaderboard().then((r) => setLeaderboard(r.rows)).catch(() => {})
    }
    if (tab === 'archive') {
      getArchive().then((r) => setArchive(r.rounds)).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, isConnected])

  const handleSubmit = async () => {
    if (!current?.roundId) return
    const phrase = phraseGuess.trim()
    const ids = namedIds.split(',').map((s) => s.trim()).filter(Boolean)
    if (!phrase) {
      showToast({ type: 'warning', title: 'Write your phrase guess', message: 'Empty submissions aren\'t accepted.', duration: 3000 })
      return
    }
    if (ids.length === 0) {
      showToast({ type: 'warning', title: 'Name at least one suspect', message: 'Paste a user id (we\'ll improve this picker later).', duration: 3000 })
      return
    }
    setSubmitting(true)
    try {
      await submitGuess(phrase, ids)
      const fresh = await getCurrentRound()
      setCurrent(fresh)
      showToast({ type: 'success', title: '🗝  Submission in', message: 'Re-submit any time before Sunday 11pm IST.', duration: 5000 })
    } catch (err: any) {
      showToast({ type: 'error', title: 'Submit failed', message: err?.message ?? 'Try again.', duration: 4000 })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-6 sm:py-10">
      <div className="max-w-2xl mx-auto cv-fade-up">
        <Header />
        <TabStrip tab={tab} setTab={setTab} />

        <div className="mt-6 cv-tab-slide" key={tab}>
          {tab === 'now' && (
            loading && !current
              ? <div className="flex justify-center py-12"><Loader /></div>
              : !current?.hasActive
                ? <NoRoundView />
                : <NowView
                    current={current}
                    fragment={fragment}
                    showFragment={showFragment}
                    setShowFragment={setShowFragment}
                    phraseGuess={phraseGuess} setPhraseGuess={setPhraseGuess}
                    namedIds={namedIds} setNamedIds={setNamedIds}
                    submitting={submitting} onSubmit={handleSubmit}
                  />
          )}
          {tab === 'leaderboard' && <LeaderboardView rows={leaderboard} />}
          {tab === 'archive' && <ArchiveView rounds={archive} />}
        </div>
      </div>
    </div>
  )
}

// ─── Header ─────────────────────────────────────────────────

function Header() {
  return (
    <div className="cv-aurora rounded-2xl p-5 border border-[var(--color-line)] bg-[var(--color-surface-1)] mb-6">
      <div className="flex items-start gap-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-white cv-halo"
          style={{ background: 'linear-gradient(135deg, var(--color-accent) 0%, #d946ef 100%)' }}
        >
          <Key size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold leading-tight cv-text-gradient">The Cipher</h1>
          <p className="text-sm text-[var(--color-fg-dim)] mt-1">
            Every Monday, a hidden phrase is split into single-word fragments and slipped to a handful of users. Hunt them. Reconstruct the line. Score ≥ 50% to win.
          </p>
          <Link
            to="/about#the-cipher"
            className="inline-flex items-center gap-1.5 mt-2 text-xs text-[var(--color-accent-fg)] hover:text-[var(--color-accent)] transition-colors"
          >
            <BookOpen size={12} />
            <span>Read the rules</span>
          </Link>
        </div>
      </div>
    </div>
  )
}

function TabStrip({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const items: { key: Tab; label: string; icon: typeof Key }[] = [
    { key: 'now',         label: 'Now',         icon: Key },
    { key: 'leaderboard', label: 'Leaderboard', icon: Trophy },
    { key: 'archive',     label: 'Archive',     icon: Library },
  ]
  return (
    <div role="tablist" className="grid grid-cols-3 gap-1 p-1 bg-[var(--color-surface-2)] rounded-lg border border-[var(--color-line)]">
      {items.map((it) => {
        const Icon = it.icon
        const active = tab === it.key
        return (
          <button
            key={it.key}
            role="tab"
            aria-selected={active}
            onClick={() => setTab(it.key)}
            className={`cv-press h-9 inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors
              ${active
                ? 'bg-[var(--color-surface-1)] text-[var(--color-fg)] shadow-sm'
                : 'text-[var(--color-fg-dim)] hover:text-[var(--color-fg)]'}`}
          >
            <Icon size={15} />
            <span>{it.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function NoRoundView() {
  return (
    <Card padding="lg" className="text-center">
      <Key size={28} className="mx-auto text-[var(--color-fg-faint)] mb-3" />
      <div className="text-sm text-[var(--color-fg-dim)]">No active Cipher round.</div>
      <div className="text-xs text-[var(--color-fg-faint)] mt-1">The next round opens Monday 9am IST.</div>
    </Card>
  )
}

// ─── Now view ───────────────────────────────────────────────

interface NowProps {
  current: NonNullable<ReturnType<typeof useCipherStore.getState>['current']>
  fragment: ReturnType<typeof useCipherStore.getState>['fragment']
  showFragment: boolean
  setShowFragment: (v: boolean) => void
  phraseGuess: string; setPhraseGuess: (s: string) => void
  namedIds:    string; setNamedIds:    (s: string) => void
  submitting:  boolean; onSubmit: () => void
}

function NowView(p: NowProps) {
  const isMember = p.current.iAmMember || p.fragment?.hasFragment
  return (
    <div className="flex flex-col gap-4">
      <RoundMetaCard current={p.current} />
      {isMember
        ? <MemberCard fragment={p.fragment} showFragment={p.showFragment} setShowFragment={p.setShowFragment} weekLabel={p.current.weekLabel} />
        : <HunterCard
            current={p.current}
            phraseGuess={p.phraseGuess} setPhraseGuess={p.setPhraseGuess}
            namedIds={p.namedIds}       setNamedIds={p.setNamedIds}
            submitting={p.submitting}   onSubmit={p.onSubmit}
          />}
    </div>
  )
}

function RoundMetaCard({ current }: { current: NowProps['current'] }) {
  return (
    <Card padding="md" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] uppercase tracking-wider text-[var(--color-fg-faint)] font-medium">
          Round {current.weekLabel}
        </div>
        {current.endsAt && <Countdown iso={current.endsAt} />}
      </div>
      <div className="text-sm text-[var(--color-fg-dim)]">
        Phrase length: <span className="text-[var(--color-fg)] font-medium tabular-nums">{current.phraseLength ?? '—'}</span> words ·
        {' '}Members hidden in the wild.
      </div>
    </Card>
  )
}

function Countdown({ iso }: { iso: string }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  const ms = new Date(iso).getTime() - now
  return (
    <span className="text-[11px] font-mono tabular-nums text-[var(--color-accent-fg)] bg-[var(--color-accent-soft)] px-2 py-0.5 rounded-full">
      Closes in {prettyDuration(ms)}
    </span>
  )
}

function MemberCard({
  fragment, showFragment, setShowFragment, weekLabel,
}: {
  fragment: ReturnType<typeof useCipherStore.getState>['fragment']
  showFragment: boolean
  setShowFragment: (v: boolean) => void
  weekLabel?: string
}) {
  return (
    <Card aurora padding="lg" className="flex flex-col items-center gap-3 text-center cv-pop">
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[var(--color-accent)] to-[#d946ef] text-white inline-flex items-center justify-center cv-halo">
        <Crown size={22} />
      </div>
      <h2 className="text-lg font-semibold cv-text-gradient">You\'re a Cipher Member this week</h2>
      <p className="text-sm text-[var(--color-fg-dim)] max-w-md">
        Your job: weave the secret word into at least three different conversations across ChatVerse this week. Make it sound natural. Don\'t announce it.
      </p>
      {showFragment ? (
        <div className="flex flex-col items-center gap-2">
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-fg-faint)]">
            {weekLabel} · your fragment
          </div>
          <div className="text-2xl font-semibold italic text-[var(--color-fg)] px-4 py-2 rounded-md bg-[var(--color-accent-soft)]">
            “{fragment?.assignedFragment}”
          </div>
          <Button variant="ghost" size="sm" leftIcon={<EyeOff size={14} />} onClick={() => setShowFragment(false)}>
            Hide
          </Button>
        </div>
      ) : (
        <Button variant="primary" leftIcon={<Eye size={14} />} onClick={() => setShowFragment(true)}>
          Reveal my fragment
        </Button>
      )}
      <p className="text-[10px] text-[var(--color-fg-faint)] max-w-sm">
        Don\'t paste this into chat verbatim — the point is for Hunters to NOTICE you use it naturally, not catch you bragging.
      </p>
    </Card>
  )
}

function HunterCard({
  current, phraseGuess, setPhraseGuess, namedIds, setNamedIds, submitting, onSubmit,
}: Omit<NowProps, 'fragment' | 'showFragment' | 'setShowFragment'>) {
  return (
    <Card padding="md" className="flex flex-col gap-3">
      <div>
        <div className="text-sm font-medium text-[var(--color-fg)]">Your guess</div>
        <div className="text-xs text-[var(--color-fg-dim)] mt-0.5">
          Last write wins — resubmit any time before {current.endsAt && new Date(current.endsAt).toLocaleString()}.
        </div>
      </div>

      <div>
        <label className="text-[11px] uppercase tracking-wider font-medium text-[var(--color-fg-faint)] mb-1 block">
          The phrase
        </label>
        <textarea
          value={phraseGuess}
          onChange={(e) => setPhraseGuess(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder='e.g. "The river remembers what the sky forgets"'
          className="w-full resize-none rounded-md bg-[var(--color-surface-2)] text-[var(--color-fg)]
            text-sm leading-relaxed p-2 border border-[var(--color-line)]
            focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)]"
        />
      </div>

      <div>
        <label className="text-[11px] uppercase tracking-wider font-medium text-[var(--color-fg-faint)] mb-1 block">
          Suspected Members (comma-separated user ids)
        </label>
        <input
          value={namedIds}
          onChange={(e) => setNamedIds(e.target.value)}
          placeholder="user-id-1, user-id-2, …"
          className="w-full h-10 rounded-md bg-[var(--color-surface-2)] text-[var(--color-fg)]
            text-sm px-2 border border-[var(--color-line)]
            focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)]"
        />
        <div className="text-[10px] text-[var(--color-fg-faint)] mt-1">
          MVP: paste raw user ids. A friendlier picker is coming.
        </div>
      </div>

      <div className="flex justify-end">
        <Button variant="primary" loading={submitting} disabled={!phraseGuess.trim() || !namedIds.trim()} onClick={onSubmit} leftIcon={<Send size={14} />}>
          {current.iHaveSubmitted ? 'Resubmit' : 'Submit guess'}
        </Button>
      </div>

      {current.mySubmission && (
        <Card padding="sm">
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)] mb-1">
            Currently submitted ({new Date(current.mySubmission.submittedAt).toLocaleString()})
          </div>
          <div className="text-sm italic text-[var(--color-fg)]">
            “{current.mySubmission.guessedPhrase}”
          </div>
          <div className="text-xs text-[var(--color-fg-dim)] mt-1">
            Named: {current.mySubmission.namedUserIds.length} suspects
          </div>
        </Card>
      )}
    </Card>
  )
}

// ─── Leaderboard ────────────────────────────────────────────

function LeaderboardView({ rows }: { rows: ReturnType<typeof useCipherStore.getState>['leaderboard'] }) {
  if (rows.length === 0) {
    return (
      <Card padding="lg" className="text-center">
        <Trophy size={26} className="mx-auto text-[var(--color-fg-faint)] mb-2" />
        <div className="text-sm text-[var(--color-fg-dim)]">No scored submissions yet.</div>
        <div className="text-xs text-[var(--color-fg-faint)] mt-1">Scoring runs at round close.</div>
      </Card>
    )
  }
  return (
    <div className="flex flex-col gap-2 cv-stagger">
      {rows.map((r, i) => (
        <Card key={`${r.hunterUsername}-${r.submittedAt}`} padding="sm" className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-[var(--color-surface-2)] inline-flex items-center justify-center text-xs font-mono font-semibold text-[var(--color-fg-dim)] shrink-0">
            {i + 1}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-[var(--color-fg)] truncate">{r.hunterUsername}</div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)]">
              {r.accuracyPct}% accuracy {r.won && '· winner'}
            </div>
          </div>
          {r.won && <Trophy size={14} className="text-amber-300/85" />}
        </Card>
      ))}
    </div>
  )
}

// ─── Archive ────────────────────────────────────────────────

function ArchiveView({ rounds }: { rounds: ReturnType<typeof useCipherStore.getState>['archive'] }) {
  if (rounds.length === 0) {
    return (
      <Card padding="lg" className="text-center">
        <Library size={26} className="mx-auto text-[var(--color-fg-faint)] mb-2" />
        <div className="text-sm text-[var(--color-fg-dim)]">No closed rounds yet.</div>
      </Card>
    )
  }
  return (
    <div className="flex flex-col gap-3 cv-stagger">
      {rounds.map((r) => (
        <Card key={r.id} padding="md" className="flex flex-col gap-2">
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-fg-faint)] font-medium">
            {r.weekLabel} · closed {new Date(r.closedAt).toLocaleDateString()}
          </div>
          <div className="text-sm italic text-[var(--color-fg)]">“{r.phrase}”</div>
          <div className="text-xs text-[var(--color-fg-dim)]">
            {r.memberCount} Members · {r.winningHunters} Hunter winner(s)
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {r.memberUsernames.map((u) => (
              <span key={u} className="text-[10px] px-1.5 h-4 rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)] inline-flex items-center font-medium">
                {u}
              </span>
            ))}
          </div>
        </Card>
      ))}
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────

function prettyDuration(ms: number): string {
  if (ms <= 0) return 'any moment'
  const totalMin = Math.floor(ms / 60_000)
  const days  = Math.floor(totalMin / (60 * 24))
  const hours = Math.floor((totalMin % (60 * 24)) / 60)
  const mins  = totalMin % 60
  if (days > 0)  return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

// keep import used
void X
