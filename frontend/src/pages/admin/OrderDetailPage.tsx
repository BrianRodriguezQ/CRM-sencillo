import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Truck,
  UserRound,
  CreditCard,
  MapPin,
  StickyNote,
  Send,
  MessageSquare,
  Phone,
  Zap,
  Package,
  CheckCircle2,
  PlusCircle,
  Trash2,
  FileImage,
  X,
  Ban,
  Wallet,
  FileText,
  Download,
} from 'lucide-react'
import {
  useOrder,
  useAssignDriver,
  useAssignAutoDriver,
  useUpdateOrderStatus,
  useOrderCommunications,
  useSendCommunication,
  useRegisterOrderPayment,
  useDeleteOrderPayment,
  type OrderPayment,
} from '../../hooks/queries/useOrders'
import { usePaymentMethodsList } from '../../hooks/queries/usePaymentMethods'
import { useDriversList } from '../../hooks/queries/useTeam'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { LoadingState } from '../../components/ui/LoadingState'
import { useAuth } from '../../context/AuthContext'
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_VARIANT,
  PAYMENT_STATUS_LABELS,
  canTransition,
  nextDriverStatus,
  type OrderStatus,
} from '../../lib/order-status'
import { formatMoney } from '../../lib/utils'
import { formatDateTime, timeAgo } from '../../lib/dates'

const ALL_NON_TERMINAL: OrderStatus[] = ['created', 'accepted', 'in_transit']

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const orderId = id ? parseInt(id) : null
  const { user } = useAuth()

  const { data: order, isLoading } = useOrder(orderId)
  const { data: communications = [] } = useOrderCommunications(orderId)
  const { data: drivers = [] } = useDriversList()
  const { data: methods = [] } = usePaymentMethodsList()

  const { mutate: assignDriver, isPending: assigning } = useAssignDriver()
  const { mutate: assignAuto, isPending: assigningAuto } = useAssignAutoDriver()
  const { mutate: updateStatus, isPending: updatingStatus } = useUpdateOrderStatus()
  const { mutate: sendMessage, isPending: sending } = useSendCommunication()
  const { mutate: registerPayment, isPending: registeringPayment } = useRegisterOrderPayment()
  const { mutate: deletePayment, isPending: deletingPayment } = useDeleteOrderPayment()

  const [selectedDriverId, setSelectedDriverId] = useState<number | ''>('')
  const [message, setMessage] = useState('')
  const [attachment, setAttachment] = useState<File | null>(null)
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  // Reasignación (regla 2-B): el vendedor NO reasigna; el superadmin sí, en Inicio.
  const [reassignOpen, setReassignOpen] = useState(false)

  // Modal de cancelación (justificación obligatoria, CTO v2)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelNote, setCancelNote] = useState('')

  // Modal de registro de pago
  const [payOpen, setPayOpen] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMethodId, setPayMethodId] = useState<number | ''>('')
  const [payReference, setPayReference] = useState('')
  const [payNote, setPayNote] = useState('')
  const [payReceipt, setPayReceipt] = useState<File | null>(null)

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl">
        <LoadingState />
      </div>
    )
  }

  if (!order) {
    return (
      <Card>
        <p className="py-10 text-center text-sm text-gray-500">Orden no encontrada.</p>
        <div className="text-center pb-6">
          <Link to="/admin/ordenes" className="text-sm font-medium text-spi-green hover:underline">
            <ArrowLeft className="mr-1 inline h-4 w-4" />
            Volver a órdenes
          </Link>
        </div>
      </Card>
    )
  }

  const isSuperadmin = user?.role === 'superadmin'
  const isVendedor = user?.role === 'vendedor'
  const isConductor = user?.role === 'conductor'

  const orderClosed = order.orderStatus === 'delivered' || order.orderStatus === 'cancelled'
  const canEditPayment = !orderClosed
  const canOperateState = isSuperadmin // v2: SOLO superadmin transiciona como respaldo
  const canAssign = (isSuperadmin || isVendedor) && order.orderStatus === 'created'

  const driverOptions = drivers ?? []

  // Acción contextual del conductor: UN botón, sin pensar (v2).
  const driverNext = nextDriverStatus(order.orderStatus)
  const driverAction = isConductor
    ? driverNext === 'accepted'
      ? { to: 'accepted' as OrderStatus, label: 'Aceptar pedido', icon: CheckCircle2 }
      : driverNext === 'in_transit'
        ? { to: 'in_transit' as OrderStatus, label: 'Comenzar viaje', icon: Truck }
        : driverNext === 'delivered'
          ? { to: 'delivered' as OrderStatus, label: 'Marcar entregada', icon: CheckCircle2 }
          : null
    : null

  const handleAssign = () => {
    if (!selectedDriverId || typeof selectedDriverId !== 'number') return
    assignDriver(
      { orderId: order.id, driverId: selectedDriverId },
      { onSettled: () => setReassignOpen(false) },
    )
  }

  const handleAutoAssign = () => {
    assignAuto(order.id, { onSettled: () => setReassignOpen(false) })
  }

  /** El conductor avanza de un clic; el superadmin también (respaldo). */
  const handleAdvance = (to: OrderStatus) => {
    setActionError('')
    updateStatus(
      { orderId: order.id, status: to },
      {
        onError: (e) => setActionError(e.message),
      },
    )
  }

  const confirmCancel = () => {
    setActionError('')
    const note = cancelNote.trim()
    if (note.length < 4) {
      setActionError('Escribí una justificación (mínimo 4 caracteres) para poder cancelar.')
      return
    }
    updateStatus(
      { orderId: order.id, status: 'cancelled', note },
      {
        onSuccess: () => {
          setCancelOpen(false)
          setCancelNote('')
        },
        onError: (e) => setActionError(e.message),
      },
    )
  }

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    // WP2: se puede mandar texto, imagen, o ambos. Sin nada → no hacer nada.
    if (!message.trim() && !attachment) return
    sendMessage(
      { orderId: order.id, message: message.trim() || undefined, attachment },
      {
        onSuccess: () => {
          setMessage('')
          setAttachment(null)
          if (attachmentPreview) URL.revokeObjectURL(attachmentPreview)
          setAttachmentPreview(null)
        },
      },
    )
  }

  const handlePickAttachment = (file: File | null) => {
    setActionError('')
    if (!file) {
      setAttachment(null)
      if (attachmentPreview) URL.revokeObjectURL(attachmentPreview)
      setAttachmentPreview(null)
      return
    }
    // Misma regla que el backend: solo imágenes, máx 5MB.
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setActionError('Formato no permitido. Usá PNG, JPG o WebP.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setActionError('La imagen supera los 5MB.')
      return
    }
    setAttachment(file)
    if (attachmentPreview) URL.revokeObjectURL(attachmentPreview)
    setAttachmentPreview(URL.createObjectURL(file))
  }

  // Método efectivo del abono: el elegido en el modal, o el de la orden si no tocó.
  // Fix: el detalle NO trae paymentMethodId suelto (vino en el objeto paymentMethod),
  // así que hay que resolverlo con order.paymentMethod?.id para que los campos de
  // comprobante (referencia/foto) se muestren cuando el método lo exige.
  const effectivePaymentMethodId =
    payMethodId !== ''
      ? Number(payMethodId)
      : (order.paymentMethod?.id ?? order.paymentMethodId)

  const handleRegisterPayment = () => {
    setActionError('')
    const amount = Number.parseFloat(payAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setActionError('Escribí un monto válido.')
      return
    }
    const method = methods.find((m) => m.id === effectivePaymentMethodId) ?? null
    const reference = payReference.trim()
    const hasReceipt = !!payReceipt

    // Regla de comprobante espejo del backend (v2).
    if (method?.requiresReference && !reference && !(method?.requiresReceipt && hasReceipt)) {
      setActionError(
        method.requiresReceipt
          ? 'Adjuntá el número de referencia o la foto del comprobante.'
          : 'Escribí el número de referencia.',
      )
      return
    }
    if (method?.requiresReceipt && !hasReceipt && !reference) {
      setActionError('Adjuntá la foto del comprobante o el número de referencia.')
      return
    }
    if (amount > (order.balance ?? 0) + 0.005) {
      setActionError(
        `El pago excede el saldo. Saldo pendiente: ${formatMoney(order.balance ?? 0)}.`,
      )
      return
    }

    registerPayment(
      {
        orderId: order.id,
        amount,
        paymentMethodId: effectivePaymentMethodId,
        reference: reference || undefined,
        note: payNote.trim() || undefined,
        receipt: payReceipt,
      },
      {
        onSuccess: () => {
          setPayOpen(false)
          setPayAmount('')
          setPayReference('')
          setPayNote('')
          setPayReceipt(null)
        },
        onError: (e) => setActionError(e.message),
      },
    )
  }

  const handleDeletePayment = (payment: OrderPayment) => {
    if (!window.confirm(`¿Eliminar el pago de ${formatMoney(payment.amount)}?`)) return
    deletePayment({ orderId: order.id, paymentId: payment.id })
  }

  const total = Number(order.amount)
  const paid = order.paidAmount ?? 0
  const balance = order.balance ?? Math.max(0, total - paid)

  const receivingMethod = methods.find((m) => m.id === effectivePaymentMethodId)

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <Link
          to="/admin/ordenes"
          className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-spi-text"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a órdenes
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Orden <span className="font-mono">{order.orderNumber}</span>
            </h1>
            <p className="text-sm text-gray-500">Creada {timeAgo(order.createdAt)}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Badge variant={ORDER_STATUS_VARIANT[order.orderStatus]} size="lg">
              {ORDER_STATUS_LABELS[order.orderStatus]}
            </Badge>
            <Badge variant="default" size="lg">
              {PAYMENT_STATUS_LABELS[order.paymentStatus]}
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* ═══ FICHA DE REPARTO — lo PRIMERO que ve el conductor ═══
              Sigue el modo: blanca de día / oscura (spi-light) de noche. El
              override .dark .text-spi-navy aclara los valores automáticamente;
              los labels dorados suben a gray-500 (legible) con dark: variant.
              Nada hardcodeado. */}
          <div className="rounded-xl border border-spi-border bg-white p-6 text-spi-navy dark:bg-spi-light">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <MapPin className="h-5 w-5 text-spi-gold dark:text-gray-500" />
              Ficha de reparto
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="flex items-start gap-3">
                <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-spi-gold dark:text-gray-500" />
                <div>
                  <p className="text-xs text-spi-gold dark:text-gray-500">Cliente</p>
                  <p className="font-semibold">{order.customer?.name ?? '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 shrink-0 text-spi-gold dark:text-gray-500" />
                <div>
                  <p className="text-xs text-spi-gold dark:text-gray-500">Teléfono</p>
                  {order.customer?.phone ? (
                    <a
                      href={`tel:${order.customer.phone}`}
                      className="font-semibold text-spi-gold underline-offset-2 hover:underline dark:text-gray-500"
                    >
                      {order.customer.phone}
                    </a>
                  ) : (
                    <p className="text-spi-gold/80 dark:text-gray-500/80">—</p>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-3 sm:col-span-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-spi-gold dark:text-gray-500" />
                <div>
                  <p className="text-xs text-spi-gold dark:text-gray-500">Dirección de entrega</p>
                  <p className="font-semibold">
                    {order.deliveryAddress ?? order.customer?.address ?? 'Sin dirección cargada'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-spi-gold dark:text-gray-500" />
                <div>
                  <p className="text-xs text-spi-gold dark:text-gray-500">Pago</p>
                  <p className="font-semibold">
                    {order.paymentMethod?.name ?? '—'}
                    <span className="ml-2 text-spi-gold/80 dark:text-gray-500/80">
                      · {PAYMENT_STATUS_LABELS[order.paymentStatus]}
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Truck className="mt-0.5 h-4 w-4 shrink-0 text-spi-gold dark:text-gray-500" />
                <div>
                  <p className="text-xs text-spi-gold dark:text-gray-500">Conductor</p>
                  <p className="font-semibold">{order.driver?.name ?? 'Sin asignar'}</p>
                </div>
              </div>
            </div>

            {/* Saldo: el cierre exige pagado (v2). Rojo/verde con variante dark:
                en modo nocturno los 300 pasan a #5a2a2a (ilegible) → subir un
                eslabón en la escala (400/600) para mantener contraste. */}
            <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg border border-spi-border p-3 text-sm">
              <div>
                <p className="text-xs text-spi-gold dark:text-gray-500">Total</p>
                <p className="font-bold text-spi-navy">{formatMoney(total)}</p>
              </div>
              <div>
                <p className="text-xs text-spi-gold dark:text-gray-500">Pagado</p>
                <p className="font-bold text-spi-navy">{formatMoney(paid)}</p>
              </div>
              <div>
                <p className="text-xs text-spi-gold dark:text-gray-500">Saldo</p>
                <p
                  className={`font-bold ${
                    balance > 0.005 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-600'
                  }`}
                >
                  {formatMoney(balance)}
                </p>
              </div>
            </div>

            {/* Botón contextual del conductor (v2) */}
            {driverAction && (() => {
              const isDelivered = driverAction.to === 'delivered'
              // Regla 1-A (CTO): no se puede marcar entregada una orden no pagada.
              // El conductor registra el pago (efectivo incluido) antes de cerrar.
              const paymentPending = isDelivered && order.paymentStatus !== 'paid'
              return (
                <div className="mt-6">
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    className="w-full"
                    loading={updatingStatus}
                    disabled={paymentPending}
                    onClick={() => handleAdvance(driverAction.to)}
                  >
                    <driverAction.icon className="h-5 w-5" />
                    {driverAction.label}
                  </Button>
                  <p className="mt-2 text-center text-xs text-spi-gold dark:text-gray-500">
                    {paymentPending
                      ? 'El pedido no está pagado todavía. Registrá el pago en la sección Pagos y recién ahí cerrá la entrega.'
                      : driverAction.to === 'accepted'
                        ? 'Confirmá que vas a hacer la entrega.'
                        : driverAction.to === 'in_transit'
                          ? 'Confirmá que estás en camino con el pedido.'
                          : 'Confirmá que entregaste el pedido.'}
                  </p>
                </div>
              )
            })()}
          </div>

          {/* ═══ PAGOS v2 — abonos + saldo ═══ */}
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                <Wallet className="h-5 w-5 text-spi-gold" />
                Pagos
              </h2>
              <div className="flex gap-2">
                {order.orderStatus === 'delivered' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      window.open(`/api/reports/delivery-note/${order.id}`, '_blank')
                    }}
                  >
                    <FileText className="h-4 w-4" />
                    Nota de entrega
                  </Button>
                )}
                {canEditPayment && (
                  <Button variant="secondary" size="sm" onClick={() => setPayOpen(true)}>
                    <PlusCircle className="h-4 w-4" />
                    Registrar pago
                  </Button>
                )}
              </div>
            </div>

            {(order.payments?.length ?? 0) === 0 ? (
              <p className="py-4 text-center text-sm text-gray-400">
                Sin pagos registrados. El saldo se cobra antes de entregar
                {order.paymentMethod?.code === 'efectivo'
                  ? ' (efectivo: se cobra en la entrega automáticamente).'
                  : '.'}
              </p>
            ) : (
              <ul className="divide-y divide-spi-border">
                {order.payments?.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                    <div>
                      <p className="font-medium text-gray-800">
                        {formatMoney(p.amount)}{' '}
                        <span className="font-normal text-gray-400">· {p.methodName}</span>
                      </p>
                      <p className="text-xs text-gray-400">
                        {p.recorderName ?? `Usuario ${p.recordedBy}`} ·{' '}
                        {formatDateTime(p.paidAt)}
                      </p>
                      {p.reference && (
                        <p className="mt-0.5 text-xs text-gray-500">Ref: {p.reference}</p>
                      )}
                      {p.note && <p className="mt-0.5 text-xs text-gray-500 italic">"{p.note}"</p>}
                      {p.receiptUrl && (
                        <a
                          href={p.receiptUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-spi-green hover:underline"
                        >
                          <FileImage className="h-3.5 w-3.5" />
                          Ver comprobante
                        </a>
                      )}
                    </div>
                    {canEditPayment && (
                      <button
                        type="button"
                        onClick={() => handleDeletePayment(p)}
                        disabled={deletingPayment}
                        className="rounded p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        title="Eliminar pago"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Items de la orden */}
          {(order.items?.length ?? 0) > 0 && (
            <Card className="p-6">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
                <Package className="h-5 w-5 text-spi-gold" />
                Contenido del pedido
              </h2>
              <div className="divide-y divide-spi-border">
                {order.items?.map((it) => (
                  <div
                    key={it.id}
                    className="flex items-center justify-between gap-3 py-2.5 text-sm"
                  >
                    <div>
                      <p className="font-medium text-gray-800">{it.productName}</p>
                      <p className="text-xs text-gray-400">
                        {it.quantity} × {formatMoney(it.unitPrice.toFixed(2))}
                      </p>
                    </div>
                    <p className="font-semibold text-gray-900">
                      {formatMoney(it.lineTotal.toFixed(2))}
                    </p>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 pt-3">
                  <p className="text-sm font-medium text-gray-500">Total</p>
                  <p className="text-xl font-bold text-gray-900">{formatMoney(order.amount)}</p>
                </div>
              </div>
            </Card>
          )}

          {/* Detalle completo */}
          {(order.deliveryAddress || order.notes) && (
            <Card className="p-6">
              <h2 className="mb-4 text-lg font-semibold text-gray-900">Detalle de la orden</h2>
              <dl className="space-y-3 text-sm">
                {order.notes && (
                  <div className="flex items-start justify-between gap-4">
                    <dt className="flex items-center gap-2 text-gray-500">
                      <StickyNote className="h-4 w-4" /> Notas
                    </dt>
                    <dd className="text-right text-gray-700">{order.notes}</dd>
                  </div>
                )}
              </dl>
            </Card>
          )}

          {/* Operaciones (v2: asignación + respaldo del superadmin; el vendedor NO toca estados) */}
          {(canAssign || canOperateState) && (
            <Card className="p-6">
              <h2 className="mb-4 text-lg font-semibold text-gray-900">Operar orden</h2>

              {actionError && (
                <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {actionError}
                </p>
              )}

              <div className="space-y-5">
                {/* Asignar conductor (solo estado Inicio).
                    Regla 2-B: una vez asignado, el vendedor NO toca — ve una tarjeta
                    informativa. El superadmin puede reasignar desde la misma tarjeta. */}
                {canAssign && (
                  <div>
                    {order.driver ? (
                      <div className="rounded-lg border border-spi-border bg-gray-50 dark:bg-white/5 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-spi-green/15 text-spi-green">
                              <UserRound className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                                {order.driver.name}
                                {order.driver.phone ? (
                                  <span className="ml-2 font-normal text-gray-400">
                                    {order.driver.phone}
                                  </span>
                                ) : null}
                              </p>
                              <p className="text-xs text-gray-400">
                                {(() => {
                                  const assigned = driverOptions.find(
                                    (d) => d.id === order.driver!.id,
                                  )
                                  return assigned
                                    ? assigned.activeOrderCount > 0
                                      ? `${assigned.activeOrderCount} activa(s)`
                                      : 'libre'
                                    : 'conductor activo'
                                })()}
                              </p>
                            </div>
                          </div>

                          {isSuperadmin && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setReassignOpen((v) => !v)}
                            >
                              <Truck className="h-4 w-4" />
                              Reasignar
                            </Button>
                          )}
                        </div>

                        {!isSuperadmin && (
                          <p className="mt-2 text-xs text-gray-400">
                            Este pedido ya tiene conductor asignado. Solo el administrador puede
                            reasignarlo.
                          </p>
                        )}

                        {isSuperadmin && reassignOpen && (
                          <div className="mt-3 flex gap-2 border-t border-spi-border pt-3">
                            <select
                              value={selectedDriverId}
                              onChange={(e) =>
                                setSelectedDriverId(
                                  e.target.value === '' ? '' : parseInt(e.target.value),
                                )
                              }
                              className="flex-1 rounded-lg border border-spi-border bg-surface px-3 py-2 text-sm text-spi-text outline-none focus:border-spi-text focus:ring-2 focus:ring-spi-text/20"
                            >
                              <option value="">Seleccionar conductor...</option>
                              {driverOptions.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name}
                                  {d.activeOrderCount > 0
                                    ? ` · ${d.activeOrderCount} activa(s)`
                                    : ' · libre'}
                                </option>
                              ))}
                            </select>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={handleAssign}
                              loading={assigning}
                            >
                              <Truck className="h-4 w-4" />
                              Asignar
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleAutoAssign}
                              loading={assigningAuto}
                              title="Asignar al conductor con menos entregas activas (autoassign ponderado)"
                            >
                              <Zap className="h-4 w-4" />
                              Auto
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-700">
                          Asignar conductor (la orden sigue en Inicio hasta que él la acepte)
                        </label>
                        <div className="flex gap-2">
                          <select
                            value={selectedDriverId}
                            onChange={(e) =>
                              setSelectedDriverId(e.target.value === '' ? '' : parseInt(e.target.value))
                            }
                            className="flex-1 rounded-lg border border-spi-border bg-surface px-3 py-2 text-sm text-spi-text outline-none focus:border-spi-text focus:ring-2 focus:ring-spi-text/20"
                          >
                            <option value="">Seleccionar conductor...</option>
                            {driverOptions.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                                {d.activeOrderCount > 0
                                  ? ` · ${d.activeOrderCount} activa(s)`
                                  : ' · libre'}
                              </option>
                            ))}
                          </select>
                          <Button type="button" variant="secondary" onClick={handleAssign} loading={assigning}>
                            <Truck className="h-4 w-4" />
                            Asignar
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleAutoAssign}
                            loading={assigningAuto}
                            title="Asignar al conductor con menos entregas activas (autoassign ponderado)"
                          >
                            <Zap className="h-4 w-4" />
                            Auto
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Respaldo del superadmin: avance por la cadena + cancelación con justificación */}
                {canOperateState && !orderClosed && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-700">
                      Progreso de la entrega (superadmin)
                    </label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {ALL_NON_TERMINAL.map((s) => {
                        const reached =
                          ORDER_STATUS_FLOW_INDEX(order.orderStatus) >= ORDER_STATUS_FLOW_INDEX(s)
                        return (
                          <span key={s} className="flex items-center gap-1.5">
                            {s !== 'created' && <span className="text-gray-300">→</span>}
                            <Button
                              type="button"
                              size="sm"
                              variant={
                                order.orderStatus === s
                                  ? 'primary'
                                  : reached
                                    ? 'secondary'
                                    : 'outline'
                              }
                              disabled={order.orderStatus !== s}
                              loading={updatingStatus}
                              onClick={() => handleAdvance(s)}
                            >
                              {ORDER_STATUS_LABELS[s]}
                            </Button>
                          </span>
                        )
                      })}
                      {!orderClosed && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="ml-2 text-red-600 hover:bg-red-50"
                          onClick={() => setCancelOpen(true)}
                        >
                          <Ban className="h-4 w-4" />
                          Cancelar
                        </Button>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-gray-400">
                      La orden avanza de una en una. Cada paso queda en el historial.
                    </p>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Comunicaciones conductor ↔ vendedor */}
          {(isSuperadmin || isVendedor || isConductor) && (
            <Card className="p-6">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
                <MessageSquare className="h-5 w-5 text-spi-gold" />
                Comunicaciones
              </h2>
              <div className="mb-4 max-h-72 space-y-3 overflow-y-auto">
                {communications.length === 0 ? (
                  <p className="py-6 text-center text-sm text-gray-400">
                    Sin mensajes todavía. Escribí el primero para coordinar la entrega.
                  </p>
                ) : (
                  communications.map((c) => {
                    const mine = c.senderId === user?.id
                    const cMsg = c.message ?? ''
                    return (
                      <div key={c.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                            mine
                              ? 'bg-spi-navy text-white'
                              : 'bg-gray-100 text-gray-800 dark:bg-white/10'
                          }`}
                        >
                          <p className="text-xs font-medium opacity-80">
                            {c.senderName ?? `Usuario ${c.senderId}`} · {timeAgo(c.createdAt)}
                          </p>
                          {c.attachmentUrl && (
                            <img
                              src={c.attachmentUrl}
                              alt="Adjunto del mensaje"
                              className="mt-2 max-h-48 w-auto max-w-full rounded-lg object-cover"
                              loading="lazy"
                            />
                          )}
                          {cMsg && <p className="mt-0.5 whitespace-pre-wrap">{cMsg}</p>}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
              <form onSubmit={handleSend} className="space-y-2">
                {attachmentPreview && (
                  <div className="flex items-center gap-2 rounded-lg border border-spi-border bg-surface p-2">
                    <img
                      src={attachmentPreview}
                      alt="Vista previa"
                      className="h-12 w-12 rounded object-cover"
                    />
                    <span className="flex-1 truncate text-xs text-gray-500">
                      {attachment?.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (attachmentPreview) URL.revokeObjectURL(attachmentPreview)
                        setAttachment(null)
                        setAttachmentPreview(null)
                      }}
                      className="rounded p-1 text-gray-400 hover:text-red-500"
                      aria-label="Quitar adjunto"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
                <div className="flex gap-2">
                  <label
                    className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-spi-border bg-surface px-3 text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5"
                    aria-label="Adjuntar imagen"
                  >
                    <FileImage className="h-4 w-4" />
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => handlePickAttachment(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Escribí un mensaje..."
                    className="flex-1 rounded-lg border border-spi-border bg-surface px-3 py-2 text-sm text-spi-text placeholder-gray-400 outline-none focus:border-spi-text focus:ring-2 focus:ring-spi-text/20"
                  />
                  <Button type="submit" size="md" loading={sending}>
                    <Send className="h-4 w-4" />
                    Enviar
                  </Button>
                </div>
              </form>
            </Card>
          )}
        </div>
      </div>

      {/* ═══ MODAL: cancelar con justificación ═══ */}
      {cancelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-surface p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Cancelar orden</h2>
              <button
                type="button"
                onClick={() => setCancelOpen(false)}
                className="rounded p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-3 text-sm text-gray-500">
              La cancelación queda en el historial con la justificación. Escribí por qué se
              cancela (mínimo 4 caracteres):
            </p>
            <textarea
              value={cancelNote}
              onChange={(e) => setCancelNote(e.target.value)}
              rows={3}
              placeholder="Ej. Cliente pidió reprogramar para mañana"
              className="w-full rounded-lg border border-spi-border bg-white px-3 py-2 text-sm text-spi-text placeholder-gray-400 outline-none focus:border-spi-text focus:ring-2 focus:ring-spi-text/20"
            />
            {actionError && (
              <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {actionError}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCancelOpen(false)}>
                Volver
              </Button>
              <Button
                variant="danger"
                loading={updatingStatus}
                disabled={cancelNote.trim().length < 4}
                onClick={confirmCancel}
              >
                <Ban className="h-4 w-4" />
                Confirmar cancelación
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: registrar pago v2 ═══ */}
      {payOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-surface p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Registrar pago</h2>
              <button
                type="button"
                onClick={() => setPayOpen(false)}
                className="rounded p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
              Saldo pendiente: <strong>{formatMoney(balance)}</strong>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Monto del abono
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder={`0.00 (máx ${formatMoney(balance)})`}
                  className="w-full rounded-lg border border-spi-border bg-white px-3 py-2 text-sm text-spi-text placeholder-gray-400 outline-none focus:border-spi-text focus:ring-2 focus:ring-spi-text/20"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Método de pago
                </label>
                <select
                  value={payMethodId}
                  onChange={(e) => setPayMethodId(e.target.value === '' ? '' : parseInt(e.target.value))}
                  className="w-full rounded-lg border border-spi-border bg-white px-3 py-2 text-sm text-spi-text outline-none focus:border-spi-text focus:ring-2 focus:ring-spi-text/20"
                >
                  <option value="">{order.paymentMethod?.name ?? 'El de la orden'}</option>
                  {methods.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              {(receivingMethod?.requiresReference || receivingMethod?.requiresReceipt) && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Comprobante
                    {receivingMethod.requiresReceipt
                      ? ' (referencia o foto)'
                      : ' (referencia obligatoria)'}
                  </label>
                  <input
                    type="text"
                    value={payReference}
                    onChange={(e) => setPayReference(e.target.value)}
                    placeholder="Número de referencia / comprobante"
                    className="w-full rounded-lg border border-spi-border bg-white px-3 py-2 text-sm text-spi-text placeholder-gray-400 outline-none focus:border-spi-text focus:ring-2 focus:ring-spi-text/20"
                  />
                </div>
              )}

              {receivingMethod?.requiresReceipt && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Foto del comprobante (PNG, JPG o WebP · máx 5MB)
                  </label>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => setPayReceipt(e.target.files?.[0] ?? null)}
                    className="w-full text-sm text-gray-500 file:mr-2 file:rounded-lg file:border-0 file:bg-spi-navy file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-spi-navy/90"
                  />
                </div>
              )}

              {receivingMethod && (
                <p className="text-xs text-gray-400">
                  {receivingMethod.requiresReference && receivingMethod.requiresReceipt
                    ? 'Podés cargar el número de referencia O la foto del comprobante.'
                    : receivingMethod.requiresReference
                      ? 'Este método exige número de referencia.'
                      : 'Efectivo: no requiere comprobante — se cobra en la entrega.'}
                </p>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Nota (opcional)</label>
                <input
                  type="text"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  placeholder="Ej. Pago parcial, restan 20"
                  className="w-full rounded-lg border border-spi-border bg-white px-3 py-2 text-sm text-spi-text placeholder-gray-400 outline-none focus:border-spi-text focus:ring-2 focus:ring-spi-text/20"
                />
              </div>

              {actionError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
              )}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPayOpen(false)}>
                Volver
              </Button>
              <Button loading={registeringPayment} onClick={handleRegisterPayment}>
                <PlusCircle className="h-4 w-4" />
                Registrar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ORDER_STATUS_FLOW_INDEX(s: OrderStatus): number {
  return ['created', 'accepted', 'in_transit', 'delivered'].indexOf(s)
}