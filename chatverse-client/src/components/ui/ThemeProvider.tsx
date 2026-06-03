import { useEffect } from 'react'
import { useUiStore } from '../../stores/uiStore'

/**
 * Applies the active theme to <html data-theme=…> on mount and on every
 * theme change. CSS variables in index.css do the rest — no per-component
 * theme wiring needed.
 *
 * Rendered once near the root of the tree (App.tsx); accepts children so
 * it stays composable. No JSX of its own.
 */
export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useUiStore((s) => s.theme)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'light') {
      root.setAttribute('data-theme', 'light')
    } else {
      root.removeAttribute('data-theme')
    }
    // Browsers / extensions also key off the `color-scheme` meta, which
    // index.css drives via CSS — nothing else needed here.
  }, [theme])

  return <>{children}</>
}
