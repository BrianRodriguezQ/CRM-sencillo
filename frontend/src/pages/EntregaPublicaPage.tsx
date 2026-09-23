/**
 * EntregaPublicaPage — ficha digital de una entrega (WP3).
 *
 * Ruta pública: /entrega/:token
 * La abre cualquiera que tenga el QR impreso en la Nota de Entrega (el
 * cliente por ejemplo). Muestra los MISMOS datos que la hoja papel, validados
 * contra el sistema: número de orden, cliente, dirección, contenido, método
 * de pago, montos y estado. Si el token no es válido (QR apócrifo o firma
 * adulterada) se muestra una pantalla de rechazo — anti-estafa.
 *
 * No requiere sesión: es un "respaldo vivo" de la entrega.
 */

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PackageCheck, ShieldAlert, Truck } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, type OrderStatus } from '../lib/order-status'
import { formatMoney } from '../lib/utils'
import { formatDateTime } from '../lib/dates'

interface DeliverySheetItem {
  productName: string
  quantity: number
  unitPrice: string
}

interface DeliverySheetData {
  orderId: number
  orderNumber: string
  customerName: string
  address: string | null
  items: DeliverySheetItem[]
  amount: string
  paymentStatus: string
  orderStatus: string
  paymentMethod: string | null
  notes: string | null
  deliveredAt: string | null
  createdAt: string
}

type SheetState =
  | { status: 'loading' }
  | { status: 'invalid'; error: string }
  | { status: 'ok'; data: DeliverySheetData }

export function EntregaPublicaPage() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<SheetState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    if (!token) {
      setState({ status: 'invalid', error: 'Código QR inválido' })
      return
    }

    fetch(`/api/entrega/token/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as {
          success?: boolean
          data?: DeliverySheetData
          error?: string
        } | null
        if (!active) return
        if (res.ok && json?.success && json.data) {
          setState({ status: 'ok', data: json.data })
        } else {
          setState({ status: 'invalid', error: json?.error ?? 'Código QR inválido' })
        }
      })
      .catch(() => {
        if (active) setState({ status: 'invalid', error: 'No se pudo validar el código QR' })
      })

    return () => {
      active = false
    }
  }, [token])

  if (state.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-spi-gold border-t-transparent" />
      </div>
    )
  }

  if (state.status === 'invalid') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
            <ShieldAlert className="h-7 w-7 text-red-500" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900">Código QR no válido</h1>
          <p className="mt-1 text-sm text-gray-500">
            {state.error}. Si recibiste esta nota de entrega impresa, comunicate con el operador
            para verificar.
          </p>
        </Card>
      </div>
    )
  }

  const { data } = state
  const isDelivered = data.orderStatus === 'delivered'

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-md">
        {/* Encabezado */}
        <div className="mb-4 text-center">
          <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-spi-navy">
            <PackageCheck className="h-8 w-8 text-spi-gold" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">{data.customerName}</h1>
          <p className="text-sm text-gray-500">
            {data.orderNumber} · {formatDateTime(data.createdAt)}
          </p>
        </div>

        {/* Estado */}
        <Card className="mb-4 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                Estado
              </p>
              <p className="text-lg font-semibold text-gray-900">
                {ORDER_STATUS_LABELS[data.orderStatus as OrderStatus] ?? data.orderStatus}
              </p>
            </div>
            <Badge variant={isDelivered ? 'success' : 'default'}>
              {PAYMENT_STATUS_LABELS[data.paymentStatus as keyof typeof PAYMENT_STATUS_LABELS] ??
                data.paymentStatus}
            </Badge>
          </div>
          {data.deliveredAt && (
            <p className="mt-2 text-xs text-gray-400">
              <Truck className="mr-1 inline h-3.5 w-3.5" />
              Entregado el {formatDateTime(data.deliveredAt)}
            </p>
          )}
        </Card>

        {/* Contenido */}
        <Card className="mb-4 p-5">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Contenido del pedido</h2>
          {data.items.length === 0 ? (
            <p className="text-sm text-gray-400">Sin detalle de productos</p>
          ) : (
            <ul className="divide-y divide-spi-border">
              {data.items.map((item, i) => (
                <li key={i} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-gray-700">
                    {item.quantity}× {item.productName}
                  </span>
                  <span className="font-medium text-gray-900">
                    {formatMoney(Number.parseFloat(item.unitPrice) * item.quantity)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex items-center justify-between border-t border-spi-border pt-3">
            <span className="text-sm text-gray-500">
              Total · {data.paymentMethod ?? '—'}
            </span>
            <span className="text-lg font-bold text-gray-900">
              {formatMoney(Number.parseFloat(data.amount))}
            </span>
          </div>
          {data.address && (
            <p className="mt-3 text-xs text-gray-400">Dirección: {data.address}</p>
          )}
          {data.notes && (
            <p className="mt-1 text-xs text-gray-400 italic">"{data.notes}"</p>
          )}
        </Card>

        <p className="text-center text-xs text-gray-400">
          Documento digital validado contra el sistema {import.meta.env.VITE_APP_NAME ?? 'CRM'}.
          <br />
          <Link to="/login" className="text-spi-navy underline">
            Ingresá al panel
          </Link>{' '}
          para más información.
        </p>
      </div>
    </div>
  )
}
