import { useEffect, useState } from 'react'
import { CalendarClock } from 'lucide-react'

/**
 * Reloj en vivo para el header: muestra la fecha y hora de VENEZUELA (UTC-4).
 *
 * Es la referencia visual de "qué día/hora cree el sistema" (el CTO lo pidió
 * para validar que los períodos de notas de entrega no tomen datos erróneos:
 * si el reloj del navegador está mal, las fechas de los reportes corren igual).
 *
 * Se actualiza cada segundo; el setInterval se limpia al desmontar.
 * Fuerza zona horaria America/Caracas para consistencia con el backend.
 */
export function LiveClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Venezuela timezone (UTC-4 todo el año, no hay DST)
  const VENEZUELA_TZ = 'America/Caracas'

  const dateLabel = new Intl.DateTimeFormat('es-VE', {
    timeZone: VENEZUELA_TZ,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(now)

  const timeLabel = new Intl.DateTimeFormat('es-VE', {
    timeZone: VENEZUELA_TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(now)

  return (
    <div
      className="hidden sm:flex items-center gap-1.5 rounded-lg border border-spi-border bg-surface px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 tabular-nums"
      title="Fecha y hora del sistema (Venezuela UTC-4)"
      aria-label={`Fecha y hora: ${dateLabel} ${timeLabel}`}
      data-testid="live-clock"
    >
      <CalendarClock className="h-3.5 w-3.5 text-spi-gold dark:text-gray-500" />
      <span className="whitespace-nowrap">
        {dateLabel} · {timeLabel}
      </span>
    </div>
  )
}
