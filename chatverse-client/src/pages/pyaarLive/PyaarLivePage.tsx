import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Theater, BookOpen, Send, Heart, Trophy, Crown, Vote, Sparkles,
  X, Eye, Video, VideoOff, Skull,
} from 'lucide-react'

import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Loader from '../../components/ui/Loader'
import SoundboardTray from '../../components/sound/SoundboardTray'
import { useToastStore } from '../../stores/toastStore'
import { usePyaarLiveStore } from '../../stores/pyaarLiveStore'
import { usePyaarLiveHub } from '../../hooks/usePyaarLiveHub'
import type {
  ShowDto, MyCoupleDto, SpectatorCoupleRow,
  DrilledCoupleView, EliminatedThreadRow, PyaarMessage,
} from '../../types/pyaarLive'

// 10 distinct hues per couple-number for visual identification on the
// control-room grid. Kept warm + brand-adjacent (rose/violet/amber).
const COUPLE_TINTS: Record<number, string> = {
  1:  '#f43f5e',  2:  '#ec4899',  3:  '#d946ef',  4:  '#a855f7',  5:  '#8b5cf6',
  6:  '#6366f1',  7:  '#3b82f6',  8:  '#06b6d4',  9:  '#10b981', 10:  '#f59e0b',
}

const REACTION_SET = ['🔥', '😭', '😍', '🫶', '😱', '💀']

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

// ─── Control room (the new spectator experience) ───────────

function SpectatorViewBlock({
  show, spectator, myVote, onVote,
}: {
  show: ShowDto
  spectator: SpectatorCoupleRow[]
  myVote: string | null
  onVote: (coupleId: string) => void
}) {
  const { drilled, eliminatedThreads, reactions, setDrilled, setEliminatedThreads, pruneReactions } = usePyaarLiveStore()
  const {
    watchCouple, unwatchCouple, sendReaction, getEliminatedThreads, getRecentReactions,
  } = usePyaarLiveHub()
  const { showToast } = useToastStore()

  const [eliminatedOpen, setEliminatedOpen] = useState(false)
  const [openEliminatedId, setOpenEliminatedId] = useState<string | null>(null)

  // Periodic prune of stale floating-emojis so the overlay can't grow.
  useEffect(() => {
    const t = setInterval(() => pruneReactions(), 1000)
    return () => clearInterval(t)
  }, [pruneReactions])

  // Pull ambient reaction crowd-vibe on grid open.
  useEffect(() => {
    getRecentReactions().then((r) => {
      const store = usePyaarLiveStore.getState()
      const now = Date.now()
      r.reactions.slice(0, 12).forEach((rr) => {
        store.pushReaction({
          id:        Math.random().toString(36).slice(2),
          emoji:     rr.emoji,
          coupleId:  rr.coupleId,
          createdAt: now,
        })
      })
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Whenever the eliminated rail is opened, hydrate the archive.
  useEffect(() => {
    if (!eliminatedOpen) return
    getEliminatedThreads()
      .then((r) => setEliminatedThreads(r.eliminated))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eliminatedOpen])

  const handleOpenCouple = async (coupleId: string) => {
    try {
      const view = await watchCouple(coupleId)
      setDrilled(view)
    } catch (err: any) {
      showToast({ type: 'error', title: 'Couldn\'t open', message: err?.message ?? 'Try again.', duration: 3500 })
    }
  }

  const handleCloseDrilled = async () => {
    const current = drilled?.couple.id
    setDrilled(null)
    if (current) await unwatchCouple(current).catch(() => {})
  }

  const handleReaction = async (emoji: string, coupleId?: string) => {
    try { await sendReaction(emoji, coupleId) }
    catch { /* silent */ }
  }

  if (spectator.length === 0) {
    return <div className="flex justify-center py-12"><Loader /></div>
  }

  const alive = spectator.filter((c) => !c.eliminated)
  const dead  = spectator.filter((c) => c.eliminated)

  return (
    <div className="relative">
      {/* Reactions overlay — floating emojis above the grid */}
      <ReactionsOverlay reactions={reactions} />

      <ShowHeaderBar show={show} aliveCount={alive.length} totalCount={spectator.length} />

      {/* Couple tile grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4 cv-stagger">
        {alive.map((c) => (
          <CoupleTile
            key={c.id}
            c={c}
            round={show.currentRound}
            voted={myVote === c.id}
            onOpen={() => handleOpenCouple(c.id)}
            onVote={() => onVote(c.id)}
            onReaction={(emoji) => handleReaction(emoji, c.id)}
          />
        ))}
      </div>

      {/* Eliminated rail (post Round 2) */}
      {dead.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setEliminatedOpen((o) => !o)}
            className="cv-press inline-flex items-center gap-2 text-[11px] uppercase tracking-wider font-medium text-[var(--color-fg-faint)] hover:text-[var(--color-fg-dim)]"
          >
            <Skull size={12} />
            <span>Eliminated ({dead.length}) · {eliminatedOpen ? 'hide' : 'read their final chat'}</span>
          </button>
          {eliminatedOpen && (
            <div className="mt-3 flex flex-col gap-2 cv-stagger">
              {eliminatedThreads.length === 0
                ? <div className="text-center text-xs text-[var(--color-fg-faint)] py-3"><Loader /></div>
                : eliminatedThreads.map((row) => (
                    <EliminatedCard
                      key={row.couple.id}
                      row={row}
                      open={openEliminatedId === row.couple.id}
                      onToggle={() => setOpenEliminatedId(
                        openEliminatedId === row.couple.id ? null : row.couple.id,
                      )}
                    />
                  ))}
            </div>
          )}
        </div>
      )}

      {/* Ambient reaction rail (grid-wide) */}
      <AmbientReactionsRail onReact={(e) => handleReaction(e)} />

      {/* Drilled-in stage */}
      {drilled && (
        <DrilledStage
          view={drilled}
          myVote={myVote}
          onClose={handleCloseDrilled}
          onVote={() => onVote(drilled.couple.id)}
          onReaction={(emoji) => handleReaction(emoji, drilled.couple.id)}
        />
      )}

      {/* Spectator-only soundboard — drumroll on a couple reveal,
          applause when a fav couple climbs the vote count, etc. */}
      <SoundboardTray scope="pyaar-live" scopeId={show.id} className="bottom-6 right-4" />
    </div>
  )
}

function ShowHeaderBar({
  show, aliveCount, totalCount,
}: { show: ShowDto; aliveCount: number; totalCount: number }) {
  return (
    <Card padding="md" className="flex items-center gap-3 flex-wrap">
      <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-medium text-rose-300 bg-rose-500/15 px-2 h-5 rounded-full border border-rose-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
        LIVE
      </div>
      <div className="text-sm text-[var(--color-fg)]">
        Round {show.currentRound} <span className="text-[var(--color-fg-dim)]">· {show.currentRoundLabel}</span>
      </div>
      <div className="ml-auto flex items-center gap-3 text-xs text-[var(--color-fg-dim)]">
        <span className="inline-flex items-center gap-1">
          <Heart size={12} className="text-rose-400" /> {aliveCount}/{totalCount} couples
        </span>
        <span className="inline-flex items-center gap-1">
          <Eye size={12} /> {show.spectatorCount.toLocaleString()} watching
        </span>
        <span className="text-[10px] uppercase tracking-wider">hosted by {show.hostedBy}</span>
      </div>
    </Card>
  )
}

function CoupleTile({
  c, round, voted, onOpen, onVote, onReaction,
}: {
  c: SpectatorCoupleRow
  round: number
  voted: boolean
  onOpen: () => void
  onVote: () => void
  onReaction: (emoji: string) => void
}) {
  const tint = COUPLE_TINTS[c.coupleNumber] ?? '#8b5cf6'
  const tileStyle = { ['--tile-tint' as any]: tint } as React.CSSProperties
  return (
    <div
      className={`cv-pyaar-tile p-3 ${c.eliminated ? 'is-eliminated' : ''}`}
      style={tileStyle}
    >
      {/* Top row — codename, members, live indicators */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <button
          onClick={onOpen}
          className="text-left min-w-0 flex-1 cv-press"
          aria-label={`Open ${c.codename}`}
        >
          <div className="text-[10px] uppercase tracking-wider font-medium" style={{ color: tint }}>
            {c.codename}
          </div>
          <div className="text-sm font-medium text-[var(--color-fg)] truncate">
            {c.memberA} <span className="text-[var(--color-fg-faint)]">&</span> {c.memberB}
          </div>
        </button>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {c.videoActive && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-rose-300">
              <span className="cv-pyaar-video-dot" />
              live cam
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-[10px] text-[var(--color-fg-faint)] tabular-nums">
            <Eye size={10} /> {c.spectatorCount}
          </span>
        </div>
      </div>

      {/* Live messages preview */}
      <button
        onClick={onOpen}
        className="w-full text-left flex flex-col gap-1 mt-1 mb-2 min-h-[64px] cv-press"
      >
        {c.recent.length === 0 ? (
          <div className="text-[10px] text-[var(--color-fg-faint)] italic">Quiet for now…</div>
        ) : (
          c.recent.slice(-3).map((m) => (
            <div key={m.id} className="text-[11px]">
              <span className="text-[var(--color-fg-faint)] mr-1">{m.senderUsername}:</span>
              <span className="text-[var(--color-fg-dim)]">{m.content.length > 60 ? m.content.slice(0, 57) + '…' : m.content}</span>
            </div>
          ))
        )}
      </button>

      {/* Footer — vote count + vote CTA + drill-in */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--color-line)]">
        <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-fg-dim)] tabular-nums">
          <Vote size={11} /> {c.voteCount}
        </span>
        <div className="flex gap-1">
          {!c.eliminated && round >= 1 && (
            <Button size="sm" variant={voted ? 'primary' : 'secondary'} onClick={onVote}>
              {voted ? 'Voted' : 'Vote'}
            </Button>
          )}
          <button
            onClick={() => onReaction('🔥')}
            className="cv-press inline-flex items-center justify-center h-8 px-2 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line)] text-sm hover:border-[var(--color-line-strong)]"
            aria-label="React fire"
          >
            🔥
          </button>
        </div>
      </div>
    </div>
  )
}

function AmbientReactionsRail({ onReact }: { onReact: (emoji: string) => void }) {
  return (
    <div className="mt-5 inline-flex items-center gap-1.5 p-1.5 rounded-full cv-glass border border-[var(--color-line)]">
      <span className="text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)] px-2">react</span>
      {REACTION_SET.map((emoji) => (
        <button
          key={emoji}
          onClick={() => onReact(emoji)}
          className="cv-press w-9 h-9 inline-flex items-center justify-center rounded-full text-lg hover:bg-[var(--color-surface-2)] transition-colors"
          aria-label={`React ${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}

function ReactionsOverlay({ reactions }: { reactions: { id: string; emoji: string; coupleId: string | null; createdAt: number }[] }) {
  // Distribute floating emojis pseudo-randomly across the viewport.
  // Each reaction picks a left% from a stable hash of its id.
  return (
    <div className="pointer-events-none fixed inset-0 z-20 overflow-hidden">
      {reactions.map((r) => {
        const seed = r.id.charCodeAt(0) + r.id.charCodeAt(1 % r.id.length)
        const left = ((seed * 17) % 88) + 5
        const bottom = 60 + ((seed * 11) % 200)
        return (
          <div
            key={r.id}
            className="cv-pyaar-float"
            style={{ left: `${left}%`, bottom: `${bottom}px` }}
          >
            {r.emoji}
          </div>
        )
      })}
    </div>
  )
}

function DrilledStage({
  view, myVote, onClose, onVote, onReaction,
}: {
  view: DrilledCoupleView
  myVote: string | null
  onClose: () => void
  onVote: () => void
  onReaction: (emoji: string) => void
}) {
  const c = view.couple
  const tint = COUPLE_TINTS[c.coupleNumber] ?? '#8b5cf6'
  const stageStyle = { ['--tile-tint' as any]: tint } as React.CSSProperties
  const voted = myVote === c.id

  // Scroll to bottom on new message.
  const [scrollRef, setScrollRef] = useState<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!scrollRef) return
    scrollRef.scrollTop = scrollRef.scrollHeight
  }, [view.messages.length, scrollRef])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="cv-sheet-up w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[88vh] flex flex-col cv-pyaar-tile"
        style={stageStyle}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 p-3 border-b border-[var(--color-line)]">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider font-medium" style={{ color: tint }}>
              {c.codename}{c.eliminated && ' · ELIMINATED'}{c.finalRank && ` · #${c.finalRank}`}
            </div>
            <div className="text-sm font-medium text-[var(--color-fg)] truncate">
              {c.memberA} <span className="text-[var(--color-fg-faint)]">&</span> {c.memberB}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {c.videoActive ? (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-rose-300">
                <Video size={11} /> live
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)]">
                <VideoOff size={11} /> text
              </span>
            )}
            <button
              onClick={onClose}
              className="cv-press w-8 h-8 inline-flex items-center justify-center rounded-md text-[var(--color-fg-dim)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface-2)]"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Video placeholder OR audio waveform vibes */}
        {c.videoActive && (
          <div className="px-3 pt-3">
            <div className="aspect-video rounded-lg bg-gradient-to-br from-rose-900/30 via-black/70 to-violet-900/30 border border-[var(--color-line)] inline-flex items-center justify-center text-xs text-[var(--color-fg-dim)]">
              📹 Live cam (LiveKit stream lands in v2 — flag is wired)
            </div>
          </div>
        )}

        {/* Messages */}
        <div ref={setScrollRef} className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
          {view.messages.length === 0 && (
            <div className="text-xs text-[var(--color-fg-faint)] text-center py-8 italic">
              No conversation yet.
            </div>
          )}
          {view.messages.map((m) => <DrilledBubble key={m.id} m={m} tint={tint} />)}
        </div>

        {/* Footer — vote + reactions */}
        <div className="p-3 border-t border-[var(--color-line)] flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-1">
            {REACTION_SET.slice(0, 4).map((emoji) => (
              <button
                key={emoji}
                onClick={() => onReaction(emoji)}
                className="cv-press w-9 h-9 inline-flex items-center justify-center rounded-full text-lg hover:bg-[var(--color-surface-2)]"
                aria-label={`React ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
          {!c.eliminated && (
            <Button variant={voted ? 'primary' : 'secondary'} onClick={onVote} leftIcon={<Vote size={12} />}>
              {voted ? 'Voted' : 'Vote for this couple'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function DrilledBubble({ m, tint }: { m: PyaarMessage; tint: string }) {
  return (
    <div className="flex items-start gap-2">
      <div
        className="w-7 h-7 rounded-full inline-flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
        style={{ background: tint }}
      >
        {m.senderUsername.slice(0, 1).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)]">
          {m.senderUsername} <span className="ml-1">· R{m.roundNumber}</span>
        </div>
        <div className="text-sm text-[var(--color-fg)] mt-0.5 whitespace-pre-wrap break-words">{m.content}</div>
      </div>
    </div>
  )
}

function EliminatedCard({
  row, open, onToggle,
}: { row: EliminatedThreadRow; open: boolean; onToggle: () => void }) {
  const tint = COUPLE_TINTS[row.couple.coupleNumber] ?? '#71717a'
  return (
    <div className="cv-pyaar-tile is-eliminated p-3" style={{ ['--tile-tint' as any]: tint } as React.CSSProperties}>
      <button onClick={onToggle} className="w-full flex items-center justify-between gap-3 text-left">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider font-medium" style={{ color: tint }}>
            {row.couple.codename} · eliminated R{row.couple.eliminatedInRound ?? '—'}
          </div>
          <div className="text-sm text-[var(--color-fg)] truncate">{row.couple.memberA} & {row.couple.memberB}</div>
        </div>
        <span className="text-[10px] text-[var(--color-fg-faint)] tabular-nums">{row.messages.length} lines</span>
      </button>
      {open && (
        <div className="mt-3 pt-3 border-t border-[var(--color-line)] flex flex-col gap-1.5 max-h-[40vh] overflow-y-auto">
          {row.messages.length === 0 ? (
            <div className="text-[10px] text-[var(--color-fg-faint)] italic">They didn\'t say much.</div>
          ) : (
            row.messages.map((m) => (
              <div key={m.id} className="text-xs">
                <span className="text-[var(--color-fg-faint)] mr-2">{m.senderUsername}:</span>
                <span className="text-[var(--color-fg-dim)] italic">{m.content}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
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
