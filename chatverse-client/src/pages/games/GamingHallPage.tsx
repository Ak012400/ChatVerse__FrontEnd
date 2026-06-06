import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Gamepad2, Plus, Users, Eye, RefreshCw, Brain, Loader2,
  ArrowRight, Trophy,
} from 'lucide-react'
import { gamesApi } from '../../api'
import { useToastStore } from '../../stores/toastStore'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Badge from '../../components/ui/Badge'
import type {
  CreateGameRoomRequest, GameRoomDto,
  QuizCategory, QuizDifficulty,
} from '../../types/games'

// ============================================================
//  GamingHallPage — entry to the Gaming Hall.
//
//  Two modes:
//    'list'   — browse + join active rooms (default)
//    'create' — host configures a new room
//
//  Why a single page with mode-switching instead of two routes?
//    The list is short-lived (rooms come and go), so a back/forward
//    navigation between Hall → CreateForm would feel jarring. Keeping
//    them on one screen lets users glance at the live room list while
//    deciding their settings.
// ============================================================

type Mode = 'list' | 'create'

const CATEGORIES: QuizCategory[] = [
  'Any', 'General', 'Books', 'Film', 'Music', 'Sports',
  'Geography', 'History', 'Politics', 'Science',
  'Computers', 'Mythology', 'Animals',
]
const DIFFICULTIES: QuizDifficulty[] = ['Any', 'Easy', 'Medium', 'Hard']

export default function GamingHallPage() {
  const navigate = useNavigate()
  const { showToast } = useToastStore()
  const [mode, setMode] = useState<Mode>('list')
  const [rooms, setRooms] = useState<GameRoomDto[]>([])
  const [loading, setLoading] = useState(false)

  const loadRooms = async () => {
    setLoading(true)
    try {
      const res = await gamesApi.listActive()
      setRooms(res.data.data ?? [])
    } catch {
      showToast({
        type: 'danger',
        title: 'Could not load rooms',
        message: 'Check your connection and retry.',
        duration: 3000,
      })
    } finally {
      setLoading(false)
    }
  }

  // Initial fetch + auto-refresh every 10s. Rooms list is small and
  // ListActiveAsync is cheap (Redis-only on the backend) so this poll
  // is well within the budget. Tightens to 3s only while empty.
  useEffect(() => {
    loadRooms()
    const interval = setInterval(loadRooms, rooms.length === 0 ? 5000 : 10000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms.length === 0])

  return (
    <div className="h-full overflow-y-auto bg-[var(--color-bg)] text-[var(--color-fg)]">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <header className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--color-surface-1)] border border-[var(--color-line)] mb-4">
            <Gamepad2 size={22} className="text-[var(--color-accent-fg)]" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Gaming Hall</h1>
          <p className="text-sm text-[var(--color-fg-faint)] mt-1">
            Play live quiz rooms with friends or strangers. Spectators welcome.
          </p>
        </header>

        {mode === 'list' && (
          <ListView
            rooms={rooms}
            loading={loading}
            onRefresh={loadRooms}
            onCreate={() => setMode('create')}
            onJoinRoom={(slug) => navigate(`/games/${slug}`)}
          />
        )}

        {mode === 'create' && (
          <CreateForm
            onCancel={() => setMode('list')}
            onCreated={(slug) => navigate(`/games/${slug}`)}
          />
        )}
      </div>
    </div>
  )
}

// ============================================================
//  ListView — active room cards + "Create" CTA
// ============================================================

function ListView({
  rooms, loading, onRefresh, onCreate, onJoinRoom,
}: {
  rooms: GameRoomDto[]
  loading: boolean
  onRefresh: () => void
  onCreate: () => void
  onJoinRoom: (slug: string) => void
}) {
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium">Live rooms</h2>
          {rooms.length > 0 && (
            <Badge tone="success" size="sm" dot>{rooms.length}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="text-xs text-[var(--color-fg-mute)] hover:text-[var(--color-fg-dim)] flex items-center gap-1 transition-colors"
            aria-label="Refresh"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <Button size="sm" leftIcon={<Plus size={14} />} onClick={onCreate}>
            New room
          </Button>
        </div>
      </div>

      {loading && rooms.length === 0 && (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={20} className="animate-spin text-[var(--color-fg-mute)]" />
        </div>
      )}

      {!loading && rooms.length === 0 && (
        <div className="text-center py-16 bg-[var(--color-surface-1)] border border-[var(--color-line)] rounded-md">
          <Brain size={28} className="mx-auto text-[var(--color-fg-mute)] mb-3" />
          <p className="text-sm font-medium">No active rooms yet</p>
          <p className="text-xs text-[var(--color-fg-mute)] mt-1 mb-4">
            Be the first to host one.
          </p>
          <Button size="sm" leftIcon={<Plus size={14} />} onClick={onCreate}>
            Create a quiz room
          </Button>
        </div>
      )}

      {rooms.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {rooms.map((r) => <RoomCard key={r.slug} room={r} onJoin={onJoinRoom} />)}
        </div>
      )}
    </>
  )
}

function RoomCard({ room, onJoin }: { room: GameRoomDto; onJoin: (slug: string) => void }) {
  const isLobby = room.status === 'Lobby'
  const isPlaying = room.status === 'Playing'
  const playersFull = room.playerCount >= room.maxPlayers
  const joinHint = playersFull
    ? 'Spectate live'
    : isPlaying
      ? 'Watch & comment'
      : 'Join the lobby'

  return (
    <button
      onClick={() => onJoin(room.slug)}
      className="text-left p-4 rounded-md bg-[var(--color-surface-1)] border border-[var(--color-line)] hover:bg-[var(--color-surface-2)] hover:border-[var(--color-line-strong)] transition-colors group"
    >
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-md bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)] flex items-center justify-center shrink-0">
          <Brain size={18} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-medium truncate">{room.name}</p>
            {isPlaying && <Badge tone="warning" size="sm" dot>Live</Badge>}
            {isLobby && <Badge tone="accent" size="sm">Lobby</Badge>}
          </div>
          <p className="text-xs text-[var(--color-fg-faint)] truncate">
            Hosted by {room.hostUsername}
          </p>

          <div className="flex items-center gap-3 mt-2 text-[10px] text-[var(--color-fg-mute)]">
            <span className="flex items-center gap-1">
              <Users size={10} />
              {room.playerCount}/{room.maxPlayers}
            </span>
            <span className="flex items-center gap-1">
              <Eye size={10} />
              {room.spectatorCount}
            </span>
            <span className="ml-auto inline-flex items-center gap-1 text-[var(--color-accent-fg)] opacity-0 group-hover:opacity-100 transition-opacity">
              {joinHint} <ArrowRight size={11} />
            </span>
          </div>
        </div>
      </div>
    </button>
  )
}

// ============================================================
//  CreateForm — host configures a new quiz room
// ============================================================

function CreateForm({
  onCancel, onCreated,
}: {
  onCancel: () => void
  onCreated: (slug: string) => void
}) {
  const { showToast } = useToastStore()
  const [submitting, setSubmitting] = useState(false)

  // Defaults reflect Phase 1 spec: 10 Q's × 15s, any category, easy/medium.
  const [name, setName] = useState('')
  const [category, setCategory] = useState<QuizCategory>('Any')
  const [difficulty, setDifficulty] = useState<QuizDifficulty>('Any')
  const [questionCount, setQuestionCount] = useState(10)
  const [secondsPerQuestion, setSecondsPerQuestion] = useState(15)
  const [maxPlayers, setMaxPlayers] = useState(4)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      showToast({ type: 'warning', title: 'Name required', message: 'Give your room a name.', duration: 2000 })
      return
    }

    setSubmitting(true)
    try {
      const req: CreateGameRoomRequest = {
        name: name.trim(),
        type: 'Quiz',
        maxPlayers,
        category,
        difficulty,
        questionCount,
        secondsPerQuestion,
      }
      const res = await gamesApi.create(req)
      onCreated(res.data.data.slug)
    } catch (err: any) {
      showToast({
        type: 'danger',
        title: 'Failed to create',
        message: err.response?.data?.error ?? 'Try again.',
        duration: 3000,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-[var(--color-surface-1)] border border-[var(--color-line)] rounded-md p-5 space-y-4"
    >
      <div className="flex items-center gap-2">
        <Trophy size={16} className="text-[var(--color-accent-fg)]" />
        <h2 className="text-sm font-medium">New Quiz room</h2>
      </div>

      <Input
        label="Room name"
        placeholder="Friday quiz night"
        value={name}
        onChange={(e) => setName(e.target.value)}
        hint="Up to 40 characters. A short suffix is appended for uniqueness."
        maxLength={40}
        autoFocus
      />

      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Category"
          value={category}
          onChange={(v) => setCategory(v as QuizCategory)}
          options={CATEGORIES}
        />
        <SelectField
          label="Difficulty"
          value={difficulty}
          onChange={(v) => setDifficulty(v as QuizDifficulty)}
          options={DIFFICULTIES}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <NumberField
          label="Questions"
          value={questionCount}
          onChange={setQuestionCount}
          min={5}
          max={20}
          hint="5 – 20"
        />
        <NumberField
          label="Sec / Q"
          value={secondsPerQuestion}
          onChange={setSecondsPerQuestion}
          min={10}
          max={30}
          hint="10 – 30"
        />
        <NumberField
          label="Max players"
          value={maxPlayers}
          onChange={setMaxPlayers}
          min={2}
          max={8}
          hint="2 – 8"
        />
      </div>

      <div className="flex items-center gap-2 pt-2">
        <Button
          type="submit"
          size="lg"
          loading={submitting}
          leftIcon={<Plus size={15} />}
          fullWidth
        >
          Create &amp; host
        </Button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-[var(--color-fg-mute)] hover:text-[var(--color-fg-dim)] px-3"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

function SelectField({
  label, value, onChange, options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: readonly string[]
}) {
  return (
    <label className="block">
      <span className="block text-xs text-[var(--color-fg-dim)] mb-1">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[var(--color-surface-2)] border border-[var(--color-line)] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-line-strong)]"
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )
}

function NumberField({
  label, value, onChange, min, max, hint,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  min: number
  max: number
  hint?: string
}) {
  return (
    <label className="block">
      <span className="block text-xs text-[var(--color-fg-dim)] mb-1">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value) || min
          onChange(Math.max(min, Math.min(max, n)))
        }}
        className="w-full bg-[var(--color-surface-2)] border border-[var(--color-line)] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-line-strong)]"
      />
      {hint && <p className="text-[10px] text-[var(--color-fg-mute)] mt-0.5">{hint}</p>}
    </label>
  )
}
