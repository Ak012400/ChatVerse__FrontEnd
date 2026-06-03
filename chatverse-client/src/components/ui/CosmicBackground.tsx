import { useMemo } from 'react'

/**
 * Cinematic "two planets talking across the cosmos" backdrop for the
 * landing page. Pure CSS + SVG — no external libs, no canvas, no JS
 * animation loops. Every animated layer is GPU-composited via
 * transform/opacity so it runs smooth even on low-end devices.
 *
 * Layers, back-to-front:
 *   1. Deep-space base gradient
 *   2. Two slow-drifting nebula blobs
 *   3. Three parallax star fields (slow / mid / fast drift)
 *   4. Two planets with orbital rings and glow halos
 *   5. Beam of "chat packet" particles flowing between the planets
 *   6. Aurora ribbon at the bottom
 *   7. Vignette + subtle grid overlay
 *
 * Respects prefers-reduced-motion (kill-switch in index.css).
 */
export default function CosmicBackground() {
  // Star fields — generated once per mount with stable randomness.
  // Each layer has different size, opacity, and drift speed for parallax.
  const stars = useMemo(() => generateStarLayers(), [])

  return (
    <div className="cosmic absolute inset-0 overflow-hidden pointer-events-none">
      {/* 1 — deep-space base */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 30% 20%, #1a1043 0%, #0a0820 35%, #050514 70%, #03020a 100%)',
        }}
      />

      {/* 2 — nebula blobs (slow drift, blur, blend) */}
      <div
        className="absolute -top-32 -left-32 w-[60vw] h-[60vw] rounded-full opacity-50"
        style={{
          background:
            'radial-gradient(circle, rgba(139, 92, 246, 0.55) 0%, transparent 60%)',
          filter: 'blur(80px)',
          animation: 'nebula-drift-a 28s ease-in-out infinite',
          mixBlendMode: 'screen',
        }}
      />
      <div
        className="absolute -bottom-40 -right-32 w-[55vw] h-[55vw] rounded-full opacity-45"
        style={{
          background:
            'radial-gradient(circle, rgba(56, 189, 248, 0.5) 0%, transparent 60%)',
          filter: 'blur(90px)',
          animation: 'nebula-drift-b 34s ease-in-out infinite',
          mixBlendMode: 'screen',
        }}
      />
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[35vw] h-[35vw] rounded-full opacity-30"
        style={{
          background:
            'radial-gradient(circle, rgba(244, 114, 182, 0.45) 0%, transparent 60%)',
          filter: 'blur(70px)',
          animation: 'nebula-drift-a 22s ease-in-out infinite reverse',
          mixBlendMode: 'screen',
        }}
      />

      {/* 3 — star fields, three parallax layers */}
      {stars.map((layer, i) => (
        <div
          key={i}
          className="absolute inset-0"
          style={{
            animation: `star-drift ${layer.driftSeconds}s linear infinite alternate`,
          }}
        >
          {layer.dots.map((d, j) => (
            <span
              key={j}
              className="absolute rounded-full bg-white"
              style={{
                top: `${d.y}%`,
                left: `${d.x}%`,
                width: d.size,
                height: d.size,
                opacity: d.baseOpacity,
                animation: `twinkle ${d.twinkleSeconds}s ease-in-out ${d.delay}s infinite`,
                boxShadow: d.size >= 2 ? `0 0 ${d.size * 2}px rgba(255,255,255,0.6)` : undefined,
              }}
            />
          ))}
        </div>
      ))}

      {/* 4 — the two planets + their beam */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          {/* Planet A — cool blue-green */}
          <radialGradient id="planet-a" cx="40%" cy="35%">
            <stop offset="0%"   stopColor="#a5f3fc" />
            <stop offset="40%"  stopColor="#3b82f6" />
            <stop offset="80%"  stopColor="#1e3a8a" />
            <stop offset="100%" stopColor="#0c1844" />
          </radialGradient>
          <radialGradient id="planet-a-glow" cx="50%" cy="50%">
            <stop offset="0%"   stopColor="rgba(59,130,246,0.55)" />
            <stop offset="100%" stopColor="rgba(59,130,246,0)" />
          </radialGradient>

          {/* Planet B — warm amber/coral */}
          <radialGradient id="planet-b" cx="40%" cy="35%">
            <stop offset="0%"   stopColor="#fde68a" />
            <stop offset="40%"  stopColor="#f97316" />
            <stop offset="80%"  stopColor="#9a3412" />
            <stop offset="100%" stopColor="#451a03" />
          </radialGradient>
          <radialGradient id="planet-b-glow" cx="50%" cy="50%">
            <stop offset="0%"   stopColor="rgba(251,146,60,0.55)" />
            <stop offset="100%" stopColor="rgba(251,146,60,0)" />
          </radialGradient>

          {/* Beam — accent indigo line, fades at both ends */}
          <linearGradient id="beam-line" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="rgba(165,180,252,0)" />
            <stop offset="20%"  stopColor="rgba(165,180,252,0.6)" />
            <stop offset="50%"  stopColor="rgba(196,181,253,0.9)" />
            <stop offset="80%"  stopColor="rgba(165,180,252,0.6)" />
            <stop offset="100%" stopColor="rgba(165,180,252,0)" />
          </linearGradient>
        </defs>

        {/* Planet A — left side, around y=420 */}
        <g style={{ animation: 'planet-bob 9s ease-in-out infinite' }}>
          {/* outer glow */}
          <circle cx="200" cy="420" r="160" fill="url(#planet-a-glow)" style={{ animation: 'planet-pulse 6s ease-in-out infinite' }} />
          {/* orbit ring */}
          <g style={{ transformOrigin: '200px 420px', animation: 'orbit-spin 40s linear infinite' }}>
            <ellipse cx="200" cy="420" rx="135" ry="38" fill="none" stroke="rgba(165,180,252,0.18)" strokeWidth="1" />
            <circle cx="335" cy="420" r="3" fill="#c7d2fe" opacity="0.8" />
          </g>
          {/* the planet itself */}
          <circle cx="200" cy="420" r="92" fill="url(#planet-a)" />
          {/* terminator shadow (night-side) */}
          <circle cx="200" cy="420" r="92" fill="rgba(0,0,0,0.35)" style={{ transform: 'translateX(20px)' }} />
        </g>

        {/* Planet B — right side, around y=380 */}
        <g style={{ animation: 'planet-bob 11s ease-in-out infinite reverse' }}>
          <circle cx="1000" cy="380" r="140" fill="url(#planet-b-glow)" style={{ animation: 'planet-pulse 7s ease-in-out infinite' }} />
          <g style={{ transformOrigin: '1000px 380px', animation: 'orbit-spin 55s linear infinite reverse' }}>
            <ellipse cx="1000" cy="380" rx="118" ry="32" fill="none" stroke="rgba(253,186,116,0.18)" strokeWidth="1" />
            <circle cx="882" cy="380" r="2.5" fill="#fde68a" opacity="0.85" />
          </g>
          <circle cx="1000" cy="380" r="78" fill="url(#planet-b)" />
          <circle cx="1000" cy="380" r="78" fill="rgba(0,0,0,0.35)" style={{ transform: 'translateX(-18px)' }} />
        </g>

        {/* Beam between the two planets */}
        <line
          x1="290" y1="420" x2="920" y2="380"
          stroke="url(#beam-line)" strokeWidth="2"
          style={{ animation: 'beam-glow 4s ease-in-out infinite' }}
        />
      </svg>

      {/* 5 — chat-packet particles flowing along the beam.
              Done in DOM (not SVG) so we can use the cleaner CSS
              keyframe + per-particle delay pattern. */}
      <div
        className="absolute"
        style={{
          // anchored at the same screen-space position as the beam start
          left: '24%', top: 'calc(50% + 10px)',
          ['--beam-dx' as any]: '52vw',
        }}
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <span
            key={`p${i}`}
            className="absolute block rounded-full"
            style={{
              width: 5, height: 5,
              background: '#c7d2fe',
              boxShadow: '0 0 8px rgba(199,210,254,0.95), 0 0 16px rgba(165,180,252,0.55)',
              animation: `beam-particle 4.5s linear ${i * 0.55}s infinite`,
            }}
          />
        ))}
        {Array.from({ length: 6 }).map((_, i) => (
          <span
            key={`q${i}`}
            className="absolute block rounded-full"
            style={{
              width: 4, height: 4,
              background: '#fde68a',
              boxShadow: '0 0 8px rgba(253,230,138,0.9)',
              top: 12,
              left: 'var(--beam-dx, 52vw)',
              animation: `beam-particle-rev 5.5s linear ${i * 0.75 + 2}s infinite`,
            }}
          />
        ))}
      </div>

      {/* 6 — shooting stars (rare, dramatic) */}
      <div className="absolute top-[8%] right-[5%]">
        {[0, 7, 14].map((delay, i) => (
          <span
            key={i}
            className="absolute block"
            style={{
              width: 2, height: 2,
              background: 'white',
              boxShadow: '0 0 6px white, 60px -20px 0 -1px rgba(255,255,255,0.25), 120px -40px 0 -1.2px rgba(255,255,255,0.12)',
              borderRadius: 999,
              animation: `shooting-star 6s ease-out ${delay}s infinite`,
            }}
          />
        ))}
      </div>

      {/* 7 — aurora ribbon at the bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[28vh]"
        style={{
          background:
            'linear-gradient(to top, rgba(99,102,241,0.18) 0%, rgba(168,85,247,0.10) 40%, transparent 100%)',
          filter: 'blur(20px)',
          animation: 'aurora 12s ease-in-out infinite',
        }}
      />

      {/* 8 — vignette + subtle scanline grid */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.55) 100%)',
        }}
      />
      <div className="absolute inset-0 bg-grid opacity-[0.06]" />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Star-field generator. Three layers with different size/opacity
// distributions so the parallax effect reads as depth.
// Deterministic-ish via tiny LCG so the layout doesn't flicker
// between hot reloads.
// ─────────────────────────────────────────────────────────────
type Star = { x: number; y: number; size: number; baseOpacity: number; twinkleSeconds: number; delay: number }
type StarLayer = { dots: Star[]; driftSeconds: number }

function generateStarLayers(): StarLayer[] {
  let seed = 0x9e3779b1
  const rand = () => {
    // xorshift32 — fast, good enough for visual scatter
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5
    return ((seed >>> 0) / 0xffffffff)
  }

  const makeLayer = (count: number, sizeRange: [number, number], opacityRange: [number, number], driftSeconds: number): StarLayer => ({
    driftSeconds,
    dots: Array.from({ length: count }, () => {
      const size = sizeRange[0] + rand() * (sizeRange[1] - sizeRange[0])
      return {
        x: rand() * 100,
        y: rand() * 100,
        size: Math.round(size * 10) / 10,
        baseOpacity: opacityRange[0] + rand() * (opacityRange[1] - opacityRange[0]),
        twinkleSeconds: 2 + rand() * 4,
        delay: rand() * 5,
      }
    }),
  })

  return [
    makeLayer(80, [1, 1.5],  [0.35, 0.6], 120), // slow, distant
    makeLayer(40, [1.5, 2.5], [0.5, 0.8], 80),  // mid
    makeLayer(20, [2, 3.5],   [0.7, 1],   50),  // close, fastest
  ]
}
