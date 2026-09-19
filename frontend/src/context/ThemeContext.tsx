import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'

type Theme = 'light' | 'dark'

interface ThemeContextType {
  theme: Theme
  toggle: () => void
}

const HOUR_NIGHT_START = 19 // 19:00 — inicio de noche
const HOUR_NIGHT_END = 7 // 07:00 — fin de noche

function isNightNow(): boolean {
  const hour = new Date().getHours()
  return hour >= HOUR_NIGHT_START || hour < HOUR_NIGHT_END
}

function systemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

/**
 * Auto: dark si el navegador/SO prefiere dark O si es de noche.
 * Light solo si el SO está en light Y es de día.
 */
function resolveAuto(): Theme {
  return systemPrefersDark() || isNightNow() ? 'dark' : 'light'
}

const ThemeContext = createContext<ThemeContextType | null>(null)

/* ── Provider ────────────────────────────────── */

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('spi-theme')
    if (stored === 'dark' || stored === 'light') return stored
    // Auto mode: sistema + hora local
    return resolveAuto()
  })

  // Aplica tema al DOM
  const applyTheme = useCallback((t: Theme) => {
    document.documentElement.classList.toggle('dark', t === 'dark')
  }, [])

  // Efecto UNIFICADO: aplica theme cada vez que cambia
  useEffect(() => {
    applyTheme(theme)
  }, [theme, applyTheme])

  // Escuchar cambios de prefers-color-scheme del navegador/SO
  useEffect(() => {
    const mql = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mql?.addEventListener) return

    const handler = () => {
      // Solo re-evaluar si el usuario NO tiene override manual
      if (localStorage.getItem('spi-theme') !== null) return
      setTheme(resolveAuto())
    }

    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  // Re-evaluar hora local cada 30s (para el cruce 19:00/07:00)
  useEffect(() => {
    const interval = setInterval(() => {
      if (localStorage.getItem('spi-theme') !== null) return
      setTheme(resolveAuto())
    }, 30_000)
    return () => clearInterval(interval)
  }, [])

  // Toggle manual — persiste override en localStorage
  const toggle = useCallback(() => {
    document.documentElement.classList.add('theme-transitioning')
    setTheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light'
      localStorage.setItem('spi-theme', next)
      return next
    })
    setTimeout(() => {
      document.documentElement.classList.remove('theme-transitioning')
    }, 500)
  }, [])

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme debe usarse dentro de un ThemeProvider')
  return ctx
}
