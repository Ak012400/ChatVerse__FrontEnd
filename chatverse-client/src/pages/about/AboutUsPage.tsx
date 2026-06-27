import { Link } from 'react-router-dom'
import {
  ArrowLeft, Sparkles, Shield, Mic, Heart, MessageCircle, Mail, Globe,
  Users, Gamepad2, Theater,
} from 'lucide-react'

import Logo from '../../components/ui/Logo'

// ============================================================
//  AboutUsPage — public "What is ChatVerse" surface.
//
//  Renders without auth gating so visitors / press / would-be users
//  can read the pitch without signing up. Listed in the sidebar under
//  the help cluster + linked from the landing page footer.
// ============================================================

export default function AboutUsPage() {
  return (
    <div className="relative min-h-screen bg-[var(--color-bg)] text-[var(--color-fg)]">
      {/* Aurora backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(circle at 14% 22%, rgba(99,102,241,0.20), transparent 55%), ' +
            'radial-gradient(circle at 86% 76%, rgba(236,72,153,0.16), transparent 55%)',
          filter: 'blur(70px)',
        }}
      />

      <header className="relative z-10 border-b border-[var(--color-line)] backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link
            to="/"
            className="text-xs text-[var(--color-fg-dim)] hover:text-[var(--color-fg)] inline-flex items-center gap-1.5"
          >
            <ArrowLeft size={13} /> Home
          </Link>
          <Logo />
          <div className="hidden sm:flex items-center gap-3 text-xs">
            <Link to="/support" className="text-[var(--color-fg-faint)] hover:text-[var(--color-accent-fg)]">Support</Link>
            <Link to="/register" className="text-[var(--color-accent-fg)] hover:text-[var(--color-fg)]">Sign up →</Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-16 space-y-12">
        {/* Hero */}
        <section className="cv-fade-up text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--color-accent-soft)] border border-[var(--color-line)] text-[10px] uppercase tracking-wider font-semibold text-[var(--color-accent-fg)]">
            <Sparkles size={11} className="animate-pulse" />
            About ChatVerse
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight cv-text-gradient">
            Conversations, on your terms.
          </h1>
          <p className="text-sm sm:text-base text-[var(--color-fg-dim)] leading-relaxed max-w-2xl mx-auto">
            ChatVerse is a real-time anonymous chat &amp; video platform with AI moderation,
            embedded games, weekly drama features, and host-run audio rooms. Built solo,
            opinionated about privacy, and tuned for the way real conversations actually happen.
          </p>
          <div className="flex items-center justify-center gap-2 pt-2">
            <Link
              to="/register"
              className="cv-press inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-95"
            >
              Get started
            </Link>
            <Link
              to="/support"
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md border border-[var(--color-line)] text-sm text-[var(--color-fg-dim)] hover:text-[var(--color-fg)] hover:border-[var(--color-accent-fg)]"
            >
              <Sparkles size={13} /> Ask the AI
            </Link>
          </div>
        </section>

        {/* Mission */}
        <section className="cv-fade-up space-y-3">
          <h2 className="text-lg font-semibold inline-flex items-center gap-2">
            <Heart size={16} className="text-pink-400" /> Our mission
          </h2>
          <p className="text-sm text-[var(--color-fg-dim)] leading-relaxed">
            Most chat apps either over-moderate (sterile feeds) or under-moderate
            (toxic chaos). ChatVerse aims for the middle: AI catches obvious abuse
            in milliseconds, but real conversation, banter, debate, and even roasts
            stay welcome. Anonymity is a feature, not a leak — every privacy-sensitive
            surface (Confession Box, Ghost Date, Debate / Roast nominations) keeps
            real identities matchmaker-only until the user explicitly opts in.
          </p>
        </section>

        {/* What's inside */}
        <section className="cv-fade-up space-y-4">
          <h2 className="text-lg font-semibold">What's inside</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FeatureCard
              icon={MessageCircle}
              title="Themed lounges + DMs"
              body="General, Gaming, Music, Tech, Random. AI moderation, reactions, image upload with on-device NSFW scan, live captions + voice translation."
            />
            <FeatureCard
              icon={Theater}
              title="Video, theater, hosted calls"
              body="Random 1-on-1, random group, hosted up-to-50 group. Plus a Theater watch-party (YouTube IFrame sync + screen-share fallback)."
            />
            <FeatureCard
              icon={Gamepad2}
              title="Embedded games"
              body="Chess (with director mode + reconnect grace), Ludo (server-authoritative dice), Quiz with a daily leaderboard, Jokes, ambient lounge prompts."
            />
            <FeatureCard
              icon={Mic}
              title="Mehfil rooms (Debate &amp; Roast)"
              body="5v5 stage with real-time mic rotation, audience challenge / cut-in, host moderation, LiveKit audio. Public or private (invite code)."
            />
            <FeatureCard
              icon={Heart}
              title="Drama features"
              body="Time Capsule · Persona Roulette · Story Chain · Confession Box · Ghost Date · Love Triangle · The Cipher · PYAAR LIVE."
            />
            <FeatureCard
              icon={Shield}
              title="Privacy by design"
              body="Real names + bios in matchmaker / host-only sub-channels. No identity in pair chat / Persona DM. Token economy for tips, sandboxed payments until you trust us."
            />
          </div>
        </section>

        {/* Built by */}
        <section className="cv-fade-up rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-1)] p-5 space-y-3">
          <h2 className="text-lg font-semibold inline-flex items-center gap-2">
            <Users size={16} className="text-[var(--color-accent-fg)]" /> Built by
          </h2>
          <p className="text-sm text-[var(--color-fg-dim)] leading-relaxed">
            ChatVerse is built solo from scratch on .NET 8 + React 19 + SignalR + LiveKit,
            with three databases (PostgreSQL + MongoDB + Redis) and a per-feature isolation
            architecture so one bug never takes down the whole app. If you want to know
            anything about how it's built, ask the in-app AI assistant — it knows the
            architecture as well as the user-facing features.
          </p>
        </section>

        {/* Contact */}
        <section className="cv-fade-up rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-1)] p-5 space-y-4">
          <h2 className="text-lg font-semibold inline-flex items-center gap-2">
            <Mail size={16} className="text-[var(--color-accent-fg)]" /> Get in touch
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <ContactRow
              icon={Sparkles}
              label="AI assistant (fastest)"
              value={<Link to="/support" className="text-[var(--color-accent-fg)] hover:underline">Open chat</Link>}
            />
            <ContactRow
              icon={Mail}
              label="Email"
              value={<a href="mailto:support@chatverse.app" className="text-[var(--color-accent-fg)] hover:underline">support@chatverse.app</a>}
            />
            <ContactRow
              icon={Globe}
              label="Web"
              value={<a href="https://chatverse-1xq.pages.dev" target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent-fg)] hover:underline">chatverse.app</a>}
            />
          </div>
        </section>

        <footer className="text-center text-[10px] text-[var(--color-fg-mute)] pt-6">
          © {new Date().getFullYear()} ChatVerse. All rights reserved.
        </footer>
      </main>

    </div>
  )
}

function FeatureCard({
  icon: Icon, title, body,
}: { icon: any; title: string; body: string }) {
  return (
    <div className="cv-hover-lift rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] p-4">
      <div className="inline-flex w-9 h-9 rounded-md items-center justify-center bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)] mb-2">
        <Icon size={16} />
      </div>
      <div className="text-sm font-semibold text-[var(--color-fg)]">{title}</div>
      <p className="text-xs text-[var(--color-fg-dim)] mt-1 leading-relaxed">{body}</p>
    </div>
  )
}

function ContactRow({
  icon: Icon, label, value,
}: { icon: any; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-2)] p-3">
      <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)]">
        <Icon size={11} /> {label}
      </div>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  )
}
