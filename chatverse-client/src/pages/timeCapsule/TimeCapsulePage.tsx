import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Hourglass, Send, Inbox, Mail, Eye, EyeOff, MessageCircleReply, BookOpen } from 'lucide-react'

import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Loader from '../../components/ui/Loader'
import { useToastStore } from '../../stores/toastStore'
import { useTimeCapsuleStore } from '../../stores/timeCapsuleStore'
import { useTimeCapsuleHub } from '../../hooks/useTimeCapsuleHub'
import type {
  ComposeCapsuleInput,
  DeliveryWindow,
  InboxCapsule,
  SentCapsule,
} from '../../types/timeCapsule'

// ============================================================
//  Time Capsule — Compose / Inbox / Sent
//
//  Mobile-first dhasu UI: single column on mobile, the tab strip
//  sits at the top so thumb reach is natural. On sm+ the form &
//  list breathe out a bit with a wider max-width.
//
//  All hub calls go through useTimeCapsuleHub — the hook also owns
//  the inbound TimeCapsuleDelivered listener (mounted at AppLayout
//  too, so the toast fires even when this page is closed).
// ============================================================

type Tab = 'compose' | 'inbox' | 'sent'

const MAX_CONTENT  = 2000
const MAX_REPLY    = 1000
const WINDOWS: DeliveryWindow[] = [7, 14, 30]

export default function TimeCapsulePage() {
  const { showToast } = useToastStore()
  const {
    inbox, sent, unread, inboxLoaded, sentLoaded,
    setInbox, setSent, clearUnread,
  } = useTimeCapsuleStore()
  const { isConnected, writeCapsule, getMyInbox, getMySent } = useTimeCapsuleHub()

  const [tab, setTab] = useState<Tab>('compose')
  const [loadingTab, setLoadingTab] = useState(false)

  // Reset the sidebar-badge counter the moment the user lands here.
  useEffect(() => { clearUnread() }, [clearUnread])

  // Lazy-fetch each tab on first open. After the initial load we
  // trust the store — the hub keeps it fresh via push events.
  useEffect(() => {
    if (!isConnected) return
    if (tab === 'inbox' && !inboxLoaded) {
      setLoadingTab(true)
      getMyInbox()
        .then((r) => setInbox(r.capsules))
        .catch(() => showToast({
          type: 'error', title: 'Inbox unavailable',
          message: 'Could not load your time capsules right now.', duration: 4000,
        }))
        .finally(() => setLoadingTab(false))
    }
    if (tab === 'sent' && !sentLoaded) {
      setLoadingTab(true)
      getMySent()
        .then((r) => setSent(r.capsules))
        .catch(() => showToast({
          type: 'error', title: 'Sent unavailable',
          message: 'Could not load your sent capsules right now.', duration: 4000,
        }))
        .finally(() => setLoadingTab(false))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, isConnected])

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-6 sm:py-10">
      <div className="max-w-2xl mx-auto cv-fade-up">
        <Header />

        <Tabs tab={tab} setTab={setTab} unread={unread} />

        <div className="mt-6">
          {tab === 'compose' && (
            <ComposeTab writeCapsule={writeCapsule} isConnected={isConnected} />
          )}
          {tab === 'inbox' && (
            <InboxTab loading={loadingTab} items={inbox} />
          )}
          {tab === 'sent' && (
            <SentTab loading={loadingTab} items={sent} />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Header ──────────────────────────────────────────────────

function Header() {
  return (
    <div className="flex items-start gap-3 mb-6">
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-white"
        style={{ background: 'linear-gradient(135deg, var(--color-accent) 0%, #8b5cf6 100%)' }}
        aria-hidden="true"
      >
        <Hourglass size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <h1 className="text-xl sm:text-2xl font-semibold leading-tight">Time Capsule</h1>
        <p className="text-sm text-[var(--color-fg-dim)] mt-1">
          Write a note now, delivered to a random stranger in 7, 14 or 30 days.
          One reply allowed — it comes back to you three days later.
        </p>
        <Link
          to="/about#time-capsule"
          className="inline-flex items-center gap-1.5 mt-2 text-xs text-[var(--color-accent-fg)] hover:text-[var(--color-accent)] transition-colors"
        >
          <BookOpen size={12} />
          <span>Read the full rules</span>
        </Link>
      </div>
    </div>
  )
}

// ─── Tabs strip ──────────────────────────────────────────────

function Tabs({
  tab, setTab, unread,
}: { tab: Tab; setTab: (t: Tab) => void; unread: number }) {
  const items: { key: Tab; label: string; icon: typeof Send; badge?: number }[] = [
    { key: 'compose', label: 'Compose', icon: Send },
    { key: 'inbox',   label: 'Inbox',   icon: Inbox, badge: unread },
    { key: 'sent',    label: 'Sent',    icon: Mail },
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
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[var(--color-accent)] text-[10px] font-semibold text-white inline-flex items-center justify-center">
                {it.badge > 9 ? '9+' : it.badge}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

// ─── Compose tab ─────────────────────────────────────────────

function ComposeTab({
  writeCapsule, isConnected,
}: {
  writeCapsule: (i: ComposeCapsuleInput) => Promise<string>
  isConnected: boolean
}) {
  const { showToast } = useToastStore()
  const [content, setContent] = useState('')
  const [deliveryDays, setDeliveryDays] = useState<DeliveryWindow>(14)
  const [revealAuthor, setRevealAuthor] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const remaining = MAX_CONTENT - content.length
  const tooLong = remaining < 0
  const empty   = content.trim().length === 0

  const handleSend = async () => {
    if (empty || tooLong || submitting || !isConnected) return
    setSubmitting(true)
    try {
      await writeCapsule({
        content:      content.trim(),
        type:         'text',
        mediaUrl:     null,
        deliveryDays,
        revealAuthor,
      })
      setContent('')
      setRevealAuthor(false)
      showToast({
        type:     'success',
        title:    '⏳ Capsule sealed',
        message:  `It'll reach a random voyager in about ${deliveryDays} days.`,
        duration: 5000,
      })
    } catch (err: any) {
      showToast({
        type:     'error',
        title:    'Could not seal capsule',
        message:  err?.message ?? 'Please try again in a moment.',
        duration: 4000,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card padding="md" className="flex flex-col gap-4">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={7}
        maxLength={MAX_CONTENT + 64 /* tiny over-buffer so the cap reads as guidance */}
        placeholder="Write to someone you'll never meet. Something honest, kind, weird, beautiful — whatever's on your mind right now."
        className="w-full resize-none rounded-md bg-[var(--color-surface-1)] text-[var(--color-fg)]
          text-sm leading-relaxed p-3 border border-[var(--color-line)]
          focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)]
          transition-colors"
      />

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <span className={tooLong ? 'text-[var(--color-danger)]' : 'text-[var(--color-fg-faint)]'}>
          {remaining >= 0 ? `${remaining} characters left` : `${-remaining} over limit`}
        </span>
      </div>

      {/* Delivery window pills */}
      <div>
        <div className="text-[11px] uppercase tracking-wider font-medium text-[var(--color-fg-faint)] mb-2">
          Deliver in
        </div>
        <div className="flex gap-2 flex-wrap">
          {WINDOWS.map((d) => {
            const active = deliveryDays === d
            return (
              <button
                key={d}
                onClick={() => setDeliveryDays(d)}
                className={`h-9 px-4 rounded-md text-sm font-medium border transition-colors
                  ${active
                    ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)] border-[var(--color-accent)]'
                    : 'bg-[var(--color-surface-1)] text-[var(--color-fg-dim)] border-[var(--color-line)] hover:text-[var(--color-fg)]'}`}
                aria-pressed={active}
              >
                {d} days
              </button>
            )
          })}
        </div>
      </div>

      {/* Reveal-author toggle */}
      <button
        onClick={() => setRevealAuthor((v) => !v)}
        className={`flex items-start gap-3 p-3 rounded-md border text-left transition-colors
          ${revealAuthor
            ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
            : 'border-[var(--color-line)] bg-[var(--color-surface-1)] hover:border-[var(--color-line-strong)]'}`}
        aria-pressed={revealAuthor}
      >
        <span className="mt-0.5 text-[var(--color-fg)]">
          {revealAuthor ? <Eye size={16} /> : <EyeOff size={16} />}
        </span>
        <span className="flex-1">
          <span className="block text-sm font-medium text-[var(--color-fg)]">
            {revealAuthor ? 'Sign this capsule' : 'Send anonymously'}
          </span>
          <span className="block text-xs text-[var(--color-fg-dim)] mt-0.5">
            {revealAuthor
              ? 'Recipient will see your username when the capsule opens.'
              : 'Recipient sees “Anonymous voyager”. Nobody can trace it back to you.'}
          </span>
        </span>
      </button>

      <div className="flex justify-end pt-1">
        <Button
          variant="primary"
          loading={submitting}
          disabled={empty || tooLong || !isConnected}
          onClick={handleSend}
          leftIcon={<Send size={14} />}
        >
          {isConnected ? 'Seal & schedule' : 'Connecting…'}
        </Button>
      </div>
    </Card>
  )
}

// ─── Inbox tab ───────────────────────────────────────────────

function InboxTab({ loading, items }: { loading: boolean; items: InboxCapsule[] }) {
  if (loading && items.length === 0) {
    return <EmptyOrLoading loading label="Pulling your time capsules…" />
  }
  if (items.length === 0) {
    return (
      <EmptyOrLoading
        loading={false}
        label="No capsules have reached you yet."
        sub="They drift in from strangers across the platform — be patient, the first one's worth the wait."
      />
    )
  }
  return (
    <div className="flex flex-col gap-3">
      {items.map((c) => <InboxCard key={c.id} c={c} />)}
    </div>
  )
}

function InboxCard({ c }: { c: InboxCapsule }) {
  const [replyOpen, setReplyOpen] = useState(false)
  return (
    <Card padding="md" hover className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs">
          <span className={`px-2 h-5 inline-flex items-center rounded-full text-[10px] font-medium
            ${c.authorName
              ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)]'
              : 'bg-[var(--color-surface-2)] text-[var(--color-fg-dim)] border border-[var(--color-line)]'}`}>
            {c.authorName ? `from ${c.authorName}` : 'Anonymous voyager'}
          </span>
          <span className="text-[var(--color-fg-faint)]">
            sealed {c.deliveryDays} days ago
          </span>
        </div>
        <span className="text-[10px] text-[var(--color-fg-faint)]">
          {formatDate(c.deliveredAt)}
        </span>
      </div>

      <p className="text-sm leading-relaxed text-[var(--color-fg)] whitespace-pre-wrap break-words">
        {c.content}
      </p>

      {c.canReply ? (
        <div className="pt-1">
          {!replyOpen ? (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<MessageCircleReply size={14} />}
              onClick={() => setReplyOpen(true)}
            >
              Reply (one shot)
            </Button>
          ) : (
            <ReplyForm capsuleId={c.id} onDone={() => setReplyOpen(false)} />
          )}
        </div>
      ) : c.repliedAt ? (
        <div className="text-xs text-[var(--color-fg-faint)]">
          You replied on {formatDate(c.repliedAt)} — your words travel back in 3 days.
        </div>
      ) : null}
    </Card>
  )
}

function ReplyForm({ capsuleId, onDone }: { capsuleId: string; onDone: () => void }) {
  const { showToast } = useToastStore()
  const { replyToCapsule } = useTimeCapsuleHub()
  const markReplied = useTimeCapsuleStore((s) => s.markReplied)

  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const remaining = MAX_REPLY - text.length
  const tooLong = remaining < 0
  const empty   = text.trim().length === 0

  const handleSend = async () => {
    if (empty || tooLong || sending) return
    setSending(true)
    try {
      const ok = await replyToCapsule(capsuleId, text.trim())
      if (!ok) throw new Error('Reply was rejected by the server.')
      markReplied(capsuleId)
      showToast({
        type:     'success',
        title:    '💌 Reply sent',
        message:  'It’ll reach the author in about 3 days.',
        duration: 5000,
      })
      onDone()
    } catch (err: any) {
      showToast({
        type:     'error',
        title:    'Reply failed',
        message:  err?.message ?? 'Could not send your reply.',
        duration: 4000,
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Write back — one shot only, make it count."
        className="w-full resize-none rounded-md bg-[var(--color-surface-2)] text-[var(--color-fg)]
          text-sm leading-relaxed p-3 border border-[var(--color-line)]
          focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)]"
      />
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs ${tooLong ? 'text-[var(--color-danger)]' : 'text-[var(--color-fg-faint)]'}`}>
          {remaining >= 0 ? `${remaining} left` : `${-remaining} over`}
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onDone}>Cancel</Button>
          <Button
            variant="primary"
            size="sm"
            loading={sending}
            disabled={empty || tooLong}
            onClick={handleSend}
          >
            Send reply
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Sent tab ────────────────────────────────────────────────

function SentTab({ loading, items }: { loading: boolean; items: SentCapsule[] }) {
  // Sort so undelivered (scheduledFor in future) sit on top — that's
  // the most interesting cohort to track.
  const sorted = useMemo(() => {
    const copy = [...items]
    copy.sort((a, b) => {
      // Pending first, then most recent deliveredAt first.
      const aPending = !a.deliveredAt
      const bPending = !b.deliveredAt
      if (aPending !== bPending) return aPending ? -1 : 1
      const aTime = a.deliveredAt ?? a.scheduledFor
      const bTime = b.deliveredAt ?? b.scheduledFor
      return new Date(bTime).getTime() - new Date(aTime).getTime()
    })
    return copy
  }, [items])

  if (loading && items.length === 0) {
    return <EmptyOrLoading loading label="Pulling your sent capsules…" />
  }
  if (items.length === 0) {
    return (
      <EmptyOrLoading
        loading={false}
        label="You haven't sealed any capsules yet."
        sub="Head to Compose and write your first one."
      />
    )
  }
  return (
    <div className="flex flex-col gap-3">
      {sorted.map((c) => <SentCard key={c.id} c={c} />)}
    </div>
  )
}

function SentCard({ c }: { c: SentCapsule }) {
  const pending = !c.deliveredAt
  return (
    <Card padding="md" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <span className={`px-2 h-5 inline-flex items-center rounded-full font-medium
          ${pending
            ? 'bg-[var(--color-surface-2)] text-[var(--color-fg-dim)] border border-[var(--color-line)]'
            : 'bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)]'}`}>
          {pending ? 'Sealed' : 'Delivered'}
        </span>
        <span className="text-[var(--color-fg-faint)]">
          {pending
            ? `arrives ~${formatDate(c.scheduledFor)}`
            : `delivered ${formatDate(c.deliveredAt!)}`}
        </span>
      </div>

      <p className="text-sm leading-relaxed text-[var(--color-fg)] whitespace-pre-wrap break-words">
        {c.content}
      </p>

      {c.gotReply && c.replyContent ? (
        <div className="mt-1 p-3 rounded-md bg-[var(--color-surface-2)] border-l-2 border-[var(--color-accent)]">
          <div className="text-[11px] font-medium text-[var(--color-accent-fg)] mb-1 uppercase tracking-wider">
            They wrote back
          </div>
          <p className="text-sm leading-relaxed text-[var(--color-fg)] whitespace-pre-wrap break-words">
            {c.replyContent}
          </p>
          {c.replyDeliveredAt && (
            <div className="text-[10px] text-[var(--color-fg-faint)] mt-1.5">
              landed {formatDate(c.replyDeliveredAt)}
            </div>
          )}
        </div>
      ) : c.gotReply ? (
        <div className="text-xs text-[var(--color-fg-faint)] italic">
          They replied — words travelling back, arriving in a few days.
        </div>
      ) : null}
    </Card>
  )
}

// ─── Empty / loading shared block ───────────────────────────

function EmptyOrLoading({
  loading, label, sub,
}: { loading: boolean; label: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-4">
      {loading
        ? <Loader />
        : <Hourglass size={28} className="text-[var(--color-fg-faint)] mb-3" />}
      <div className="text-sm text-[var(--color-fg-dim)]">{label}</div>
      {sub && <div className="text-xs text-[var(--color-fg-faint)] mt-1 max-w-sm">{sub}</div>}
    </div>
  )
}

// ─── Date helper ─────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  // Compact: "12 Jun" within same year, else "12 Jun '26".
  const now = new Date()
  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString(undefined, {
    day:   'numeric',
    month: 'short',
    year:  sameYear ? undefined : '2-digit',
  })
}
