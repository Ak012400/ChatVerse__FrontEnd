import { useEffect, useState } from 'react'
import { X, Search, Send, Loader2 } from 'lucide-react'
import { usersApi } from '../../api'
import Button from '../ui/Button'

// ============================================================
//  InvitePlayerModal — host invites a specific user by searching
//  ChatVerse's user directory.
//
//  Uses the existing /api/users/search endpoint (debounced 350ms).
//  On select, calls onInvite(userId) which the parent forwards
//  through the hub. The modal closes on successful send.
// ============================================================

interface User {
  userId: string
  username: string
  trustScore?: number
}

interface Props {
  open: boolean
  onClose: () => void
  onInvite: (userId: string, username: string) => Promise<void> | void
}

export default function InvitePlayerModal({ open, onClose, onInvite }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<User[]>([])
  const [searching, setSearching] = useState(false)
  const [sendingId, setSendingId] = useState<string | null>(null)

  // Debounced search — the API tolerates 1 req/350ms easily and this
  // keeps the keystroke→result feel snappy without hammering it.
  useEffect(() => {
    if (!open) return
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    let cancelled = false
    const id = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await usersApi.search(query.trim(), 10)
        if (cancelled) return
        setResults(res.data.data ?? [])
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 350)
    return () => { cancelled = true; clearTimeout(id) }
  }, [query, open])

  if (!open) return null

  const handlePick = async (u: User) => {
    setSendingId(u.userId)
    try {
      await onInvite(u.userId, u.username)
      onClose()
      setQuery('')
      setResults([])
    } finally {
      setSendingId(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md bg-[var(--color-bg)] border border-[var(--color-line)] rounded-md shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-[var(--color-line)] flex items-center justify-between">
          <h2 className="text-sm font-medium">Invite a player</h2>
          <button onClick={onClose} aria-label="Close"
            className="text-[var(--color-fg-mute)] hover:text-[var(--color-fg-dim)] transition-colors">
            <X size={16} />
          </button>
        </header>
        <div className="p-5 space-y-3">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-fg-mute)]" />
            <input
              type="text"
              autoFocus
              placeholder="Search by username…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full h-10 pl-9 pr-3 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line)] text-sm focus:outline-none focus:border-[var(--color-line-strong)]"
            />
          </div>

          <div className="min-h-[140px] max-h-[260px] overflow-y-auto">
            {searching && (
              <div className="flex justify-center py-6">
                <Loader2 size={16} className="animate-spin text-[var(--color-fg-mute)]" />
              </div>
            )}
            {!searching && query.trim().length < 2 && (
              <p className="text-xs text-[var(--color-fg-mute)] text-center py-6">
                Type at least 2 letters to search.
              </p>
            )}
            {!searching && query.trim().length >= 2 && results.length === 0 && (
              <p className="text-xs text-[var(--color-fg-mute)] text-center py-6">
                No users found.
              </p>
            )}
            <ul className="space-y-1">
              {results.map((u) => (
                <li key={u.userId}>
                  <button
                    type="button"
                    onClick={() => handlePick(u)}
                    disabled={sendingId !== null}
                    className="w-full px-3 py-2 rounded-md bg-[var(--color-surface-1)] border border-[var(--color-line)] hover:bg-[var(--color-surface-2)] hover:border-[var(--color-line-strong)] flex items-center gap-2 text-left transition-colors"
                  >
                    <span className="text-sm flex-1 truncate">{u.username}</span>
                    {sendingId === u.userId ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Send size={12} className="text-[var(--color-accent-fg)]" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <footer className="p-5 pt-2">
          <Button fullWidth size="sm" onClick={onClose}>
            Done
          </Button>
        </footer>
      </div>
    </div>
  )
}
