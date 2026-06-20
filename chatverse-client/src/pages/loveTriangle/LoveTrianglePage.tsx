import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users, BookOpen, Send, Share2, Eye, EyeOff, Trophy, Heart, Vote, Theater,
} from 'lucide-react'

import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Loader from '../../components/ui/Loader'
import { useToastStore } from '../../stores/toastStore'
import { useLoveTriangleStore } from '../../stores/loveTriangleStore'
import { useLoveTriangleHub } from '../../hooks/useLoveTriangleHub'
import type {
  MyTriangle, PublicTriangle, PairKey, PairMessage, PublicExcerpt,
} from '../../types/loveTriangle'

// ============================================================
//  /love-triangle — weekly 3-person drama
//
//  Two top-level views:
//    • Mine — your triangle (lobby/countdown/chat/voting/outcome)
//    • Audience — public triangles + excerpts + voting
//
//  Sub-state inside Mine is phase-driven.
// ============================================================

type TopTab = 'mine' | 'audience'
const MAX_MSG = 1000

export default function LoveTrianglePage() {
  const { showToast } = useToastStore()
  const {
    registration, myTriangle, publicTriangles, excerpts, history,
    setRegistration, setMyTriangle, setPublicTriangles, setExcerpts, setHistory,
    appendPairMessage, applyExcerptToggle,
  } = useLoveTriangleStore()
  const {
    isConnected,
    register, withdraw, getMyStatus,
    sendPairMessage, toggleShareExcerpt,
    getPublicTriangles, getTriangleExcerpts, vote,
    getMyHistory,
  } = useLoveTriangleHub()

  const [tab, setTab] = useState<TopTab>('mine')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [openExcerptsFor, setOpenExcerptsFor] = useState<string | null>(null)

  useEffect(() => {
    if (!isConnected) return
    setLoading(true)
    Promise.all([getMyStatus(), getMyHistory()])
      .then(([s, h]) => {
        setRegistration(s.registration)
        setMyTriangle(s.activeTriangle)
        setHistory(h.triangles)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected])

  useEffect(() => {
    if (!isConnected || tab !== 'audience') return
    setLoading(true)
    getPublicTriangles(0)
      .then((r) => setPublicTriangles(r.triangles))
      .catch(() => {})
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, isConnected])

  const handleRegister = async () => {
    if (busy) return
    setBusy(true)
    try {
      const r = await register()
      setRegistration(r)
      showToast({ type: 'success', title: '💕  Signed up', message: 'See you Sunday 10pm IST.', duration: 5000 })
    } catch (err: any) {
      showToast({ type: 'error', title: 'Register failed', message: err?.message ?? 'Try again.', duration: 4000 })
    } finally { setBusy(false) }
  }

  const handleWithdraw = async () => {
    if (busy) return
    setBusy(true)
    try { setRegistration(await withdraw()) }
    catch (err: any) {
      showToast({ type: 'error', title: 'Withdraw failed', message: err?.message ?? 'Try again.', duration: 4000 })
    } finally { setBusy(false) }
  }

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-6 sm:py-10">
      <div className="max-w-2xl mx-auto cv-fade-up">
        <Header />
        <TabStrip tab={tab} setTab={setTab} />

        <div className="mt-6 cv-tab-slide" key={tab}>
          {tab === 'mine' ? (
            loading && !myTriangle && !registration
              ? <div className="flex justify-center py-12"><Loader /></div>
              : <MineView
                  registration={registration}
                  myTriangle={myTriangle}
                  busy={busy}
                  onRegister={handleRegister}
                  onWithdraw={handleWithdraw}
                  sendPairMessage={async (pk, c) => {
                    const m = await sendPairMessage(pk, c)
                    appendPairMessage(pk, m)
                  }}
                  toggleShareExcerpt={async (pk, msgId) => {
                    const m = await toggleShareExcerpt(msgId)
                    applyExcerptToggle(pk, m.id, m.isShared, m.sharedByMe)
                  }}
                />
          ) : (
            <AudienceView
              triangles={publicTriangles}
              excerptsById={excerpts}
              openExcerptsFor={openExcerptsFor}
              onOpenExcerpts={async (id) => {
                setOpenExcerptsFor(openExcerptsFor === id ? null : id)
                if (openExcerptsFor !== id) {
                  const r = await getTriangleExcerpts(id)
                  setExcerpts(id, r.excerpts)
                }
              }}
              onVote={async (id, pairKey) => {
                try {
                  const updated = await vote(id, pairKey)
                  setPublicTriangles(publicTriangles.map((t) => t.id === id ? updated : t))
                  showToast({ type: 'success', title: '🗳  Vote in', message: `You picked ${pairKey.toUpperCase()}.`, duration: 4000 })
                } catch (err: any) {
                  showToast({ type: 'error', title: 'Vote failed', message: err?.message ?? 'Try again.', duration: 4000 })
                }
              }}
            />
          )}
        </div>

        {history.length > 0 && tab === 'mine' && (
          <div className="mt-10">
            <HistoryRail items={history} />
          </div>
        )}
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
          style={{ background: 'linear-gradient(135deg, var(--color-accent) 0%, #ec4899 100%)' }}
        >
          <Users size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold leading-tight cv-text-gradient">Love Triangle</h1>
          <p className="text-sm text-[var(--color-fg-dim)] mt-1">
            Three strangers, three pair-chats, one winning duo. Sundays at 10pm IST. The audience watches anonymous excerpts and votes.
          </p>
          <Link
            to="/about#love-triangle"
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

function TabStrip({ tab, setTab }: { tab: TopTab; setTab: (t: TopTab) => void }) {
  const items: { key: TopTab; label: string; icon: typeof Users }[] = [
    { key: 'mine',     label: 'My triangle', icon: Heart },
    { key: 'audience', label: 'Audience',    icon: Theater },
  ]
  return (
    <div role="tablist" className="grid grid-cols-2 gap-1 p-1 bg-[var(--color-surface-2)] rounded-lg border border-[var(--color-line)]">
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

// ─── Mine view ──────────────────────────────────────────────

type MineProps = {
  registration: ReturnType<typeof useLoveTriangleStore.getState>['registration']
  myTriangle:   MyTriangle | null
  busy:         boolean
  onRegister:   () => void
  onWithdraw:   () => void
  sendPairMessage: (pk: PairKey, content: string) => Promise<void>
  toggleShareExcerpt: (pk: PairKey, msgId: string) => Promise<void>
}

function MineView(p: MineProps) {
  if (!p.myTriangle) {
    return <LobbyView {...p} />
  }
  const t = p.myTriangle
  if (t.status === 'completed') return <OutcomeView triangle={t} />
  if (t.status === 'voting') return <VotingPhaseView triangle={t} />
  return <ChatPhaseView triangle={t} send={p.sendPairMessage} toggleShare={p.toggleShareExcerpt} />
}

function LobbyView({ registration, busy, onRegister, onWithdraw }: MineProps) {
  const inQueue = registration?.status === 'pending' || registration?.status === 'matched'
  return (
    <Card padding="lg" className="flex flex-col items-center gap-3 text-center">
      <div className="w-12 h-12 rounded-2xl bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)] inline-flex items-center justify-center cv-halo">
        <Users size={22} />
      </div>
      <h2 className="text-lg font-semibold">
        {inQueue ? 'You\'re on the list' : 'Up for some drama this Sunday?'}
      </h2>
      <p className="text-sm text-[var(--color-fg-dim)] max-w-sm">
        Sunday 10pm IST you\'ll be paired with two strangers. The three of you DM in pairs over 7 days. The audience watches snippets and picks the winning pair.
      </p>
      {registration?.nextEventAt && <NextEventLine iso={registration.nextEventAt} />}
      {inQueue ? (
        <Button variant="secondary" loading={busy} onClick={onWithdraw} size="sm">Withdraw</Button>
      ) : (
        <Button variant="primary" loading={busy} onClick={onRegister} leftIcon={<Heart size={16} />}>
          I\'m in
        </Button>
      )}
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
      Formation in <span className="text-[var(--color-fg)] font-medium">{txt}</span>
    </div>
  )
}

// ─── Chat phase ─────────────────────────────────────────────

function ChatPhaseView({
  triangle, send, toggleShare,
}: {
  triangle: MyTriangle
  send: (pk: PairKey, content: string) => Promise<void>
  toggleShare: (pk: PairKey, msgId: string) => Promise<void>
}) {
  const [activePair, setActivePair] = useState<PairKey>(triangle.myPairs[0])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const thread = triangle.threads[activePair] ?? { count: 0, messages: [] }
  const otherMember = otherMemberOf(triangle, activePair)

  const handleSend = async () => {
    const content = draft.trim()
    if (!content || sending) return
    if (content.length > MAX_MSG) return
    setSending(true)
    try { await send(activePair, content); setDraft('') }
    finally { setSending(false) }
  }

  return (
    <Card padding="md" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-fg-faint)]">
            Your triangle · you\'re Member {triangle.myRole}
          </div>
          <div className="text-sm text-[var(--color-fg)] mt-0.5">
            with <span className="font-medium">{triangle.members.a.username}</span>, <span className="font-medium">{triangle.members.b.username}</span>, <span className="font-medium">{triangle.members.c.username}</span>
          </div>
        </div>
        <PhaseCountdown iso={triangle.chatEndsAt} label="Chat ends in" />
      </div>

      {/* Pair switcher — only my own pairs (the third side is opaque) */}
      <div className="grid grid-cols-2 gap-1 p-1 bg-[var(--color-surface-2)] rounded-md border border-[var(--color-line)]">
        {triangle.myPairs.map((pk) => {
          const active = activePair === pk
          const other = otherMemberOf(triangle, pk)
          return (
            <button
              key={pk}
              onClick={() => setActivePair(pk)}
              className={`cv-press h-9 rounded text-sm font-medium transition-colors
                ${active
                  ? 'bg-[var(--color-surface-1)] text-[var(--color-fg)] shadow-sm'
                  : 'text-[var(--color-fg-dim)] hover:text-[var(--color-fg)]'}`}
            >
              ↔ {other.username}
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-2 max-h-[55vh] overflow-y-auto">
        {thread.messages.length === 0 && (
          <div className="text-xs text-[var(--color-fg-faint)] text-center py-6">
            No messages with {otherMember.username} yet. Open with a question.
          </div>
        )}
        {thread.messages.map((m) => (
          <PairBubble
            key={m.id} m={m}
            onToggleShare={() => toggleShare(activePair, m.id)}
          />
        ))}
      </div>

      <div className="pt-2 border-t border-[var(--color-line)] flex gap-2 items-end">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder={`Message ${otherMember.username}…`}
          maxLength={MAX_MSG + 64}
          className="flex-1 resize-none rounded-md bg-[var(--color-surface-2)] text-[var(--color-fg)]
            text-sm leading-relaxed p-2 border border-[var(--color-line)]
            focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)]"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
        />
        <Button variant="primary" size="sm" loading={sending} disabled={!draft.trim()} onClick={handleSend} leftIcon={<Send size={12} />}>
          Send
        </Button>
      </div>
    </Card>
  )
}

function PairBubble({
  m, onToggleShare,
}: { m: PairMessage; onToggleShare: () => void }) {
  return (
    <div className={`flex gap-1.5 ${m.mine ? 'justify-end' : 'justify-start'} items-end`}>
      <div className={`flex flex-col ${m.mine ? 'items-end' : 'items-start'} max-w-[80%]`}>
        <div
          className={`px-3 py-2 rounded-2xl text-sm leading-relaxed break-words whitespace-pre-wrap
            ${m.mine
              ? 'bg-[var(--color-accent)] text-white rounded-br-sm'
              : 'bg-[var(--color-surface-2)] text-[var(--color-fg)] rounded-bl-sm border border-[var(--color-line)]'}`}
        >
          {m.content}
        </div>
        <button
          onClick={onToggleShare}
          className="text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)] hover:text-[var(--color-accent-fg)] mt-0.5 inline-flex items-center gap-1 cv-press"
          title={m.isShared ? (m.sharedByMe ? 'Unshare from public feed' : 'Already shared') : 'Share to public feed as anonymous excerpt'}
        >
          {m.isShared
            ? <><Eye size={10} /> shared</>
            : <><EyeOff size={10} /> share</>}
        </button>
      </div>
    </div>
  )
}

// ─── Voting phase (member view) ─────────────────────────────

function VotingPhaseView({ triangle }: { triangle: MyTriangle }) {
  return (
    <Card padding="lg" className="flex flex-col items-center gap-3 text-center cv-pop">
      <div className="w-12 h-12 rounded-2xl bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)] inline-flex items-center justify-center cv-halo">
        <Vote size={22} />
      </div>
      <h2 className="text-lg font-semibold">Voting is live</h2>
      <p className="text-sm text-[var(--color-fg-dim)] max-w-md">
        Chat phase wrapped. The audience now has 24 hours to pick the winning pair. You can\'t vote on your own triangle — sit back and watch.
      </p>
      <PhaseCountdown iso={triangle.votingEndsAt} label="Voting closes in" />
      <VoteBars counts={triangle.voteCounts} />
    </Card>
  )
}

function VoteBars({ counts, myVote }: { counts: Record<PairKey, number>; myVote?: PairKey | null }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  return (
    <div className="w-full max-w-sm flex flex-col gap-2 mt-2">
      {(Object.keys(counts) as PairKey[]).map((pk) => {
        const c = counts[pk] ?? 0
        const pct = total === 0 ? 0 : Math.round((c / total) * 100)
        const mine = myVote === pk
        return (
          <div key={pk}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className={`uppercase tracking-wider font-medium ${mine ? 'text-[var(--color-accent-fg)]' : 'text-[var(--color-fg-dim)]'}`}>
                {pk}{mine && ' · your pick'}
              </span>
              <span className="tabular-nums text-[var(--color-fg-faint)]">{c} · {pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
              <div
                className={`h-full transition-[width] duration-500 ${mine ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-fg-mute)]'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Outcome view (member) ─────────────────────────────────

function OutcomeView({ triangle }: { triangle: MyTriangle }) {
  const wp = triangle.winningPair
  const label = wp === 'tie' ? 'A tie'
    : wp === 'no_votes' ? 'No one voted'
    : wp ? `Pair ${wp.toUpperCase()}` : '—'
  return (
    <Card aurora padding="lg" className="flex flex-col items-center gap-3 text-center cv-pop">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[var(--color-accent)] to-[#ec4899] text-white inline-flex items-center justify-center cv-halo">
        <Trophy size={26} />
      </div>
      <h2 className="text-xl font-semibold cv-text-gradient">Triangle wrapped</h2>
      <p className="text-sm text-[var(--color-fg-dim)] max-w-md">Winning pair: <span className="text-[var(--color-fg)] font-medium">{label}</span></p>
      <VoteBars counts={triangle.voteCounts} />
    </Card>
  )
}

// ─── Audience view ──────────────────────────────────────────

function AudienceView({
  triangles, excerptsById, openExcerptsFor, onOpenExcerpts, onVote,
}: {
  triangles: PublicTriangle[]
  excerptsById: Record<string, PublicExcerpt[]>
  openExcerptsFor: string | null
  onOpenExcerpts: (id: string) => void
  onVote: (id: string, pk: PairKey) => void
}) {
  if (triangles.length === 0) {
    return (
      <div className="text-center py-14">
        <Theater size={28} className="mx-auto text-[var(--color-fg-faint)] mb-3" />
        <div className="text-sm text-[var(--color-fg-dim)]">No active triangles right now.</div>
        <div className="text-xs text-[var(--color-fg-faint)] mt-1">Pairings happen Sunday 10pm IST.</div>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-3 cv-stagger">
      {triangles.map((t) => (
        <AudienceCard
          key={t.id}
          t={t}
          excerpts={excerptsById[t.id]}
          isOpen={openExcerptsFor === t.id}
          onOpen={() => onOpenExcerpts(t.id)}
          onVote={(pk) => onVote(t.id, pk)}
        />
      ))}
    </div>
  )
}

function AudienceCard({
  t, excerpts, isOpen, onOpen, onVote,
}: {
  t: PublicTriangle
  excerpts?: PublicExcerpt[]
  isOpen: boolean
  onOpen: () => void
  onVote: (pk: PairKey) => void
}) {
  return (
    <Card padding="md" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-fg-faint)]">
            Triangle · {t.weekStart}
          </div>
          <div className="text-sm text-[var(--color-fg)] mt-0.5 flex gap-2">
            <span>{t.members.a}</span>·<span>{t.members.b}</span>·<span>{t.members.c}</span>
          </div>
        </div>
        <StatusChip status={t.status} />
      </div>

      <VoteBars counts={t.voteCounts} myVote={t.myVote} />

      {t.status === 'voting' && !t.isMember && (
        <div className="flex gap-2 justify-center flex-wrap">
          {(['a-b','b-c','a-c'] as PairKey[]).map((pk) => (
            <Button
              key={pk}
              size="sm"
              variant={t.myVote === pk ? 'primary' : 'secondary'}
              onClick={() => onVote(pk)}
              leftIcon={<Vote size={13} />}
            >
              {pk.toUpperCase()}
            </Button>
          ))}
        </div>
      )}

      <Button variant="ghost" size="sm" onClick={onOpen} leftIcon={<Share2 size={13} />}>
        {isOpen ? 'Hide excerpts' : 'Read excerpts'}
      </Button>

      {isOpen && (
        <div className="flex flex-col gap-2 pt-2 border-t border-[var(--color-line)]">
          {!excerpts ? (
            <div className="flex justify-center py-3"><Loader /></div>
          ) : excerpts.length === 0 ? (
            <div className="text-xs text-[var(--color-fg-faint)] text-center py-2">
              No excerpts shared yet.
            </div>
          ) : excerpts.map((e) => (
            <div key={e.id} className="text-sm">
              <span className="text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)] mr-2">
                Member {e.senderRole} · {e.pairKey.toUpperCase()}
              </span>
              <span className="text-[var(--color-fg)] italic">&ldquo;{e.content}&rdquo;</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function StatusChip({ status }: { status: PublicTriangle['status'] }) {
  const map = {
    active:    { label: 'chat phase', color: 'bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)]' },
    voting:    { label: 'voting',     color: 'bg-amber-500/15 text-amber-300/85 border border-amber-500/30' },
    completed: { label: 'wrapped',    color: 'bg-[var(--color-surface-2)] text-[var(--color-fg-dim)] border border-[var(--color-line)]' },
  }
  const s = map[status]
  return (
    <span className={`text-[10px] uppercase tracking-wider px-1.5 h-4 inline-flex items-center rounded font-medium ${s.color}`}>
      {s.label}
    </span>
  )
}

// ─── History ────────────────────────────────────────────────

function HistoryRail({ items }: { items: ReturnType<typeof useLoveTriangleStore.getState>['history'] }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider font-medium text-[var(--color-fg-faint)] mb-2">
        Your past triangles
      </div>
      <div className="flex flex-col gap-2">
        {items.map((h) => (
          <Card key={h.id} padding="sm" className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm text-[var(--color-fg)]">
                {h.weekStart} · Member {h.myRole}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)]">
                {h.status}{h.winningPair && ` · won by ${h.winningPair === 'tie' ? 'tie' : h.winningPair === 'no_votes' ? 'nobody' : h.winningPair.toUpperCase()}`}
              </div>
            </div>
            {h.status === 'completed' && <Trophy size={14} className="text-[var(--color-fg-faint)]" />}
          </Card>
        ))}
      </div>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────

function PhaseCountdown({ iso, label }: { iso: string; label: string }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  const ms = new Date(iso).getTime() - now
  return (
    <span className="text-[11px] font-mono tabular-nums text-[var(--color-accent-fg)] bg-[var(--color-accent-soft)] px-2 py-0.5 rounded-full whitespace-nowrap">
      {label} {prettyDuration(ms)}
    </span>
  )
}

function otherMemberOf(t: MyTriangle, pk: PairKey): { username: string } {
  const meRole = t.myRole.toLowerCase()
  const other = pk.split('-').find((r) => r !== meRole) as 'a' | 'b' | 'c' | undefined
  if (!other) return { username: '???' }
  return t.members[other]
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
