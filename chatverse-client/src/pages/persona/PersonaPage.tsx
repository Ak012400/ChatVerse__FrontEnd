import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Sparkles, Send, X, BookOpen, Compass, Flame, Eye,
} from 'lucide-react'

import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Loader from '../../components/ui/Loader'
import { useToastStore } from '../../stores/toastStore'
import { usePersonaStore } from '../../stores/personaStore'
import { usePersonaHub } from '../../hooks/usePersonaHub'
import type { PersonaCard, StreakRow } from '../../types/persona'

// ============================================================
//  /persona — Persona Roulette MVP
//
//  Three tabs:
//    • Today  — your persona card (name, avatar, bio, mood)
//    • Streaks — every pair you've consecutively conversed with
//    • Discover — 10 random today-personas to start a fresh thread
//
//  Tapping a streak or discover tile opens a thread sheet that
//  slides over the page. Mobile-first single column; sm+ keeps
//  the same width but breathes a bit more.
// ============================================================

type Tab = 'today' | 'streaks' | 'discover'
const MAX_MSG = 1000

function avatarUrl(seed: string, size = 64) {
  // Dicebear's open API — no key, generous CDN cache. We use the
  // "shapes" style — minimal geometric, lightweight, themed-able.
  return `https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(seed)}&size=${size}`
}

const moodAccent: Record<string, string> = {
  playful:     'from-pink-400 to-rose-400',
  wistful:     'from-indigo-400 to-blue-400',
  curious:     'from-amber-400 to-orange-400',
  restless:    'from-red-400 to-rose-500',
  candid:      'from-emerald-400 to-teal-400',
  dreamy:      'from-violet-400 to-fuchsia-400',
  wry:         'from-yellow-400 to-amber-500',
  tender:      'from-pink-300 to-rose-300',
  mischievous: 'from-orange-400 to-amber-500',
  earnest:     'from-cyan-400 to-sky-400',
}

export default function PersonaPage() {
  const { showToast } = useToastStore()
  const {
    myPersona, streaks, discover,
    myPersonaLoaded, streaksLoaded, discoverLoaded,
    setMyPersona, setStreaks, setDiscover,
  } = usePersonaStore()
  const {
    isConnected,
    getMyPersona, getActiveStreaks, discoverPersonas,
  } = usePersonaHub()

  const [tab, setTab] = useState<Tab>('today')
  const [openPersonaId, setOpenPersonaId] = useState<string | null>(null)
  const [loadingTab, setLoadingTab] = useState(false)

  // Lazy-fetch each tab on first open. After that the store +
  // server-push events keep it fresh.
  useEffect(() => {
    if (!isConnected) return
    if (tab === 'today' && !myPersonaLoaded) {
      setLoadingTab(true)
      getMyPersona()
        .then(setMyPersona)
        .catch(() => showToast({
          type: 'error', title: 'Couldn\'t load today\'s persona',
          message: 'Try refreshing in a moment.', duration: 4000,
        }))
        .finally(() => setLoadingTab(false))
    }
    if (tab === 'streaks' && !streaksLoaded) {
      setLoadingTab(true)
      getActiveStreaks()
        .then((r) => setStreaks(r.streaks))
        .catch(() => {})
        .finally(() => setLoadingTab(false))
    }
    if (tab === 'discover' && !discoverLoaded) {
      setLoadingTab(true)
      discoverPersonas()
        .then((r) => setDiscover(r.personas))
        .catch(() => {})
        .finally(() => setLoadingTab(false))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, isConnected])

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-6 sm:py-10">
      <div className="max-w-2xl mx-auto">
        <Header />
        <Tabs tab={tab} setTab={setTab} streakCount={streaks.length} />

        <div className="mt-6">
          {tab === 'today' && <TodayTab loading={loadingTab} persona={myPersona} />}
          {tab === 'streaks' && (
            <StreaksTab
              loading={loadingTab}
              streaks={streaks}
              onOpen={(id) => id && setOpenPersonaId(id)}
            />
          )}
          {tab === 'discover' && (
            <DiscoverTab
              loading={loadingTab}
              personas={discover}
              onOpen={(id) => setOpenPersonaId(id)}
            />
          )}
        </div>
      </div>

      {/* Thread sheet — slides up on mobile, modal on sm+ */}
      {openPersonaId && (
        <ThreadSheet
          otherPersonaId={openPersonaId}
          onClose={() => setOpenPersonaId(null)}
        />
      )}
    </div>
  )
}

// ─── Header ─────────────────────────────────────────────────

function Header() {
  return (
    <div className="flex items-start gap-3 mb-6">
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-white"
        style={{ background: 'linear-gradient(135deg, var(--color-accent) 0%, #8b5cf6 100%)' }}
        aria-hidden="true"
      >
        <Sparkles size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <h1 className="text-xl sm:text-2xl font-semibold leading-tight">Persona Roulette</h1>
        <p className="text-sm text-[var(--color-fg-dim)] mt-1">
          Today you\'re someone new. Talk to strangers — or to the same person, day after day, both of you blind to the other\'s real name.
        </p>
        <Link
          to="/about#persona-roulette"
          className="inline-flex items-center gap-1.5 mt-2 text-xs text-[var(--color-accent-fg)] hover:text-[var(--color-accent)] transition-colors"
        >
          <BookOpen size={12} />
          <span>Read the full rules</span>
        </Link>
      </div>
    </div>
  )
}

// ─── Tabs ───────────────────────────────────────────────────

function Tabs({
  tab, setTab, streakCount,
}: { tab: Tab; setTab: (t: Tab) => void; streakCount: number }) {
  const items: { key: Tab; label: string; icon: typeof Sparkles; badge?: number }[] = [
    { key: 'today',    label: 'Today',    icon: Sparkles },
    { key: 'streaks',  label: 'Streaks',  icon: Flame, badge: streakCount },
    { key: 'discover', label: 'Discover', icon: Compass },
  ]
  return (
    <div
      role="tablist"
      className="grid grid-cols-3 gap-1 p-1 bg-[var(--color-surface-2)] rounded-lg border border-[var(--color-line)]"
    >
      {items.map((it) => {
        const Icon = it.icon
        const active = tab === it.key
        return (
          <button
            key={it.key}
            role="tab"
            aria-selected={active}
            onClick={() => setTab(it.key)}
            className={`relative h-9 inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors
              ${active
                ? 'bg-[var(--color-surface-1)] text-[var(--color-fg)] shadow-sm'
                : 'text-[var(--color-fg-dim)] hover:text-[var(--color-fg)]'}`}
          >
            <Icon size={15} />
            <span>{it.label}</span>
            {it.badge && it.badge > 0 ? (
              <span className="ml-1 px-1.5 h-4 rounded-full bg-[var(--color-accent-soft)] text-[10px] font-semibold text-[var(--color-accent-fg)] inline-flex items-center">
                {it.badge}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

// ─── Today tab ──────────────────────────────────────────────

function TodayTab({ loading, persona }: { loading: boolean; persona: PersonaCard | null }) {
  if (loading || !persona) {
    return (
      <div className="flex flex-col items-center py-14"><Loader /></div>
    )
  }
  const accent = moodAccent[persona.mood] ?? 'from-indigo-400 to-violet-500'
  return (
    <Card padding="lg" className="flex flex-col items-center text-center">
      <div className={`p-1 rounded-full bg-gradient-to-br ${accent}`}>
        <img
          src={avatarUrl(persona.avatarSeed, 128)}
          alt={persona.displayName}
          width={96} height={96}
          className="w-24 h-24 rounded-full bg-[var(--color-surface-1)]"
        />
      </div>
      <h2 className="mt-4 text-xl font-semibold">{persona.displayName}</h2>
      <div className="text-[11px] uppercase tracking-wider text-[var(--color-fg-faint)] mt-0.5">
        feeling {persona.mood}
      </div>
      <p className="mt-3 text-sm text-[var(--color-fg-dim)] max-w-md leading-relaxed">
        {persona.bio}
      </p>
      <p className="mt-4 text-[11px] text-[var(--color-fg-faint)]">
        This persona expires at 00:00 UTC. Tomorrow you\'ll be someone else entirely.
      </p>
    </Card>
  )
}

// ─── Streaks tab ────────────────────────────────────────────

function StreaksTab({
  loading, streaks, onOpen,
}: {
  loading: boolean
  streaks: StreakRow[]
  onOpen: (otherPersonaId: string | null) => void
}) {
  if (loading && streaks.length === 0) {
    return <div className="flex flex-col items-center py-10"><Loader /></div>
  }
  if (streaks.length === 0) {
    return (
      <div className="text-center py-14">
        <Flame size={28} className="mx-auto text-[var(--color-fg-faint)] mb-3" />
        <div className="text-sm text-[var(--color-fg-dim)]">No streaks yet.</div>
        <div className="text-xs text-[var(--color-fg-faint)] mt-1 max-w-sm mx-auto">
          Head to Discover and start a conversation — keep meeting the same person across days to build a streak.
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      {streaks.map((s) => <StreakRowCard key={s.streakId} s={s} onOpen={onOpen} />)}
    </div>
  )
}

function StreakRowCard({
  s, onOpen,
}: { s: StreakRow; onOpen: (otherPersonaId: string | null) => void }) {
  const accent = s.otherMood ? (moodAccent[s.otherMood] ?? 'from-indigo-400 to-violet-500') : 'from-zinc-500 to-zinc-600'
  return (
    <Card padding="md" hover className="flex items-center gap-3">
      <div className={`p-0.5 rounded-full bg-gradient-to-br ${accent} shrink-0`}>
        {s.otherAvatarSeed ? (
          <img
            src={avatarUrl(s.otherAvatarSeed, 56)}
            alt={s.otherDisplay}
            width={44} height={44}
            className="w-11 h-11 rounded-full bg-[var(--color-surface-1)]"
          />
        ) : (
          <div className="w-11 h-11 rounded-full bg-[var(--color-surface-2)] inline-flex items-center justify-center text-[var(--color-fg-faint)]">
            <Sparkles size={16} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-[var(--color-fg)] truncate">
            {s.otherDisplay}
          </span>
          {s.unmasked && (
            <span className="text-[10px] uppercase tracking-wider px-1.5 h-4 inline-flex items-center rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              unmasked
            </span>
          )}
          {s.vaulted && (
            <span className="text-[10px] uppercase tracking-wider px-1.5 h-4 inline-flex items-center rounded bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)]">
              vault
            </span>
          )}
        </div>
        <div className="text-xs text-[var(--color-fg-dim)] mt-0.5 flex items-center gap-1.5">
          <Flame size={12} />
          <span>{s.consecutiveDays}-day streak</span>
          {s.hasMarker && !s.unmasked && (
            <span className="text-[var(--color-fg-faint)]">· you\'ve crossed paths before</span>
          )}
        </div>
      </div>
      <Button
        variant="secondary"
        size="sm"
        disabled={!s.otherPersonaId}
        onClick={() => onOpen(s.otherPersonaId)}
      >
        {s.otherPersonaId ? 'Open' : 'Drifted'}
      </Button>
    </Card>
  )
}

// ─── Discover tab ───────────────────────────────────────────

function DiscoverTab({
  loading, personas, onOpen,
}: {
  loading: boolean
  personas: PersonaCard[]
  onOpen: (otherPersonaId: string) => void
}) {
  if (loading && personas.length === 0) {
    return <div className="flex flex-col items-center py-10"><Loader /></div>
  }
  if (personas.length === 0) {
    return (
      <div className="text-center py-14">
        <Compass size={28} className="mx-auto text-[var(--color-fg-faint)] mb-3" />
        <div className="text-sm text-[var(--color-fg-dim)]">No personas to discover yet.</div>
        <div className="text-xs text-[var(--color-fg-faint)] mt-1">
          Check back after midnight UTC — the persona pool refreshes daily.
        </div>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {personas.map((p) => <DiscoverTile key={p.id} p={p} onOpen={onOpen} />)}
    </div>
  )
}

function DiscoverTile({
  p, onOpen,
}: { p: PersonaCard; onOpen: (otherPersonaId: string) => void }) {
  const accent = moodAccent[p.mood] ?? 'from-indigo-400 to-violet-500'
  return (
    <Card padding="md" hover className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <div className={`p-0.5 rounded-full bg-gradient-to-br ${accent}`}>
          <img
            src={avatarUrl(p.avatarSeed, 56)}
            alt={p.displayName}
            width={44} height={44}
            className="w-11 h-11 rounded-full bg-[var(--color-surface-1)]"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-[var(--color-fg)] truncate">{p.displayName}</div>
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-fg-faint)]">
            {p.mood}
          </div>
        </div>
      </div>
      <p className="text-xs text-[var(--color-fg-dim)] leading-relaxed">{p.bio}</p>
      <Button
        size="sm"
        variant="primary"
        leftIcon={<Send size={12} />}
        onClick={() => onOpen(p.id)}
        className="mt-1"
      >
        Say hi
      </Button>
    </Card>
  )
}

// ─── Thread sheet (modal-ish) ───────────────────────────────

function ThreadSheet({
  otherPersonaId, onClose,
}: { otherPersonaId: string; onClose: () => void }) {
  const { showToast } = useToastStore()
  const {
    threads, loadingThread, setThread, appendToThread, setLoadingThread,
  } = usePersonaStore()
  const { getThreadWithPersona, sendPersonaMessage } = usePersonaHub()

  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const messages = threads[otherPersonaId] ?? []
  const loading = loadingThread[otherPersonaId] ?? false

  // Fetch on open.
  useEffect(() => {
    if (threads[otherPersonaId]) return
    setLoadingThread(otherPersonaId, true)
    getThreadWithPersona(otherPersonaId)
      .then((r) => setThread(otherPersonaId, r.messages))
      .catch((err: any) => showToast({
        type: 'error', title: 'Thread unavailable',
        message: err?.message ?? 'Try again in a moment.', duration: 3500,
      }))
      .finally(() => setLoadingThread(otherPersonaId, false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherPersonaId])

  const handleSend = async () => {
    const content = draft.trim()
    if (!content || sending) return
    if (content.length > MAX_MSG) {
      showToast({ type: 'warning', title: 'Too long', message: `Trim under ${MAX_MSG} chars.`, duration: 3000 })
      return
    }
    setSending(true)
    try {
      const sent = await sendPersonaMessage(otherPersonaId, content)
      appendToThread(otherPersonaId, sent)
      setDraft('')
    } catch (err: any) {
      showToast({
        type: 'error', title: 'Couldn\'t send',
        message: err?.message ?? 'Try again.', duration: 4000,
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm
        flex items-end sm:items-center justify-center p-0 sm:p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[90vh] sm:max-h-[80vh] flex flex-col
          bg-[var(--color-surface-1)] sm:rounded-xl border-t sm:border border-[var(--color-line)]"
      >
        <div className="flex items-center justify-between gap-3 p-3 border-b border-[var(--color-line)]">
          <div className="text-sm font-medium text-[var(--color-fg)]">Persona thread</div>
          <button
            onClick={onClose}
            className="w-8 h-8 inline-flex items-center justify-center rounded-md text-[var(--color-fg-dim)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface-2)]"
            aria-label="Close thread"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
          {loading && messages.length === 0 && (
            <div className="flex justify-center py-6"><Loader /></div>
          )}
          {!loading && messages.length === 0 && (
            <div className="text-center text-xs text-[var(--color-fg-faint)] py-8">
              No messages yet — say something first.
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} m={m} />
          ))}
        </div>

        <div className="p-3 border-t border-[var(--color-line)] flex gap-2 items-end">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder="Write something honest…"
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
          <Button
            variant="primary"
            size="sm"
            loading={sending}
            disabled={!draft.trim()}
            onClick={handleSend}
            leftIcon={<Send size={12} />}
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ m }: { m: { id: string; senderPersonaId: string; senderDisplayName: string; senderAvatarSeed: string; content: string; createdAt: string } }) {
  // We can't perfectly tell "mine" from "theirs" without comparing
  // to my today's persona id. The store knows myPersona — pull it.
  const myPersonaId = usePersonaStore((s) => s.myPersona?.id)
  const mine = myPersonaId && m.senderPersonaId === myPersonaId
  return (
    <div className={`flex gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
      {!mine && (
        <img
          src={avatarUrl(m.senderAvatarSeed, 28)}
          alt=""
          width={24} height={24}
          className="w-6 h-6 rounded-full bg-[var(--color-surface-2)] mt-1 shrink-0"
        />
      )}
      <div
        className={`max-w-[78%] px-3 py-2 rounded-2xl text-sm leading-relaxed break-words whitespace-pre-wrap
          ${mine
            ? 'bg-[var(--color-accent)] text-white rounded-br-sm'
            : 'bg-[var(--color-surface-2)] text-[var(--color-fg)] rounded-bl-sm border border-[var(--color-line)]'}`}
      >
        {!mine && (
          <div className="text-[10px] uppercase tracking-wider opacity-70 mb-0.5">
            {m.senderDisplayName}
          </div>
        )}
        {m.content}
      </div>
    </div>
  )
}

// keep import used
void Eye
