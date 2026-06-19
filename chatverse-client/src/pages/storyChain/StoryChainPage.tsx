import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Feather, BookOpen, Send, Users, ChevronRight, Lock, Library,
} from 'lucide-react'

import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Loader from '../../components/ui/Loader'
import { useToastStore } from '../../stores/toastStore'
import { useStoryChainStore } from '../../stores/storyChainStore'
import { useStoryChainHub } from '../../hooks/useStoryChainHub'
import type { ArchivedChain, ChainState, StoryContribution } from '../../types/storyChain'

// ============================================================
//  /story-chain — daily collaborative writing
//
//  Two tabs:
//    • Today — prompt + scrolling stream of contributions, with
//              join-queue and add-sentence affordances.
//    • Archive — recent published stories.
//
//  Mobile-first single column.
// ============================================================

type Tab = 'today' | 'archive'
const MAX_SENTENCE = 280

export default function StoryChainPage() {
  const { showToast } = useToastStore()
  const {
    current, archive, myTurnExpiresAt,
    currentLoaded, archiveLoaded,
    setCurrent, setArchive,
  } = useStoryChainStore()
  const {
    isConnected,
    getCurrentChain, joinQueue, leaveQueue, addSentence, getArchive,
  } = useStoryChainHub()

  const [tab, setTab] = useState<Tab>('today')
  const [loadingTab, setLoadingTab] = useState(false)
  const [queueBusy, setQueueBusy] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  // Lazy-fetch each tab on first open. After that, server-push events
  // keep `current` fresh and `archive` is rarely needed mid-day.
  useEffect(() => {
    if (!isConnected) return
    if (tab === 'today' && !currentLoaded) {
      setLoadingTab(true)
      getCurrentChain()
        .then(setCurrent)
        .catch(() => showToast({
          type: 'error', title: 'Couldn\'t load today\'s story',
          message: 'Refresh in a moment.', duration: 4000,
        }))
        .finally(() => setLoadingTab(false))
    }
    if (tab === 'archive' && !archiveLoaded) {
      setLoadingTab(true)
      getArchive()
        .then((r) => setArchive(r.chains))
        .catch(() => {})
        .finally(() => setLoadingTab(false))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, isConnected])

  const handleJoin = async () => {
    if (queueBusy) return
    setQueueBusy(true)
    try { setCurrent(await joinQueue()) }
    catch (err: any) {
      showToast({
        type: 'error', title: 'Couldn\'t join the queue',
        message: err?.message ?? 'Try again.', duration: 4000,
      })
    }
    finally { setQueueBusy(false) }
  }

  const handleLeave = async () => {
    if (queueBusy) return
    setQueueBusy(true)
    try { setCurrent(await leaveQueue()) }
    catch (err: any) {
      showToast({
        type: 'error', title: 'Couldn\'t leave queue',
        message: err?.message ?? 'Try again.', duration: 4000,
      })
    }
    finally { setQueueBusy(false) }
  }

  const handleSend = async () => {
    const text = draft.trim()
    if (!text || sending) return
    if (text.length > MAX_SENTENCE) {
      showToast({
        type: 'warning', title: 'Too long',
        message: `Trim under ${MAX_SENTENCE} characters.`, duration: 3000,
      })
      return
    }
    setSending(true)
    try {
      setCurrent(await addSentence(text))
      setDraft('')
    } catch (err: any) {
      showToast({
        type: 'error', title: 'Couldn\'t add your sentence',
        message: err?.message ?? 'Try again.', duration: 4000,
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-6 sm:py-10">
      <div className="max-w-2xl mx-auto">
        <Header />
        <Tabs tab={tab} setTab={setTab} />

        <div className="mt-6">
          {tab === 'today' && (
            <TodayTab
              loading={loadingTab}
              current={current}
              myTurnExpiresAt={myTurnExpiresAt}
              queueBusy={queueBusy}
              draft={draft}
              setDraft={setDraft}
              sending={sending}
              onJoin={handleJoin}
              onLeave={handleLeave}
              onSend={handleSend}
            />
          )}
          {tab === 'archive' && (
            <ArchiveTab loading={loadingTab} chains={archive} />
          )}
        </div>
      </div>
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
        <Feather size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <h1 className="text-xl sm:text-2xl font-semibold leading-tight">Story Chain</h1>
        <p className="text-sm text-[var(--color-fg-dim)] mt-1">
          Today\'s prompt is open. Each person adds one sentence. After 50 voices, the story locks and joins the archive.
        </p>
        <Link
          to="/about#story-chain"
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

function Tabs({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const items: { key: Tab; label: string; icon: typeof Feather }[] = [
    { key: 'today',   label: 'Today',   icon: Feather },
    { key: 'archive', label: 'Archive', icon: Library },
  ]
  return (
    <div
      role="tablist"
      className="grid grid-cols-2 gap-1 p-1 bg-[var(--color-surface-2)] rounded-lg border border-[var(--color-line)]"
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
            className={`h-9 inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors
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

// ─── Today tab ──────────────────────────────────────────────

function TodayTab({
  loading, current, myTurnExpiresAt,
  queueBusy, draft, setDraft, sending,
  onJoin, onLeave, onSend,
}: {
  loading: boolean
  current: ChainState | null
  myTurnExpiresAt: string | null
  queueBusy: boolean
  draft: string
  setDraft: (s: string) => void
  sending: boolean
  onJoin: () => void
  onLeave: () => void
  onSend: () => void
}) {
  if (loading && !current) {
    return <div className="flex justify-center py-14"><Loader /></div>
  }
  if (!current) {
    return (
      <div className="text-center py-14">
        <Feather size={28} className="mx-auto text-[var(--color-fg-faint)] mb-3" />
        <div className="text-sm text-[var(--color-fg-dim)]">
          Today\'s prompt drops at 3pm IST.
        </div>
      </div>
    )
  }

  const locked = current.status !== 'active'

  return (
    <div className="flex flex-col gap-4">
      <PromptCard current={current} />
      <ChainStream prompt={current.prompt} sentences={current.sentences} />
      {!locked && (
        <ActionPanel
          current={current}
          myTurnExpiresAt={myTurnExpiresAt}
          queueBusy={queueBusy}
          draft={draft}
          setDraft={setDraft}
          sending={sending}
          onJoin={onJoin}
          onLeave={onLeave}
          onSend={onSend}
        />
      )}
      {locked && <LockedBanner status={current.status} />}
    </div>
  )
}

function PromptCard({ current }: { current: ChainState }) {
  const pct = Math.min(100, Math.round((current.totalSentences / current.cap) * 100))
  return (
    <Card padding="md" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] uppercase tracking-wider font-medium text-[var(--color-fg-faint)]">
          Prompt for {current.promptDate}
        </div>
        <div className="text-[11px] text-[var(--color-fg-faint)] flex items-center gap-1.5">
          <Users size={12} />
          <span>{current.totalSentences} / {current.cap} voices</span>
        </div>
      </div>
      <p className="text-base leading-relaxed text-[var(--color-fg)] italic">
        &ldquo;{current.prompt}&rdquo;
      </p>
      {/* Tiny progress bar — adds a "stadium fills up" feel. */}
      <div className="h-1 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[var(--color-accent)] to-violet-500 transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </Card>
  )
}

function ChainStream({
  prompt, sentences,
}: { prompt: string; sentences: StoryContribution[] }) {
  return (
    <Card padding="md" className="flex flex-col gap-2">
      <div className="text-[11px] uppercase tracking-wider font-medium text-[var(--color-fg-faint)] mb-1">
        The story so far
      </div>
      <p className="text-sm leading-relaxed text-[var(--color-fg-dim)] italic">
        {prompt}
      </p>
      {sentences.length === 0 ? (
        <div className="text-xs text-[var(--color-fg-faint)] py-2">
          No voices yet. The first one sets the tone.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {sentences.map((s, i) => (
            <SentenceLine key={`${s.addedAt}-${i}`} index={i + 1} s={s} />
          ))}
        </div>
      )}
    </Card>
  )
}

function SentenceLine({ index, s }: { index: number; s: StoryContribution }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-[10px] font-mono text-[var(--color-fg-faint)] mt-1.5 tabular-nums w-6 text-right shrink-0">
        {index.toString().padStart(2, '0')}
      </span>
      <div className="flex-1 leading-relaxed text-[var(--color-fg)]">
        {s.sentence}{' '}
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)] ml-1">
          — {s.authorUsername}
        </span>
      </div>
    </div>
  )
}

function ActionPanel({
  current, myTurnExpiresAt,
  queueBusy, draft, setDraft, sending,
  onJoin, onLeave, onSend,
}: {
  current: ChainState
  myTurnExpiresAt: string | null
  queueBusy: boolean
  draft: string
  setDraft: (s: string) => void
  sending: boolean
  onJoin: () => void
  onLeave: () => void
  onSend: () => void
}) {
  if (current.hasContributed) {
    return (
      <Card padding="md" className="text-center">
        <div className="text-sm text-[var(--color-fg)]">You\'ve added your line to this chain.</div>
        <div className="text-xs text-[var(--color-fg-dim)] mt-1">Come back tomorrow for a fresh prompt.</div>
      </Card>
    )
  }

  if (current.myTurn) {
    return (
      <Card padding="md" className="flex flex-col gap-3 border-[var(--color-accent)]">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-[var(--color-accent-fg)]">It\'s your turn</div>
          <TurnCountdown expiresAt={myTurnExpiresAt} />
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          maxLength={MAX_SENTENCE + 32}
          placeholder="Add one sentence that takes the story somewhere…"
          className="w-full resize-none rounded-md bg-[var(--color-surface-2)] text-[var(--color-fg)]
            text-sm leading-relaxed p-3 border border-[var(--color-line)]
            focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)]"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSend()
            }
          }}
        />
        <div className="flex items-center justify-between gap-3">
          <span className={`text-xs ${draft.length > MAX_SENTENCE ? 'text-[var(--color-danger)]' : 'text-[var(--color-fg-faint)]'}`}>
            {MAX_SENTENCE - draft.length} left
          </span>
          <Button
            variant="primary"
            size="sm"
            loading={sending}
            disabled={!draft.trim() || draft.length > MAX_SENTENCE}
            onClick={onSend}
            leftIcon={<Send size={14} />}
          >
            Add to the story
          </Button>
        </div>
      </Card>
    )
  }

  // Not contributed, not my turn — join/leave queue affordance.
  const inQueue = current.myQueuePosition !== null
  return (
    <Card padding="md" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-[var(--color-fg)]">
          {inQueue
            ? `You\'re #${current.myQueuePosition} in the queue.`
            : 'Join the queue to take a turn.'}
        </div>
        <div className="text-xs text-[var(--color-fg-faint)]">
          {current.queueLength} waiting
          {current.hasActiveTurn && <span className="ml-1.5">· someone\'s writing</span>}
        </div>
      </div>
      <Button
        variant={inQueue ? 'secondary' : 'primary'}
        loading={queueBusy}
        onClick={inQueue ? onLeave : onJoin}
        leftIcon={inQueue ? undefined : <ChevronRight size={14} />}
      >
        {inQueue ? 'Leave the queue' : 'Join the queue'}
      </Button>
    </Card>
  )
}

function TurnCountdown({ expiresAt }: { expiresAt: string | null }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const remaining = useMemo(() => {
    if (!expiresAt) return null
    const ms = new Date(expiresAt).getTime() - now
    if (ms <= 0) return '00:00'
    const m = Math.floor(ms / 60_000)
    const s = Math.floor((ms % 60_000) / 1_000)
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }, [expiresAt, now])
  if (!remaining) return null
  return (
    <span className="text-[11px] font-mono tabular-nums text-[var(--color-accent-fg)] bg-[var(--color-accent-soft)] px-2 py-0.5 rounded-full">
      {remaining}
    </span>
  )
}

function LockedBanner({ status }: { status: 'locked' | 'published' }) {
  return (
    <Card padding="md" className="text-center">
      <Lock size={20} className="mx-auto text-[var(--color-fg-faint)] mb-2" />
      <div className="text-sm font-medium text-[var(--color-fg)]">
        {status === 'published' ? 'Sealed and archived.' : 'Sealing the story…'}
      </div>
      <div className="text-xs text-[var(--color-fg-dim)] mt-1">
        Check the Archive tab to read it from the start.
      </div>
    </Card>
  )
}

// ─── Archive tab ────────────────────────────────────────────

function ArchiveTab({ loading, chains }: { loading: boolean; chains: ArchivedChain[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  if (loading && chains.length === 0) {
    return <div className="flex justify-center py-10"><Loader /></div>
  }
  if (chains.length === 0) {
    return (
      <div className="text-center py-14">
        <Library size={28} className="mx-auto text-[var(--color-fg-faint)] mb-3" />
        <div className="text-sm text-[var(--color-fg-dim)]">No published stories yet.</div>
        <div className="text-xs text-[var(--color-fg-faint)] mt-1">
          Once today\'s chain seals, it lands here.
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      {chains.map((c) => (
        <ArchiveCard
          key={c.id}
          chain={c}
          open={openId === c.id}
          onToggle={() => setOpenId(openId === c.id ? null : c.id)}
        />
      ))}
    </div>
  )
}

function ArchiveCard({
  chain, open, onToggle,
}: { chain: ArchivedChain; open: boolean; onToggle: () => void }) {
  return (
    <Card padding="md" hover className="flex flex-col gap-2">
      <button
        onClick={onToggle}
        className="flex items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <div className="flex-1 min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-fg-faint)] mb-1">
            {chain.promptDate} · {chain.totalSentences} voices
          </div>
          <div className="text-sm italic text-[var(--color-fg)] line-clamp-2">
            &ldquo;{chain.prompt}&rdquo;
          </div>
        </div>
        <ChevronRight
          size={16}
          className={`text-[var(--color-fg-faint)] shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
        />
      </button>

      {open && (
        <div className="pt-2 border-t border-[var(--color-line)] flex flex-col gap-1.5">
          <p className="text-sm leading-relaxed text-[var(--color-fg-dim)] italic">{chain.prompt}</p>
          {chain.sentences.map((s, i) => (
            <SentenceLine key={`${s.addedAt}-${i}`} index={i + 1} s={s} />
          ))}
        </div>
      )}
    </Card>
  )
}
