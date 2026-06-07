import { X, MessageCircleQuestion, Lightbulb } from 'lucide-react'
import type { AmbientQuestion } from '../../types/games'

// ============================================================
//  AmbientQuestionCard — the ambient trivia/prompt card that
//  appears at the top of gameable chat rooms.
//
//  Behaviour:
//   • MCQ mode      — 4 option buttons. Tapping seeds a chat
//                      reply ("I'd go with B: <option>"). The
//                      parent (ChatPage) actually sends it via
//                      sendMessage; we just hand back the text.
//   • Discussion    — open prompt with a "Reply in chat ↓" cue.
//                      No buttons, just spark the conversation.
//
//  Dismissing only hides for the current user (local store
//  state). The next emission replaces it for everyone anyway,
//  so we don't bother round-tripping a dismissal.
// ============================================================

interface Props {
  question: AmbientQuestion
  /** Called when the user picks an MCQ option — the parent sends
   *  the seeded reply through the chat hub. */
  onSeedReply: (text: string) => void
  /** Called when the user clicks the X. Hides the card locally. */
  onDismiss: () => void
}

export default function AmbientQuestionCard({
  question, onSeedReply, onDismiss,
}: Props) {
  const isMcq = question.mode === 'Mcq' && question.options && question.options.length > 0

  const seed = (idx: number) => {
    const opt = question.options?.[idx]
    if (!opt) return
    const letter = String.fromCharCode(65 + idx)
    onSeedReply(`Going with ${letter}: ${opt} — anyone else?`)
  }

  return (
    <div className="mx-4 my-3 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-1)] overflow-hidden">
      {/* Header strip */}
      <div className="px-3 py-1.5 flex items-center gap-2 border-b border-[var(--color-line)] bg-[var(--color-surface-2)]">
        {isMcq ? (
          <MessageCircleQuestion size={11} className="text-[var(--color-accent-fg)]" />
        ) : (
          <Lightbulb size={11} className="text-[var(--color-warning-fg)]" />
        )}
        <span className="text-[10px] uppercase tracking-wide text-[var(--color-fg-mute)]">
          {isMcq ? 'Quick trivia' : 'Conversation starter'} · {question.category}
        </span>
        <button
          onClick={onDismiss}
          className="ml-auto text-[var(--color-fg-mute)] hover:text-[var(--color-fg-dim)] transition-colors"
          aria-label="Dismiss for me"
          title="Hide for me (others still see it)"
        >
          <X size={12} />
        </button>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        <p className="text-sm leading-snug font-medium">
          {question.text}
        </p>

        {isMcq && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-3">
            {question.options!.map((opt, idx) => (
              <button
                key={idx}
                onClick={() => seed(idx)}
                className="text-left text-xs px-2.5 py-1.5 rounded-md bg-[var(--color-bg)] border border-[var(--color-line)] hover:bg-[var(--color-surface-2)] hover:border-[var(--color-line-strong)] transition-colors"
              >
                <span className="text-[var(--color-fg-mute)] font-semibold mr-1.5">
                  {String.fromCharCode(65 + idx)}.
                </span>
                {opt}
              </button>
            ))}
          </div>
        )}

        {!isMcq && (
          <p className="text-[11px] text-[var(--color-fg-mute)] italic mt-2">
            Reply in chat ↓ — no wrong answer.
          </p>
        )}
      </div>
    </div>
  )
}
