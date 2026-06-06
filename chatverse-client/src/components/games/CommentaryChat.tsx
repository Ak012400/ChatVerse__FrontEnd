import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Send, Eye } from 'lucide-react'
import type { GameChatMessage } from '../../types/games'
import { useAuthStore } from '../../stores/authStore'

// ============================================================
//  CommentaryChat — game-room chat with spectator-flood guards.
//
//  Why a dedicated chat component (not just reuse ChatPage's)?
//    A popular quiz can attract 50+ spectators, all reacting to
//    every question. ChatPage's "one row per message" rendering
//    would scroll-jitter the screen and bury actual player banter.
//    Three quality-of-life additions specific to games:
//      1) Emoji-burst collapse — "🔥 🔥 🔥 🔥" within 2s render as
//         "🔥 ×4" on a single line.
//      2) Spectator visual distinction — spectator messages are
//         dimmer + tagged so player chat stands out.
//      3) Auto-scroll guard — if the user scrolled up to read,
//         we DON'T jump them back to bottom on every new message
//         (chat apps that do are infuriating).
// ============================================================

interface Props {
  messages: GameChatMessage[]
  onSend: (text: string) => void
  /** Hide the input row for read-only views (e.g. modal previews). */
  readOnly?: boolean
}

interface CollapsedRow {
  kind: 'msg' | 'burst'
  /** Stable id used as React key. */
  id: string
  /** Used to compute timestamps and styling. */
  baseMsg: GameChatMessage
  /** Only set for kind === 'burst': how many extra identical emojis
   *  collapsed into this row (so we render "🔥 ×N+1"). */
  burstCount?: number
  /** Cached set of distinct users contributing to the burst. */
  burstSenders?: string[]
}

const BURST_WINDOW_MS = 2500
const EMOJI_ONLY_RE = /^(\p{Extended_Pictographic}|\s)+$/u

export default function CommentaryChat({ messages, onSend, readOnly }: Props) {
  const me = useAuthStore((s) => s.user)
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const [pinnedToBottom, setPinnedToBottom] = useState(true)

  // Compute collapsed rows: same-emoji bursts from any senders within
  // a 2.5s window become a single row. We DON'T collapse text messages
  // — players might be cheering each other on with substantive lines.
  const rows = useMemo(() => collapseEmojiBursts(messages), [messages])

  // ─── Auto-scroll lifecycle ─────────────────────────────────────
  // Detect "user scrolled up" vs "user is at the bottom". When they're
  // at the bottom we stick them there on new messages; when they've
  // scrolled up we leave them alone so they can read history without
  // the rug pulled out.
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const onScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      setPinnedToBottom(distFromBottom < 64)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!pinnedToBottom) return
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [rows.length, pinnedToBottom])

  // ─── Send handlers ─────────────────────────────────────────────

  const submit = () => {
    const text = draft.trim()
    if (!text) return
    onSend(text)
    setDraft('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface-1)] border border-[var(--color-line)] rounded-md overflow-hidden">
      <header className="px-4 py-3 border-b border-[var(--color-line)] flex items-center justify-between">
        <h3 className="text-sm font-medium">Commentary</h3>
        <span className="text-[10px] text-[var(--color-fg-mute)] tabular-nums">
          {messages.length}
        </span>
      </header>

      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-2"
      >
        {rows.length === 0 && (
          <p className="text-xs text-[var(--color-fg-mute)] text-center py-8">
            Be the first to chat 🎉
          </p>
        )}

        {rows.map((row) => {
          const m = row.baseMsg
          const isMe = m.senderId === me?.userId
          const isSpectator = m.senderRole === 'Spectator'

          if (row.kind === 'burst') {
            return (
              <div
                key={row.id}
                className="flex items-center gap-2 px-2 py-1 rounded-md bg-[var(--color-surface-2)] border border-dashed border-[var(--color-line)]"
              >
                <span className="text-base">{m.text}</span>
                <span className="text-xs font-semibold text-[var(--color-fg-dim)]">
                  ×{(row.burstCount ?? 0) + 1}
                </span>
                <span className="ml-auto text-[10px] text-[var(--color-fg-mute)] truncate">
                  {row.burstSenders?.slice(0, 3).join(', ')}
                  {(row.burstSenders?.length ?? 0) > 3 ? '…' : ''}
                </span>
              </div>
            )
          }

          return (
            <div
              key={row.id}
              className={[
                'flex flex-col',
                isMe ? 'items-end' : 'items-start',
              ].join(' ')}
            >
              <div
                className={[
                  'inline-flex items-baseline gap-1.5 max-w-[90%]',
                  'px-3 py-1.5 rounded-md text-sm',
                  isSpectator ? 'opacity-75' : '',
                  isMe
                    ? 'bg-[var(--color-accent-soft)] text-[var(--color-fg)]'
                    : 'bg-[var(--color-surface-2)] text-[var(--color-fg)]',
                ].join(' ')}
              >
                <span className="text-[10px] font-semibold text-[var(--color-fg-mute)] shrink-0">
                  {m.senderUsername}
                  {isSpectator && (
                    <Eye size={9} className="inline ml-0.5 -mt-0.5" />
                  )}
                </span>
                <span className="break-words">{m.text}</span>
              </div>
            </div>
          )
        })}
      </div>

      {!readOnly && (
        <div className="border-t border-[var(--color-line)] p-2 flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            maxLength={280}
            placeholder="Cheer them on…"
            className="flex-1 resize-none bg-[var(--color-surface-2)] border border-[var(--color-line)] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-line-strong)]"
          />
          <button
            onClick={submit}
            disabled={!draft.trim()}
            className="h-9 w-9 rounded-md bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors"
            aria-label="Send"
          >
            <Send size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── collapseEmojiBursts ────────────────────────────────────────
// Walks the chronological message list once, collapsing runs of
// identical emoji-only messages within a 2.5s window into one
// burst row. O(N) — safe to recompute on every render.
function collapseEmojiBursts(messages: GameChatMessage[]): CollapsedRow[] {
  const rows: CollapsedRow[] = []
  let i = 0
  while (i < messages.length) {
    const cur = messages[i]
    if (!EMOJI_ONLY_RE.test(cur.text)) {
      rows.push({ kind: 'msg', id: cur.id, baseMsg: cur })
      i++
      continue
    }
    // Scan forward as long as next messages are SAME emoji within window.
    let j = i + 1
    const senders = new Set<string>([cur.senderUsername])
    let lastTime = new Date(cur.atUtc).getTime()
    while (
      j < messages.length &&
      messages[j].text === cur.text &&
      new Date(messages[j].atUtc).getTime() - lastTime < BURST_WINDOW_MS
    ) {
      senders.add(messages[j].senderUsername)
      lastTime = new Date(messages[j].atUtc).getTime()
      j++
    }
    if (j - i > 1) {
      rows.push({
        kind: 'burst',
        id: cur.id,
        baseMsg: cur,
        burstCount: j - i - 1,
        burstSenders: Array.from(senders),
      })
    } else {
      rows.push({ kind: 'msg', id: cur.id, baseMsg: cur })
    }
    i = j
  }
  return rows
}
