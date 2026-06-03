import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'
import hi from './locales/hi.json'

const STORAGE_KEY = 'cv_lang'

/* Hydrate from localStorage if we've saved a choice before; otherwise
 * try the browser's primary language; finally fall back to English. */
function initialLang(): 'en' | 'hi' {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'en' || saved === 'hi') return saved
  } catch {
    /* ignore */
  }
  const nav = (typeof navigator !== 'undefined' ? navigator.language : '').toLowerCase()
  return nav.startsWith('hi') ? 'hi' : 'en'
}

void i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      hi: { translation: hi },
    },
    lng: initialLang(),
    fallbackLng: 'en',
    interpolation: { escapeValue: false }, // React already escapes
    returnNull: false,
  })

export function setLanguage(lang: 'en' | 'hi') {
  void i18n.changeLanguage(lang)
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    /* ignore */
  }
}

export function getLanguage(): 'en' | 'hi' {
  return (i18n.language as 'en' | 'hi') ?? 'en'
}

export default i18n
