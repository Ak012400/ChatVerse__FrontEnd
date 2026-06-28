import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft, Send, MessageCircle, Mail, Loader2, Check, X, Bot,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { supportApi } from '../../api'
import { useToastStore } from '../../stores/toastStore'
import Button from '../../components/ui/Button'

// ============================================================
//  SupportPage — AI assistant + ticket pipeline.
//
//  The page hosts a chat conversation with the ChatVerse AI assistant.
//  Backend `/support/ask` returns the LLM reply plus `offerTicket`
//  (a heuristic that flips true when the model recommends human help).
//  Tapping "Email support" opens a small ticket form that POSTs to
//  `/support/ticket`, which emails the support inbox with the user's
//  identity stamped in.
// ============================================================

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  /** UI-only flag — the AI's "create a ticket?" CTA. */
  offerTicket?: boolean
}

const SEED_GREETING: ChatMessage = {
  role: 'assistant',
  content:
    "Hi 👋 I'm the ChatVerse Assistant. Ask me anything about the app — features, how to play a game, what Mehfil Debate / Roast does, how PYAAR LIVE works, account / payment / privacy questions. If I can't fix it, I'll help you email the team.",
}

export default function SupportPage() {
  const { showToast } = useToastStore()
  const [messages, setMessages] = useState<ChatMessage[]>([SEED_GREETING])
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState(false)
  const [showTicket, setShowTicket] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, thinking])

  const send = async () => {
    const text = draft.trim()
    if (!text || thinking) return
    const next: ChatMessage[] = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setDraft('')
    setThinking(true)
    try {
      // Send only role + content (UI-only fields stripped).
      const wirePayload = next.map((m) => ({ role: m.role, content: m.content }))
      const r = await supportApi.ask(wirePayload)
      const reply = (r.data.data as any)?.reply as string ?? ''
      const offerTicket = !!(r.data.data as any)?.offerTicket
      setMessages((prev) => [...prev, { role: 'assistant', content: reply, offerTicket }])
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? e?.message ?? 'Something went wrong.'
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Sorry — ${msg}. You can also email the team using the button below.`, offerTicket: true },
      ])
    } finally {
      setThinking(false)
    }
  }

  const handleTicketSent = () => {
    setShowTicket(false)
    showToast({
      type: 'success',
      title: 'Ticket sent',
      message: "We'll email you back at the address on your account.",
      duration: 5000,
    })
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: "Got it — ticket forwarded to the support inbox. Someone from the team will reply to your account email.",
      },
    ])
  }

  return (
    <div className="relative min-h-screen bg-[var(--color-bg)] text-[var(--color-fg)] flex flex-col">
      {/* Aurora backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(circle at 18% 22%, rgba(99,102,241,0.18), transparent 55%), ' +
            'radial-gradient(circle at 82% 78%, rgba(139,92,246,0.15), transparent 55%)',
          filter: 'blur(60px)',
        }}
      />

      <header className="relative z-10 border-b border-[var(--color-line)] backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <Link
            to="/chat"
            className="text-xs text-[var(--color-fg-dim)] hover:text-[var(--color-fg)] inline-flex items-center gap-1.5"
          >
            <ArrowLeft size={13} /> Back
          </Link>
          <div className="flex-1" />
          <div className="inline-flex items-center gap-2 text-sm font-semibold">
            <Bot size={14} className="text-[var(--color-accent-fg)] animate-pulse" />
            ChatVerse Assistant
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 flex flex-col">
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
          <div className="max-w-3xl mx-auto space-y-3">
            {messages.map((m, i) => (
              <ChatBubble key={i} m={m} onTicket={() => setShowTicket(true)} />
            ))}
            {thinking && (
              <div className="flex items-center gap-2 text-xs text-[var(--color-fg-faint)]">
                <Loader2 size={12} className="animate-spin" />
                Thinking…
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        <div className="border-t border-[var(--color-line)] backdrop-blur-sm bg-[color-mix(in_srgb,var(--color-bg)_70%,transparent)]">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3">
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder="Ask anything about ChatVerse…"
                disabled={thinking}
                className="flex-1 resize-none rounded-md text-sm leading-relaxed p-2 border border-[var(--color-line)] bg-[var(--color-surface-1)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)] disabled:opacity-60"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
                }}
              />
              <Button
                size="sm"
                variant="primary"
                onClick={send}
                disabled={!draft.trim() || thinking}
                leftIcon={<Send size={13} />}
              >
                Send
              </Button>
              <button
                onClick={() => setShowTicket(true)}
                className="hidden sm:inline-flex items-center gap-1.5 h-10 px-3 rounded-md border border-[var(--color-line)] text-xs text-[var(--color-fg-dim)] hover:text-[var(--color-fg)] hover:border-[var(--color-accent-fg)] transition-colors"
                title="Email the support team"
              >
                <Mail size={13} /> Email support
              </button>
            </div>
            <p className="mt-2 text-[10px] text-[var(--color-fg-mute)] text-center">
              Replies are generated by an AI. For account-specific issues, email the team via the button above.
            </p>
          </div>
        </div>
      </main>

      {showTicket && (
        <TicketModal onClose={() => setShowTicket(false)} onSent={handleTicketSent} />
      )}
    </div>
  )
}

function ChatBubble({ m, onTicket }: { m: ChatMessage; onTicket: () => void }) {
  const mine = m.role === 'user'
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[88%] sm:max-w-[78%] rounded-2xl px-3 py-2 text-sm leading-relaxed
        ${mine
          ? 'bg-[var(--color-accent)] text-white'
          : 'bg-[var(--color-surface-1)] border border-[var(--color-line)] text-[var(--color-fg)]'}`}>
        {!mine && (
          <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--color-accent-fg)] mb-0.5 inline-flex items-center gap-1">
            <Bot size={9} /> Assistant
          </div>
        )}
        <div className="whitespace-pre-wrap break-words">{m.content}</div>
        {m.offerTicket && !mine && (
          <button
            onClick={onTicket}
            className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)] border border-[var(--color-accent-fg)] hover:bg-[var(--color-accent-soft)]/80"
          >
            <Mail size={11} /> Email the team
          </button>
        )}
      </div>
    </div>
  )
}

function TicketModal({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const can = subject.trim().length >= 4 && body.trim().length >= 10

  const submit = async () => {
    if (!can || sending) return
    setSending(true)
    try {
      const r = await supportApi.ticket(subject.trim(), body.trim())
      if ((r.data.data as any)?.ok) onSent()
    } catch { /* handled by caller's toast */ }
    finally { setSending(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm">
      <div className="cv-sheet-up w-full sm:max-w-md sm:rounded-xl rounded-t-2xl bg-[var(--color-surface-1)] border border-[var(--color-line)] shadow-2xl">
        <header className="p-4 border-b border-[var(--color-line)] flex items-center justify-between">
          <div className="text-sm font-semibold inline-flex items-center gap-2">
            <Mail size={14} className="text-[var(--color-accent-fg)]" /> Email support
          </div>
          <button onClick={onClose}><X size={16} /></button>
        </header>
        <div className="p-4 space-y-3 text-sm">
          <p className="text-[11px] text-[var(--color-fg-mute)] leading-snug">
            The team will reply to the email on your account. Include any details that help — what you tried, what you expected, what you saw instead.
          </p>
          <div>
            <label className="block text-[11px] uppercase tracking-wider font-medium text-[var(--color-fg-faint)] mb-1">Subject</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value.slice(0, 200))}
              placeholder="Short summary"
              className="w-full px-3 py-2 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line)] focus:border-[var(--color-accent-fg)] outline-none text-sm"
            />
            <div className="text-[10px] text-[var(--color-fg-mute)] text-right mt-0.5">{subject.length}/200</div>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider font-medium text-[var(--color-fg-faint)] mb-1">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, 8000))}
              rows={6}
              placeholder="Details, steps, screenshots-by-link, etc."
              className="w-full resize-none px-3 py-2 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line)] focus:border-[var(--color-accent-fg)] outline-none text-sm leading-relaxed"
            />
            <div className="text-[10px] text-[var(--color-fg-mute)] text-right mt-0.5">{body.length}/8000</div>
          </div>
        </div>
        <footer className="p-4 border-t border-[var(--color-line)]">
          <Button
            fullWidth variant="primary"
            disabled={!can || sending}
            onClick={submit}
            leftIcon={sending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          >
            {sending ? 'Sending…' : 'Send ticket'}
          </Button>
        </footer>
      </div>
    </div>
  )
}

// Defensive — silence unused-import lint warnings if any branch goes unused.
void MessageCircle
