import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark'

interface UiState {
  /** Whether the secondary sidebar (rooms list / video modes) is hidden. */
  secondaryCollapsed: boolean
  toggleSecondary: () => void
  setSecondaryCollapsed: (v: boolean) => void

  /** Active color theme. Dark is the default — matches the original design. */
  theme: Theme
  toggleTheme: () => void
  setTheme: (t: Theme) => void
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
    }),
    { name: 'cv_ui' },
  ),
)
