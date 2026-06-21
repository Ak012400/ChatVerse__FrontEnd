import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark'

/** Stable string ids for each sidebar feature icon. Keep these in
 *  sync with FEATURE_ICONS in PrimarySidebar — they're persisted in
 *  localStorage, so renaming one orphans existing user preferences. */
export type FeatureIconId =
  | 'chat'
  | 'video'
  | 'dms'
  | 'persona'
  | 'time-capsule'
  | 'story-chain'
  | 'confessions'
  | 'ghost-date'
  | 'love-triangle'
  | 'cipher'
  | 'pyaar-live'
  | 'mehfil'

/** Default order — also acts as the source-of-truth list for "what
 *  features exist". The sidebar uses this to seed brand-new users
 *  AND to merge-in any new feature added after a user's last visit. */
export const DEFAULT_FEATURE_ORDER: FeatureIconId[] = [
  'chat',
  'video',
  'dms',
  'persona',
  'time-capsule',
  'story-chain',
  'confessions',
  'ghost-date',
  'love-triangle',
  'cipher',
  'pyaar-live',
  'mehfil',
]

interface UiState {
  /** Whether the secondary sidebar (rooms list / video modes) is hidden. */
  secondaryCollapsed: boolean
  toggleSecondary: () => void
  setSecondaryCollapsed: (v: boolean) => void

  /** Active color theme. Dark is the default — matches the original design. */
  theme: Theme
  toggleTheme: () => void
  setTheme: (t: Theme) => void

  /** User-customised sidebar order. Drag-to-reorder writes here.
   *  Unknown / new feature ids are appended at the end on load so
   *  shipping a new feature doesn't strand it off-screen for
   *  existing users. */
  featureOrder: FeatureIconId[]
  moveFeature: (id: FeatureIconId, toIndex: number) => void
  resetFeatureOrder: () => void

  /** Push-to-talk preference for group video calls. When `pttEnabled`
   *  is true, the mic stays muted by default and only unmutes while
   *  the user holds `pttKey` (KeyboardEvent.code, e.g. 'Space'). When
   *  false, mic behaves as always-on with manual mute button.
   *  Used by `usePushToTalk` hook in HostedGroupPage + RandomGroupPage. */
  pttEnabled: boolean
  pttKey: string
  setPttEnabled: (v: boolean) => void
  setPttKey: (key: string) => void
}

/**
 * UI-only preferences that should survive a page refresh. Persisted to
 * localStorage so the user doesn't have to re-collapse / re-pick theme
 * on every visit. Kept separate from authStore so it doesn't piggy-back
 * on auth events.
 *
 * The theme apply-to-DOM side effect lives in <ThemeProvider> rather
 * than inside this store, so the store stays a plain state container.
 */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      secondaryCollapsed: false,
      toggleSecondary: () => set((s) => ({ secondaryCollapsed: !s.secondaryCollapsed })),
      setSecondaryCollapsed: (v) => set({ secondaryCollapsed: v }),

      theme: 'dark',
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      setTheme: (theme) => set({ theme }),

      featureOrder: DEFAULT_FEATURE_ORDER,
      moveFeature: (id, toIndex) =>
        set((s) => {
          const current = [...s.featureOrder]
          const from = current.indexOf(id)
          if (from < 0) return {}
          current.splice(from, 1)
          const clamped = Math.max(0, Math.min(toIndex, current.length))
          current.splice(clamped, 0, id)
          return { featureOrder: current }
        }),
      resetFeatureOrder: () => set(() => ({ featureOrder: DEFAULT_FEATURE_ORDER })),

      // Push-to-talk defaults to OFF — always-on mic is friendlier for
      // first-time users. Power users in noisy 6+ person calls flip it
      // on once they realise it's there. Spacebar is the universal
      // walkie-talkie key (Discord/Steam-trained muscle memory).
      pttEnabled: false,
      pttKey: 'Space',
      setPttEnabled: (v) => set({ pttEnabled: v }),
      setPttKey: (key) => set({ pttKey: key }),
    }),
    {
      name: 'cv_ui',
      // On rehydrate, MERGE any new feature ids that weren't in the
      // persisted order. This way shipping a new feature doesn't
      // leave the icon hidden from existing users.
      onRehydrateStorage: () => (state) => {
        if (!state) return
        const known = new Set(state.featureOrder ?? [])
        const merged = [
          ...(state.featureOrder ?? []),
          ...DEFAULT_FEATURE_ORDER.filter((id) => !known.has(id)),
        ]
        state.featureOrder = merged as FeatureIconId[]
      },
    },
  ),
)
