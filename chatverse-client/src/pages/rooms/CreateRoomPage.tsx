import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Plus, Hash, Copy, Check, AlertCircle, ExternalLink,
} from 'lucide-react'

import { roomsApi } from '../../api'
import { useChatStore } from '../../stores/chatStore'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Card from '../../components/ui/Card'

const CATEGORIES = ['general', 'gaming', 'tech', 'music', 'random'] as const

export default function CreateRoomPage() {
  const navigate = useNavigate()
  const setRooms = useChatStore((s) => s.setRooms)
  const rooms = useChatStore((s) => s.rooms)

  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<string>('general')
  const [iconEmoji, setIconEmoji] = useState('💬')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ slug: string; inviteUrl: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (displayName.trim().length < 3) {
      setError('Room name must be at least 3 characters.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await roomsApi.create({
        displayName: displayName.trim(),
        description: description.trim() || undefined,
        category,
        iconEmoji,
      })
      const data = res.data.data
      setResult({ slug: data.slug, inviteUrl: data.inviteUrl })
      // Prepend to the sidebar list so the user sees it immediately.
      setRooms([
        {
          slug: data.slug,
          displayName: data.displayName,
          description: data.description ?? '',
          category: data.category,
          iconEmoji: data.iconEmoji,
          activeNow: 0,
          totalMessages: 0,
        },
        ...rooms,
      ])
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Could not create the room.')
    } finally {
      setLoading(false)
    }
  }

  const copyInvite = async () => {
    if (!result) return
    const fullUrl = `${window.location.origin}${result.inviteUrl}`
    try {
      await navigator.clipboard.writeText(fullUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  if (result) {
    return (
      <div className="h-full overflow-y-auto bg-[var(--color-bg)] text-[var(--color-fg)]">
        <div className="max-w-md mx-auto px-6 py-10">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[var(--color-success-soft)] border border-[rgba(34,197,94,0.3)] text-[#86efac] mb-4">
              <Check size={20} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight mb-1">Room created</h1>
            <p className="text-sm text-[var(--color-fg-faint)]">
              Share the link to invite others.
            </p>
          </div>

          <Card padding="lg" className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Hash size={14} className="text-[var(--color-fg-faint)]" />
              <span className="font-mono text-[var(--color-fg-dim)]">{result.slug}</span>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-fg-faint)] mb-1.5">
                Invite link
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 px-2.5 h-9 inline-flex items-center text-[11px] rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line)] overflow-x-auto whitespace-nowrap">
                  {window.location.origin}{result.inviteUrl}
                </code>
                <button
                  onClick={copyInvite}
                  className="h-9 px-2.5 rounded-md bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] border border-[var(--color-line)] text-[var(--color-fg-dim)] hover:text-[var(--color-fg)] inline-flex items-center gap-1 transition-colors"
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  <span className="text-xs">{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          </Card>

          <Button
            fullWidth
            size="lg"
            className="mt-5"
            rightIcon={<ExternalLink size={15} />}
            onClick={() => navigate(`/chat/${result.slug}`)}
          >
            Open room
          </Button>

          <button
            onClick={() => navigate('/chat')}
            className="block mx-auto mt-4 text-xs text-[var(--color-fg-mute)] hover:text-[var(--color-fg-dim)] transition-colors"
          >
            ← Back to rooms
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-[var(--color-bg)] text-[var(--color-fg)]">
      <div className="max-w-md mx-auto px-6 py-10">
        <button
          onClick={() => navigate('/chat')}
          className="inline-flex items-center gap-1.5 text-xs text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] mb-6 transition-colors"
        >
          <ArrowLeft size={13} />
          Back to rooms
        </button>

        <div className="mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[var(--color-accent-soft)] border border-[rgba(99,102,241,0.3)] mb-4">
            <Plus size={20} className="text-[var(--color-accent-fg)]" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Create a room</h1>
          <p className="text-sm text-[var(--color-fg-faint)] mt-1">
            Spin up a chat space and share the invite link.
          </p>
        </div>

        <Card padding="lg">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Room name"
              placeholder="Friday late night"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />

            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-fg-faint)] mb-1.5">
                Icon
              </p>
              <div className="flex gap-2 flex-wrap">
                {['💬', '🎮', '🎵', '💻', '🎲', '🍿', '⚽️', '☕️'].map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setIconEmoji(e)}
                    className={`w-9 h-9 rounded-md text-base inline-flex items-center justify-center transition-colors
                      ${
                        iconEmoji === e
                          ? 'bg-[var(--color-accent-soft)] border border-[rgba(99,102,241,0.4)]'
                          : 'bg-[var(--color-surface-2)] border border-[var(--color-line)] hover:bg-[var(--color-surface-3)]'
                      }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            <Input
              label="Description (optional)"
              placeholder="What's this room about?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-fg-faint)] mb-1.5">
                Category
              </p>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={`px-2.5 h-7 rounded-full text-xs font-medium border transition-colors
                      ${
                        category === c
                          ? 'bg-[var(--color-accent-soft)] border-[rgba(99,102,241,0.4)] text-[var(--color-accent-fg)]'
                          : 'bg-[var(--color-surface-2)] border-[var(--color-line)] text-[var(--color-fg-dim)] hover:bg-[var(--color-surface-3)]'
                      }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-[var(--color-danger-soft)] border border-[rgba(239,68,68,0.3)] text-[#fca5a5] text-xs">
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" fullWidth size="lg" loading={loading}>
              {loading ? 'Creating…' : 'Create room'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
