import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Phone, Truck, Power, PowerOff, Search, Activity, CalendarDays } from 'lucide-react'
import { useUsersList, useToggleUserActive } from '../../hooks/queries/useTeam'
import { useOrdersList } from '../../hooks/queries/useOrders'
import { ORDER_STATUS_LABELS } from '../../lib/order-status'
import type { User } from '../../context/AuthContext'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { EmptyState } from '../../components/ui/EmptyState'
import { Avatar } from '../../components/ui/Avatar'
import { LoadingState } from '../../components/ui/LoadingState'
import { Pagination } from '../../components/ui/Pagination'
import { formatMoney } from '../../lib/utils'
import { toISODate, startOfWeek } from '../../lib/dates'

type ActPeriod = 'semana' | 'mes' | 'año'

const ACT_PERIODS: { value: ActPeriod; label: string }[] = [
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
  { value: 'año', label: 'Año' },
]

function computeRange(period: ActPeriod): { desde: string; hasta: string; label: string } {
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
      label: `Del ${toISODate(lunes)} al ${toISODate(domingo)}`,
    }
  }
  if (period === 'mes') {
    const fin = new Date(y, m + 1, 0)
    return { desde: toISODate(new Date(y, m, 1)), hasta: toISODate(fin), label: 'Este mes' }
  }
  return {
    desde: toISODate(new Date(y, 0, 1)),
    hasta: toISODate(new Date(y, 11, 31)),
    label: 'Este año',
  }
}

export function DriversPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'activo' | 'inactivo' | ''>('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [activeDriver, setActiveDriver] = useState<User | null>(null)
  const { data: list, isLoading } = useUsersList({
    role: 'conductor',
    page,
    perPage,
    search: search.trim() || undefined,
    ...(statusFilter ? { isActive: statusFilter === 'activo' } : {}),
  })
  const filtersChanged = (fn: () => void) => {
    setPage(1)
    fn()
  }
  const allDrivers = list?.items ?? []
  const total = list?.total ?? 0

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Conductores</h1>
        <p className="text-sm text-gray-500">
          {total} conductor{total === 1 ? '' : 'es'}
          {statusFilter ? ` · ${statusFilter === 'activo' ? 'activos' : 'inactivos'}` : ''}
        </p>
      </div>

      <Card className="mb-4">
        <div className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => filtersChanged(() => setSearch(e.target.value))}
                placeholder="Buscar conductor por nombre, correo o teléfono..."
                className="w-full rounded-lg border border-spi-border bg-surface py-2 pl-9 pr-3 text-sm text-spi-text placeholder-gray-400 outline-none focus:border-spi-text focus:ring-2 focus:ring-spi-text/20"
              />
            </div>
            <select
              aria-label="Filtrar por estado"
              value={statusFilter}
              onChange={(e) =>
                filtersChanged(() => setStatusFilter(e.target.value as 'activo' | 'inactivo' | ''))
              }
              className="rounded-lg border border-spi-border bg-surface px-3 py-2 text-sm text-spi-text outline-none focus:border-spi-text focus:ring-2 focus:ring-spi-text/20 cursor-pointer"
            >
              <option value="">Todos los estados</option>
              <option value="activo">Activos</option>
              <option value="inactivo">Inactivos</option>
            </select>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <LoadingState />
      ) : allDrivers.length === 0 ? (
        <Card>
          <EmptyState icon={Truck} title="Sin conductores" description="No se encontraron conductores." />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {allDrivers.map((d) => (
              <DriverCard key={d.id} driver={d} onViewActivity={() => setActiveDriver(d)} />
            ))}
          </div>

          <Card className="mt-4">
            <Pagination
              page={page}
              perPage={perPage}
              total={total}
              onPageChange={setPage}
              onPerPageChange={(n) => {
                setPerPage(n)
                setPage(1)
              }}
            />
          </Card>
        </>
      )}

      {activeDriver && (
        <DriverActivityModal driver={activeDriver} onClose={() => setActiveDriver(null)} />
      )}
    </div>
  )
}

function DriverCard({ driver, onViewActivity }: { driver: User; onViewActivity: () => void }) {
  const { mutate: toggleActive, isPending } = useToggleUserActive()

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={driver.name} size="md" />
          <div>
            <p className="font-medium text-gray-900">
              <Link
                to={`/admin/equipo/${driver.id}`}
                className="underline-offset-2 hover:text-spi-green hover:underline"
              >
                {driver.name}
              </Link>
            </p>
            <p className="text-xs text-gray-400">{driver.email}</p>
            {driver.phone && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                <Phone className="h-3 w-3" /> {driver.phone}
              </p>
            )}
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
            driver.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              driver.isActive ? 'bg-green-500' : 'bg-gray-400'
            }`}
          />
          {driver.isActive ? 'Activo' : 'Inactivo'}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-end gap-1">
        <Button type="button" variant="secondary" size="sm" onClick={onViewActivity}>
          <Activity className="h-3.5 w-3.5" />
          Actividad
        </Button>
        <Button
          type="button"
          variant={driver.isActive ? 'danger' : 'secondary'}
          size="sm"
          loading={isPending}
          onClick={() => toggleActive(driver.id)}
        >
          {driver.isActive ? (
            <PowerOff className="h-3.5 w-3.5" />
          ) : (
            <Power className="h-3.5 w-3.5" />
          )}
          {driver.isActive ? 'Desactivar' : 'Activar'}
        </Button>
      </div>
    </Card>
  )
}

function DriverActivityModal({ driver, onClose }: { driver: User; onClose: () => void }) {
  const [period, setPeriod] = useState<ActPeriod>('semana')
  const range = useMemo(() => computeRange(period), [period])

  const { data: ordersData, isLoading } = useOrdersList({
    driverId: driver.id,
    desde: range.desde,
    hasta: range.hasta,
    perPage: 200,
  })
  const orders = ordersData?.items ?? []

  const stats = useMemo(() => {
    const delivered = orders.filter((o) => o.orderStatus === 'delivered')
    const inTransit = orders.filter((o) => o.orderStatus === 'in_transit')
    const totalMoney = delivered.reduce((acc, o) => acc + (Number(o.amount) || 0), 0)
    return { delivered: delivered.length, inTransit: inTransit.length, totalMoney }
  }, [orders])

  return (
    <Modal isOpen onClose={onClose} title={`Actividad de ${driver.name}`} size="lg" zIndex={90}>
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex rounded-lg border border-spi-border bg-surface p-1">
          {ACT_PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPeriod(p.value)}
              className={
                'rounded-md px-4 py-1.5 text-sm font-medium transition-colors ' +
                (period === p.value ? 'bg-spi-navy text-white' : 'text-gray-500 hover:text-spi-text')
              }
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="flex items-center gap-1.5 text-xs text-gray-400">
          <CalendarDays className="h-3.5 w-3.5" /> {range.label}
        </p>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-spi-border bg-gray-50 dark:bg-white/5 p-3">
          <p className="text-xs text-gray-500">Pedidos en el período</p>
          <p className="mt-0.5 text-xl font-bold text-gray-900">{orders.length}</p>
        </div>
        <div className="rounded-lg border border-spi-border bg-gray-50 dark:bg-white/5 p-3">
          <p className="text-xs text-gray-500">Entregados</p>
          <p className="mt-0.5 text-xl font-bold text-green-600">{stats.delivered}</p>
        </div>
        <div className="rounded-lg border border-spi-border bg-gray-50 dark:bg-white/5 p-3">
          <p className="text-xs text-gray-500">Total entregado</p>
          <p className="mt-0.5 text-xl font-bold text-spi-green">{formatMoney(stats.totalMoney)}</p>
        </div>
      </div>

      {isLoading ? (
        <LoadingState size="sm" />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="Sin pedidos en el período"
          description={`No hay pedidos asignados a ${driver.name} en este período.`}
        />
      ) : (
        <div className="max-h-96 overflow-y-auto rounded-lg border border-spi-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface dark:bg-surface">
              <tr className="border-b border-spi-border text-left text-xs uppercase tracking-wider text-gray-500">
                <th className="px-4 py-2.5">Nº</th>
                <th className="px-4 py-2.5">Cliente</th>
                <th className="px-4 py-2.5">Estado</th>
                <th className="px-4 py-2.5 text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-spi-border">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-gray-50 dark:hover:bg-white/5">
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{o.orderNumber}</td>
                  <td className="px-4 py-2.5 text-gray-800">{o.customer?.name ?? '—'}</td>
                  <td className="px-4 py-2.5">
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
                  <td className="px-4 py-2.5 text-right font-semibold text-gray-900">
                    {formatMoney(o.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {stats.inTransit > 0 && (
        <p className="mt-3 text-xs text-gray-400">
          Hay {stats.inTransit} pedido(s) todavía en camino en este período.
        </p>
      )}
    </Modal>
  )
}