import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Users,
  Package,
  CheckCircle2,
  Wallet,
  FileText,
  Info,
  AlertCircle,
  CalendarDays,
  BadgeCheck,
} from 'lucide-react'
import { useCustomer } from '../../hooks/queries/useCustomers'
import { useOrdersList } from '../../hooks/queries/useOrders'
import { ORDER_STATUS_LABELS } from '../../lib/order-status'
import { api } from '../../api/client'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Avatar } from '../../components/ui/Avatar'
import { LoadingState } from '../../components/ui/LoadingState'
import { formatMoney } from '../../lib/utils'
import { formatDate } from '../../lib/dates'
import { toISODate } from '../../lib/dates'
import { startOfWeek } from '../../lib/dates'

/* ─── Períodos del historial: semana / mes / año ─── */

type HistPeriod = 'semana' | 'mes' | 'año'
type NotaPeriod = 'dia' | 'semana' | 'mes'

const HIST_PERIODS: { value: HistPeriod; label: string }[] = [
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
  { value: 'año', label: 'Año' },
]

const NOTA_PERIODS: { value: NotaPeriod; label: string }[] = [
  { value: 'dia', label: 'Día' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
]

const PILL_CLASS =
  'rounded-lg border border-spi-border bg-surface px-3 py-2 text-sm text-spi-text outline-none focus:border-spi-text focus:ring-2 focus:ring-spi-text/20'

function todayISO(): string {
  const d = new Date()
  return toISODate(d)
}

function computeHistRange(
  period: HistPeriod,
): { desde: string; hasta: string; label: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()

  if (period === 'semana') {
    const lunes = startOfWeek(now)
    const domingo = new Date(lunes)
    domingo.setDate(lunes.getDate() + 6)
    return {
      desde: toISODate(lunes),
      hasta: toISODate(domingo),
      label: `Esta semana (${toISODate(lunes)} al ${toISODate(domingo)})`,
    }
  }
  if (period === 'mes') {
    const fin = new Date(y, m + 1, 0)
    return {
      desde: toISODate(new Date(y, m, 1)),
      hasta: toISODate(fin),
      label: `Este mes (${toISODate(new Date(y, m, 1))} al ${toISODate(fin)})`,
    }
  }
  const fin = new Date(y, 11, 31)
  return {
    desde: toISODate(new Date(y, 0, 1)),
    hasta: toISODate(fin),
    label: `Este año (${toISODate(new Date(y, 0, 1))} al ${toISODate(fin)})`,
  }
}

/* ─── Tipos del preview de nota de entrega (espeja el backend) ─── */

interface DeliveryNoteItem {
  producto: string
  cantidad: number
  precioUnitario: number
}

interface DeliveryNoteOrder {
  id: number
  numero: string
  entregadoEn: string | null
  vendedor: string | null
  metodoPago: string | null
  total: number
  items: DeliveryNoteItem[]
}

interface DeliveryNoteGroup {
  cliente: { id: number; name: string; phone: string | null; email: string | null; address: string | null }
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

/* ─── Página ─── */

export function CustomerDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const customerId = id ? Number(id) : null

  const { data: customer, isLoading: loadingCustomer } = useCustomer(customerId)

  // Historial de pedidos
  const [histPeriod, setHistPeriod] = useState<HistPeriod>('mes')
  const histRange = useMemo(() => computeHistRange(histPeriod), [histPeriod])
  const { data: ordersData, isLoading: loadingOrders } = useOrdersList({
    customerId: customerId ?? undefined,
    desde: histRange.desde,
    hasta: histRange.hasta,
    perPage: 200,
  })
  const orders = ordersData?.items ?? []

  // Preview de nota de entrega
  const [notaPeriod, setNotaPeriod] = useState<NotaPeriod>('dia')
  const [notaFecha, setNotaFecha] = useState(todayISO())
  const [preview, setPreview] = useState<DeliveryNoteData | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [previewNotice, setPreviewNotice] = useState('')

  const deliveredOrders = useMemo(() => orders.filter((o) => o.orderStatus === 'delivered'), [orders])
  const totalDelivered = useMemo(
    () => deliveredOrders.reduce((acc, o) => acc + (Number(o.amount) || 0), 0),
    [deliveredOrders],
  )

  const handleLoadPreview = async () => {
    setPreviewError('')
    setPreviewNotice('')
    setPreview(null)
    setPreviewLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('clienteId', String(customerId))
      params.set('periodo', notaPeriod)
      if (notaFecha) params.set('fecha', notaFecha)

      const res = await api.get<{ data: DeliveryNoteData | null; message?: string }>(
        `/reports/delivery-notes-data?${params.toString()}`,
      )
      if (res.data && res.data.data) {
        setPreview(res.data.data)
      } else {
        setPreviewNotice(res.data?.message ?? 'No hay pedidos entregados en el período seleccionado.')
      }
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'No se pudo cargar la vista previa')
    } finally {
      setPreviewLoading(false)
    }
  }

  if (loadingCustomer) {
    return (
      <div className="mx-auto max-w-5xl">
        <LoadingState />
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="mx-auto max-w-5xl">
        <Card>
          <EmptyState icon={Users} title="Cliente no encontrado" description="El cliente no existe o fue eliminado." />
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Button type="button" variant="ghost" size="sm" className="mb-3" onClick={() => navigate('/admin/clientes')}>
        <ArrowLeft className="h-4 w-4" />
        Volver a clientes
      </Button>

      {/* Encabezado del cliente */}
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <Avatar name={customer.name} size="lg" />
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  customer.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {customer.isActive ? 'Activo' : 'Inactivo'}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-600">
              {customer.rif && (
                <span className="flex items-center gap-1.5">
                  <BadgeCheck className="h-4 w-4 text-gray-400" /> RIF: {customer.rif}
                </span>
              )}
              {customer.phone && (
                <span className="flex items-center gap-1.5">
                  <Phone className="h-4 w-4 text-gray-400" /> {customer.phone}
                </span>
              )}
              {customer.email && (
                <span className="flex items-center gap-1.5">
                  <Mail className="h-4 w-4 text-gray-400" /> {customer.email}
                </span>
              )}
              {customer.address && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-gray-400" /> {customer.address}
                </span>
              )}
              {!customer.rif && !customer.phone && !customer.email && !customer.address && (
                <span className="text-gray-400">Sin datos de contacto</span>
              )}
            </div>
            {customer.notes && (
              <p className="mt-2 text-sm text-gray-500 border-l-2 border-spi-gold pl-3">
                {customer.notes}
              </p>
            )}
          </div>
        </div>

        {/* Resumen del período */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border border-spi-border bg-gray-50 dark:bg-white/5 p-4">
            <p className="flex items-center gap-1.5 text-xs text-gray-500">
              <Package className="h-3.5 w-3.5" /> Pedidos en el período
            </p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{orders.length}</p>
          </div>
          <div className="rounded-lg border border-spi-border bg-gray-50 dark:bg-white/5 p-4">
            <p className="flex items-center gap-1.5 text-xs text-gray-500">
              <CheckCircle2 className="h-3.5 w-3.5" /> Entregados
            </p>
            <p className="mt-1 text-2xl font-bold text-green-600">{deliveredOrders.length}</p>
          </div>
          <div className="rounded-lg border border-spi-border bg-gray-50 dark:bg-white/5 p-4">
            <p className="flex items-center gap-1.5 text-xs text-gray-500">
              <Wallet className="h-3.5 w-3.5" /> Total entregado
            </p>
            <p className="mt-1 text-2xl font-bold text-spi-green">{formatMoney(totalDelivered)}</p>
          </div>
        </div>
      </Card>

      {/* Selector de período del historial */}
      <div className="mt-6 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-gray-400" />
          <span className="text-sm text-gray-500">Historial:</span>
          <div className="inline-flex rounded-lg border border-spi-border bg-surface p-1">
            {HIST_PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setHistPeriod(p.value)}
                className={
                  'rounded-md px-4 py-1.5 text-sm font-medium transition-colors ' +
                  (histPeriod === p.value
                    ? 'bg-spi-navy text-white'
                    : 'text-gray-500 hover:text-spi-text')
                }
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-gray-400">{histRange.label}</p>
      </div>

      {/* Tabla de pedidos */}
      <Card className="mt-3">
        {loadingOrders ? (
          <LoadingState />
        ) : orders.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Sin pedidos en el período"
            description={`No hay pedidos de ${customer.name} en ${histRange.label}. Cambiá el período o creá uno nuevo.`}
            action={{
              label: 'Crear orden',
              onClick: () => navigate(`/admin/ordenes/nueva?cliente=${customer.id}`),
            }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-spi-border text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3">Nº</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Vendedor</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-spi-border">
                {orders.map((o) => (
                  <tr
                    key={o.id}
                    className="hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer"
                    onClick={() => navigate(`/admin/ordenes/${o.id}`)}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{o.orderNumber}</td>
                    <td className="px-4 py-3 text-gray-700">{formatDate(o.createdAt)}</td>
                    <td className="px-4 py-3 text-gray-700">{o.seller?.name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                          o.orderStatus === 'delivered'
                            ? 'bg-green-50 text-green-700'
                            : o.orderStatus === 'cancelled'
                              ? 'bg-gray-100 text-gray-500'
                              : 'bg-yellow-50 text-yellow-700'
                        }`}
                      >
                        {ORDER_STATUS_LABELS[o.orderStatus]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {formatMoney(o.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Nota de entrega del cliente */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <FileText className="h-5 w-5 text-spi-navy" />
          Nota de entrega
        </h2>
        <p className="text-sm text-gray-500">
          Prepará el comprobante de las entregas de {customer.name} y revisá el contenido antes del PDF.
        </p>

        <Card className="mt-3 p-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-spi-text">Período</label>
              <div className="inline-flex rounded-lg border border-spi-border bg-surface p-1">
                {NOTA_PERIODS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setNotaPeriod(p.value)}
                    className={
                      'rounded-md px-4 py-1.5 text-sm font-medium transition-colors ' +
                      (notaPeriod === p.value
                        ? 'bg-spi-navy text-white'
                        : 'text-gray-500 hover:text-spi-text')
                    }
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-spi-text">Fecha de referencia</label>
              <input
                type="date"
                value={notaFecha}
                onChange={(e) => setNotaFecha(e.target.value)}
                className={PILL_CLASS + ' w-full'}
              />
            </div>
            <div>
              <Button type="button" onClick={handleLoadPreview} loading={previewLoading}>
                <FileText className="h-4 w-4" />
                Ver vista previa
              </Button>
            </div>
          </div>

          {previewNotice && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-spi-border bg-gray-50 dark:bg-white/5 p-3 text-sm text-gray-600 dark:text-gray-300">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{previewNotice}</span>
            </div>
          )}
          {previewError && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{previewError}</span>
            </div>
          )}

          {preview && (
            <div className="mt-5 border-t border-spi-border pt-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm font-semibold text-gray-900">
                  NOTA DE ENTREGA — {customer.name}
                </p>
                <p className="text-xs text-gray-400">{preview.rango.label}</p>
              </div>
              <p className="mt-1 text-xs text-gray-400">
                {preview.totalPedidos} pedido(s) entregado(s) · {formatMoney(preview.totalGeneral)}
              </p>

              <div className="mt-4 space-y-4">
                {preview.grupos.flatMap((g) => g.ordenes).map((o) => (
                  <div key={o.id} className="rounded-lg border border-spi-border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-mono text-xs text-gray-500">{o.numero}</p>
                      <p className="text-sm font-semibold text-gray-900">{formatMoney(o.total)}</p>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-400">
                      Entregado {o.entregadoEn ? formatDate(o.entregadoEn) : '—'} · {o.metodoPago ?? '—'} ·{' '}
                      {o.vendedor ?? '—'}
                    </p>
                    {o.items.length > 0 && (
                      <ul className="mt-2 divide-y divide-spi-border">
                        {o.items.map((it, idx) => (
                          <li key={idx} className="flex items-center justify-between py-1 text-sm">
                            <span className="text-gray-700">
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
          )}
        </Card>
      </div>
    </div>
  )
}