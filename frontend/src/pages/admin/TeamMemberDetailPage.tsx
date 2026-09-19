import { Link, useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Users,
  Package,
  AlertTriangle,
  TrendingUp,
  CheckCircle2,
  Truck,
} from 'lucide-react'
import { useTeamMemberDashboard } from '../../hooks/queries/useDeliveryDashboard'
import { useAuth } from '../../context/AuthContext'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Avatar } from '../../components/ui/Avatar'
import { LoadingState } from '../../components/ui/LoadingState'
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_VARIANT,
  PAYMENT_STATUS_LABELS,
} from '../../lib/order-status'
import { formatMoney } from '../../lib/utils'

/**
 * Drill-down del superadmin (decisión 3-B): panel de UN vendedor o conductor.
 * La data viene de GET /dashboard/user/:id — si el usuario es superadmin,
 * el backend responde 400 ("no se puede ver el panel de un superadmin").
 */
export function TeamMemberDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const memberId = id ? Number(id) : null
  const { user: currentUser } = useAuth()

  const { data, isLoading, isError, error } = useTeamMemberDashboard(memberId)

  const errorMsg =
    error instanceof Error
      ? error.message
      : 'No se pudo cargar el panel del miembro. Verificá que sea un vendedor o conductor activo.'

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl">
        <LoadingState />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-5xl">
        <Card>
          <EmptyState
            icon={Users}
            title="No se puede mostrar este panel"
            description={errorMsg}
            action={{
              label: 'Volver al equipo',
              onClick: () => navigate('/admin/equipo'),
            }}
          />
        </Card>
      </div>
    )
  }

  const member = data.user
  const totals = data.totals
  const isDriver = member.role === 'conductor'
  // Rutas agrupadas bajo Equipo (CTO 2026-09-18, decisión 1-B).
  const backTo = isDriver ? '/admin/equipo/conductores' : '/admin/equipo/vendedores'
  const backLabel = isDriver ? 'Volver a conductores' : 'Volver a vendedores'

  const statSource: Array<{ label: string; value: string; tone: string }> = [
    {
      label: 'Órdenes hoy',
      value: String(totals.todayOrders),
      tone: 'text-sky-600 bg-sky-100',
    },
    {
      label: 'En progreso',
      value: String(totals.inProgress),
      tone: 'text-amber-600 bg-amber-100',
    },
    {
      label: 'Entregadas',
      value: String(totals.delivered),
      tone: 'text-green-600 bg-green-100',
    },
    {
      label: 'Canceladas',
      value: String(totals.cancelled),
      tone: 'text-red-600 bg-red-100',
    },
  ]

  return (
    <div className="mx-auto max-w-5xl">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mb-3"
        onClick={() => navigate(backTo)}
      >
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </Button>

      {/* Ficha del miembro */}
      <div className="rounded-xl bg-spi-navy p-6 text-white">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <Avatar name={member.name} size="lg" />
            <div>
              <h1 className="text-2xl font-bold">{member.name}</h1>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 rounded-full bg-spi-gold/20 px-2.5 py-0.5 text-xs font-medium text-spi-gold">
                  {member.role === 'conductor' && <Truck className="h-3 w-3" />}
                  {member.role === 'vendedor' && <Package className="h-3 w-3" />}
                  {member.role === 'vendedor' ? 'Vendedor' : 'Conductor'}
                </span>
                {currentUser?.id === member.id && (
                  <span className="text-xs text-white/50">(sos vos)</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {statSource.map((s) => (
            <div key={s.label} className={`rounded-lg p-3 ${s.tone}`}>
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className="mt-0.5 text-xl font-bold text-gray-900">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Resumen según rol (mismo criterio que el dashboard v2) */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <div className="mb-2 flex items-center gap-2">
            {isDriver ? (
              <CheckCircle2 className="h-4 w-4 text-spi-green" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            )}
            <p className="text-sm font-semibold text-gray-900">
              {isDriver ? 'Entregadas' : 'Pedidos sin conductor'}
            </p>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {isDriver ? data.delivered : data.unassigned}
          </p>
          <p className="text-xs text-gray-400">
            {isDriver
              ? 'Entregas confirmadas del conductor.'
              : 'Pedidos en Inicio esperando asignación (decisión 1-A).'}
          </p>
        </Card>
        <Card>
          <div className="mb-2 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-spi-green" />
            <p className="text-sm font-semibold text-gray-900">Ingresos cobrados</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatMoney(totals.totalRevenue)}</p>
          <p className="text-xs text-gray-400">
            {isDriver ? 'Pagos de sus entregas (decisión 2-A).' : 'Pagos de sus pedidos.'}
          </p>
        </Card>
        <Card>
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <p className="text-sm font-semibold text-gray-900">Pendiente de cobro</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatMoney(totals.pendingRevenue)}</p>
          <p className="text-xs text-gray-400">Pedidos en metálico/otros sin saldar todavía.</p>
        </Card>
      </div>

      {/* Top clientes (solo vendedor) */}
      {!isDriver && (
        <Card className="mt-4">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Top clientes</h2>
          {data.topCustomers.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">Sin ventas todavía.</p>
          ) : (
            <ul className="space-y-2">
              {data.topCustomers.map((c) => (
                <li key={c.id} className="flex items-center justify-between text-sm">
                  <Link
                    to={`/admin/clientes/${c.id}`}
                    className="font-medium text-gray-800 underline-offset-2 hover:text-spi-green hover:underline"
                  >
                    {c.name}
                  </Link>
                  <span className="text-gray-400">
                    {c.totalOrders} órdenes · {formatMoney(c.totalAmount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* Últimas órdenes */}
      <Card className="mt-4">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Últimas órdenes</h2>
        {data.recentOrders.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-400">Sin órdenes todavía.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-spi-border text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3">N°</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Pago</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-spi-border">
                {data.recentOrders.map((o) => (
                  <tr
                    key={o.id}
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5"
                    onClick={() => navigate(`/admin/ordenes/${o.id}`)}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{o.orderNumber}</td>
                    <td className="px-4 py-3 text-gray-800">{o.customer?.name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={ORDER_STATUS_VARIANT[o.orderStatus]}>
                        {ORDER_STATUS_LABELS[o.orderStatus]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="default">{PAYMENT_STATUS_LABELS[o.paymentStatus]}</Badge>
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
    </div>
  )
}