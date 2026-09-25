import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  FileText,
  Download,
  CalendarDays,
  Users,
  CheckCircle2,
  AlertCircle,
  Info,
  Search,
  X,
  Building2,
} from 'lucide-react'
import { useCustomersList, useBranches } from '../../hooks/queries/useCustomers'
import { api, downloadFile } from '../../api/client'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { formatMoney } from '../../lib/utils'

type Periodo = 'dia' | 'semana' | 'mes'

/** Espeja la respuesta de GET /reports/delivery-notes-data (backend). */
interface DeliveryNoteItem {
  producto: string
  cantidad: number
  precioUnitario: number
}

interface DeliveryNoteOrder {
  id: number
  numero: string
  entregadoEn: string | null
  operador: string | null
  conductor: string | null
  metodoPago: string | null
  paymentStatus: string | null
  saldo: number
  total: number
  items: DeliveryNoteItem[]
}

interface DeliveryNoteGroup {
  cliente: {
    id: number
    name: string
    phone: string | null
    email: string | null
    address: string | null
  }
  ordenes: DeliveryNoteOrder[]
  totalPeriodo: number
}

interface DeliveryNoteData {
  rango: { desde: string; hasta: string; label: string }
  emitidoEn: string
  totalPedidos: number
  totalGeneral: number
  grupos: DeliveryNoteGroup[]
}

const PERIODOS: { value: Periodo; label: string }[] = [
  { value: 'dia', label: 'Día' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
]

const SELECT_CLASS =
  'w-full rounded-lg border border-spi-border bg-surface px-3 py-2 text-sm text-spi-text outline-none focus:border-spi-text focus:ring-2 focus:ring-spi-text/20'

/** Fecha local → 'YYYY-MM-DD' (sin pasar por UTC, que correría el día). */
function todayISO(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

function formatDay(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

/** 'YYYY-MM-DD' → Date LOCAL (el mismo parseo sin UTC que usa el reporte). */
function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Date local → 'YYYY-MM-DD' (sin pasar por UTC). */
function toISO(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** Suma/resta días a un 'YYYY-MM-DD' (fechas locales). */
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return toISO(new Date(y, m - 1, d + days))
}

/** Suma/resta meses a un 'YYYY-MM-DD' (fechas locales). */
function addMonths(iso: string, months: number): string {
  const [y, m] = iso.split('-').map(Number)
  return toISO(new Date(y, m - 1 + months, 1))
}

/** Lunes de la semana que contiene `iso` (semana calendario es-VE). */
function weekMonday(iso: string): string {
  const dt = parseISO(iso)
  const diff = (dt.getDay() + 6) % 7 // 0=domingo → 6, lunes → 0
  return toISO(new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() - diff))
}

/** Nombre del mes de un 'YYYY-MM-DD' (ej. "Septiembre 2026"). */
function monthName(iso: string): string {
  const base = parseISO(iso)
  const name = base.toLocaleDateString('es-VE', { month: 'long', year: 'numeric' })
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** Espeja el cálculo del backend para mostrar el rango exacto que se va a generar. */
function periodPreview(periodo: Periodo, fechaISO: string): string {
  if (!fechaISO) return 'Elegí una fecha para ver el rango'
  const [y, m, d] = fechaISO.split('-').map(Number)
  const base = new Date(y, m - 1, d)

  if (periodo === 'dia') return `Entregas del ${formatDay(base)}`

  if (periodo === 'semana') {
    const diffToMonday = (base.getDay() + 6) % 7
    const monday = new Date(y, m - 1, d - diffToMonday)
    const sunday = new Date(y, m - 1, d - diffToMonday + 6)
    return `Entregas del ${formatDay(monday)} al ${formatDay(sunday)}`
  }

  const monthName = base.toLocaleDateString('es-VE', { month: 'long', year: 'numeric' })
  return `Entregas de ${monthName.charAt(0).toUpperCase()}${monthName.slice(1)}`
}

/** Badge legible del estado de pago en la vista previa web. */
function paymentBadge(status: string | null): { label: string; className: string } {
  switch (status) {
    case 'paid':
      return { label: 'Pagado', className: 'bg-green-100 text-green-700' }
    case 'partial':
      return { label: 'Parcial', className: 'bg-amber-100 text-amber-700' }
    case 'pending':
      return { label: 'Pendiente', className: 'bg-red-100 text-red-700' }
    default:
      return { label: status ?? '—', className: 'bg-gray-100 text-gray-600' }
  }
}

export function NotasEntregaPage() {
  // Deep link desde CobranzaPage: /admin/notas-entrega?clienteId=&nombre=&periodo=
  // Se leen UNA vez al montar y alimentan los estados iniciales (la página
  // sigue siendo 100% editable después).
  const [searchParams] = useSearchParams()
  const urlClienteId = searchParams.get('clienteId') ?? ''
  const urlNombre = searchParams.get('nombre') ?? ''
  const urlPeriodo = searchParams.get('periodo')
  const urlFecha = searchParams.get('fecha')

  const [clienteId, setClienteId] = useState(urlClienteId)
  // Typeahead lazy: el dropdown lista los primeros 10 clientes al hacer focus
  // (y filtra por la búsqueda cuando escribís). El nombre elegido se persiste
  // aparte porque el cliente puede no estar entre los resultados actuales
  // (CTO 2026-09-18: nunca listas enteras).
  const [customerQuery, setCustomerQuery] = useState(urlNombre)
  const [customerName, setCustomerName] = useState(urlNombre)
  const [customerIsGroup, setCustomerIsGroup] = useState(false)
  const [customerOpen, setCustomerOpen] = useState(false)
  // Sucursal específica de un grupo (vacío = grupo consolidado).
  const [branchId, setBranchId] = useState('')
  const [periodo, setPeriodo] = useState<Periodo>(
    urlPeriodo === 'dia' || urlPeriodo === 'semana' || urlPeriodo === 'mes' ? urlPeriodo : 'dia',
  )
  const [fecha, setFecha] = useState(() => {
    if (urlFecha) return urlFecha
    // Normalizar la fecha base al período que vino (mismo criterio que los
    // controles de la página: semana → lunes, mes → día 1).
    if (urlPeriodo === 'semana') return weekMonday(todayISO())
    if (urlPeriodo === 'mes') return todayISO().slice(0, 8) + '01'
    return todayISO()
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [done, setDone] = useState('')
  // Exportación Excel (.xlsx) — separada del PDF para que no se pisen.
  const [exportingXlsx, setExportingXlsx] = useState(false)

  // Vista previa web (JSON del backend, antes del PDF)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [previewNotice, setPreviewNotice] = useState('')
  const [previewData, setPreviewData] = useState<DeliveryNoteData | null>(null)

  const { data: customersData, isLoading: loadingCustomers } = useCustomersList({
    search: customerQuery.trim() || undefined,
    perPage: 10,
  })
  const customers = useMemo(
    () => [...(customersData?.items ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [customersData],
  )

  // Sucursales del grupo seleccionado (para generar nota de sucursal puntual).
  const { data: branches = [] } = useBranches(customerIsGroup && clienteId ? Number(clienteId) : null)

  const preview = useMemo(() => periodPreview(periodo, fecha), [periodo, fecha])

  const selectedCustomer = customerName ? { name: customerName } : null

  const pickCustomer = (id: number, name: string, isGroup: boolean) => {
    setClienteId(String(id))
    setCustomerName(name)
    setCustomerIsGroup(isGroup)
    setCustomerQuery(name)
    setCustomerOpen(false)
    // Cambió el cliente → resetea la sucursal.
    setBranchId('')
  }

  const clearCustomer = () => {
    setClienteId('')
    setCustomerName('')
    setCustomerIsGroup(false)
    setCustomerQuery('')
    setCustomerOpen(false)
    setBranchId('')
  }

  const handleLoadPreview = async () => {
    setPreviewError('')
    setPreviewNotice('')
    setPreviewData(null)
    setPreviewLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('periodo', periodo)
      if (fecha) params.set('fecha', fecha)
      if (branchId) {
        // Nota de UNA sucursal: branchId gana sobre clienteId en el backend.
        params.set('branchId', branchId)
      } else if (clienteId) {
        params.set('clienteId', clienteId)
      }

      const res = await api.get<DeliveryNoteData | null>(
        `/reports/delivery-notes-data?${params.toString()}`,
      )
      // OJO: api.get devuelve { success, data } en runtime → res.data YA es el dto.
      // Antes esto hacía if(res.data && res.data.data) y nunca entraba (preview roto).
      const dto = res.data
      if (dto) {
        setPreviewData(dto)
      } else {
        // "No hay entregas en el período" → aviso neutro, no error.
        const msg = (res as unknown as { message?: string }).message
        setPreviewNotice(msg ?? 'No hay pedidos entregados en el período seleccionado.')
      }
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'No se pudo cargar la vista previa')
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleGenerate = async () => {
    setError('')
    setNotice('')
    setDone('')
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('periodo', periodo)
      if (fecha) params.set('fecha', fecha)
      if (branchId) {
        params.set('branchId', branchId)
      } else if (clienteId) {
        params.set('clienteId', clienteId)
      }

      const result = await downloadFile(
        `/reports/delivery-notes?${params.toString()}`,
        'notas-entrega.pdf',
      )

      // "No hay entregas en el período" no es un error: es un aviso neutro.
      if (!result.downloaded) {
        setNotice(result.message ?? 'No hay nada para descargar en el período seleccionado.')
        return
      }

      setDone(
        selectedCustomer
          ? `Nota de entrega de ${selectedCustomer.name} generada correctamente.`
          : 'Notas de entrega generadas correctamente (un cliente por página).',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el PDF')
    } finally {
      setLoading(false)
    }
  }

  /** Excel .xlsx — MISMOS filtros que el PDF (cliente, sucursal, período y fecha). */
  const handleExportXlsx = async () => {
    setError('')
    setNotice('')
    setDone('')
    setExportingXlsx(true)
    try {
      const params = new URLSearchParams()
      params.set('periodo', periodo)
      if (fecha) params.set('fecha', fecha)
      if (branchId) {
        params.set('branchId', branchId)
      } else if (clienteId) {
        params.set('clienteId', clienteId)
      }

      const result = await downloadFile(
        `/exports/notas-entrega.xlsx?${params.toString()}`,
        'notas-entrega.xlsx',
      )

      if (!result.downloaded) {
        setNotice(result.message ?? 'No hay nada para descargar en el período seleccionado.')
        return
      }

      setDone(
        selectedCustomer
          ? `Excel de notas de entrega de ${selectedCustomer.name} generado correctamente.`
          : 'Excel de notas de entrega generado correctamente.',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el Excel')
    } finally {
      setExportingXlsx(false)
    }
  }

  const fechaLabel =
    periodo === 'dia'
      ? 'Fecha (día exacto)'
      : periodo === 'semana'
        ? 'Semana (lunes a domingo)'
        : 'Mes'

  /** Cambia de período y normaliza la fecha base para que el control sea estable. */
  const handlePeriodoChange = (p: Periodo) => {
    setPeriodo(p)
    if (p === 'semana') {
      // La fecha base pasa a ser el lunes de la semana actual → navegar de a 7 suma/resta semanas.
      setFecha(weekMonday(fecha))
    } else if (p === 'mes') {
      // La fecha base pasa a ser el día 1 del mes → navegar de a 1 mes es estable.
      setFecha(fecha.slice(0, 8) + '01')
    }
  }

  // Para el control de semana: fecha base = lunes; el domingo es lunes + 6.
  const semanaInicio =
    periodo === 'semana'
      ? weekMonday(fecha)
      : periodo === 'mes'
        ? fecha.slice(0, 8) + '01'
        : fecha
  const semanaLunes = periodo === 'semana' ? parseISO(weekMonday(fecha)) : null
  const semanaDomingo = semanaLunes ? new Date(semanaLunes.getFullYear(), semanaLunes.getMonth(), semanaLunes.getDate() + 6) : null

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FileText className="h-6 w-6 text-spi-navy" />
          Notas de entrega
        </h1>
        <p className="text-sm text-gray-500">
          Generá el comprobante en PDF de los pedidos entregados, agrupados por cliente.
        </p>
      </div>

      <Card>
        <div className="space-y-5 p-5">
          {/* Cliente — typeahead lazy (busca server-side, 10 resultados) */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-spi-text">
              <Users className="h-4 w-4 text-gray-400" />
              Cliente
            </label>
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={customerQuery}
                  onChange={(e) => {
                    setCustomerQuery(e.target.value)
                    setCustomerOpen(true)
                    // Al editar, el cliente elegido deja de estar fijo.
                    if (clienteId && e.target.value !== customerName) {
                      setClienteId('')
                      setCustomerName('')
                    }
                  }}
                  onFocus={() => setCustomerOpen(true)}
                  onBlur={() => setTimeout(() => setCustomerOpen(false), 150)}
                  placeholder={loadingCustomers ? 'Cargando clientes...' : 'Buscar cliente por nombre...'}
                  className="w-full rounded-lg border border-spi-border bg-surface py-2 pl-9 pr-9 text-sm text-spi-text placeholder-gray-400 outline-none focus:border-spi-text focus:ring-2 focus:ring-spi-text/20"
                />
                {(customerQuery || customerName) && (
                  <button
                    type="button"
                    onClick={clearCustomer}
                    aria-label="Quitar cliente (todos)"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {customerOpen && (
                <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-spi-border bg-surface shadow-lg">
                  {loadingCustomers && customers.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-gray-400">Cargando clientes...</p>
                  ) : customers.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-gray-400">
                      {customerQuery.trim() ? 'Sin clientes que coincidan.' : 'No hay clientes registrados.'}
                    </p>
                  ) : (
                    <>
                      {/* Sin búsqueda: el listado general ya está cargado por
                          useCustomersList({ perPage: 10 }) → mostramos los
                          primeros 10 ordenados por nombre apenas se hace focus. */}
                      {!customerQuery.trim() && (
                        <p className="border-b border-spi-border px-4 py-2 text-xs text-gray-400">
                          Primeros 10 clientes — escribí para filtrar.
                        </p>
                      )}
                      {customers.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onMouseDown={(e) => {
                            // onMouseDown corre antes que el onBlur del input.
                            e.preventDefault()
                            pickCustomer(c.id, c.name, Boolean(c.isGroup))
                          }}
                          className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm text-gray-800 hover:bg-gray-50 dark:hover:bg-white/5"
                        >
                          <span>{c.name}</span>
                          {c.phone && <span className="text-xs text-gray-400">{c.phone}</span>}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-400">
              {clienteId
                ? 'Solo se incluirán los pedidos de este cliente.'
                : 'Un cliente por página, con el detalle de sus productos y totales.'}
            </p>
          </div>

          {/* Alcance de la nota: grupo consolidado o sucursal puntual (CTO 2026-09-24).
              Aparece cuando el cliente marcado es un grupo con sucursales. */}
          {customerIsGroup && branches.length > 0 && (
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-spi-text">
                <Building2 className="h-4 w-4 text-gray-400" />
                Alcance de la nota
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-spi-text">
                  <input
                    type="radio"
                    name="nota-alcance"
                    checked={branchId === ''}
                    onChange={() => setBranchId('')}
                    className="accent-spi-navy"
                  />
                  Nota general — todo el grupo ({customerName})
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-sm text-spi-text">
                    <input
                      type="radio"
                      name="nota-alcance"
                      checked={branchId !== ''}
                      onChange={() => setBranchId(String(branches[0]?.id ?? ''))}
                      className="accent-spi-navy"
                    />
                    Sucursal puntual
                  </label>
                  {branchId !== '' && (
                    <select
                      value={branchId}
                      onChange={(e) => setBranchId(e.target.value)}
                      className={SELECT_CLASS + ' max-w-xs'}
                      aria-label="Sucursal"
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
              <p className="mt-1 text-xs text-gray-400">
                {branchId
                  ? 'La nota incluye solo los pedidos entregados a esa sucursal, con su cuenta y saldo.'
                  : 'La nota consolida los pedidos de todas las sucursales del grupo.'}
              </p>
            </div>
          )}

          {/* Período */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-spi-text">
              <CalendarDays className="h-4 w-4 text-gray-400" />
              Período
            </label>
            <div className="inline-flex rounded-lg border border-spi-border bg-surface p-1">
              {PERIODOS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => handlePeriodoChange(p.value)}
                  className={
                    'rounded-md px-4 py-1.5 text-sm font-medium transition-colors ' +
                    (periodo === p.value
                      ? 'bg-spi-navy text-white'
                      : 'text-gray-500 hover:text-spi-text')
                  }
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Fecha — control contextual según el período. El CTO lo pidió explícito:
              día → elegís el día; semana → elegís la semana; mes → elegís el mes. */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-spi-text">{fechaLabel}</label>

            {periodo === 'dia' && (
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className={SELECT_CLASS + ' max-w-xs'}
                aria-label="Día"
              />
            )}

            {periodo === 'semana' && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFecha(addDays(semanaInicio, -7))}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-spi-border bg-surface text-spi-text hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                  aria-label="Semana anterior"
                >
                  ‹
                </button>
                <div className="min-w-52 rounded-lg border border-spi-border bg-surface px-3 py-2 text-sm text-spi-text tabular-nums">
                  {semanaLunes && semanaDomingo
                    ? `${formatDay(semanaLunes)} al ${formatDay(semanaDomingo)}`
                    : '—'}
                </div>
                <button
                  type="button"
                  onClick={() => setFecha(addDays(semanaInicio, 7))}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-spi-border bg-surface text-spi-text hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                  aria-label="Semana siguiente"
                >
                  ›
                </button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setFecha(weekMonday(todayISO()))}
                >
                  Esta semana
                </Button>
              </div>
            )}

            {periodo === 'mes' && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFecha(addMonths(semanaInicio, -1))}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-spi-border bg-surface text-spi-text hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                  aria-label="Mes anterior"
                >
                  ‹
                </button>
                <div className="min-w-40 rounded-lg border border-spi-border bg-surface px-3 py-2 text-sm text-spi-text">
                  {fecha ? monthName(fecha.slice(0, 8) + '01') : '—'}
                </div>
                <button
                  type="button"
                  onClick={() => setFecha(addMonths(semanaInicio, 1))}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-spi-border bg-surface text-spi-text hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                  aria-label="Mes siguiente"
                >
                  ›
                </button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setFecha(todayISO().slice(0, 8) + '01')}
                >
                  Este mes
                </Button>
              </div>
            )}
          </div>

          {/* Preview del rango */}
          <div className="rounded-lg border border-spi-border bg-gray-50 dark:bg-white/5 px-4 py-3">
            <p className="text-sm text-spi-text">{preview}</p>
            <p className="mt-0.5 text-xs text-gray-400">
              Solo se incluyen pedidos con estado <span className="font-medium">entregado</span>.
            </p>
          </div>

          {notice && (
            <div className="flex items-start gap-2 rounded-lg border border-spi-border bg-gray-50 dark:bg-white/5 p-3 text-sm text-gray-600 dark:text-gray-300">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {done && (
            <div className="flex items-start gap-2 rounded-lg border border-spi-green/30 bg-spi-green/10 p-3 text-sm text-green-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{done}</span>
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-spi-border pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={handleExportXlsx}
              loading={exportingXlsx}
              disabled={exportingXlsx}
            >
              <Download className="h-4 w-4" />
              Descargar Excel .xlsx
            </Button>
            <Button type="button" onClick={handleGenerate} loading={loading}>
              <Download className="h-4 w-4" />
              Generar PDF
            </Button>
          </div>
        </div>
      </Card>

      {previewError && (
        <Card className="mt-4">
          <div className="flex items-start gap-2 p-4 text-sm text-red-600">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{previewError}</span>
          </div>
        </Card>
      )}

      {previewData && (
        <Card className="mt-4 p-5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-lg font-bold text-gray-900">
              {selectedCustomer ? `NOTA DE ENTREGA — ${selectedCustomer.name}` : 'NOTAS DE ENTREGA'}
            </p>
            <p className="text-xs text-gray-400">{previewData.rango.label}</p>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Pedidos entregados: <span className="font-semibold">{previewData.totalPedidos}</span> · Total:{' '}
            <span className="font-semibold text-spi-green">{formatMoney(previewData.totalGeneral)}</span>
          </p>

          <div className="mt-5 space-y-6">
            {previewData.grupos.map((g) => (
              <div key={g.cliente.id}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="font-semibold text-gray-900">{g.cliente.name}</p>
                  <p className="text-sm font-semibold text-gray-700">
                    {formatMoney(g.totalPeriodo)}
                  </p>
                </div>
                {g.cliente.phone || g.cliente.email || g.cliente.address ? (
                  <p className="mt-0.5 text-xs text-gray-400">
                    {[g.cliente.phone, g.cliente.email, g.cliente.address].filter(Boolean).join(' · ')}
                  </p>
                ) : null}

                <div className="mt-2 divide-y divide-spi-border rounded-lg border border-spi-border">
                  {g.ordenes.map((o) => (
                    <div key={o.id} className="p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-mono text-xs text-gray-500">{o.numero}</p>
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${paymentBadge(o.paymentStatus).className}`}
                          >
                            {paymentBadge(o.paymentStatus).label}
                          </span>
                          <p className="text-sm font-semibold text-gray-900">{formatMoney(o.total)}</p>
                        </div>
                      </div>
                      <p className="mt-0.5 text-xs text-gray-400">
                        Entregado {o.entregadoEn ? new Date(o.entregadoEn).toLocaleDateString('es-AR', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'} ·{' '}
                        {o.metodoPago ?? '—'} · {o.operador ?? '—'} · {o.conductor ?? '—'}
                      </p>
                      {o.saldo > 0.005 && (
                        <p className="mt-0.5 text-xs font-semibold text-red-600">
                          Saldo pendiente: {formatMoney(o.saldo)}
                        </p>
                      )}
                      {o.items.length > 0 && (
                        <ul className="mt-2">
                          {o.items.map((it, idx) => (
                            <li
                              key={idx}
                              className="flex items-center justify-between py-0.5 text-sm text-gray-600"
                            >
                              <span>
                                {it.cantidad}× {it.producto}
                              </span>
                              <span className="text-xs text-gray-400">
                                {formatMoney(it.precioUnitario * it.cantidad)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
