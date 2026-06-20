import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  MessageSquare, BookOpen, Send, Crown, Ghost, X, Library, Flame,
} from 'lucide-react'

import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Loader from '../../components/ui/Loader'
import { useToastStore } from '../../stores/toastStore'
import { useConfessionStore } from '../../stores/confessionStore'
import { useConfessionHub } from '../../hooks/useConfessionHub'
import type { ConfessionCard as Card_T } from '../../types/confession'

// ============================================================
//  /confessions — Confession Box (Phase 2 sticky)
//
//  Two tabs:
//    • Today's Feed — anonymous confessions + 6-emoji reactions
//    • Lore Wall    — past weeks' top 5
//
//  A "RevealOfferModal" pops automatically when the user is the
//  author of yesterday's top confession (via TopConfessionOffered
//  push event OR lazy GetMyTopOffer on first connect).
// ============================================================

type Tab = 'feed' | 'lore'
const MAX_CONFESSION = 500

export default function ConfessionsPage() {
  const { showToast } = useToastStore()
  const {
    feed, allowedEmojis, loreWall, pendingOffer,
    feedLoaded, loreLoaded,
    setFeed, prependFeed, setLoreWall, setPendingOffer,
  } = useConfessionStore()
  const {
    isConnected,
    post, getTodaysFeed, react,
    getMyTopOffer, acceptReveal, declineReveal,
    getLoreWall,
  } = useConfessionHub()

  const [tab, setTab] = useState<Tab>('feed')
  const [loadingTab, setLoadingTab] = useState(false)
  const [weekOffset, setWeekOffset] = useState(0)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)

  // Initial load + offer check.
  useEffect(() => {
    if (!isConnected) return
    if (!feedLoaded) {
      setLoadingTab(true)
      getTodaysFeed()
        .then((r) => setFeed(r.confessions, r.allowedEmojis))
        .catch(() => {})
        .finally(() => setLoadingTab(false))
    }
    // Lazy offer check on connect.
    if (!pendingOffer) {
      getMyTopOffer().then((r) => {
        if (r.hasOffer) setPendingOffer(r)
      }).catch(() => { /* offer fetch is silent */ })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected])

  // Lazy load Lore Wall per week.
  useEffect(() => {
    if (!isConnected || tab !== 'lore') return
    const key = `wk-${weekOffset}`
    if (loreLoaded[key]) return
    setLoadingTab(true)
    getLoreWall(weekOffset)
      .then((r) => setLoreWall(key, r.confessions))
      .catch(() => {})
      .finally(() => setLoadingTab(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, weekOffset, isConnected])

  const handlePost = async () => {
    const content = draft.trim()
    if (!content || posting) return
    if (content.length > MAX_CONFESSION) {
      showToast({
        type: 'warning', title: 'Too long',
        message: `Trim under ${MAX_CONFESSION} characters.`, duration: 3000,
      })
      return
    }
    setPosting(true)
    try {
      const card = await post(content)
      prependFeed(card)
      setDraft('')
      setComposerOpen(false)
      showToast({
        type: 'success', title: '🫥  Sent into the void',
        message: 'Anonymous, like everything in here.', duration: 4000,
      })
    } catch (err: any) {
      showToast({
        type: 'error', title: 'Couldn\'t post',
        message: err?.message ?? 'Try again.', duration: 4000,
      })
    } finally {
      setPosting(false)
    }
  }

  const handleReact = async (id: string, emoji: string) => {
    try { await react(id, emoji) }
    catch (err: any) {
      showToast({
        type: 'error', title: 'Reaction failed',
        message: err?.message ?? 'Try again.', duration: 3000,
      })
    }
  }

  const handleReveal = async () => {
    if (!pendingOffer?.id) return
    try {
      await acceptReveal(pendingOffer.id)
      setPendingOffer(null)
      showToast({
        type: 'success', title: '👁  You stepped into the light',
        message: 'Your name is now on yesterday\'s top confession.',
        duration: 6000,
      })
    } catch (err: any) {
      showToast({
        type: 'error', title: 'Reveal failed',
        message: err?.message ?? 'Try again.', duration: 4000,
      })
    }
  }

  const handleDecline = async () => {
    if (!pendingOffer?.id) return
    try {
      await declineReveal(pendingOffer.id)
      setPendingOffer(null)
      showToast({
        type: 'info', title: '👻  Ghost Voice unlocked',
        message: 'Your profile now carries a Ghost Voice badge.',
        duration: 6000,
      })
    } catch (err: any) {
      showToast({
        type: 'error', title: 'Couldn\'t decline',
        message: err?.message ?? 'Try again.', duration: 4000,
      })
    }
  }

  const currentLoreKey = `wk-${weekOffset}`
  const currentLore = loreWall[currentLoreKey] ?? []

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-6 sm:py-10">
      <div className="max-w-2xl mx-auto cv-fade-up">
        <Header onCompose={() => setComposerOpen(true)} />
        <Tabs tab={tab} setTab={setTab} />

        <div className="mt-6 cv-tab-slide" key={tab}>
          {tab === 'feed' && (
            <FeedTab
              loading={loadingTab}
              cards={feed}
              allowedEmojis={allowedEmojis}
              onReact={handleReact}
            />
          )}
          {tab === 'lore' && (
            <LoreTab
              loading={loadingTab}
              cards={currentLore}
              weekOffset={weekOffset}
              onWeekChange={setWeekOffset}
              allowedEmojis={allowedEmojis}
            />
          )}
        </div>
      </div>

      {composerOpen && (
        <ComposerSheet
          draft={draft}
          setDraft={setDraft}
          posting={posting}
          onClose={() => setComposerOpen(false)}
          onPost={handlePost}
        />
      )}

      {pendingOffer?.hasOffer && (
        <RevealOfferModal
          offer={pendingOffer}
          onReveal={handleReveal}
          onDecline={handleDecline}
        />
      )}
    </div>
  )
}

// ─── Header ─────────────────────────────────────────────────

function Header({ onCompose }: { onCompose: () => void }) {
  return (
    <div className="cv-aurora rounded-2xl p-5 mb-6 border border-[var(--color-line)] bg-[var(--color-surface-1)]">
      <div className="flex items-start gap-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-white cv-halo"
          style={{ background: 'linear-gradient(135deg, var(--color-accent) 0%, #8b5cf6 100%)' }}
          aria-hidden="true"
        >
          <MessageSquare size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold leading-tight cv-text-gradient">
            Confession Box
          </h1>
          <p className="text-sm text-[var(--color-fg-dim)] mt-1">
            Anonymous confessions, daily. The most-reacted one each day gets a choice: step into the light, or claim the Ghost Voice badge forever.
          </p>
          <div className="flex items-center gap-3 mt-3">
            <Button variant="primary" size="sm" onClick={onCompose} leftIcon={<Send size={14} />}>
              Confess something
            </Button>
            <Link
              to="/about#confession-box"
              className="inline-flex items-center gap-1.5 text-xs text-[var(--color-accent-fg)] hover:text-[var(--color-accent)] transition-colors"
            >
              <BookOpen size={12} />
              <span>Read the rules</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Tabs ───────────────────────────────────────────────────

function Tabs({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const items: { key: Tab; label: string; icon: typeof MessageSquare }[] = [
    { key: 'feed', label: 'Today\'s feed', icon: Flame },
    { key: 'lore', label: 'Lore Wall',     icon: Library },
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

// ─── Feed tab ───────────────────────────────────────────────

function FeedTab({
  loading, cards, allowedEmojis, onReact,
}: {
  loading: boolean
  cards: Card_T[]
  allowedEmojis: string[]
  onReact: (id: string, emoji: string) => void
}) {
  if (loading && cards.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="cv-skeleton h-20" />
        ))}
      </div>
    )
  }
  if (cards.length === 0) {
    return (
      <div className="text-center py-14">
        <MessageSquare size={28} className="mx-auto text-[var(--color-fg-faint)] mb-3" />
        <div className="text-sm text-[var(--color-fg-dim)]">No confessions today yet.</div>
        <div className="text-xs text-[var(--color-fg-faint)] mt-1">Be the first voice.</div>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-3 cv-stagger">
      {cards.map((c) => (
        <ConfessionTile key={c.id} c={c} allowedEmojis={allowedEmojis} onReact={onReact} />
      ))}
    </div>
  )
}

function ConfessionTile({
  c, allowedEmojis, onReact,
}: {
  c: Card_T
  allowedEmojis: string[]
  onReact: (id: string, emoji: string) => void
}) {
  const ghost = c.topRanked && c.revealedUsername === null
  const revealed = c.revealedUsername !== null
  return (
    <Card padding="md" hover={false} className="flex flex-col gap-3">
      {/* Author chip — runs the entire identity-disclosure logic */}
      <div className="flex items-center justify-between gap-3 text-xs">
        {revealed ? (
          <span className="inline-flex items-center gap-1.5 px-2 h-5 rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)] font-medium">
            <Crown size={11} />
            <span>{c.revealedUsername}</span>
          </span>
        ) : ghost ? (
          <span className="inline-flex items-center gap-1.5 px-2 h-5 rounded-full bg-[var(--color-surface-2)] text-[var(--color-fg-dim)] border border-[var(--color-line-strong)] font-medium">
            <Ghost size={11} />
            <span>Ghost Voice</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2 h-5 rounded-full bg-[var(--color-surface-2)] text-[var(--color-fg-faint)] border border-[var(--color-line)]">
            <span>Anonymous</span>
          </span>
        )}
        <div className="flex items-center gap-2">
          {c.mine && (
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)]">
              yours
            </span>
          )}
          {c.topRanked && !ghost && !revealed && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-amber-300/85">
              <Crown size={10} />
              top
            </span>
          )}
        </div>
      </div>

      <p className="text-sm leading-relaxed text-[var(--color-fg)] whitespace-pre-wrap break-words">
        {c.content}
      </p>

      <ReactionRow
        confessionId={c.id}
        allowedEmojis={allowedEmojis}
        counts={c.reactionCounts}
        mineEmoji={c.mineEmoji}
        mine={c.mine}
        onReact={onReact}
      />
    </Card>
  )
}

function ReactionRow({
  confessionId, allowedEmojis, counts, mineEmoji, mine, onReact,
}: {
  confessionId: string
  allowedEmojis: string[]
  counts: Record<string, number>
  mineEmoji: string | null
  mine: boolean
  onReact: (id: string, emoji: string) => void
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {allowedEmojis.map((e) => {
        const count = counts[e] ?? 0
        const picked = mineEmoji === e
        return (
          <button
            key={e}
            disabled={mine}
            onClick={() => onReact(confessionId, e)}
            title={mine ? 'You can\'t react to your own confession' : undefined}
            className={`cv-press inline-flex items-center gap-1 h-7 px-2 rounded-full border text-xs transition-colors
              ${picked
                ? 'bg-[var(--color-accent-soft)] border-[var(--color-accent)] text-[var(--color-accent-fg)]'
                : 'bg-[var(--color-surface-2)] border-[var(--color-line)] text-[var(--color-fg-dim)] hover:text-[var(--color-fg)] hover:border-[var(--color-line-strong)]'}
              ${mine ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span className="text-sm leading-none">{e}</span>
            {count > 0 && <span className="text-[10px] font-medium tabular-nums">{count}</span>}
          </button>
        )
      })}
    </div>
  )
}

// ─── Lore Wall tab ──────────────────────────────────────────

function LoreTab({
  loading, cards, weekOffset, onWeekChange, allowedEmojis,
}: {
  loading: boolean
  cards: Card_T[]
  weekOffset: number
  onWeekChange: (w: number) => void
  allowedEmojis: string[]
}) {
  const label = weekOffset === 0 ? 'This week' : weekOffset === 1 ? 'Last week' : `${weekOffset} weeks ago`

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-[var(--color-fg-dim)]">Top 5 confessions of {label}</span>
        <div className="flex gap-1">
          <Button
            variant="ghost" size="sm"
            disabled={weekOffset >= 8}
            onClick={() => onWeekChange(weekOffset + 1)}
          >
            ← Older
          </Button>
          <Button
            variant="ghost" size="sm"
            disabled={weekOffset === 0}
            onClick={() => onWeekChange(weekOffset - 1)}
          >
            Newer →
          </Button>
        </div>
      </div>

      {loading && cards.length === 0 ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="cv-skeleton h-24" />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <div className="text-center py-12">
          <Library size={26} className="mx-auto text-[var(--color-fg-faint)] mb-2" />
          <div className="text-sm text-[var(--color-fg-dim)]">No confessions crowned this week.</div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 cv-stagger">
          {cards.map((c, i) => (
            <div key={c.id} className="flex gap-3 items-start">
              <div className="w-7 h-7 rounded-full bg-[var(--color-surface-2)] inline-flex items-center justify-center text-xs font-mono font-semibold text-[var(--color-fg-dim)] mt-3 shrink-0">
                {i + 1}
              </div>
              <div className="flex-1">
                <ConfessionTile c={c} allowedEmojis={allowedEmojis} onReact={() => {}} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Composer sheet ─────────────────────────────────────────

function ComposerSheet({
  draft, setDraft, posting, onClose, onPost,
}: {
  draft: string
  setDraft: (s: string) => void
  posting: boolean
  onClose: () => void
  onPost: () => void
}) {
  const remaining = MAX_CONFESSION - draft.length
  const tooLong = remaining < 0
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-6"
      onClick={onClose}
    >
      <Card
        glass
        padding="md"
        onClick={(e) => e.stopPropagation()}
        className="cv-sheet-up w-full sm:max-w-md flex flex-col gap-3 rounded-b-none sm:rounded-xl"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-[var(--color-fg)]">Anonymous confession</div>
          <button
            onClick={onClose}
            className="cv-press w-8 h-8 inline-flex items-center justify-center rounded-md text-[var(--color-fg-dim)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface-2)]"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={5}
          autoFocus
          placeholder="Say the thing you couldn't say out loud."
          className="w-full resize-none rounded-md bg-[var(--color-surface-2)] text-[var(--color-fg)]
            text-sm leading-relaxed p-3 border border-[var(--color-line)]
            focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)]"
        />
        <div className="flex items-center justify-between gap-3">
          <span className={`text-xs ${tooLong ? 'text-[var(--color-danger)]' : 'text-[var(--color-fg-faint)]'}`}>
            {remaining >= 0 ? `${remaining} left` : `${-remaining} over`}
          </span>
          <Button
            variant="primary" size="sm"
            loading={posting}
            disabled={!draft.trim() || tooLong}
            onClick={onPost}
            leftIcon={<Send size={14} />}
          >
            Confess anonymously
          </Button>
        </div>
      </Card>
    </div>
  )
}

// ─── Reveal-offer modal ─────────────────────────────────────

function RevealOfferModal({
  offer, onReveal, onDecline,
}: {
  offer: { id?: string; content?: string; totalReactions?: number }
  onReveal: () => void
  onDecline: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <Card
        glass aurora
        padding="lg"
        className="cv-sheet-up w-full max-w-md flex flex-col gap-4 text-center"
      >
        <div
          className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center text-white cv-halo"
          style={{ background: 'linear-gradient(135deg, var(--color-accent) 0%, #8b5cf6 100%)' }}
        >
          <Crown size={26} />
        </div>
        <div>
          <div className="text-lg font-semibold cv-text-gradient">Yesterday\'s top confession was yours</div>
          <div className="text-xs text-[var(--color-fg-faint)] mt-1">
            {offer.totalReactions ?? '—'} reactions
          </div>
        </div>
        <Card padding="sm" className="text-left">
          <p className="text-sm leading-relaxed text-[var(--color-fg-dim)] italic">
            &ldquo;{offer.content ?? '…'}&rdquo;
          </p>
        </Card>
        <div className="text-sm text-[var(--color-fg)]">
          Reveal yourself for a featured spot on the platform, or claim a permanent <span className="font-medium">Ghost Voice</span> badge instead.
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:justify-center">
          <Button variant="secondary" onClick={onDecline} leftIcon={<Ghost size={14} />}>
            Stay a ghost
          </Button>
          <Button variant="primary" onClick={onReveal} leftIcon={<Crown size={14} />}>
            Reveal myself
          </Button>
        </div>
        <p className="text-[10px] text-[var(--color-fg-faint)]">
          This choice is permanent for this confession. (You can stay anonymous on future ones.)
        </p>
      </Card>
    </div>
  )
}
