import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import {
  Wallet,
  Clock,
  Users,
  TrendingUp,
  FileText,
  Phone,
  CreditCard,
  Receipt,
  AlertCircle,
  BarChart3,
  LineChart as LineChartIcon,
} from 'lucide-react'
import {
  useCobranzaDashboard,
  type CobranzaDebtor,
  type PaymentMethodStat,
} from '../../hooks/queries/useCobranza'
import { useRevenueSeries } from '../../hooks/queries/useDeliveryDashboard'
import { useOrdersList } from '../../hooks/queries/useOrders'
import { downloadFile } from '../../api/client'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { LoadingState } from '../../components/ui/LoadingState'
import { formatMoney } from '../../lib/utils'
import { formatDay } from '../../lib/dates'
import { PAYMENT_STATUS_VARIANT } from '../../lib/order-status'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'

/**
 * Panel de COBRANZA — cuentas por cobrar.
 *
 * Fuentes:
 *   - GET /dashboard/cobranza → KPIs + top deudores + stats por método de pago.
 *   - GET /dashboard/revenue-series?periodo=mes → gráficas de evolución
 *     "Cobrado vs Por cobrar" de los últimos 12 meses (PUNTO 3 del mandato:
 *     el backend la habilitó para superadmin + cobranza).
 *   - GET /orders?paymentStatus=pending&perPage=200 → pedidos con saldo
 *     (el backend interpreta 'pending' como pending|partial, el mismo scope
 *     que usa el dashboard de cobranza).
 *
 * "Ver nota de entrega" navega a Notas de entrega con el cliente prefiltrado
 * (la página lee `clienteId`/`nombre`/`periodo` desde la URL).
 */
export function CobranzaPage() {
  const navigate = useNavigate()
  const { data, isLoading, isError } = useCobranzaDashboard()
  const { data: pendingResp, isLoading: pendingLoading, isError: pendingError } = useOrdersList({
    paymentStatus: 'pending',
    perPage: 200,
  })
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  // Series mensuales de los últimos 12 meses (incluye el mes corriente).
  // El backend arma los buckets mensuales partiendo de `desde`.
  const ahora = new Date()
  const desde12m = new Date(ahora.getFullYear(), ahora.getMonth() - 11, 1)
  const hastaStr = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(
    ahora.getDate(),
  ).padStart(2, '0')}`
  const desdeStr = `${desde12m.getFullYear()}-${String(desde12m.getMonth() + 1).padStart(2, '0')}-01`
  const {
    data: revenueResp,
    isLoading: revenueLoading,
    isError: revenueError,
  } = useRevenueSeries('mes', desdeStr, hastaStr)
  const revenueSeries = revenueResp?.series ?? []
  // label legible ("septiembre de 2026") para los tooltips, key = bucket YYYY-MM.
  const revenueLabels =
    revenueSeries.length > 0
      ? new Map(revenueSeries.map((s: { fecha: string; label: string }) => [s.fecha, s.label]))
      : new Map<string, string>()

  const totals = data?.totals
  const topDebtors = data?.topDebtors ?? []
  const paymentStats = data?.paymentStats ?? []
  const pendingOrders = pendingResp?.items ?? []

  const handleExport = async () => {
    setExportError('')
    setExporting(true)
    try {
      await downloadFile('/exports/cobranza.xlsx', 'cobranza.xlsx')
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'No se pudo generar el Excel')
    } finally {
      setExporting(false)
    }
  }

  const goNotaEntrega = (debtor: CobranzaDebtor) => {
    // Periodo mes: la nota agrupa los pedidos entregados del cliente en el mes
    // corriente. NotasEntregaPage lee estos parámetros al montar.
    const params = new URLSearchParams({
      clienteId: String(debtor.customerId),
      nombre: debtor.customerName,
      periodo: 'mes',
    })
    navigate(`/admin/notas-entrega?${params.toString()}`)
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Wallet className="h-6 w-6 text-spi-navy" />
            Resumen financiero
          </h1>
          <p className="text-sm text-gray-500">
            Cuentas por cobrar: deudores con saldo pendiente y lo cobrado por método de pago.
          </p>
          {exportError && (
            <p className="mt-1 text-xs text-red-600">{exportError}</p>
          )}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleExport}
          loading={exporting}
          disabled={exporting}
        >
          Descargar Excel 📄
        </Button>
      </div>

      {/* ─── KPIs ─── */}
      <div className="mb-8 flex gap-3 overflow-x-auto pb-2">
        <KpiCard
          label="Cobrado"
          value={formatMoney(totals?.totalRevenue)}
          icon={TrendingUp}
          tone="text-green-600 bg-green-100"
        />
        <KpiCard
          label="Por cobrar"
          value={formatMoney(data?.pendingRevenue)}
          icon={Clock}
          tone="text-amber-600 bg-amber-100"
        />
        <KpiCard
          label="Pedidos pendientes"
          value={String(data?.pendingOrders ?? 0)}
          icon={Receipt}
          tone="text-sky-600 bg-sky-100"
        />
        <KpiCard
          label="Deudores"
          value={String(topDebtors.length)}
          icon={Users}
          tone="text-violet-600 bg-violet-100"
        />
      </div>

      {isError && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>No se pudo cargar el resumen de cobranza. Volvé a intentar en un momento.</span>
        </div>
      )}

      {/* ─── Evolución Cobrado vs Por cobrar (últimos 12 meses, PUNTO 3) ─── */}
      <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 text-green-600">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Cobrado vs por cobrar</h2>
              <p className="text-xs text-gray-500">Montos mensuales apilados · últimos 12 meses</p>
            </div>
          </div>
          {revenueLoading ? (
            <LoadingState size="sm" label="Cargando evolución…" />
          ) : revenueError || revenueSeries.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Sin datos de evolución para mostrar.</p>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: '#6b7280' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} />
                  <Tooltip
                    formatter={(value: any) => formatMoney(Number(value))}
                    labelFormatter={(fecha: any) => revenueLabels.get(String(fecha)) ?? String(fecha)}
                  />
                  <Legend />
                  <Bar dataKey="cobrado" name="Cobrado" stackId="cobro" fill="#16a34a" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="porCobrar" name="Por cobrar" stackId="cobro" fill="#d97706" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-600">
              <LineChartIcon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Evolución mensual</h2>
              <p className="text-xs text-gray-500">Comparativa cobrado · por cobrar · total</p>
            </div>
          </div>
          {revenueLoading ? (
            <LoadingState size="sm" label="Cargando evolución…" />
          ) : revenueError || revenueSeries.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Sin datos de evolución para mostrar.</p>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: '#6b7280' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} />
                  <Tooltip
                    formatter={(value: any) => formatMoney(Number(value))}
                    labelFormatter={(fecha: any) => revenueLabels.get(String(fecha)) ?? String(fecha)}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="cobrado" name="Cobrado" stroke="#16a34a" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="porCobrar" name="Por cobrar" stroke="#d97706" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="total" name="Total" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* ─── Top deudores (2/3) ─── */}
        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Pendientes por pagar</h2>
              <p className="text-xs text-gray-500">Clientes con mayor monto pendiente</p>
            </div>
          </div>

          {isLoading ? (
            <LoadingState size="sm" label="Cargando deudores…" />
          ) : topDebtors.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Sin pendientes por pagar</p>
          ) : (
            <ul className="space-y-2">
              {topDebtors.map((d, i) => (
                <li
                  key={d.customerId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gray-50 p-3 transition-colors hover:bg-gray-100 dark:bg-white/5 dark:hover:bg-white/10"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="w-6 text-right text-sm font-medium text-gray-400">{i + 1}.</span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-900">{d.customerName}</p>
                      <p className="flex items-center gap-1 text-xs text-gray-400">
                        <Phone className="h-3 w-3" />
                        {d.customerPhone ?? 'Sin teléfono'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-bold text-amber-600">{formatMoney(d.pendingAmount)}</p>
                      <p className="text-xs text-gray-400">
                        {d.pendingOrders} {d.pendingOrders === 1 ? 'pedido' : 'pedidos'}
                      </p>
                    </div>
                    <Button type="button" variant="secondary" size="sm" onClick={() => goNotaEntrega(d)}>
                      <FileText className="h-4 w-4" />
                      Ver nota de entrega
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ─── Stats por método de pago (1/3) ─── */}
        <Card>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-600">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Cobro por método</h2>
              <p className="text-xs text-gray-400">Desglose de la entrada de pagos según los métodos registrados</p>
            </div>
          </div>

          {isLoading ? (
            <LoadingState size="sm" label="Cargando métodos…" />
          ) : paymentStats.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Todavía no hay pagos registrados.</p>
          ) : (
            <ul className="space-y-2">
              {paymentStats.map((s: PaymentMethodStat) => (
                <li
                  key={s.methodCode}
                  className="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-white/5"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-800">{s.method}</p>
                    <p className="text-xs text-gray-400">
                      {s.count} {s.count === 1 ? 'pago' : 'pagos'}
                    </p>
                  </div>
                  <p className="font-bold text-spi-green">{formatMoney(s.totalAmount)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ─── Pedidos pendientes de cobro ─── */}
      <Card className="mt-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Pedidos pendientes de cobro</h2>
              <p className="text-xs text-gray-500">
                Órdenes con saldo (pendiente o parcial) — tocá una para gestionar los abonos
              </p>
            </div>
          </div>
          {!pendingLoading && (
            <Badge variant="warning">{pendingOrders.length} con saldo</Badge>
          )}
        </div>

        {pendingError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>No se pudieron cargar los pedidos pendientes.</span>
          </div>
        )}

        {pendingLoading ? (
          <LoadingState size="sm" label="Cargando pedidos…" />
        ) : pendingOrders.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">
            Sin pedidos con saldo pendiente. ¡Todo cobrado!
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-spi-border text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3">Pedido</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Método</th>
                  <th className="px-4 py-3 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-spi-border">
                {pendingOrders.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => navigate(`/admin/ordenes/${o.id}`)}
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5"
                  >
                    <td className="px-4 py-3 font-mono font-medium text-gray-900">{o.orderNumber}</td>
                    <td className="px-4 py-3 text-gray-700">{o.customer?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{formatDay(o.createdAt)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={PAYMENT_STATUS_VARIANT[o.paymentStatus]}>
                        {o.paymentMethod?.name ?? '—'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-amber-600">
                      {formatMoney(o.balance ?? o.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

/** Tarjeta de KPI compacta (mismo estilo que el Panel). */
function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  tone: string
}) {
  return (
    <div className="w-44 flex-none">
      <Card className="h-full p-4">
        <div className={`mb-2 flex h-9 w-9 items-center justify-center rounded-lg ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
        <p className="text-xs font-medium leading-tight text-gray-500">{label}</p>
        <p className="mt-1 truncate text-lg font-bold text-gray-900">{value}</p>
      </Card>
    </div>
  )
}