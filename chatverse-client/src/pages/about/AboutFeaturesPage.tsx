import { useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Hourglass, Sparkles, Heart, MessageCircle, Ghost, Mic, Theater, Feather,
  Info, Shield, Clock, Users, Reply, Eye, BookOpen, ChevronRight,
} from 'lucide-react'

import Card from '../../components/ui/Card'
import { FEATURE_GUIDES, type FeatureGuide, type GuideSection } from '../../data/featureGuides'

// ============================================================
//  /about — in-app feature guide.
//
//  One page, one source of truth (data/featureGuides.ts). Each
//  guide gets a tile in the TOC strip + a deep-linkable section.
//  Adding a new feature later = appending one entry to the data
//  file; this page renders it automatically.
//
//  Deep links: /about#time-capsule lands on the Time Capsule section.
// ============================================================

const featureIconMap: Record<FeatureGuide['icon'], typeof Hourglass> = {
  hourglass:        Hourglass,
  masks:            Sparkles,        // (placeholder until lucide ships Masks)
  feather:          Feather,
  sparkles:         Sparkles,
  heart:            Heart,
  'message-circle': MessageCircle,
  ghost:            Ghost,
  cipher:           Sparkles,        // (placeholder)
  mic:              Mic,
  theater:          Theater,
}

const sectionIconMap: Record<NonNullable<GuideSection['icon']>, typeof Info> = {
  info:     Info,
  shield:   Shield,
  clock:    Clock,
  sparkles: Sparkles,
  users:    Users,
  reply:    Reply,
  eye:      Eye,
  rules:    BookOpen,
}

export default function AboutFeaturesPage() {
  const { hash } = useLocation()
  const navigate = useNavigate()

  // Scroll to the deep-linked section once layout has painted. Without
  // the rAF wrap the section's still 0-height on first commit and we
  // jump to the wrong offset.
  useEffect(() => {
    if (!hash) return
    const id = hash.replace('#', '')
    requestAnimationFrame(() => {
      const el = document.getElementById(id)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [hash])

  const liveGuides = useMemo(
    () => FEATURE_GUIDES.filter((g) => g.status === 'live'),
    [],
  )
  const soonGuides = useMemo(
    () => FEATURE_GUIDES.filter((g) => g.status === 'soon'),
    [],
  )

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-6 sm:py-10">
      <div className="max-w-3xl mx-auto">
        <Header />

        {/* TOC — quick jump strip. Lives at the top so users on a deep
            link see other features they could explore. */}
        <div className="mt-6 mb-8">
          <div className="text-[11px] uppercase tracking-wider font-medium text-[var(--color-fg-faint)] mb-2">
            Jump to
          </div>
          <div className="flex flex-wrap gap-2">
            {FEATURE_GUIDES.map((g) => {
              const Icon = featureIconMap[g.icon] ?? Sparkles
              return (
                <button
                  key={g.slug}
                  onClick={() => navigate(`/about#${g.slug}`)}
                  className="inline-flex items-center gap-2 h-9 px-3 rounded-md
                    bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)]
                    border border-[var(--color-line)]
                    text-sm text-[var(--color-fg-dim)] hover:text-[var(--color-fg)]
                    transition-colors"
                >
                  <Icon size={14} />
                  <span>{g.title}</span>
                  {g.status === 'soon' && (
                    <span className="text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)]">
                      soon
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Live features */}
        <div className="flex flex-col gap-10">
          {liveGuides.map((g) => <GuideBlock key={g.slug} guide={g} />)}
        </div>

        {/* Coming soon — collapsed teaser list */}
        {soonGuides.length > 0 && (
          <div className="mt-12 pt-8 border-t border-[var(--color-line)]">
            <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--color-fg-faint)] mb-3">
              On the way
            </h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {soonGuides.map((g) => <SoonTile key={g.slug} guide={g} />)}
            </div>
          </div>
        )}

        <footer className="mt-12 pt-6 border-t border-[var(--color-line)] text-xs text-[var(--color-fg-faint)]">
          Found a rule that feels off, or something missing?{' '}
          Tap the thumbs-down on any message Claude writes inside the platform —
          your feedback shapes the next version of these rules.
        </footer>
      </div>
    </div>
  )
}

// ─── Header ─────────────────────────────────────────────────

function Header() {
  return (
    <div className="flex items-start gap-3">
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-white"
        style={{ background: 'linear-gradient(135deg, var(--color-accent) 0%, #8b5cf6 100%)' }}
        aria-hidden="true"
      >
        <BookOpen size={20} />
      </div>
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold leading-tight">How it all works</h1>
        <p className="text-sm text-[var(--color-fg-dim)] mt-1">
          The full rules + privacy guarantees for every feature on ChatVerse,
          in one place. Updated as we ship.
        </p>
      </div>
    </div>
  )
}

// ─── One feature's full guide block ─────────────────────────

function GuideBlock({ guide }: { guide: FeatureGuide }) {
  const Icon = featureIconMap[guide.icon] ?? Sparkles
  return (
    <section
      id={guide.slug}
      aria-labelledby={`${guide.slug}-title`}
      // Scroll-margin so deep links don't bury the heading behind the
      // sticky top padding of the canvas.
      style={{ scrollMarginTop: '24px' }}
    >
      <header className="flex items-start gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0
            bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)]"
          aria-hidden="true"
        >
          <Icon size={18} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 id={`${guide.slug}-title`} className="text-lg sm:text-xl font-semibold">
              {guide.title}
            </h2>
            <span
              className={`text-[10px] uppercase tracking-wider px-1.5 h-4 inline-flex items-center rounded
                ${guide.status === 'live'
                  ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)]'
                  : 'bg-[var(--color-surface-2)] text-[var(--color-fg-faint)] border border-[var(--color-line)]'}`}
            >
              {guide.status === 'live' ? 'Live' : 'Coming soon'}
            </span>
          </div>
          <p className="text-sm text-[var(--color-fg-dim)] mt-1">{guide.tagline}</p>
        </div>
      </header>

      <div className="flex flex-col gap-3">
        {guide.sections.map((s, i) => <SectionCard key={i} section={s} />)}
      </div>
    </section>
  )
}

function SectionCard({ section }: { section: GuideSection }) {
  const Icon = section.icon ? sectionIconMap[section.icon] : Info
  const isList = Array.isArray(section.body)
  return (
    <Card padding="md">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-[var(--color-fg-faint)] shrink-0" aria-hidden="true">
          <Icon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[var(--color-fg)] mb-1.5">
            {section.heading}
          </h3>
          {isList ? (
            <ul className="text-sm text-[var(--color-fg-dim)] leading-relaxed flex flex-col gap-1.5">
              {(section.body as string[]).map((line, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-[var(--color-fg-faint)] shrink-0">–</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--color-fg-dim)] leading-relaxed">
              {section.body as string}
            </p>
          )}
        </div>
      </div>
    </Card>
  )
}

// ─── Coming-soon teaser tile ────────────────────────────────

function SoonTile({ guide }: { guide: FeatureGuide }) {
  const Icon = featureIconMap[guide.icon] ?? Sparkles
  return (
    <div className="p-3 rounded-md border border-dashed border-[var(--color-line-strong)] bg-[var(--color-surface-1)]">
      <div className="flex items-center gap-2">
        <Icon size={14} className="text-[var(--color-fg-faint)]" />
        <div className="text-sm font-medium text-[var(--color-fg)]">{guide.title}</div>
        <ChevronRight size={14} className="ml-auto text-[var(--color-fg-faint)]" />
      </div>
      <p className="text-xs text-[var(--color-fg-faint)] mt-1">{guide.tagline}</p>
    </div>
  )
}
