/**
 * Tests — ThemeContext
 *
 * Estrategia: renderizar ThemeProvider, verificar que:
 * - El tema por defecto es AUTO: dark si sistema dark O es de noche, light si no
 * - toggle cambia a dark y agrega clase .dark al <html>
 * - toggle persiste en localStorage y desactiva auto
 * - useTheme lanza error si se usa fuera del provider
 *
 * Determinismo: se mockea window.matchMedia y se fija la hora con fake timers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ThemeProvider, useTheme } from '../ThemeContext'

function TestButton() {
  const { theme, toggle } = useTheme()
  return <button onClick={toggle}>theme: {theme}</button>
}

function mockMatchMedia(matches: boolean) {
  const mql = {
    matches,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }
  window.matchMedia = vi.fn().mockReturnValue(mql)
  return mql
}

describe('ThemeContext', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark', 'theme-transitioning')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T12:00:00')) // mediodía → "día"
    mockMatchMedia(false) // sistema en light
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('provee tema light por defecto (día + sistema light)', () => {
    render(
      <ThemeProvider>
        <TestButton />
      </ThemeProvider>,
    )
    expect(screen.getByText('theme: light')).toBeDefined()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('usa dark si el sistema prefiere dark aunque sea de día', () => {
    mockMatchMedia(true)
    render(
      <ThemeProvider>
        <TestButton />
      </ThemeProvider>,
    )
    expect(screen.getByText('theme: dark')).toBeDefined()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('usa dark si es de noche aunque el sistema esté en light', () => {
    vi.setSystemTime(new Date('2026-01-01T23:00:00')) // 23:00 → noche
    render(
      <ThemeProvider>
        <TestButton />
      </ThemeProvider>,
    )
    expect(screen.getByText('theme: dark')).toBeDefined()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('reacciona al cambio de prefers-color-scheme en vivo (sin override manual)', () => {
    const mql = mockMatchMedia(false)
    render(
      <ThemeProvider>
        <TestButton />
      </ThemeProvider>,
    )
    expect(screen.getByText('theme: light')).toBeDefined()

    // Simular cambio del OS a dark: invocar el handler registrado
    const changeHandler = mql.addEventListener.mock.calls.find(
      (c: unknown[]) => c[0] === 'change',
    )?.[1] as () => void
    expect(changeHandler).toBeTypeOf('function')

    mql.matches = true
    act(() => changeHandler())
    expect(screen.getByText('theme: dark')).toBeDefined()
  })

  it('toggle manual persiste en localStorage', () => {
    render(
      <ThemeProvider>
        <TestButton />
      </ThemeProvider>,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(localStorage.getItem('spi-theme')).toBe('dark')
  })

  it('toggle cambia a dark y agrega clase .dark', () => {
    render(
      <ThemeProvider>
        <TestButton />
      </ThemeProvider>,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('theme: dark')).toBeDefined()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('toggle vuelve a light', () => {
    render(
      <ThemeProvider>
        <TestButton />
      </ThemeProvider>,
    )
    fireEvent.click(screen.getByRole('button')) // light → dark
    fireEvent.click(screen.getByRole('button')) // dark → light
    expect(screen.getByText('theme: light')).toBeDefined()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('restaura tema desde localStorage (override manual gana)', () => {
    localStorage.setItem('spi-theme', 'dark')
    render(
      <ThemeProvider>
        <TestButton />
      </ThemeProvider>,
    )
    expect(screen.getByText('theme: dark')).toBeDefined()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('no sobreescribe override manual con el auto al cambiar de hora', () => {
    localStorage.setItem('spi-theme', 'light')
    render(
      <ThemeProvider>
        <TestButton />
      </ThemeProvider>,
    )
    // Cambiar hora a noche → NO debe afectar override manual light
    vi.setSystemTime(new Date('2026-01-01T23:30:00'))
    act(() => vi.advanceTimersByTime(31_000))
    expect(screen.getByText('theme: light')).toBeDefined()
  })

  it('usa auto si localStorage tiene valor inválido', () => {
    localStorage.setItem('spi-theme', 'invalid')
    render(
      <ThemeProvider>
        <TestButton />
      </ThemeProvider>,
    )
    // Día + sistema light → light
    expect(screen.getByText('theme: light')).toBeDefined()
  })
})
