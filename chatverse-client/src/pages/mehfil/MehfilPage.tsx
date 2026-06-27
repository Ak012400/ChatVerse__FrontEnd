import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Mic, BookOpen, Send, Plus, X, Gift, Users, Play, Square, Trash2, BadgeCheck,
} from 'lucide-react'

import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Loader from '../../components/ui/Loader'
import SoundboardTray from '../../components/sound/SoundboardTray'
// Per-template specialisations (per-feature isolation policy).
// Each templateKind that has its own first-class UX gets imported
// here and dispatched below. Generic `RoomDetailView` is the
// fallback for templates without a specialised page.
// Debate v1 was deleted 2026-06-21 — replaced by Debate v2 (StageBracket).
import DebateV2RoomPage from './DebateV2RoomPage'
import RoastRoomPage from './RoastRoomPage'
import GhostRoomPage from './GhostRoomPage'
import OpenMicRoomPage from './OpenMicRoomPage'
import { useToastStore } from '../../stores/toastStore'
import { useMehfilStore } from '../../stores/mehfilStore'
import { useMehfilHub } from '../../hooks/useMehfilHub'
import type { MehfilRoomCard, MehfilTemplate } from '../../types/mehfil'

// ============================================================
//  /mehfil — creator-room platform
//
//  Three views:
//    • Discover — live + upcoming + template filters
//    • My rooms — rooms I host (lifecycle controls)
//    • Open room — drill-in view: chat + audience + tips
// ============================================================

const MAX_MSG = 1000

const TEMPLATE_LABEL: Record<MehfilTemplate, string> = {
  // Locked focus templates — both built on the StageBracket shared backend.
  debate:      'Debate',
  roast:       'Roast',
  // Legacy / pre-existing kinds — labels kept so old rooms still
  // render correctly in Discover.
  dating_show: 'Dating show',
  open_mic:    'Open mic',
  watch_party: 'Watch party',
  game_night:  'Game night',
  podcast:     'Podcast',
  story_circle: 'Story circle',
  trivia:      'Trivia',
  talent_show: 'Talent show',
  networking:  'Networking',
  custom:      'Custom',
}

/// Templates exposed in the room-creation flow. Existing rooms with
/// other templateKinds remain openable via Discover, but the host can
/// only create new rooms in these two flavours going forward.
const CREATE_FLOW_TEMPLATES: MehfilTemplate[] = ['debate', 'roast']

// ── Template palettes — each Mehfil template gets its own colour
//   pair. Wired into the room stage via CSS vars; aurora + bubbles +
//   gift rail all pull from these. Picked so every theme reads as
//   distinct at a glance without leaving the brand-purple universe.
const TEMPLATE_PALETTE: Record<MehfilTemplate, { accent1: string; accent2: string; emoji: string }> = {
  debate:      { accent1: '#f97316', accent2: '#ef4444', emoji: '🔥' },
  roast:       { accent1: '#dc2626', accent2: '#7c3aed', emoji: '💀' },
  dating_show: { accent1: '#f43f5e', accent2: '#ec4899', emoji: '💞' },
  open_mic:    { accent1: '#f59e0b', accent2: '#fbbf24', emoji: '🎤' },
  watch_party: { accent1: '#6366f1', accent2: '#8b5cf6', emoji: '🎬' },
  game_night:  { accent1: '#10b981', accent2: '#06b6d4', emoji: '🎮' },
  podcast:     { accent1: '#3b82f6', accent2: '#8b5cf6', emoji: '🎙' },
  story_circle:{ accent1: '#8b5cf6', accent2: '#a78bfa', emoji: '📖' },
  trivia:      { accent1: '#eab308', accent2: '#f59e0b', emoji: '🧠' },
  talent_show: { accent1: '#d946ef', accent2: '#c026d3', emoji: '✨' },
  networking:  { accent1: '#14b8a6', accent2: '#06b6d4', emoji: '🤝' },
  custom:      { accent1: '#6366f1', accent2: '#8b5cf6', emoji: '🌌' },
}

const GIFT_EMOJI: Record<string, string> = {
  rose:    '🌹',
  bouquet: '💐',
  crown:   '👑',
}

type Tab = 'discover' | 'mine'

export default function MehfilPage() {
  const { showToast } = useToastStore()
  const {
    discoverRooms, templates, gifts, myRooms,
    openRoom, openRoomIAmHost, openRoomMessages, openRoomAttendees, openRoomTips,
    setDiscover, setMyRooms, setOpenRoom, appendMessage,
  } = useMehfilStore()
  const {
    isConnected,
    discover, getRoom, myRooms: invokeMyRooms,
    createRoom, cancelRoom, startRoom, endRoom,
    joinRoom, leaveRoom, sendMessage, tip,
  } = useMehfilHub()

  const [tab, setTab] = useState<Tab>('discover')
  const [filter, setFilter] = useState<'live' | 'upcoming' | 'all'>('all')
  const [templateFilter, setTemplateFilter] = useState<MehfilTemplate | null>(null)
  const [loading, setLoading] = useState(false)
  const [openRoomId, setOpenRoomId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  // Load discover + mine on connect.
  useEffect(() => {
    if (!isConnected) return
    setLoading(true)
    Promise.all([
      discover(templateFilter ? 'template' : filter, templateFilter ?? undefined),
      invokeMyRooms(),
    ])
      .then(([d, m]) => {
        setDiscover(d.rooms, d.templates, d.gifts)
        setMyRooms(m.rooms)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, filter, templateFilter])

  // Load open-room detail when opened.
  //
  // For *debate / roast* rooms hosted by me that are still in 'scheduled'
  // status, automatically flip to 'live' the moment the host opens them.
  // These two templates are designed for on-demand sessions, not pre-
  // scheduled events — without auto-start, room.status stays 'scheduled'
  // and the room never appears in Discover's "Live" filter, and audience
  // members get a degraded UX. Other templates keep the old "wait for
  // the cron at scheduledFor" behaviour.
  useEffect(() => {
    if (!openRoomId || !isConnected) {
      if (!openRoomId) setOpenRoom(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const r = await getRoom(openRoomId)
        if (cancelled) return
        setOpenRoom(r.room, r.iAmHost, r.messages, r.attendees, r.tips)

        const AUTO_START: MehfilTemplate[] = ['debate', 'roast']
        if (
          r.iAmHost &&
          r.room.status === 'scheduled' &&
          AUTO_START.includes(r.room.templateKind)
        ) {
          try {
            const live = await startRoom(r.room.id)
            if (!cancelled) {
              // Merge: keep messages/attendees/tips from the original load;
              // only the room card fields (status, audience, etc.) refresh.
              setOpenRoom(
                { ...r.room, ...live },
                true,
                r.messages, r.attendees, r.tips,
              )
            }
          } catch {
            // Non-fatal — the host can still start the StageBracket round
            // via the in-room "Start now" button. The only thing they
            // lose is automatic visibility in Discover's "Live" filter.
          }
        }
      } catch {
        if (!cancelled) {
          showToast({
            type: 'error', title: 'Couldn\'t load room', message: 'Try again.', duration: 3500,
          })
        }
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRoomId, isConnected])

  const handleSend = async () => {
    if (!openRoom || !draft.trim() || sending) return
    setSending(true)
    try {
      const m = await sendMessage(openRoom.id, draft.trim())
      appendMessage({ ...m, mine: true })
      setDraft('')
    } catch (err: any) {
      showToast({ type: 'error', title: 'Send failed', message: err?.message ?? 'Try again.', duration: 4000 })
    } finally { setSending(false) }
  }

  const handleTip = async (gift: string) => {
    if (!openRoom) return
    try { await tip(openRoom.id, gift) }
    catch (err: any) {
      showToast({ type: 'error', title: 'Tip failed', message: err?.message ?? 'Try again.', duration: 4000 })
    }
  }

  if (openRoomId) {
    // Per-template specialised pages (debate, ghost_date, open_mic,
    // podcast, …) need MUCH more horizontal real-estate than the
    // generic 3xl-constrained card. Render them in a wider canvas with
    // a sticky back-bar so the back affordance stays visible while the
    // user scrolls the stage. Generic templates keep the old layout.
    const isTemplateRoom =
      !!openRoom &&
      ['debate', 'roast', 'ghost_date', 'open_mic', 'podcast'].includes(openRoom.templateKind)

    if (isTemplateRoom) {
      return (
        <div className="h-full overflow-y-auto">
          <div className="sticky top-0 z-30 backdrop-blur-md bg-[color-mix(in_srgb,var(--color-bg)_70%,transparent)] border-b border-[var(--color-line)]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 h-12 flex items-center">
              <button
                onClick={() => setOpenRoomId(null)}
                className="text-xs text-[var(--color-fg-dim)] hover:text-[var(--color-fg)] inline-flex items-center gap-1.5 cv-press"
              >
                <span>←</span> Back to Mehfil
              </button>
            </div>
          </div>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 cv-fade-up">
            {!openRoom
              ? <div className="flex justify-center py-12"><Loader /></div>
              : openRoom.templateKind === 'debate'
                ? <DebateV2RoomPage
                    room={openRoom}
                    iAmHost={openRoomIAmHost}
                    onLeave={async () => {
                      try {
                        await leaveRoom(openRoom.id)
                        setOpenRoomId(null)
                      } catch (err: any) {
                        showToast({ type: 'error', title: 'Leave failed', message: err?.message ?? 'Try again.', duration: 4000 })
                      }
                    }}
                    onEndRoom={async () => {
                      try { const r = await endRoom(openRoom.id); setOpenRoom({ ...openRoom, ...r }, openRoomIAmHost) }
                      catch (err: any) { showToast({ type: 'error', title: 'End failed', message: err?.message ?? 'Try again.', duration: 4000 }) }
                    }}
                    onStartMehfil={async () => {
                      try {
                        const r = await startRoom(openRoom.id)
                        setOpenRoom({ ...openRoom, ...r }, openRoomIAmHost)
                      } catch (err: any) {
                        showToast({ type: 'error', title: 'Start failed', message: err?.message ?? 'Try again.', duration: 4000 })
                      }
                    }}
                  />
              : openRoom.templateKind === 'roast'
                ? <RoastRoomPage
                    room={openRoom}
                    iAmHost={openRoomIAmHost}
                    onLeave={async () => {
                      try {
                        await leaveRoom(openRoom.id)
                        setOpenRoomId(null)
                      } catch (err: any) {
                        showToast({ type: 'error', title: 'Leave failed', message: err?.message ?? 'Try again.', duration: 4000 })
                      }
                    }}
                    onEndRoom={async () => {
                      try { const r = await endRoom(openRoom.id); setOpenRoom({ ...openRoom, ...r }, openRoomIAmHost) }
                      catch (err: any) { showToast({ type: 'error', title: 'End failed', message: err?.message ?? 'Try again.', duration: 4000 }) }
                    }}
                    onStartMehfil={async () => {
                      try {
                        const r = await startRoom(openRoom.id)
                        setOpenRoom({ ...openRoom, ...r }, openRoomIAmHost)
                      } catch (err: any) {
                        showToast({ type: 'error', title: 'Start failed', message: err?.message ?? 'Try again.', duration: 4000 })
                      }
                    }}
                  />
              : openRoom.templateKind === 'ghost_date'
                ? <GhostRoomPage
                    room={openRoom}
                    iAmHost={openRoomIAmHost}
                    onLeave={async () => {
                      try {
                        await leaveRoom(openRoom.id)
                        setOpenRoomId(null)
                      } catch (err: any) {
                        showToast({ type: 'error', title: 'Leave failed', message: err?.message ?? 'Try again.', duration: 4000 })
                      }
                    }}
                    onEndRoom={async () => {
                      try { const r = await endRoom(openRoom.id); setOpenRoom({ ...openRoom, ...r }, openRoomIAmHost) }
                      catch (err: any) { showToast({ type: 'error', title: 'End failed', message: err?.message ?? 'Try again.', duration: 4000 }) }
                    }}
                  />
              : openRoom.templateKind === 'open_mic'
                ? <OpenMicRoomPage
                    room={openRoom}
                    iAmHost={openRoomIAmHost}
                    onLeave={async () => {
                      try {
                        await leaveRoom(openRoom.id)
                        setOpenRoomId(null)
                      } catch (err: any) {
                        showToast({ type: 'error', title: 'Leave failed', message: err?.message ?? 'Try again.', duration: 4000 })
                      }
                    }}
                    onEndRoom={async () => {
                      try { const r = await endRoom(openRoom.id); setOpenRoom({ ...openRoom, ...r }, openRoomIAmHost) }
                      catch (err: any) { showToast({ type: 'error', title: 'End failed', message: err?.message ?? 'Try again.', duration: 4000 }) }
                    }}
                  />
              : null}
          </div>
        </div>
      )
    }

    // Generic flow (non-template rooms) — unchanged.
    return (
      <div className="h-full overflow-y-auto px-4 sm:px-8 py-6 sm:py-10">
        <div className="max-w-3xl mx-auto cv-fade-up">
          <button
            onClick={() => setOpenRoomId(null)}
            className="text-xs text-[var(--color-fg-dim)] hover:text-[var(--color-fg)] mb-3 inline-flex items-center gap-1"
          >
            ← Back to Mehfil
          </button>
          {!openRoom
            ? <div className="flex justify-center py-12"><Loader /></div>
            // ── Per-template dispatch ──────────────────────────────
            // Debate rooms land on DebateRoomPage which connects to
            // its own /hubs/debate. Generic flow (RoomDetailView) is
            // untouched for all other templates per isolation policy.
            : openRoom.templateKind === 'debate'
              ? <DebateV2RoomPage
                  room={openRoom}
                  iAmHost={openRoomIAmHost}
                  onLeave={async () => {
                    try {
                      await leaveRoom(openRoom.id)
                      setOpenRoomId(null)
                    } catch (err: any) {
                      showToast({ type: 'error', title: 'Leave failed', message: err?.message ?? 'Try again.', duration: 4000 })
                    }
                  }}
                  onEndRoom={async () => {
                    try { const r = await endRoom(openRoom.id); setOpenRoom({ ...openRoom, ...r }, openRoomIAmHost) }
                    catch (err: any) { showToast({ type: 'error', title: 'End failed', message: err?.message ?? 'Try again.', duration: 4000 }) }
                  }}
                />
            : openRoom.templateKind === 'ghost_date'
              ? <GhostRoomPage
                  room={openRoom}
                  iAmHost={openRoomIAmHost}
                  onLeave={async () => {
                    try {
                      await leaveRoom(openRoom.id)
                      setOpenRoomId(null)
                    } catch (err: any) {
                      showToast({ type: 'error', title: 'Leave failed', message: err?.message ?? 'Try again.', duration: 4000 })
                    }
                  }}
                  onEndRoom={async () => {
                    try { const r = await endRoom(openRoom.id); setOpenRoom({ ...openRoom, ...r }, openRoomIAmHost) }
                    catch (err: any) { showToast({ type: 'error', title: 'End failed', message: err?.message ?? 'Try again.', duration: 4000 }) }
                  }}
                />
              : <RoomDetailView
                room={openRoom}
                iAmHost={openRoomIAmHost}
                messages={openRoomMessages}
                attendees={openRoomAttendees}
                tips={openRoomTips}
                gifts={gifts}
                draft={draft} setDraft={setDraft}
                sending={sending}
                onSend={handleSend}
                onTip={handleTip}
                onJoin={async () => {
                  try {
                    const r = await joinRoom(openRoom.id)
                    const fresh = await getRoom(r.id)
                    setOpenRoom(fresh.room, fresh.iAmHost, fresh.messages, fresh.attendees, fresh.tips)
                  } catch (err: any) {
                    showToast({ type: 'error', title: 'Join failed', message: err?.message ?? 'Try again.', duration: 4000 })
                  }
                }}
                onLeave={async () => {
                  try {
                    await leaveRoom(openRoom.id)
                    setOpenRoomId(null)
                  } catch (err: any) {
                    showToast({ type: 'error', title: 'Leave failed', message: err?.message ?? 'Try again.', duration: 4000 })
                  }
                }}
                onStart={async () => {
                  try { const r = await startRoom(openRoom.id); setOpenRoom({ ...openRoom, ...r }, openRoomIAmHost) }
                  catch (err: any) { showToast({ type: 'error', title: 'Start failed', message: err?.message ?? 'Try again.', duration: 4000 }) }
                }}
                onEnd={async () => {
                  try { const r = await endRoom(openRoom.id); setOpenRoom({ ...openRoom, ...r }, openRoomIAmHost) }
                  catch (err: any) { showToast({ type: 'error', title: 'End failed', message: err?.message ?? 'Try again.', duration: 4000 }) }
                }}
              />}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-6 sm:py-10">
      <div className="max-w-3xl mx-auto cv-fade-up">
        <Header onCreate={() => setCreateOpen(true)} />
        <TabStrip tab={tab} setTab={setTab} />

        <div className="mt-6 cv-tab-slide" key={tab}>
          {tab === 'discover' ? (
            <DiscoverPanel
              filter={filter} setFilter={setFilter}
              templates={templates}
              templateFilter={templateFilter} setTemplateFilter={setTemplateFilter}
              rooms={discoverRooms}
              loading={loading}
              onOpen={(id) => setOpenRoomId(id)}
            />
          ) : (
            <MinePanel rooms={myRooms} onOpen={(id) => setOpenRoomId(id)} onCancel={async (id) => {
              try {
                await cancelRoom(id)
                const m = await invokeMyRooms()
                setMyRooms(m.rooms)
              } catch (err: any) {
                showToast({ type: 'error', title: 'Cancel failed', message: err?.message ?? 'Try again.', duration: 4000 })
              }
            }} />
          )}
        </div>
      </div>

      {createOpen && (
        <CreateRoomSheet
          // Force the create flow to the two locked templates regardless
          // of what the server's `templates` array contains. Existing
          // rooms in deprecated templates still open via Discover; only
          // *new* room creation is constrained.
          templates={CREATE_FLOW_TEMPLATES}
          onClose={() => setCreateOpen(false)}
          onCreate={async (form) => {
            try {
              const room = await createRoom(form.template, form.title, form.description, form.scheduledFor, form.maxAudience)
              const m = await invokeMyRooms()
              setMyRooms(m.rooms)
              setCreateOpen(false)
              showToast({ type: 'success', title: '🎤  Mehfil scheduled', message: `${room.title} is on the calendar.`, duration: 5000 })
            } catch (err: any) {
              showToast({ type: 'error', title: 'Create failed', message: err?.message ?? 'Try again.', duration: 4000 })
            }
          }}
        />
      )}
    </div>
  )
}

// ─── Header ─────────────────────────────────────────────────

function Header({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="cv-aurora rounded-2xl p-5 border border-[var(--color-line)] bg-[var(--color-surface-1)] mb-6">
      <div className="flex items-start gap-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-white cv-halo"
          style={{ background: 'linear-gradient(135deg, var(--color-accent) 0%, #f59e0b 100%)' }}
        >
          <Mic size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold leading-tight cv-text-gradient">Mehfil</h1>
          <p className="text-sm text-[var(--color-fg-dim)] mt-1">
            Host your own room. Open mic, debate, story circle, watch party — eleven templates. Audience tips with virtual gifts (Phase 5 settles balance; today it\'s leaderboard glory).
          </p>
          <div className="flex items-center gap-3 mt-3">
            <Button variant="primary" size="sm" leftIcon={<Plus size={14} />} onClick={onCreate}>
              Host a Mehfil
            </Button>
            <Link
              to="/about#mehfil"
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

function TabStrip({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const items: { key: Tab; label: string }[] = [
    { key: 'discover', label: 'Discover' },
    { key: 'mine',     label: 'My rooms' },
  ]
  return (
    <div role="tablist" className="grid grid-cols-2 gap-1 p-1 bg-[var(--color-surface-2)] rounded-lg border border-[var(--color-line)]">
      {items.map((it) => {
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
            {it.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Discover ───────────────────────────────────────────────

function DiscoverPanel({
  filter, setFilter, templates, templateFilter, setTemplateFilter,
  rooms, loading, onOpen,
}: {
  filter: 'live' | 'upcoming' | 'all'
  setFilter: (f: 'live' | 'upcoming' | 'all') => void
  templates: MehfilTemplate[]
  templateFilter: MehfilTemplate | null
  setTemplateFilter: (t: MehfilTemplate | null) => void
  rooms: MehfilRoomCard[]
  loading: boolean
  onOpen: (id: string) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', 'live', 'upcoming'] as const).map((f) => (
          <button
            key={f}
            onClick={() => { setFilter(f); setTemplateFilter(null) }}
            className={`cv-press h-7 px-3 rounded-full text-xs uppercase tracking-wider font-medium transition-colors
              ${filter === f && !templateFilter
                ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)] border border-[var(--color-accent)]'
                : 'bg-[var(--color-surface-2)] text-[var(--color-fg-dim)] border border-[var(--color-line)] hover:text-[var(--color-fg)]'}`}
          >
            {f}
          </button>
        ))}
      </div>

      {templates.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {templates.map((t) => (
            <button
              key={t}
              onClick={() => setTemplateFilter(templateFilter === t ? null : t)}
              className={`cv-press h-6 px-2 rounded text-[10px] uppercase tracking-wider transition-colors
                ${templateFilter === t
                  ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)] border border-[var(--color-accent)]'
                  : 'bg-[var(--color-surface-1)] text-[var(--color-fg-dim)] border border-[var(--color-line)] hover:text-[var(--color-fg)]'}`}
            >
              {TEMPLATE_LABEL[t] ?? t}
            </button>
          ))}
        </div>
      )}

      {loading && rooms.length === 0
        ? <div className="flex justify-center py-12"><Loader /></div>
        : rooms.length === 0
          ? <div className="text-center py-12 text-sm text-[var(--color-fg-dim)]">No rooms here yet.</div>
          : (
            <div className="flex flex-col gap-3 cv-stagger">
              {rooms.map((r) => <RoomTile key={r.id} room={r} onOpen={onOpen} />)}
            </div>
          )}
    </div>
  )
}

function RoomTile({ room, onOpen }: { room: MehfilRoomCard; onOpen: (id: string) => void }) {
  return (
    <Card padding="md" hover className="flex flex-col gap-2" onClick={() => onOpen(room.id)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)]">
            {TEMPLATE_LABEL[room.templateKind] ?? room.templateKind} · hosted by {room.hostUsername}
          </div>
          <div className="text-sm font-medium text-[var(--color-fg)] mt-0.5">{room.title}</div>
        </div>
        <StatusChip status={room.status} audience={room.currentAudienceCount} />
      </div>
      {room.description && (
        <p className="text-xs text-[var(--color-fg-dim)] line-clamp-2">{room.description}</p>
      )}
      <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--color-fg-faint)]">
        <span>{room.status === 'scheduled' ? `Starts ${new Date(room.scheduledFor).toLocaleString()}` : room.status === 'live' ? 'LIVE NOW' : 'ended'}</span>
        <span className="inline-flex items-center gap-1"><Users size={11} /> {room.currentAudienceCount}/{room.maxAudience}</span>
      </div>
    </Card>
  )
}

function StatusChip({ status, audience }: { status: MehfilRoomCard['status']; audience: number }) {
  if (status === 'live') {
    return (
      <span className="text-[10px] uppercase tracking-wider px-1.5 h-5 inline-flex items-center gap-1 rounded font-medium bg-rose-500/15 text-rose-300 border border-rose-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
        live · {audience}
      </span>
    )
  }
  const map = {
    scheduled: { label: 'scheduled', color: 'bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)]' },
    ended:     { label: 'ended',     color: 'bg-[var(--color-surface-2)] text-[var(--color-fg-dim)] border border-[var(--color-line)]' },
    cancelled: { label: 'cancelled', color: 'bg-[var(--color-surface-2)] text-[var(--color-fg-faint)] border border-[var(--color-line)]' },
  } as const
  const m = map[status]
  return (
    <span className={`text-[10px] uppercase tracking-wider px-1.5 h-5 inline-flex items-center rounded font-medium ${m.color}`}>
      {m.label}
    </span>
  )
}

// ─── Mine ───────────────────────────────────────────────────

function MinePanel({
  rooms, onOpen, onCancel,
}: { rooms: MehfilRoomCard[]; onOpen: (id: string) => void; onCancel: (id: string) => void }) {
  if (rooms.length === 0) {
    return (
      <Card padding="lg" className="text-center">
        <Mic size={26} className="mx-auto text-[var(--color-fg-faint)] mb-2" />
        <div className="text-sm text-[var(--color-fg-dim)]">You haven\'t hosted yet.</div>
        <div className="text-xs text-[var(--color-fg-faint)] mt-1">Tap "Host a Mehfil" up top to schedule one.</div>
      </Card>
    )
  }
  return (
    <div className="flex flex-col gap-3 cv-stagger">
      {rooms.map((r) => (
        <Card key={r.id} padding="md" className="flex items-center gap-3">
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onOpen(r.id)}>
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)]">
              {TEMPLATE_LABEL[r.templateKind] ?? r.templateKind}
            </div>
            <div className="text-sm font-medium text-[var(--color-fg)]">{r.title}</div>
            <div className="text-[10px] text-[var(--color-fg-faint)] mt-0.5">
              {r.status === 'live' ? `LIVE · ${r.currentAudienceCount}` : r.status === 'scheduled' ? `Starts ${new Date(r.scheduledFor).toLocaleString()}` : r.status}
            </div>
          </div>
          {r.status === 'scheduled' && (
            <Button size="sm" variant="ghost" leftIcon={<Trash2 size={12} />} onClick={() => onCancel(r.id)}>
              Cancel
            </Button>
          )}
        </Card>
      ))}
    </div>
  )
}

// ─── Create sheet ───────────────────────────────────────────

function CreateRoomSheet({
  templates, onClose, onCreate,
}: {
  templates: MehfilTemplate[]
  onClose: () => void
  onCreate: (form: { template: MehfilTemplate; title: string; description: string; scheduledFor: string; maxAudience: number }) => void
}) {
  const [template, setTemplate] = useState<MehfilTemplate>(templates[0] ?? 'open_mic')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [scheduledFor, setScheduledFor] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000)
    return d.toISOString().slice(0, 16)
  })
  const [maxAudience, setMaxAudience] = useState(100)
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
          <div className="text-sm font-medium text-[var(--color-fg)]">Host a Mehfil</div>
          <button
            onClick={onClose}
            className="cv-press w-8 h-8 inline-flex items-center justify-center rounded-md text-[var(--color-fg-dim)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface-2)]"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-wider font-medium text-[var(--color-fg-faint)] mb-1 block">Template</label>
          <div className="flex flex-wrap gap-1">
            {templates.map((t) => (
              <button
                key={t}
                onClick={() => setTemplate(t)}
                className={`cv-press h-7 px-2 rounded text-[11px] transition-colors
                  ${template === t
                    ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)] border border-[var(--color-accent)]'
                    : 'bg-[var(--color-surface-2)] text-[var(--color-fg-dim)] border border-[var(--color-line)] hover:text-[var(--color-fg)]'}`}
              >
                {TEMPLATE_LABEL[t] ?? t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-wider font-medium text-[var(--color-fg-faint)] mb-1 block">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="e.g. Saturday Shayari Open Mic"
            className="w-full h-10 rounded-md bg-[var(--color-surface-2)] text-[var(--color-fg)] text-sm px-2 border border-[var(--color-line)] focus:outline-none focus:border-[var(--color-accent)]"
          />
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-wider font-medium text-[var(--color-fg-faint)] mb-1 block">Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="A line or two so audience knows what they're in for."
            className="w-full resize-none rounded-md bg-[var(--color-surface-2)] text-[var(--color-fg)] text-sm p-2 border border-[var(--color-line)] focus:outline-none focus:border-[var(--color-accent)]"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] uppercase tracking-wider font-medium text-[var(--color-fg-faint)] mb-1 block">Starts</label>
            <input
              type="datetime-local"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              className="w-full h-10 rounded-md bg-[var(--color-surface-2)] text-[var(--color-fg)] text-sm px-2 border border-[var(--color-line)] focus:outline-none focus:border-[var(--color-accent)]"
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider font-medium text-[var(--color-fg-faint)] mb-1 block">Max audience</label>
            <input
              type="number"
              min={2} max={5000}
              value={maxAudience}
              onChange={(e) => setMaxAudience(Number(e.target.value))}
              className="w-full h-10 rounded-md bg-[var(--color-surface-2)] text-[var(--color-fg)] text-sm px-2 border border-[var(--color-line)] focus:outline-none focus:border-[var(--color-accent)]"
            />
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <Button
            variant="primary" size="sm"
            disabled={!title.trim()}
            onClick={() => onCreate({
              template, title, description,
              scheduledFor: new Date(scheduledFor).toISOString(),
              maxAudience,
            })}
            leftIcon={<Plus size={14} />}
          >
            Schedule
          </Button>
        </div>
      </Card>
    </div>
  )
}

// ─── Open room detail ───────────────────────────────────────

function RoomDetailView({
  room, iAmHost, messages, attendees, tips, gifts,
  draft, setDraft, sending, onSend, onTip,
  onJoin, onLeave, onStart, onEnd,
}: {
  room: MehfilRoomCard
  iAmHost: boolean
  messages: ReturnType<typeof useMehfilStore.getState>['openRoomMessages']
  attendees: ReturnType<typeof useMehfilStore.getState>['openRoomAttendees']
  tips: ReturnType<typeof useMehfilStore.getState>['openRoomTips']
  gifts: Record<string, number>
  draft: string; setDraft: (s: string) => void
  sending: boolean
  onSend: () => void
  onTip: (g: string) => void
  onJoin: () => void
  onLeave: () => void
  onStart: () => void
  onEnd: () => void
}) {
  const isLive = room.status === 'live'
  const palette = TEMPLATE_PALETTE[room.templateKind] ?? TEMPLATE_PALETTE.custom

  // Auto-scroll the chat to the latest message when the count grows.
  const [chatRef, setChatRef] = useState<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!chatRef) return
    chatRef.scrollTop = chatRef.scrollHeight
  }, [messages.length, chatRef])

  // Gift-burst animation — when the tip stream grows, render a brief
  // emoji that floats up from the gift rail and fades. Keyed by tip-id
  // so React unmounts the prior burst as a new one mounts.
  const lastTip = tips[0]
  const [burstKey, setBurstKey] = useState<string | null>(null)
  useEffect(() => {
    if (!lastTip) return
    const id = (lastTip.senderUsername + ':' + lastTip.createdAt)
    setBurstKey(id)
    const t = setTimeout(() => setBurstKey(null), 1600)
    return () => clearTimeout(t)
  }, [lastTip?.senderUsername, lastTip?.createdAt])

  // The CSS vars drive the .cv-mehfil-stage aurora + bubble + gift-btn
  // theming. Cast through React.CSSProperties so custom props pass TS.
  const stageStyle = {
    ['--mehfil-accent-1' as any]: palette.accent1,
    ['--mehfil-accent-2' as any]: palette.accent2,
  } as React.CSSProperties

  return (
    <div className="cv-mehfil-stage cv-pop p-4 sm:p-5 border border-[var(--color-line)]" style={stageStyle}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className="w-12 h-12 rounded-2xl shrink-0 text-white inline-flex items-center justify-center text-2xl cv-halo shadow-lg"
            style={{
              background: `linear-gradient(135deg, ${palette.accent1} 0%, ${palette.accent2} 100%)`,
            }}
            aria-hidden="true"
          >
            <span>{palette.emoji}</span>
          </div>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)] inline-flex items-center gap-1.5">
              <span>{TEMPLATE_LABEL[room.templateKind] ?? room.templateKind}</span>
              <span>·</span>
              <span>hosted by {room.hostUsername}</span>
              <BadgeCheck size={10} className="inline" />
            </div>
            <div className="text-lg sm:text-xl font-semibold cv-text-gradient mt-0.5 leading-tight">{room.title}</div>
            {room.description && (
              <p className="text-xs text-[var(--color-fg-dim)] mt-1 max-w-md leading-relaxed">{room.description}</p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <StatusChip status={room.status} audience={room.currentAudienceCount} />
          {isLive && (
            <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--color-fg-dim)] tabular-nums">
              <span className="cv-audience-dot" />
              {room.currentAudienceCount}/{room.maxAudience} listening
            </span>
          )}
          <div className="text-[10px] text-[var(--color-fg-faint)] tabular-nums inline-flex items-center gap-1">
            <Gift size={10} /> {room.totalTipsTokens} tokens · {room.totalAttendeesCount} total
          </div>
        </div>
      </div>

      {/* Host lifecycle — gated on iAmHost from server so audience
          never sees the Start/End buttons even if they\'re looking
          at someone else\'s scheduled room. */}
      {iAmHost && (
        <div className="mt-3"><HostBar room={room} onStart={onStart} onEnd={onEnd} /></div>
      )}

      {/* Audience join/leave */}
      {isLive && room.hostUsername !== '' && (
        <div className="flex items-center justify-between gap-3 pt-3 mt-3 border-t border-[var(--color-line)]">
          <span className="text-xs text-[var(--color-fg-dim)] inline-flex items-center gap-1.5">
            <Users size={12} /> in the room
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={onLeave}>Leave</Button>
            <Button size="sm" variant="primary" onClick={onJoin}>Join</Button>
          </div>
        </div>
      )}

      {/* Chat */}
      {isLive && (
        <div
          ref={setChatRef}
          className="flex flex-col gap-2 mt-3 py-2 overflow-y-auto"
          style={{ maxHeight: '50vh' }}
        >
          {messages.length === 0 && (
            <div className="text-xs text-[var(--color-fg-faint)] text-center py-6 italic">
              No messages yet. Be the first voice.
            </div>
          )}
          {messages.map((m) => (
            <ChatRow key={m.id} m={m} />
          ))}
        </div>
      )}

      {/* Composer + themed gift rail with burst */}
      {isLive && (
        <div className="relative pt-3 mt-3 border-t border-[var(--color-line)] flex flex-col gap-2">
          <div className="flex gap-2 items-end">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              maxLength={MAX_MSG + 64}
              placeholder="Say something…"
              className="flex-1 resize-none rounded-lg cv-glass text-[var(--color-fg)] text-sm leading-relaxed p-2 border border-[var(--color-line)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)]"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() } }}
            />
            <Button variant="primary" size="sm" loading={sending} disabled={!draft.trim()} onClick={onSend} leftIcon={<Send size={12} />}>Send</Button>
          </div>
          {/* Gift rail — hidden for the host. The backend rejects self-
              tips ("Host can't tip themselves"), so showing the rail to
              the host produces a confusing error toast when they tap
              Rose / Bouquet / Crown out of curiosity. Audience only. */}
          {!iAmHost && (
            <div className="relative flex gap-2 flex-wrap">
              {burstKey && lastTip && (
                <div className="cv-gift-burst" key={burstKey}>
                  <span>{GIFT_EMOJI[lastTip.giftType] ?? '🎁'}</span>
                </div>
              )}
              {Object.entries(gifts).map(([key, tokens]) => (
                <button
                  key={key}
                  onClick={() => onTip(key)}
                  className="cv-gift-btn cv-press inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs bg-[var(--color-surface-2)] border border-[var(--color-line)] text-[var(--color-fg-dim)] hover:text-[var(--color-fg)]"
                  title={`${key} · ${tokens} tokens`}
                >
                  <span className="text-base leading-none">{GIFT_EMOJI[key] ?? '🎁'}</span>
                  <span className="capitalize font-medium">{key}</span>
                  <span className="text-[var(--color-fg-faint)] tabular-nums">{tokens}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Audience list (collapsed) */}
      {isLive && attendees.length > 0 && (
        <details className="pt-3 mt-3 border-t border-[var(--color-line)]">
          <summary className="text-[11px] uppercase tracking-wider text-[var(--color-fg-faint)] cursor-pointer hover:text-[var(--color-fg-dim)]">
            In the room ({attendees.length})
          </summary>
          <div className="flex flex-wrap gap-1 mt-2">
            {attendees.map((a) => (
              <span
                key={a.username}
                className="text-[10px] px-2 h-5 inline-flex items-center rounded-full bg-[var(--color-surface-1)] text-[var(--color-fg-dim)] border border-[var(--color-line)]"
              >
                {a.username}
              </span>
            ))}
          </div>
        </details>
      )}

      {/* Recent tips ticker */}
      {tips.length > 0 && (
        <details className="pt-3 mt-3 border-t border-[var(--color-line)]">
          <summary className="text-[11px] uppercase tracking-wider text-[var(--color-fg-faint)] cursor-pointer hover:text-[var(--color-fg-dim)]">
            Recent tips ({tips.length})
          </summary>
          <div className="flex flex-col gap-1.5 mt-2">
            {tips.slice(0, 10).map((t, i) => (
              <div key={i} className="text-xs text-[var(--color-fg-dim)] inline-flex items-center gap-1.5">
                <span className="text-sm leading-none">{GIFT_EMOJI[t.giftType] ?? '🎁'}</span>
                <span className="text-[var(--color-fg)] font-medium">{t.senderUsername}</span>
                <span>sent a <span className="capitalize">{t.giftType}</span></span>
                <span className="ml-auto text-amber-300/85 tabular-nums">+{t.tokenAmount}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Drama-flavoured soundboard for the stage — host can drop
          drumrolls, audience can clap, gasp on big reveals.
          Gated on `isLive` so the floating tray doesn't overlap the
          Start button on scheduled / ended rooms. */}
      {isLive && (
        <SoundboardTray scope="mehfil" scopeId={room.id} className="bottom-6 right-4" />
      )}
    </div>
  )
}

/** Themed chat row — host messages get accent border, my messages
 *  get the template gradient, everyone else gets a neutral bubble. */
function ChatRow({
  m,
}: { m: { id: string; senderUsername: string; isHost: boolean; mine: boolean; content: string; createdAt: string } }) {
  const tone = m.mine ? 'is-mine' : m.isHost ? 'is-host' : ''
  return (
    <div className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
      {!m.mine && (
        <div className="w-7 h-7 rounded-full mr-2 mt-auto mb-0.5 inline-flex items-center justify-center text-[10px] font-semibold text-[var(--color-fg-dim)] bg-[var(--color-surface-2)] border border-[var(--color-line)] shrink-0">
          {m.senderUsername.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div
        className={`cv-mehfil-bubble ${tone} max-w-[80%] px-3.5 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words
          ${m.mine ? 'rounded-br-sm' : 'rounded-bl-sm bg-[var(--color-surface-2)] text-[var(--color-fg)] border border-[var(--color-line)]'}`}
      >
        {!m.mine && (
          <div className="text-[10px] uppercase tracking-wider opacity-75 mb-0.5 inline-flex items-center gap-1">
            <span>{m.senderUsername}</span>
            {m.isHost && (
              <span className="px-1 rounded font-semibold text-amber-300/95 bg-amber-500/15 border border-amber-500/30">
                HOST
              </span>
            )}
          </div>
        )}
        {m.content}
      </div>
    </div>
  )
}

function HostBar({ room, onStart, onEnd }: { room: MehfilRoomCard; onStart: () => void; onEnd: () => void }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {room.status === 'scheduled' && (
        <Button size="sm" variant="primary" leftIcon={<Play size={14} />} onClick={onStart}>Start now</Button>
      )}
      {room.status === 'live' && (
        <Button size="sm" variant="secondary" leftIcon={<Square size={14} />} onClick={onEnd}>End Mehfil</Button>
      )}
    </div>
  )
}
