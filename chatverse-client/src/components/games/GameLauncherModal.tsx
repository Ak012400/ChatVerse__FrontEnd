import { useState } from 'react'
import { X, Brain, Sparkles, Laugh, Loader2, Globe, Lock, Crown, Dices } from 'lucide-react'
import { gamesApi } from '../../api'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import Button from '../ui/Button'
import Input from '../ui/Input'
import type {
  CreateGameRoomRequest, GameType, QuizCategory, QuizDifficulty,
} from '../../types/games'

// ============================================================
//  GameLauncherModal — quick-start picker for embedded play.
//
//  Surfaces from ChatPage's "Start Game" header button. The chat
//  room itself isn't a game session — this modal lets the user
//  spin up a real Quiz / Trivia room from the chat context, then
//  the parent embeds the resulting room id alongside the chat
//  thread so participants stay in the same conversation while
//  playing.
//
//  Why 2 presets instead of the full form?
//    The GamingHallPage already exposes every dial. Here we want
//    one tap, one decision: casual or hard. Power users who need
//    custom categories can still go to /games directly.
// ============================================================

type GamePreset = 'quiz' | 'trivia' | 'jokes' | 'chess' | 'ludo'

interface PresetConfig {
  id: GamePreset
  /** Backend game type — Quiz preset and Trivia preset both send
   *  `Quiz` to the API (Trivia is just a difficulty/timing variant).
   *  Jokes preset sends `Jokes` which routes to JokesSession. */
  gameType: GameType
  title: string
  subtitle: string
  category: QuizCategory
  difficulty: QuizDifficulty
  questionCount: number
  secondsPerQuestion: number
  maxPlayers: number
  icon: React.ReactNode
  iconBg: string
}

const PRESETS: PresetConfig[] = [
  {
    id: 'quiz',
    gameType: 'Quiz',
    title: 'Casual Quiz',
    subtitle: '10 questions · 15s each · any category, any difficulty',
    category: 'Any',
    difficulty: 'Any',
    questionCount: 10,
    secondsPerQuestion: 15,
    maxPlayers: 6,
    icon: <Brain size={20} />,
    iconBg: 'bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)]',
  },
  {
    id: 'trivia',
    gameType: 'Quiz',
    title: 'Hard Trivia',
    subtitle: '10 questions · 10s each · hard difficulty — for the brave',
    category: 'Any',
    difficulty: 'Hard',
    questionCount: 10,
    secondsPerQuestion: 10,
    maxPlayers: 6,
    icon: <Sparkles size={20} />,
    iconBg: 'bg-[var(--color-warning-soft)] text-[var(--color-warning-fg)]',
  },
  {
    id: 'jokes',
    gameType: 'Jokes',
    title: 'Jokes Roast',
    subtitle: '10 jokes · 30s each · react with emoji, no scoring',
    // category/difficulty unused by Jokes backend but the field is
    // required by the shared QuizSettings shape. "Any" is harmless.
    category: 'Any',
    difficulty: 'Any',
    questionCount: 10,
    secondsPerQuestion: 30,
    maxPlayers: 8,
    icon: <Laugh size={20} />,
    iconBg: 'bg-[var(--color-success-soft)] text-[var(--color-success-fg)]',
  },
  {
    id: 'chess',
    gameType: 'Chess',
    title: 'Chess',
    subtitle: '2 players · no time limit · opens in a separate room',
    // Chess ignores category/difficulty/questionCount/seconds entirely,
    // but the shared CreateGameRoomRequest validation enforces ranges
    // for ALL game types. Sending dummy in-range values keeps the
    // controller happy without a backend special-case.
    //   - questionCount must be 5-20
    //   - secondsPerQuestion must be 10-30
    category: 'Any',
    difficulty: 'Any',
    questionCount: 10,
    secondsPerQuestion: 15,
    maxPlayers: 2,
    icon: <Crown size={20} />,
    iconBg: 'bg-[var(--color-surface-2)] text-[var(--color-fg-dim)]',
  },
  {
    id: 'ludo',
    gameType: 'Ludo',
    title: 'Ludo',
    subtitle: '2-4 players · host assigns seats · 30s turns',
    // Same dummy-value trick as Chess — Ludo ignores quiz settings
    // but the shared request validation enforces ranges for all types.
    category: 'Any',
    difficulty: 'Any',
    questionCount: 10,
    secondsPerQuestion: 15,
    maxPlayers: 4,
    icon: <Dices size={20} />,
    iconBg: 'bg-[var(--color-warning-soft)] text-[var(--color-warning-fg)]',
  },
]

interface Props {
  /** Opening flag — parent owns the visibility state. */
  open: boolean
  onClose: () => void
  /** Called with the freshly-created room slug + game type after a
   *  successful create. Parent uses the type to decide between inline
   *  embed (Quiz/Jokes) vs full-screen overlay route (Chess/Ludo). */
  onCreated: (slug: string, gameType: GameType) => void
  /** Optional default room name — typically the chat room's display
   *  name so the new game inherits the context (e.g. "Gaming Lounge
   *  quiz" instead of an empty default). */
  defaultName?: string
  /** Source chat slug — when present, the room is tagged so it shows
   *  up in that chat's Active Games panel for the rest of the members
   *  (when Public). Null/undefined = standalone (from /games page). */
  sourceChatSlug?: string
}

export default function GameLauncherModal({
  open, onClose, onCreated, defaultName, sourceChatSlug,
}: Props) {
  const { showToast } = useToastStore()
  const me = useAuthStore((s) => s.user)
  const isGuest = !!me?.isGuest
  const [name, setName] = useState(defaultName ?? '')
  const [selected, setSelected] = useState<GamePreset>('quiz')
  const [submitting, setSubmitting] = useState(false)
  // Visibility default = public when the modal is launched from inside
  // a chat (so other chat members see it), otherwise private. Users
  // can toggle either way before clicking Launch.
  const [isPublic, setIsPublic] = useState<boolean>(!!sourceChatSlug)

  if (!open) return null

  const preset = PRESETS.find((p) => p.id === selected)!

  const handleLaunch = async () => {
    const trimmed = (name.trim() || defaultName || 'Quick game').slice(0, 40)
    setSubmitting(true)
    try {
      const req: CreateGameRoomRequest = {
        name: trimmed,
        type: preset.gameType, // Quiz or Jokes — routed by GameSessionRegistry
        maxPlayers: preset.maxPlayers,
        category: preset.category,
        difficulty: preset.difficulty,
        questionCount: preset.questionCount,
        secondsPerQuestion: preset.secondsPerQuestion,
        isPublic,
        sourceChatSlug,
        // Quiz v2: new quiz/trivia rooms use buzzer scoring — first
        // correct answer gets the point. Jokes/Chess ignore the field;
        // old rooms keep Speed mode (backend default).
        scoringMode: preset.gameType === 'Quiz' ? 'FirstCorrect' : undefined,
      }
      const res = await gamesApi.create(req)
      const slug = res.data.data.slug
      // Chess opens a dedicated full-screen overlay page rather than
      // embedding inline (board needs much more space + own chat rail).
      // Caller distinguishes via the preset they picked.
      onCreated(slug, preset.gameType)
      // Reset for next use
      setName(defaultName ?? '')
    } catch (err: any) {
      showToast({
        type: 'danger',
        title: 'Could not start game',
        message: err.response?.data?.error ?? 'Try again.',
        duration: 3000,
      })
    } finally {
      setSubmitting(false)
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
          <h2 className="text-sm font-medium">Start a game</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--color-fg-mute)] hover:text-[var(--color-fg-dim)] transition-colors"
          >
            <X size={16} />
          </button>
        </header>

        <div className="p-5 space-y-4">
          <Input
            label="Room name"
            placeholder={defaultName ?? 'Friday night fun'}
            value={name}
            onChange={(e) => setName(e.target.value)}
            hint="Visible to everyone who joins. 40 chars max."
            maxLength={40}
            autoFocus
          />

          {/* Visibility toggle — only meaningful when launched from inside
              a chat room. For standalone /games-page creates there's no
              chat to be public in, so we hide the toggle entirely. */}
          {sourceChatSlug && (
            <div>
              <p className="text-xs text-[var(--color-fg-dim)] mb-2">Visibility</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsPublic(true)}
                  className={[
                    'p-3 rounded-md border text-left transition-all',
                    isPublic
                      ? 'bg-[var(--color-accent-soft)] border-[var(--color-accent-fg)]'
                      : 'bg-[var(--color-surface-1)] border-[var(--color-line)] hover:border-[var(--color-line-strong)]',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Globe size={14} className="text-[var(--color-accent-fg)]" />
                    <span className="text-sm font-medium">Public</span>
                  </div>
                  <p className="text-[10px] text-[var(--color-fg-mute)]">
                    Visible to everyone in this chat
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPublic(false)}
                  className={[
                    'p-3 rounded-md border text-left transition-all',
                    !isPublic
                      ? 'bg-[var(--color-warning-soft)] border-[var(--color-warning-border)]'
                      : 'bg-[var(--color-surface-1)] border-[var(--color-line)] hover:border-[var(--color-line-strong)]',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Lock size={14} className="text-[var(--color-warning-fg)]" />
                    <span className="text-sm font-medium">Private</span>
                  </div>
                  <p className="text-[10px] text-[var(--color-fg-mute)]">
                    Share the URL to invite
                  </p>
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs text-[var(--color-fg-dim)]">Pick a mode</p>
            {PRESETS.map((p) => {
              const isActive = p.id === selected
              // Chess hosting requires a signed-in account so the room
              // has a real identity for the seat/invite/end flows.
              // Guests can still JOIN a chess/ludo room someone else
              // created — this gate only blocks hosting.
              const blockedForGuest = isGuest &&
                (p.gameType === 'Chess' || p.gameType === 'Ludo')
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => !blockedForGuest && setSelected(p.id)}
                  disabled={blockedForGuest}
                  title={blockedForGuest ? 'Sign in to host a chess room' : undefined}
                  className={[
                    'w-full text-left p-3 rounded-md border transition-all',
                    isActive
                      ? 'bg-[var(--color-accent-soft)] border-[var(--color-accent-fg)]'
                      : 'bg-[var(--color-surface-1)] border-[var(--color-line)] hover:border-[var(--color-line-strong)]',
                    blockedForGuest ? 'opacity-50 cursor-not-allowed hover:border-[var(--color-line)]' : '',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${p.iconBg}`}>
                      {p.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{p.title}</p>
                      <p className="text-[11px] text-[var(--color-fg-mute)] leading-snug">
                        {p.subtitle}
                      </p>
                    </div>
                    <span
                      className={[
                        'w-3.5 h-3.5 rounded-full border-2 shrink-0',
                        isActive
                          ? 'border-[var(--color-accent-fg)] bg-[var(--color-accent)]'
                          : 'border-[var(--color-line-strong)]',
                      ].join(' ')}
                    />
                  </div>
                </button>
              )
            })}
          </div>
          {isGuest && (
            <p className="text-[10px] text-[var(--color-fg-mute)] italic mt-1.5">
              Guests can join any live chess room as a spectator + chat.
              <a href="/register" className="ml-1 text-[var(--color-accent-fg)] hover:underline font-medium">
                Sign up to host
              </a>
            </p>
          )}
        </div>

        <footer className="p-5 pt-2 flex items-center gap-2">
          <Button
            fullWidth
            size="lg"
            onClick={handleLaunch}
            disabled={submitting}
            leftIcon={submitting ? <Loader2 size={15} className="animate-spin" /> : null}
          >
            {submitting ? 'Creating room…' : 'Launch'}
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-[var(--color-fg-mute)] hover:text-[var(--color-fg-dim)] px-3"
          >
            Cancel
          </button>
        </footer>
      </div>
    </div>
  )
}
