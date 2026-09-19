import { useEffect, useRef } from 'react'
import { cn } from '../../lib/utils'

export interface SectionTab {
  key: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
}

interface SectionTabsProps {
  tabs: readonly SectionTab[]
  activeKey: string
  onChange: (key: string) => void
  /** pill = fondo gris con píldora activa; underline = borde inferior dorado */
  variant?: 'pill' | 'underline'
  size?: 'sm' | 'md'
  className?: string
  /** Clases extra para el botón activo (permite anular el estilo por defecto del variant). */
  activeClassName?: string
  /**
   * Habilita snap-centrado: cada pestaña se centra con scroll-snap al hacer
   * swipe, y al pulsar una pestaña queda centrada en el viewport.
   */
  snap?: boolean
}

/**
 * Navegación de secciones (tabs) reutilizable y mobile-first.
 *
 * En pantallas táctiles los scrollbars son overlay (invisibles hasta hacer
 * swipe). Este componente permite navegar por swipe/drag horizontal y centrar
 * la pestaña activa al pulsarla (snap). Sin flechas ni overlays: scroll nativo
 * limpio con scrollbar fina.
 */
export function SectionTabs({
  tabs,
  activeKey,
  onChange,
  variant = 'pill',
  size = 'md',
  className,
  activeClassName,
  snap = false,
}: SectionTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Centrar la pestaña activa al pulsarla (solo cuando hay overflow y snap activo)
  useEffect(() => {
    if (!snap) return
    const el = scrollRef.current
    if (!el) return
    const activeBtn = el.querySelector<HTMLElement>(`[data-snap-key="${activeKey}"]`)
    if (!activeBtn) return
    const containerRect = el.getBoundingClientRect()
    const btnRect = activeBtn.getBoundingClientRect()
    const left =
      el.scrollLeft + btnRect.left - containerRect.left - (containerRect.width - btnRect.width) / 2
    el.scrollTo({ left, behavior: 'smooth' })
  }, [activeKey, snap])

  return (
    <div className={cn('w-full max-w-full min-w-0', className)}>
      <div
        ref={scrollRef}
        className={cn(
          'flex overflow-x-auto scrollbar-thin scroll-smooth w-full max-w-full min-w-0',
          snap && 'snap-x',
          variant === 'pill'
            ? cn('gap-1 bg-gray-100 dark:bg-white/5 rounded-lg', size === 'sm' ? 'p-0.5' : 'p-1')
            : 'gap-1 border-b border-gray-200 dark:border-spi-border',
        )}
      >
        {tabs.map((t) => {
          const Icon = t.icon
          const active = t.key === activeKey
          return (
            <button
              key={t.key}
              type="button"
              data-snap-key={t.key}
              onClick={() => onChange(t.key)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-1.5 whitespace-nowrap font-medium transition-colors cursor-pointer',
                snap && 'snap-center shrink-0',
                size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2 text-sm',
                variant === 'pill'
                  ? active
                    ? cn(
                        'rounded-md bg-white dark:bg-spi-navy text-spi-text shadow-sm',
                        activeClassName,
                      )
                    : 'rounded-md text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  : cn(
                      'border-b-2',
                      active
                        ? cn('border-spi-gold text-spi-gold', activeClassName)
                        : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
                    ),
              )}
            >
              {Icon && <Icon className="h-4 w-4 shrink-0" />}
              {t.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
