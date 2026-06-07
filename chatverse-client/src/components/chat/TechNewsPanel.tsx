import { useEffect, useState, useCallback } from 'react'
import {
  Newspaper, ChevronDown, ChevronUp, RefreshCw, ExternalLink,
  MessageSquare, Share2, Loader2,
} from 'lucide-react'
import { techNewsApi, type TechNewsItem } from '../../api/techNews'

// ============================================================
//  TechNewsPanel — live news feed embedded above the Tech Talk
//  chat. Pulls HN top stories + dev.to trending articles every
//  60s, interleaved server-side so the list feels balanced.
//
//  Each card has two clear actions:
//   • Read article  — external link, opens in new tab
//   • Share in chat — seeds a chat message with a quoted preview
//                     so the room can riff on the headline
//
//  Like the Active Games panel, collapse state persists in
//  localStorage so power users who prefer plain chat aren't
//  forced to look at the feed every visit.
// ============================================================

const POLL_MS = 60_000
const COLLAPSE_KEY = 'cv:tech-news-panel:collapsed'

interface Props {
  /** Called when the user shares an article. The parent forwards
   *  the seeded text through the chat hub. */
  onShareToChat: (text: string) => void
}

export default function TechNewsPanel({ onShareToChat }: Props) {
  const [items, setItems] = useState<TechNewsItem[]>([])
  const [loading, setLoading] = useState(false)
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  })

  const fetchNews = useCallback(async () => {
    setLoading(true)
    try {
      const res = await techNewsApi.list()
      setItems(res.data.data ?? [])
    } catch {
      // Quiet — the panel is non-critical, no point nagging.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNews()
    if (collapsed) return
    const id = setInterval(fetchNews, POLL_MS)
    return () => clearInterval(id)
  }, [fetchNews, collapsed])

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0') } catch { /* private mode */ }
      return next
    })
  }

  return (
    <div className="shrink-0 border-b border-[var(--color-line)] bg-[var(--color-surface-1)]">
      <button
        type="button"
        onClick={toggleCollapsed}
        className="w-full px-5 py-2.5 flex items-center gap-2 hover:bg-[var(--color-surface-2)] transition-colors text-left"
      >
        <Newspaper size={14} className="text-[var(--color-accent-fg)] shrink-0" />
        <span className="text-xs font-medium uppercase tracking-wide">Live Tech News</span>
        {!collapsed && items.length > 0 && (
          <span className="text-[10px] text-[var(--color-fg-mute)] tabular-nums">
            {items.length}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {!collapsed && (
            <span
              onClick={(e) => { e.stopPropagation(); fetchNews() }}
              className="text-[10px] text-[var(--color-fg-mute)] hover:text-[var(--color-fg-dim)] flex items-center gap-1 transition-colors"
              role="button"
              aria-label="Refresh"
            >
              <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
            </span>
          )}
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </span>
      </button>

      {!collapsed && (
        <div className="px-3 pb-3 max-h-64 overflow-y-auto">
          {loading && items.length === 0 && (
            <div className="flex items-center justify-center py-8 text-[var(--color-fg-mute)]">
              <Loader2 size={16} className="animate-spin" />
            </div>
          )}
          {!loading && items.length === 0 && (
            <p className="text-xs text-[var(--color-fg-mute)] text-center py-4">
              Feed unavailable. Try refresh.
            </p>
          )}
          <ul className="space-y-1.5">
            {items.map((item, idx) => (
              <li
                key={`${item.source}-${item.url}-${idx}`}
                className="p-2.5 rounded-md bg-[var(--color-bg)] border border-[var(--color-line)] hover:border-[var(--color-line-strong)] transition-colors"
              >
                <div className="flex items-start gap-2">
                  <span
                    className={[
                      'text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 mt-0.5',
                      item.source === 'HackerNews'
                        ? 'bg-[var(--color-warning-soft)] text-[var(--color-warning-fg)]'
                        : 'bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)]',
                    ].join(' ')}
                  >
                    {item.source === 'HackerNews' ? 'HN' : 'dev'}
                  </span>
                  <p className="text-xs leading-snug flex-1 font-medium">
                    {item.title}
                  </p>
                </div>
                <div className="flex items-center gap-2 mt-1.5 ml-1">
                  <span className="text-[10px] text-[var(--color-fg-mute)] tabular-nums">
                    ▲ {item.points}
                  </span>
                  {item.author && (
                    <span className="text-[10px] text-[var(--color-fg-mute)] truncate max-w-[80px]">
                      {item.author}
                    </span>
                  )}
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto text-[10px] text-[var(--color-fg-mute)] hover:text-[var(--color-fg-dim)] flex items-center gap-1 transition-colors"
                  >
                    <ExternalLink size={9} /> Read
                  </a>
                  {item.commentsUrl && item.commentsUrl !== item.url && (
                    <a
                      href={item.commentsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-[var(--color-fg-mute)] hover:text-[var(--color-fg-dim)] flex items-center gap-1 transition-colors"
                    >
                      <MessageSquare size={9} /> Comments
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => onShareToChat(`📰 ${item.title}\n${item.url}\nThoughts?`)}
                    className="text-[10px] text-[var(--color-accent-fg)] hover:text-[var(--color-accent)] flex items-center gap-1 transition-colors"
                  >
                    <Share2 size={9} /> Share
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
