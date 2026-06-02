import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'
import { setLanguage } from '../../i18n'

/**
 * Two-option language toggle. Kept simple intentionally — Hindi is the
 * key second locale per the product plan. When we add more languages
 * this becomes a Select rather than a pair of buttons.
 */
export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation()
  const current = (i18n.language?.startsWith('hi') ? 'hi' : 'en') as 'en' | 'hi'

  const choose = (lang: 'en' | 'hi') => {
    if (lang === current) return
    setLanguage(lang)
  }

  return (
    <div className="flex items-center gap-2.5">
      <Languages size={14} className="text-[var(--color-fg-faint)]" />
      <span className="text-xs text-[var(--color-fg-dim)] flex-1">
        {t('profile.language')}
      </span>
      <div className="inline-flex rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line)] p-0.5">
        <button
          onClick={() => choose('en')}
          className={`px-2.5 h-7 rounded text-xs font-medium transition-colors
            ${
              current === 'en'
                ? 'bg-[var(--color-surface-3)] text-[var(--color-fg)]'
                : 'text-[var(--color-fg-faint)] hover:text-[var(--color-fg)]'
            }`}
          aria-pressed={current === 'en'}
        >
          {t('lang.english')}
        </button>
        <button
          onClick={() => choose('hi')}
          className={`px-2.5 h-7 rounded text-xs font-medium transition-colors
            ${
              current === 'hi'
                ? 'bg-[var(--color-surface-3)] text-[var(--color-fg)]'
                : 'text-[var(--color-fg-faint)] hover:text-[var(--color-fg)]'
            }`}
          aria-pressed={current === 'hi'}
        >
          {t('lang.hindi')}
        </button>
      </div>
    </div>
  )
}
