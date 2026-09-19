export function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function daysUntil(dateStr: string): number {
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

/**
 * PGlite guarda los timestamps "YYYY-MM-DD HH:mm:ss(.ms)" SIN zona horaria y el
 * backend los interpreta en hora LOCAL (America/Caracas: db/index.ts hace
 * SET TIME ZONE). Por eso el frontend SIEMPRE los parsea como LOCALES.
 * `new Date("2026-09-18 14:00:00")` es inconsistente entre engines; con "T"
 * en vez de espacio el parseo local es explícito en Chrome/Node.
 */
export function parseLocalDate(dateStr?: string | null): Date {
  const s = String(dateStr ?? '').trim()
  if (!s) return new Date(NaN)
  return new Date(s.replace(' ', 'T'))
}

export function formatDate(dateStr: string): string {
  return parseLocalDate(dateStr + (dateStr.includes('T') ? '' : 'T12:00:00')).toLocaleDateString(
    'es-AR',
    { year: 'numeric', month: 'short', day: 'numeric' },
  )
}

export function formatDay(dateStr: string): string {
  const d = parseLocalDate(dateStr)
  if (isNaN(d.getTime())) return '—'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

export function formatTime(timeStr: string): string {
  return timeStr.slice(0, 5)
}

export function formatDateTime(dateStr?: string | null): string {
  const d = parseLocalDate(dateStr)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-VE', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Tiempo relativo en español: "ahora", "hace 5 min", "hace 3 h", "hace 2 días" */
export function timeAgo(dateStr?: string | null): string {
  const then = parseLocalDate(dateStr).getTime()
  if (isNaN(then)) return ''
  const diffMs = Date.now() - then
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'hace 1 día'
  return `hace ${days} días`
}

export function extractDateKey(dateStr: string): string {
  return dateStr.slice(0, 10)
}

export function getMonthDays(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

export function getMonthStartDay(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function startOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday start
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export function endOfWeek(date: Date): Date {
  const d = startOfWeek(date)
  d.setDate(d.getDate() + 6)
  return d
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

export const DAY_HEADERS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
export const DAY_HEADERS_SHORT = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

export function getHours(): string[] {
  return Array.from({ length: 11 }, (_, i) => `${i + 7}:00`)
}

export function getWeekNumber(date: Date): number {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  return (
    1 +
    Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
  )
}
