import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Theater, BookOpen, Send, Heart, Trophy, Crown, Vote, Sparkles,
} from 'lucide-react'

import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Loader from '../../components/ui/Loader'
import { useToastStore } from '../../stores/toastStore'
import { usePyaarLiveStore } from '../../stores/pyaarLiveStore'
import { usePyaarLiveHub } from '../../hooks/usePyaarLiveHub'
import type { ShowDto, MyCoupleDto, SpectatorCoupleRow } from '../../types/pyaarLive'

// ============================================================
//  /pyaar-live — Saturday 8pm IST mass dating show
//
//  State-driven (NOT tab-driven):
//    • LobbyView      — no live show, registration affordance
//    • CountdownView  — registered + pre-show window
//    • CoupleChatView — I'm in a live couple, my private thread
//    • SpectatorView  — live show + I'm not in it, grid + vote
//    • OutcomeView    — completed show
// ============================================================

const MAX_MSG = 1000

export default function PyaarLivePage() {
  const { showToast } = useToastStore()
  const {
    registration, show, myCouple, spectator, myVote, history,
    setRegistration, setShow, setMyCouple, setSpectator, setHistory,
    appendCoupleMessage, applyVoteChange,
  } = usePyaarLiveStore()
  const {
    isConnected,
    register, withdraw, getMyStatus, getActiveShow, getMyCouple,
    sendCoupleMessage, getSpectatorView, vote, getMyHistory,
  } = usePyaarLiveHub()

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
        setShow(s.activeShow)
        setMyCouple(s.myCouple)
        setHistory(h.shows)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected])

  // Spectator data load when I'm watching but not playing.
  useEffect(() => {
    if (!isConnected || !show || show.status !== 'live' || show.iAmInCouple) return
    getSpectatorView()
      .then((v) => setSpectator(v.couples, v.myVote))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show?.id, show?.status, show?.iAmInCouple, isConnected])

  const phase = derivePhase(show, myCouple)

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-6 sm:py-10">
      <div className="max-w-3xl mx-auto cv-fade-up">
        <Header show={show} />

        <div className="mt-6 cv-tab-slide" key={phase}>
          {loading && !show && !registration ? (
            <div className="flex justify-center py-12"><Loader /></div>
          ) : phase === 'couple-chat' && myCouple ? (
            <CoupleChatView
              myCouple={myCouple}
              draft={draft} setDraft={setDraft}
              sending={sending}
              onSend={async () => {
                if (!draft.trim() || sending) return
                setSending(true)
                try {
                  const m = await sendCoupleMessage(draft.trim())
                  appendCoupleMessage({ ...m, mine: true })
                  setDraft('')
                } catch (err: any) {
                  showToast({ type: 'error', title: 'Send failed', message: err?.message ?? 'Try again.', duration: 4000 })
                } finally { setSending(false) }
              }}
            />
          ) : phase === 'spectator' && show ? (
            <SpectatorViewBlock
              show={show}
              spectator={spectator}
              myVote={myVote}
              onVote={async (id) => {
                try {
                  const updated = await vote(id)
                  setShow(updated)
                  applyVoteChange(id)
                  showToast({ type: 'success', title: '🗳  Vote in', message: 'Your vote\'s counted.', duration: 3500 })
                } catch (err: any) {
                  showToast({ type: 'error', title: 'Vote failed', message: err?.message ?? 'Try again.', duration: 4000 })
                }
              }}
            />
          ) : phase === 'outcome' && show ? (
            <OutcomeView show={show} />
          ) : phase === 'countdown' ? (
            <CountdownView
              nextEventAt={registration?.nextEventAt ?? null}
              busy={busy}
              onWithdraw={async () => {
                if (busy) return
                setBusy(true)
                try { setRegistration(await withdraw()) }
                catch (err: any) { showToast({ type: 'error', title: 'Withdraw failed', message: err?.message ?? 'Try again.', duration: 4000 }) }
                finally { setBusy(false) }
              }}
            />
          ) : (
            <LobbyView
              registration={registration}
              busy={busy}
              onRegister={async () => {
                if (busy) return
                setBusy(true)
                try {
                  const r = await register()
                  setRegistration(r)
                  showToast({ type: 'success', title: '🎬  Signed up', message: 'See you Saturday 8pm IST.', duration: 5000 })
                } catch (err: any) {
                  showToast({ type: 'error', title: 'Register failed', message: err?.message ?? 'Try again.', duration: 4000 })
                } finally { setBusy(false) }
              }}
              onRefreshShow={async () => {
                try {
                  const s = await getActiveShow()
                  setShow(s)
                  if (s.iAmInCouple) {
                    const c = await getMyCouple()
                    setMyCouple(c)
                  }
                } catch { /* no live show */ }
              }}
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

type Phase = 'lobby' | 'countdown' | 'couple-chat' | 'spectator' | 'outcome'

function derivePhase(show: ShowDto | null, myCouple: MyCoupleDto | null): Phase {
  if (!show) return 'lobby'
  if (show.status === 'completed') return 'outcome'
  if (show.status === 'live') {
    if (myCouple && !myCouple.eliminated) return 'couple-chat'
    return 'spectator'
  }
  return 'countdown'
}

// ─── Header ─────────────────────────────────────────────────

function Header({ show }: { show: ShowDto | null }) {
  return (
    <div className="cv-aurora rounded-2xl p-5 border border-[var(--color-line)] bg-[var(--color-surface-1)] mb-6">
      <div className="flex items-start gap-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-white cv-halo"
          style={{ background: 'linear-gradient(135deg, var(--color-accent) 0%, #ec4899 100%)' }}
        >
          <Theater size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold leading-tight cv-text-gradient">PYAAR LIVE</h1>
          <p className="text-sm text-[var(--color-fg-dim)] mt-1">
            Saturdays at 8pm IST. Ten random couples, four rounds, mid-show elimination, audience picks the top three.
          </p>
          {show?.status === 'live' && (
            <div className="mt-3 flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-medium text-rose-300 bg-rose-500/15 px-2 h-5 rounded-full border border-rose-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                LIVE
              </span>
              <span className="text-xs text-[var(--color-fg-dim)]">
                Round {show.currentRound} · {show.currentRoundLabel}
              </span>
              {show.currentRoundEndsAt && <Countdown iso={show.currentRoundEndsAt} />}
            </div>
          )}
          <Link
            to="/about#pyaar-live"
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

function Countdown({ iso }: { iso: string }) {
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

// ─── Lobby ──────────────────────────────────────────────────

function LobbyView({
  registration, busy, onRegister, onRefreshShow,
}: {
  registration: ReturnType<typeof usePyaarLiveStore.getState>['registration']
  busy: boolean
  onRegister: () => void
  onRefreshShow: () => void
}) {
  useEffect(() => { onRefreshShow() }, [onRefreshShow])
  return (
    <Card padding="lg" className="flex flex-col items-center gap-3 text-center">
      <div className="w-12 h-12 rounded-2xl bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)] inline-flex items-center justify-center cv-halo">
        <Heart size={22} />
      </div>
      <h2 className="text-lg font-semibold">
        {registration?.status === 'matched' ? 'You\'re paired up' : 'Sign up for Saturday'}
      </h2>
      <p className="text-sm text-[var(--color-fg-dim)] max-w-md">
        20 voyagers get picked. 10 couples. 4 rounds. One winning pair. The audience eliminates after Round 2, then crowns the top three.
      </p>
      {registration?.nextEventAt && <NextEventLine iso={registration.nextEventAt} />}
      <Button variant="primary" size="lg" loading={busy} onClick={onRegister} leftIcon={<Heart size={16} />}>
        I\'m in
      </Button>
    </Card>
  )
}

function CountdownView({ nextEventAt, busy, onWithdraw }: { nextEventAt: string | null; busy: boolean; onWithdraw: () => void }) {
  return (
    <Card padding="lg" className="flex flex-col items-center gap-3 text-center">
      <div className="w-12 h-12 rounded-2xl bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)] inline-flex items-center justify-center cv-halo">
        <Sparkles size={22} />
      </div>
      <h2 className="text-lg font-semibold">You\'re on the list</h2>
      <p className="text-sm text-[var(--color-fg-dim)] max-w-md">
        Saturday 8pm IST you\'ll either be paired into a couple or you\'ll watch as a spectator. Either way you can vote on couples you\'re not in.
      </p>
      {nextEventAt && <NextEventLine iso={nextEventAt} />}
      <Button variant="secondary" size="sm" loading={busy} onClick={onWithdraw}>Withdraw</Button>
    </Card>
  )
}

function NextEventLine({ iso }: { iso: string }) {
  const [_, force] = useState(0)
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])
  const ms = new Date(iso).getTime() - Date.now()
  const txt = useMemo(() => prettyDuration(ms), [ms])
  return (
    <div className="text-xs text-[var(--color-fg-faint)] tabular-nums">
      Show starts in <span className="text-[var(--color-fg)] font-medium">{txt}</span>
    </div>
  )
}

// ─── Couple chat ────────────────────────────────────────────

function CoupleChatView({
  myCouple, draft, setDraft, sending, onSend,
}: {
  myCouple: MyCoupleDto
  draft: string; setDraft: (s: string) => void
  sending: boolean; onSend: () => void
}) {
  return (
    <Card padding="md" className="flex flex-col" style={{ height: '75vh' }}>
      <div className="flex items-center justify-between pb-3 border-b border-[var(--color-line)]">
        <div>
          <div className="text-sm font-medium text-[var(--color-fg)]">{myCouple.codename} · with {myCouple.partnerUsername}</div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)]">
            Round {myCouple.currentRound} · {myCouple.currentRoundLabel}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs text-[var(--color-fg-dim)]">
            <Vote size={12} /> {myCouple.voteCount}
          </span>
          {myCouple.currentRoundEndsAt && <Countdown iso={myCouple.currentRoundEndsAt} />}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-3 flex flex-col gap-2">
        {myCouple.messages.length === 0 && (
          <div className="text-xs text-[var(--color-fg-faint)] text-center py-6">
            No messages yet. Open with anything.
          </div>
        )}
        {myCouple.messages.map((m) => <Bubble key={m.id} m={m} />)}
      </div>

      <div className="pt-3 border-t border-[var(--color-line)] flex gap-2 items-end">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          maxLength={MAX_MSG + 64}
          placeholder={`Message ${myCouple.partnerUsername}…`}
          className="flex-1 resize-none rounded-md bg-[var(--color-surface-2)] text-[var(--color-fg)]
            text-sm leading-relaxed p-2 border border-[var(--color-line)]
            focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)]"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() }
          }}
        />
        <Button variant="primary" size="sm" loading={sending} disabled={!draft.trim()} onClick={onSend} leftIcon={<Send size={12} />}>
          Send
        </Button>
      </div>
    </Card>
  )
}

function Bubble({ m }: { m: { content: string; mine?: boolean; senderUsername: string; createdAt: string } }) {
  return (
    <div className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed break-words whitespace-pre-wrap
          ${m.mine
            ? 'bg-[var(--color-accent)] text-white rounded-br-sm'
            : 'bg-[var(--color-surface-2)] text-[var(--color-fg)] rounded-bl-sm border border-[var(--color-line)]'}`}
      >
        {!m.mine && (
          <div className="text-[10px] uppercase tracking-wider opacity-70 mb-0.5">{m.senderUsername}</div>
        )}
        {m.content}
      </div>
    </div>
  )
}

// ─── Spectator grid ─────────────────────────────────────────

function SpectatorViewBlock({
  show, spectator, myVote, onVote,
}: {
  show: ShowDto
  spectator: SpectatorCoupleRow[]
  myVote: string | null
  onVote: (coupleId: string) => void
}) {
  return (
    <div className="flex flex-col gap-3 cv-stagger">
      {spectator.length === 0 && <div className="flex justify-center py-12"><Loader /></div>}
      {spectator.map((c) => (
        <SpectatorCard key={c.id} c={c} myVote={myVote} onVote={onVote} round={show.currentRound} />
      ))}
    </div>
  )
}

function SpectatorCard({
  c, myVote, onVote, round,
}: { c: SpectatorCoupleRow; myVote: string | null; onVote: (id: string) => void; round: number }) {
  const voted = myVote === c.id
  return (
    <Card padding="md" className={`flex flex-col gap-2 ${c.eliminated ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-wider font-medium text-[var(--color-fg-faint)]">
            {c.codename}{c.eliminated ? ' · ELIMINATED' : ''}{c.finalRank && ` · #${c.finalRank}`}
          </div>
          <div className="text-sm text-[var(--color-fg)]">
            {c.memberA} <span className="text-[var(--color-fg-faint)]">&amp;</span> {c.memberB}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-fg-dim)] tabular-nums">{c.voteCount} votes</span>
          {!c.eliminated && round >= 1 && (
            <Button
              size="sm" variant={voted ? 'primary' : 'secondary'}
              leftIcon={<Vote size={12} />}
              onClick={() => onVote(c.id)}
            >
              {voted ? 'Voted' : 'Vote'}
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
        {c.recent.length === 0 && (
          <div className="text-[10px] text-[var(--color-fg-faint)]">No recent lines.</div>
        )}
        {c.recent.map((m) => (
          <div key={m.id} className="text-xs">
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)] mr-2">
              {m.senderUsername}
            </span>
            <span className="text-[var(--color-fg-dim)] italic">{m.content}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ─── Outcome ────────────────────────────────────────────────

function OutcomeView({ show }: { show: ShowDto }) {
  const winners = show.couples
    .filter((c) => c.finalRank !== null && c.finalRank !== undefined)
    .sort((a, b) => (a.finalRank ?? 99) - (b.finalRank ?? 99))
  return (
    <Card aurora padding="lg" className="flex flex-col items-center gap-3 text-center cv-pop">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[var(--color-accent)] to-[#ec4899] text-white inline-flex items-center justify-center cv-halo">
        <Trophy size={26} />
      </div>
      <h2 className="text-xl font-semibold cv-text-gradient">Show wrapped</h2>
      <p className="text-sm text-[var(--color-fg-dim)] max-w-md">The audience has spoken.</p>
      <div className="w-full max-w-sm flex flex-col gap-2 mt-2">
        {winners.map((w) => (
          <Card key={w.id} padding="sm" className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)] inline-flex items-center justify-center font-semibold text-sm shrink-0">
              {w.finalRank}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="text-sm font-medium text-[var(--color-fg)]">{w.codename}</div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)]">
                {w.memberA} & {w.memberB} · {w.voteCount} votes
              </div>
            </div>
            {w.finalRank === 1 && <Crown size={14} className="text-amber-300/85" />}
          </Card>
        ))}
      </div>
    </Card>
  )
}

// ─── History ────────────────────────────────────────────────

function HistoryRail({ items }: { items: ReturnType<typeof usePyaarLiveStore.getState>['history'] }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider font-medium text-[var(--color-fg-faint)] mb-2">
        Past shows
      </div>
      <div className="flex flex-col gap-2">
        {items.map((h) => (
          <Card key={h.showId} padding="sm" className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm text-[var(--color-fg)]">{h.eventDate}</div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)]">
                {h.myCouple ? `${h.myCouple.codename}${h.myCouple.finalRank ? ` · #${h.myCouple.finalRank}` : h.myCouple.eliminated ? ' · eliminated' : ''}` : 'spectator'} · {h.winnersCount} winners
              </div>
            </div>
            {h.myCouple?.finalRank === 1 && <Crown size={14} className="text-amber-300/85" />}
          </Card>
        ))}
      </div>
    </div>
  )
}

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
