import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Heart, BookOpen, Send, Ghost, Sparkles, X, Clock, History, Check,
} from 'lucide-react'

import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Loader from '../../components/ui/Loader'
import { useToastStore } from '../../stores/toastStore'
import { useGhostDateStore } from '../../stores/ghostDateStore'
import { useGhostDateHub } from '../../hooks/useGhostDateHub'
import type { ActiveGhostDate, GhostDateOutcome } from '../../types/ghostDate'

// ============================================================
//  /ghost-date — weekly anonymous dating
//
//  The page is state-driven (NOT tab-driven): based on registration
//  status + live-date presence + time, it picks the right view:
//    • LobbyView        — no active date, can register/withdraw
//    • CountdownView    — registered + pre-pairing
//    • ChatView         — live 30-min window
//    • DecisionView     — chat ended, 5-min decision window
//    • OutcomeView      — outcome resolved
//    • HistoryRail      — always visible at the bottom
// ============================================================

const MAX_MSG = 1000

export default function GhostDatePage() {
  const { showToast } = useToastStore()
  const {
    registration, activeDate, thread, history,
    setRegistration, setActiveDate, setThread, setHistory,
    appendMessage,
  } = useGhostDateStore()
  const {
    isConnected,
    register, withdraw, getMyStatus,
    sendMessage, getThread, submitDecision, getMyHistory,
  } = useGhostDateHub()

  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  // Initial load.
  useEffect(() => {
    if (!isConnected) return
    setLoading(true)
    Promise.all([getMyStatus(), getMyHistory()])
      .then(([s, h]) => {
        setRegistration(s.registration)
        setActiveDate(s.activeDate)
        setHistory(h.dates)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected])

  // Thread fetch when entering ChatView.
  useEffect(() => {
    if (!activeDate || !isConnected) return
    if (thread.length > 0) return                // already loaded
    if (now() < new Date(activeDate.scheduledFor).getTime()) return
    getThread().then((r) => setThread(r.messages)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDate?.id, isConnected])

  const phase = derivePhase(activeDate)

  const handleRegister = async () => {
    if (busy) return
    setBusy(true)
    try {
      const r = await register()
      setRegistration(r)
      showToast({
        type: 'success', title: '🌙  You\'re in',
        message: 'See you at Thursday 9pm IST.', duration: 5000,
      })
    } catch (err: any) {
      showToast({ type: 'error', title: 'Couldn\'t register', message: err?.message ?? 'Try again.', duration: 4000 })
    } finally { setBusy(false) }
  }

  const handleWithdraw = async () => {
    if (busy) return
    setBusy(true)
    try {
      const r = await withdraw()
      setRegistration(r)
    } catch (err: any) {
      showToast({ type: 'error', title: 'Couldn\'t withdraw', message: err?.message ?? 'Try again.', duration: 4000 })
    } finally { setBusy(false) }
  }

  const handleSend = async () => {
    const content = draft.trim()
    if (!content || sending) return
    if (content.length > MAX_MSG) return
    setSending(true)
    try {
      const m = await sendMessage(content)
      appendMessage(m)
      setDraft('')
    } catch (err: any) {
      showToast({ type: 'error', title: 'Send failed', message: err?.message ?? 'Try again.', duration: 4000 })
    } finally { setSending(false) }
  }

  const handleDecision = async (reveal: boolean) => {
    if (!activeDate || busy) return
    setBusy(true)
    try {
      const d = await submitDecision(activeDate.id, reveal)
      setActiveDate(d)
    } catch (err: any) {
      showToast({ type: 'error', title: 'Decision failed', message: err?.message ?? 'Try again.', duration: 4000 })
    } finally { setBusy(false) }
  }

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-6 sm:py-10">
      <div className="max-w-2xl mx-auto cv-fade-up">
        <Header />

        <div className="mt-6 cv-tab-slide" key={phase}>
          {loading && !registration && !activeDate ? (
            <div className="flex justify-center py-12"><Loader /></div>
          ) : phase === 'chat' ? (
            <ChatView
              activeDate={activeDate!}
              thread={thread}
              draft={draft} setDraft={setDraft}
              sending={sending}
              onSend={handleSend}
            />
          ) : phase === 'decision' ? (
            <DecisionView
              activeDate={activeDate!}
              busy={busy}
              onChoose={handleDecision}
            />
          ) : phase === 'outcome' ? (
            <OutcomeView activeDate={activeDate!} />
          ) : phase === 'countdown' ? (
            <CountdownView
              nextEventAt={registration?.nextEventAt ?? null}
              busy={busy}
              onWithdraw={handleWithdraw}
            />
          ) : (
            <LobbyView
              registration={registration}
              busy={busy}
              onRegister={handleRegister}
            />
          )}
        </div>

        {history.length > 0 && (
          <div className="mt-10">
            <HistoryRail items={history} />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Phase deriver ──────────────────────────────────────────

type Phase = 'lobby' | 'countdown' | 'chat' | 'decision' | 'outcome'

function derivePhase(d: ActiveGhostDate | null): Phase {
  if (!d) return 'lobby'
  const t = now()
  if (d.outcome) return 'outcome'
  if (t < new Date(d.scheduledFor).getTime()) return 'countdown'
  if (t < new Date(d.expiresAt).getTime()) return 'chat'
  return 'decision'
}

function now(): number { return Date.now() }

// ─── Header ─────────────────────────────────────────────────

function Header() {
  return (
    <div className="cv-aurora rounded-2xl p-5 border border-[var(--color-line)] bg-[var(--color-surface-1)] mb-6">
      <div className="flex items-start gap-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-white cv-halo"
          style={{ background: 'linear-gradient(135deg, var(--color-accent) 0%, #ec4899 100%)' }}
        >
          <Heart size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold leading-tight cv-text-gradient">Ghost Date</h1>
          <p className="text-sm text-[var(--color-fg-dim)] mt-1">
            Thursdays at 9pm IST. Anonymous 30-minute text date with one stranger. After it ends, you both choose: step into the light or vanish.
          </p>
          <Link
            to="/about#ghost-date"
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

// ─── Lobby (not registered) ─────────────────────────────────

function LobbyView({
  registration, busy, onRegister,
}: {
  registration: ReturnType<typeof useGhostDateStore.getState>['registration']
  busy: boolean
  onRegister: () => void
}) {
  const nextEvent = registration?.nextEventAt
  const status = registration?.status ?? 'not_registered'

  return (
    <Card padding="lg" className="flex flex-col items-center gap-3 text-center">
      <div className="w-12 h-12 rounded-2xl bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)] inline-flex items-center justify-center cv-halo">
        <Ghost size={22} />
      </div>
      <h2 className="text-lg font-semibold">
        {status === 'withdrew' ? 'You\'re out for this week' : 'Ready for Thursday?'}
      </h2>
      <p className="text-sm text-[var(--color-fg-dim)] max-w-sm">
        Sign up before 9pm IST Thursday. The system will pair you with a stranger.
        Faces stay hidden until you both ✓ at the end.
      </p>
      {nextEvent && <NextEventCountdownLine iso={nextEvent} />}
      <Button
        variant="primary" size="lg"
        loading={busy}
        leftIcon={<Heart size={16} />}
        onClick={onRegister}
      >
        I\'m in
      </Button>
    </Card>
  )
}

// ─── Countdown (registered, waiting) ───────────────────────

function CountdownView({
  nextEventAt, busy, onWithdraw,
}: { nextEventAt: string | null; busy: boolean; onWithdraw: () => void }) {
  return (
    <Card padding="lg" className="flex flex-col items-center gap-3 text-center">
      <div className="w-12 h-12 rounded-2xl bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)] inline-flex items-center justify-center cv-halo">
        <Clock size={22} />
      </div>
      <h2 className="text-lg font-semibold">You\'re on the list</h2>
      <p className="text-sm text-[var(--color-fg-dim)] max-w-sm">
        The pairing tick fires at Thursday 9pm IST. You\'ll get a toast + the chat window opens automatically here.
      </p>
      {nextEventAt && <NextEventCountdownLine iso={nextEventAt} />}
      <Button
        variant="secondary" size="sm"
        loading={busy}
        onClick={onWithdraw}
      >
        Withdraw
      </Button>
    </Card>
  )
}

function NextEventCountdownLine({ iso }: { iso: string }) {
  const [_, force] = useState(0)
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])
  const ms = new Date(iso).getTime() - Date.now()
  const txt = useMemo(() => prettyDuration(ms), [ms])
  return (
    <div className="text-xs text-[var(--color-fg-faint)] tabular-nums">
      Pairing in <span className="text-[var(--color-fg)] font-medium">{txt}</span>
    </div>
  )
}

// ─── Chat (live 30-min window) ──────────────────────────────

function ChatView({
  activeDate, thread, draft, setDraft, sending, onSend,
}: {
  activeDate: ActiveGhostDate
  thread: { id: string; content: string; createdAt: string; mine: boolean }[]
  draft: string
  setDraft: (s: string) => void
  sending: boolean
  onSend: () => void
}) {
  return (
    <Card padding="md" className="flex flex-col" style={{ height: '70vh' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between pb-3 border-b border-[var(--color-line)]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[var(--color-surface-2)] inline-flex items-center justify-center text-[var(--color-fg-faint)]">
            <Ghost size={14} />
          </div>
          <div>
            <div className="text-sm font-medium text-[var(--color-fg)]">{activeDate.theirDisplay}</div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)]">
              anonymous · 30-min window
            </div>
          </div>
        </div>
        <ChatCountdown iso={activeDate.expiresAt} />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-3 flex flex-col gap-2">
        {thread.length === 0 && (
          <div className="text-xs text-[var(--color-fg-faint)] text-center py-6">
            Empty so far. Say hi.
          </div>
        )}
        {thread.map((m) => <Bubble key={m.id} m={m} />)}
      </div>

      {/* Composer */}
      <div className="pt-3 border-t border-[var(--color-line)] flex gap-2 items-end">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="Type something honest…"
          maxLength={MAX_MSG + 64}
          className="flex-1 resize-none rounded-md bg-[var(--color-surface-2)] text-[var(--color-fg)]
            text-sm leading-relaxed p-2 border border-[var(--color-line)]
            focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)]"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSend()
            }
          }}
        />
        <Button
          variant="primary" size="sm"
          loading={sending}
          disabled={!draft.trim()}
          onClick={onSend}
          leftIcon={<Send size={12} />}
        >
          Send
        </Button>
      </div>
    </Card>
  )
}

function Bubble({ m }: { m: { content: string; mine: boolean; createdAt: string } }) {
  return (
    <div className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[78%] px-3 py-2 rounded-2xl text-sm leading-relaxed break-words whitespace-pre-wrap
          ${m.mine
            ? 'bg-[var(--color-accent)] text-white rounded-br-sm'
            : 'bg-[var(--color-surface-2)] text-[var(--color-fg)] rounded-bl-sm border border-[var(--color-line)]'}`}
      >
        {m.content}
      </div>
    </div>
  )
}

function ChatCountdown({ iso }: { iso: string }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const ms = new Date(iso).getTime() - now
  if (ms <= 0) return null
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1_000)
  return (
    <span className="text-[11px] font-mono tabular-nums text-[var(--color-accent-fg)] bg-[var(--color-accent-soft)] px-2 py-0.5 rounded-full">
      {m.toString().padStart(2, '0')}:{s.toString().padStart(2, '0')}
    </span>
  )
}

// ─── Decision (5-min window) ────────────────────────────────

function DecisionView({
  activeDate, busy, onChoose,
}: { activeDate: ActiveGhostDate; busy: boolean; onChoose: (reveal: boolean) => void }) {
  const decided = activeDate.myDecision !== null

  return (
    <Card padding="lg" className="flex flex-col items-center gap-3 text-center cv-pop">
      <div className="w-12 h-12 rounded-2xl bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)] inline-flex items-center justify-center cv-halo">
        <Sparkles size={22} />
      </div>
      <h2 className="text-lg font-semibold">Choose, before the window closes</h2>
      <p className="text-sm text-[var(--color-fg-dim)] max-w-sm">
        Was {activeDate.theirDisplay} someone you\'d want to know? If you both ✓, identities reveal.
        If just one of you ✓, neither side learns. If both ✗, the system may pair you again months later.
      </p>
      <DecisionCountdown iso={activeDate.decisionDeadline} />

      {decided ? (
        <Card padding="sm" className="w-full max-w-xs">
          <div className="text-sm text-[var(--color-fg)]">
            You said <span className="font-medium">{activeDate.myDecision ? 'reveal' : 'pass'}</span>.
          </div>
          <div className="text-xs text-[var(--color-fg-dim)] mt-1">
            {activeDate.theirDecided ? 'Both decisions in — outcome incoming.' : 'Waiting for them to choose…'}
          </div>
        </Card>
      ) : (
        <div className="flex gap-2">
          <Button variant="secondary" loading={busy} onClick={() => onChoose(false)} leftIcon={<Ghost size={14} />}>
            Pass
          </Button>
          <Button variant="primary" loading={busy} onClick={() => onChoose(true)} leftIcon={<Check size={14} />}>
            Reveal
          </Button>
        </div>
      )}
    </Card>
  )
}

function DecisionCountdown({ iso }: { iso: string }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const ms = new Date(iso).getTime() - now
  if (ms <= 0) return <span className="text-xs text-[var(--color-danger)]">Window closed</span>
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1_000)
  return (
    <span className="text-[11px] font-mono tabular-nums text-[var(--color-accent-fg)] bg-[var(--color-accent-soft)] px-2 py-0.5 rounded-full">
      {m.toString().padStart(2, '0')}:{s.toString().padStart(2, '0')} left
    </span>
  )
}

// ─── Outcome view ───────────────────────────────────────────

function OutcomeView({ activeDate }: { activeDate: ActiveGhostDate }) {
  const o = activeDate.outcome as GhostDateOutcome
  const titles: Record<GhostDateOutcome, string> = {
    mutual_reveal: '✨ Both said yes',
    bittersweet:   '🌒 Bittersweet ending',
    mutual_pass:   '👻 Both said pass',
    expired:       '⏳ Window closed without a decision',
  }
  const bodies: Record<GhostDateOutcome, string> = {
    mutual_reveal: `${activeDate.theirDisplay} stepped out of the shadows. You can keep talking via DMs.`,
    bittersweet:   'One of you said reveal, the other passed. Neither name is shared. Hope is a slow weather.',
    mutual_pass:   'No reveal. But the system remembers you crossed paths — months from now, if you both opt in again, you may be paired again.',
    expired:       'At least one of you missed the 5-minute window. Try again next Thursday.',
  }
  return (
    <Card aurora padding="lg" className="flex flex-col items-center gap-3 text-center cv-pop">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[var(--color-accent)] to-[#ec4899] text-white inline-flex items-center justify-center cv-halo">
        {o === 'mutual_reveal' ? <Sparkles size={26} /> : <Ghost size={26} />}
      </div>
      <h2 className="text-xl font-semibold cv-text-gradient">{titles[o]}</h2>
      <p className="text-sm text-[var(--color-fg-dim)] max-w-md">{bodies[o]}</p>
      {o === 'mutual_reveal' && (
        <div className="mt-2 text-sm text-[var(--color-fg)] font-medium">
          {activeDate.theirDisplay}
        </div>
      )}
    </Card>
  )
}

// ─── History rail ───────────────────────────────────────────

function HistoryRail({ items }: { items: ReturnType<typeof useGhostDateStore.getState>['history'] }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider font-medium text-[var(--color-fg-faint)] mb-2 inline-flex items-center gap-1.5">
        <History size={12} />
        <span>Your past dates</span>
      </div>
      <div className="flex flex-col gap-2">
        {items.map((h) => (
          <Card key={h.id} padding="sm" className="flex items-center gap-3">
            <div className={`w-7 h-7 rounded-full inline-flex items-center justify-center shrink-0
              ${h.outcome === 'mutual_reveal'
                ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)]'
                : 'bg-[var(--color-surface-2)] text-[var(--color-fg-faint)]'}`}>
              {h.outcome === 'mutual_reveal' ? <Sparkles size={13} /> : <Ghost size={13} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-[var(--color-fg)] truncate">{h.theirDisplay}</div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)]">
                {h.eventDate} · {h.outcome ?? 'unknown'}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ─── Pretty duration ────────────────────────────────────────

function prettyDuration(ms: number): string {
  if (ms <= 0) return 'any moment'
  const totalMin = Math.floor(ms / 60_000)
  const days  = Math.floor(totalMin / (60 * 24))
  const hours = Math.floor((totalMin % (60 * 24)) / 60)
  const mins  = totalMin % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

// keep X import used
void X
