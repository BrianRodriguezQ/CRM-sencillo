import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import {
  Package,
  Truck,
  CheckCircle2,
  XCircle,
  DollarSign,
  Users,
  Shield,
  Clock,
  ArrowRight,
  MapPin,
  AlertTriangle,
  TrendingUp,
  BarChart2,
  Calendar,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import {
  useDeliveryDashboard,
  useRevenueSeries,
  useTopClients,
  type DriverDashboardStats,
  type SellerDashboardStats,
  type SuperadminDashboardStats,
  type RevenueSeriesPoint,
  type TopClientEntry,
} from '../../hooks/queries/useDeliveryDashboard'
import { useUpdateOrderStatus } from '../../hooks/queries/useOrders'
import type { OrderStatus } from '../../lib/order-status'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_VARIANT,
  PAYMENT_STATUS_LABELS,
  nextDriverStatus,
} from '../../lib/order-status'
import { formatMoney } from '../../lib/utils'
import { formatDay, toISODate } from '../../lib/dates'

export function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data, isLoading } = useDeliveryDashboard(user?.role)

  const stats = data as { totals?: Record<string, unknown>; recentOrders?: unknown[] } | undefined

  const totals = (stats?.totals ?? {}) as Record<string, number | string>

  const orderCount = (key: string) => (typeof totals[key] === 'number' ? totals[key] : 0)
  // Backend devuelve numbers; revenue ahora acepta number | string
  const revenue = (key: string) => {
    const v = totals[key]
    return typeof v === 'number' ? v : (typeof v === 'string' ? Number(v) : 0)
  }

  type StatCard = {
    label: string
    value: string
    icon: React.ComponentType<{ className?: string }>
    tone: string
    to?: string
  }

  // ─── Stat cards base (todos los roles) ───
  const baseStatCards: StatCard[] = [
    { label: 'Órdenes hoy', value: String(orderCount('todayOrders')), icon: Package, tone: 'text-sky-600 bg-sky-100' },
    { label: 'En progreso', value: String(orderCount('inProgress')), icon: Clock, tone: 'text-amber-600 bg-amber-100' },
    { label: 'Entregadas', value: String(orderCount('delivered')), icon: CheckCircle2, tone: 'text-green-600 bg-green-100' },
    { label: 'Canceladas', value: String(orderCount('cancelled')), icon: XCircle, tone: 'text-red-600 bg-red-100' },
  ]

  // ─── Quinto card según rol ───
  let extraStatCards: StatCard[] = []
  if (user?.role === 'operador') {
    extraStatCards = [{
      label: 'Sin asignar',
      value: String((data as SellerDashboardStats | undefined)?.unassigned ?? 0),
      icon: AlertTriangle,
      tone: 'text-amber-600 bg-amber-100',
      to: '/admin/ordenes?status=created',
    }]
  } else if (user?.role === 'conductor') {
    extraStatCards = [{
      label: 'Ganancias',
      value: formatMoney(revenue('totalRevenue')),
      icon: DollarSign,
      tone: 'text-spi-green bg-spi-green/10',
    }]
  } else if (user?.role === 'superadmin') {
    // Superadmin: KPIs de dinero (Cobrado / Por cobrar) — sin "Ingresos cobrados" duplicado
    extraStatCards = [
      {
        label: 'Cobrado',
        value: formatMoney(revenue('totalRevenue')),
        icon: DollarSign,
        tone: 'text-green-600 bg-green-100',
      },
      {
        label: 'Por cobrar',
        value: formatMoney(revenue('pendingRevenue')),
        icon: Clock,
        tone: 'text-amber-600 bg-amber-100',
      },
    ]
  }

  const statCards = [...baseStatCards, ...extraStatCards]

  const recentOrders = (stats?.recentOrders ?? []) as Array<Record<string, unknown>>

  // ─── Superadmin: top clientes (solo se ejecutan para superadmin) ───
  const isSuperadmin = user?.role === 'superadmin'
  const { data: topClientsResp } = useTopClients(
    isSuperadmin ? 'semana' : 'semana',
    isSuperadmin ? toISODate(new Date(Date.now() - 8 * 7 * 24 * 60 * 60 * 1000)) : undefined,
    isSuperadmin ? toISODate(new Date()) : undefined,
    8,
  )

  const topClients = topClientsResp?.data ?? []

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Panel</h1>
          <p className="text-sm text-gray-500">
            Hola, {user?.name?.split(' ')[0]} — este es el resumen de <strong>L&L System</strong>.
          </p>
        </div>
        <div className="flex gap-2">
          {user?.role !== 'conductor' && (
            <Link
              to="/admin/ordenes/nueva"
              className="inline-flex items-center gap-2 rounded-lg bg-spi-gold px-3.5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-yellow-600"
            >
              <Package className="h-4 w-4" />
              Nueva orden
            </Link>
          )}
        </div>
      </div>

      {/* ─── Stats cards: single row, horizontal scroll on mobile ─── */}
      <div className="flex gap-3 mb-8 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-spi-border scrollbar-track-transparent -mx-2 px-2">
        {isLoading
          ? Array.from({ length: statCards.length }).map((_, i) => (
              <div key={i} className="flex-none w-44 animate-pulse">
                <div className="h-10 w-10 rounded-lg bg-gray-200 mb-2" />
                <div className="h-3 w-16 bg-gray-200 rounded mb-1" />
                <div className="h-5 w-20 bg-gray-200 rounded" />
              </div>
            ))
          : statCards.map((s: StatCard, i) => {
              const to = s.to
              const isClickable = !!to
              return (
                <div key={i} className={`flex-none w-44 ${isClickable ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
                  onClick={isClickable ? () => navigate(to!) : undefined}
                  role={isClickable ? 'button' : undefined}
                  tabIndex={isClickable ? 0 : undefined}
                  onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') navigate(to!) } : undefined}
                >
                  <Card className="h-full p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg {s.tone}">
                        <s.icon className="h-5 w-5" />
                      </div>
                    </div>
                    <p className="text-xs font-medium text-gray-500 leading-tight">{s.label}</p>
                    <p className="mt-1 text-lg font-bold text-gray-900 truncate">{s.value}</p>
                  </Card>
                </div>
              )
            })}
      </div>

      {/* ─── Conductor: próxima entrega ─── */}
      {user?.role === 'conductor' && (
        <DriverNextDelivery data={data as DriverDashboardStats | undefined} />
      )}

      {/* ─── Superadmin: Gráficos de ingresos + Top clientes ─── */}
      {user?.role === 'superadmin' && (
        <SuperadminRevenueCharts
          topClients={topClients}
        />
      )}

      {/* ─── operador: Top clientes + Órdenes recientes ─── */}
      {user?.role === 'operador' && (
        <SellerSummary data={data as SellerDashboardStats | undefined} recentOrders={recentOrders} />
      )}

      {/* ─── Superadmin: Equipo + Top operadores/conductores ─── */}
      {user?.role === 'superadmin' && (
        <SuperadminSummary data={data as SuperadminDashboardStats | undefined} />
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
 * COMPONENTES INTERNOS
 * ═══════════════════════════════════════════════════════════════════════════ */

function DriverNextDelivery({ data }: { data: DriverDashboardStats | undefined }) {
  const navigate = useNavigate()
  const active = (data?.recentOrders ?? []).filter(
    (o: any) => ['created', 'accepted', 'in_transit'].includes(o.orderStatus),
  )
  const activeOrders = active.length > 0 ? [...active].reverse() : []

  if (activeOrders.length === 0) {
    return (
      <Card className="rounded-xl bg-white dark:bg-spi-navy p-6 text-gray-900 dark:text-white mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-spi-gold/20 text-spi-gold">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Sin entregas activas</h2>
            <p className="text-sm text-gray-500 dark:text-white/70">
              Cuando te asignen una orden, aparece acá con un botón para aceptarla.
            </p>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="rounded-xl bg-white dark:bg-spi-navy p-6 text-gray-900 dark:text-white mb-8 overflow-hidden">
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <MapPin className="h-5 w-5 text-spi-gold" />
            Tu cola de entregas
          </h2>
          <p className="text-sm text-gray-500 dark:text-white/60">
            {activeOrders.length} {activeOrders.length === 1 ? 'entrega activa' : 'entregas activas'} · prioridad por orden de llegada
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {activeOrders.map((order) => (
          <div
            key={order.id}
            className="group flex items-center justify-between gap-4 p-4 rounded-lg bg-gray-50 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
            onClick={() => navigate(`/admin/ordenes/${order.id}`)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/admin/ordenes/${order.id}`) }}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <p className="font-mono font-semibold text-gray-900 dark:text-white">{order.orderNumber}</p>
                <Badge variant={ORDER_STATUS_VARIANT[order.orderStatus as OrderStatus]} size="sm">
                  {ORDER_STATUS_LABELS[order.orderStatus as OrderStatus]}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-gray-500 dark:text-white/70 truncate">
                {order.customer?.name ?? '—'} · {order.deliveryAddress ?? order.customer?.address ?? 'Sin dirección'}
              </p>
              <p className="mt-1 text-xs text-gray-400 dark:text-white/50">
                Total: {formatMoney(order.balance ?? order.amount ?? 0)} · {order.paymentMethod?.name ?? '—'}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-spi-gold transition-colors shrink-0" />
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-gray-500 dark:text-white/60">
        Hacé clic en una orden para ver el detalle y operar (aceptar, iniciar viaje, marcar entregada).
      </p>
    </Card>
  )
}

function SellerSummary({ data, recentOrders }: { data: SellerDashboardStats | undefined; recentOrders: Array<Record<string, unknown>> }) {
  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
            <Users className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Tus clientes top (por ganancia cobrada)</h2>
        </div>
        {(data?.topCustomers?.length ?? 0) === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Sin ventas todavía.</p>
        ) : (
          <ul className="space-y-2">
            {data?.topCustomers.map((c) => (
              <li key={c.id} className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-800">{c.name}</span>
                <Badge variant="success">{c.totalOrders} órdenes · {formatMoney(c.totalAmount)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
            <Package className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Tus órdenes recientes</h2>
        </div>
        {recentOrders.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Sin órdenes.</p>
        ) : (
          <ul className="space-y-2">
            {recentOrders.slice(0, 5).map((o) => (
              <li key={String(o.id)} className="flex items-center justify-between text-sm">
                <Link to={`/admin/ordenes/${o.id}`} className="font-medium text-gray-800 underline-offset-2 hover:text-spi-green hover:underline">
                  {String(o.orderNumber)}
                </Link>
                <Badge variant={ORDER_STATUS_VARIANT[o.orderStatus as OrderStatus]}>{ORDER_STATUS_LABELS[o.orderStatus as OrderStatus]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function SuperadminSummary({ data }: { data: SuperadminDashboardStats | undefined }) {
  const topSellers = data?.topSellers ?? []
  const topDrivers = data?.topDrivers ?? []

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
            <Shield className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Equipo</h2>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <StatMini label="operadores" value={String(data?.activeSellers ?? 0)} />
          <StatMini label="Conductores" value={String(data?.activeDrivers ?? 0)} />
          <StatMini label="Clientes" value={String(data?.totalCustomers ?? 0)} />
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
              <Users className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Top operadores (ganancia)</h2>
          </div>
          {topSellers.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">Sin ventas todavía.</p>
          ) : (
            <ul className="space-y-2">
              {topSellers.map((s) => (
                <li key={s.id} className="flex items-center justify-between text-sm">
                  <Link to={`/admin/equipo/${s.id}`} className="font-medium text-gray-800 underline-offset-2 hover:text-spi-green hover:underline">
                    {s.name}
                  </Link>
                  <Badge variant="success">{s.totalOrders} órdenes · {formatMoney(s.totalAmount)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-600">
              <TrendingUp className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Top conductores (entregadas)</h2>
          </div>
          {topDrivers.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">Sin entregas todavía.</p>
          ) : (
            <ul className="space-y-2">
              {topDrivers.map((d) => (
                <li key={d.id} className="flex items-center justify-between text-sm">
                  <Link to={`/admin/equipo/${d.id}`} className="font-medium text-gray-800 underline-offset-2 hover:text-spi-green hover:underline">
                    {d.name}
                  </Link>
                  <Badge variant="info">{d.deliveredCount} entregadas · {formatMoney(d.totalDelivered)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="text-lg font-bold text-gray-900">{value}</p>
    </div>
  )
}

/* ─── Gráficos de revenue + Top clientes (Superadmin) ─── */
function SuperadminRevenueCharts({
  topClients,
}: {
  topClients: TopClientEntry[]
}) {
  return (
    <div className="space-y-6">
      {/* ── Top Clientes ── */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
              <Users className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Top clientes del período</h2>
          </div>
          <span className="text-sm text-gray-500">{topClients.length} clientes</span>
        </div>

        {topClients.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Sin clientes con ventas en el período.</p>
        ) : (
          <div className="space-y-2">
            {topClients.map((c, i) => (
              <div key={c.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-gray-50 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="text-sm font-medium text-gray-500 w-6 text-right">{i + 1}.</span>
                  <div>
                    <p className="font-medium text-gray-900 truncate">{c.name}</p>
                    <p className="text-xs text-gray-400">{c.totalOrders} órdenes</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-spi-green">{formatMoney(c.totalAmount)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
