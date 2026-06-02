import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UiState {
  /** Whether the secondary sidebar (rooms list / video modes) is hidden. */
  secondaryCollapsed: boolean
  toggleSecondary: () => void
  setSecondaryCollapsed: (v: boolean) => void
}

/**
 * UI-only preferences that should survive a page refresh. Persisted to
 * localStorage so the user doesn't have to re-collapse on every visit.
 * Kept separate from authStore so it doesn't piggy-back on auth events.
 */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      secondaryCollapsed: false,
      toggleSecondary: () => set((s) => ({ secondaryCollapsed: !s.secondaryCollapsed })),
      setSecondaryCollapsed: (v) => set({ secondaryCollapsed: v }),
    }),
    { name: 'cv_ui' },
  ),
)
