import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Package, Search } from 'lucide-react'
import { useOrdersList } from '../../hooks/queries/useOrders'
import { useAuth } from '../../context/AuthContext'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Pagination } from '../../components/ui/Pagination'
import { SectionTabs } from '../../components/ui/SectionTabs'
import { EmptyState } from '../../components/ui/EmptyState'
import { LoadingState } from '../../components/ui/LoadingState'
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_VARIANT,
  PAYMENT_STATUS_LABELS,
  type OrderStatus,
} from '../../lib/order-status'
import { formatMoney } from '../../lib/utils'

const STATUS_TABS = [
  { key: '', label: 'Todas' },
  { key: 'created', label: 'Creadas' },
  { key: 'accepted', label: 'Aceptadas' },
  { key: 'in_transit', label: 'En tránsito' },
  { key: 'delivered', label: 'Entregadas' },
  { key: 'cancelled', label: 'Canceladas' },
]

// Filtro de PAGO: 'pending' = con saldo (nada o abono parcial), 'paid' = saldadas.
const PAYMENT_TABS = [
  { key: '', label: 'Pago: todas' },
  { key: 'pending', label: 'Pendientes' },
  { key: 'paid', label: 'Saldadas' },
] as const

export function OrdersPage() {
  const [searchParams] = useSearchParams()
  // El card "Sin asignar" del dashboard vendedor llega con ?status=created.
  const initialStatus = (searchParams.get('status') ?? '') as OrderStatus | ''
  // El panel "Pagos pendientes" del dashboard llega con ?payment=pending.
  const initialPayment = (searchParams.get('payment') ?? '') as 'pending' | 'paid' | ''
  const [status, setStatus] = useState<OrderStatus | ''>(initialStatus)
  const [payment, setPayment] = useState<'pending' | 'paid' | ''>(initialPayment)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [search, setSearch] = useState('')

  const { user } = useAuth()
  const { data, isLoading } = useOrdersList({ page, perPage, status, paymentStatus: payment, search })

  const items = data?.items ?? []
  const total = data?.total ?? 0

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Órdenes</h1>
          <p className="text-sm text-gray-500">Todas las órdenes del sistema.</p>
        </div>
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

      <Card className="mb-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Buscar por número de orden o cliente..."
              className="w-full rounded-lg border border-spi-border bg-surface py-2 pl-9 pr-3 text-sm text-spi-text placeholder-gray-400 outline-none focus:border-spi-text focus:ring-2 focus:ring-spi-text/20"
            />
          </div>
          <SectionTabs
            tabs={STATUS_TABS}
            activeKey={status}
            onChange={(key) => {
              setStatus(key as OrderStatus | '')
              setPage(1)
            }}
            variant="pill"
            size="sm"
            className="w-full sm:w-auto"
          />
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 pt-0">
          <SectionTabs
            tabs={PAYMENT_TABS}
            activeKey={payment}
            onChange={(key) => {
              setPayment(key as 'pending' | 'paid' | '')
              setPage(1)
            }}
            variant="pill"
            size="sm"
            className="w-full sm:w-auto"
          />
        </div>
      </Card>

      <Card>
        {isLoading ? (
          <LoadingState />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Sin órdenes"
            description="No hay órdenes para los filtros seleccionados."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-spi-border text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3">N°</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Vendedor</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Pago</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-spi-border">
                {items.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50 dark:hover:bg-white/5">
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/ordenes/${o.id}`}
                        className="font-mono text-xs font-semibold text-spi-text underline-offset-2 hover:underline"
                      >
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {o.customer?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{o.seller?.name ?? '—'}</td>
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

        {items.length > 0 && (
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
        )}
      </Card>
    </div>
  )
}
