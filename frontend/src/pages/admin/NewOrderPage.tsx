import { useMemo, useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Package, Search, X, Plus, Trash2, UserPlus, Zap, Eye, Users, Pencil, Building2 } from 'lucide-react'
import { useCreateOrder } from '../../hooks/queries/useOrders'
import {
  useCustomersList,
  useCustomerGroups,
  useBranches,
  useCreateCustomer,
  type Customer,
} from '../../hooks/queries/useCustomers'
import { useDriversList } from '../../hooks/queries/useTeam'
import { usePaymentMethodsList } from '../../hooks/queries/usePaymentMethods'
import type { OrderItemInput } from '../../hooks/queries/useOrders'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { formatMoney } from '../../lib/utils'

interface DraftItem {
  key: number
  productName: string
  quantity: number
  unitPrice: number
}

let itemKey = 1

export function NewOrderPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const presetCustomerId = searchParams.get('cliente')
  const { mutate: createOrder, isPending } = useCreateOrder()
  const { mutate: createCustomer, isPending: creatingCustomer } = useCreateCustomer()

  // Cliente seleccionado: queda como tarjeta INMUTABLE (ver UI). Solo se
  // deselecciona con «Quitar», que devuelve el formulario a la búsqueda.
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [customerQuery, setCustomerQuery] = useState('')
  // Sucursal seleccionada (solo si el cliente es grupo/franquicia)
  const [selectedBranchId, setSelectedBranchId] = useState<number | ''>('')
  const [autoAssign, setAutoAssign] = useState(true)
  const [driverId, setDriverId] = useState<number | ''>('')
  const [paymentMethodId, setPaymentMethodId] = useState<number | ''>('')
  const [draftItems, setDraftItems] = useState<DraftItem[]>([
    { key: 1, productName: '', quantity: 1, unitPrice: 0 },
  ])
  const [amount, setAmount] = useState('0.00')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  // Paso 2 del flujo: previsualización inmutable de la orden antes de crear.
  const [previewOpen, setPreviewOpen] = useState(false)

  // Modal crear cliente inline
  const [customerModalOpen, setCustomerModalOpen] = useState(false)
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
  })

  // El dropdown de clientes SOLO se despliega mientras se escribe en la
  // búsqueda (customerQuery no vacío y sin cliente seleccionado). Con el campo
  // vacío NO se lista nada: la lista va apareciendo a medida que se filtra.
  const { data: customersData } = useCustomersList({ search: customerQuery, perPage: 10 })
  const { data: drivers } = useDriversList()
  const { data: paymentMethods } = usePaymentMethodsList()
  const activePayments = (paymentMethods ?? []).filter((p) => p.isActive)

  const customerOptions = customersData?.items ?? []

  // Sucursales del grupo seleccionado (para facturar a una sucursal puntual).
  const isGroupCustomer = Boolean(selectedCustomer?.isGroup)
  const { data: branches = [] } = useBranches(isGroupCustomer ? (selectedCustomer?.id ?? null) : null)

  // Si el cliente deja de ser grupo o cambia, resetear la sucursal.
  useEffect(() => {
    if (!isGroupCustomer) setSelectedBranchId('')
  }, [isGroupCustomer, selectedCustomer?.id])

  // Si vino ?cliente=5, mostramos el nombre una vez que cargan los clientes.
  useEffect(() => {
    if (!presetCustomerId || customerQuery) return
    const preset = customerOptions.find((c) => String(c.id) === presetCustomerId)
    if (preset) {
      setSelectedCustomer(preset)
      setCustomerQuery(preset.name)
    }
  }, [presetCustomerId, customerOptions, customerQuery])

  // Total desde items (preview local — el backend recalcula SIEMPRE)
  const itemsTotal = useMemo(
    () => draftItems.reduce((acc, it) => acc + (it.unitPrice || 0) * (it.quantity || 0), 0),
    [draftItems],
  )
  const hasItems = draftItems.some((it) => it.productName.trim() !== '')

  const updateDraft = (key: number, patch: Partial<DraftItem>) => {
    setDraftItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)))
  }

  const removeDraft = (key: number) => {
    setDraftItems((prev) =>
      prev.length === 1
        ? [{ key: 1, productName: '', quantity: 1, unitPrice: 0 }]
        : prev.filter((it) => it.key !== key),
    )
  }

  const addDraft = () => {
    itemKey += 1
    setDraftItems((prev) => [...prev, { key: itemKey, productName: '', quantity: 1, unitPrice: 0 }])
  }

  const handleCreateCustomer = () => {
    setError('')
    if (!newCustomer.name.trim()) {
      setError('El nombre del cliente es requerido')
      return
    }
    createCustomer(
      {
        name: newCustomer.name.trim(),
        phone: newCustomer.phone.trim() || null,
        email: newCustomer.email.trim() || null,
        address: newCustomer.address.trim() || null,
      },
      {
        onSuccess: (customer) => {
          setSelectedCustomer(customer)
          setCustomerQuery(customer.name)
          setCustomerModalOpen(false)
          setNewCustomer({ name: '', phone: '', email: '', address: '' })
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : 'Error al crear el cliente')
        },
      },
    )
  }

  /** Valida el formulario; si algo falta, setea el error y devuelve false. */
  const validateOrder = (): boolean => {
    setError('')
    if (!selectedCustomer) {
      setError('Seleccioná un cliente')
      return false
    }
    // Punto 6 (CTO): el pedido de un grupo/franquicia SIEMPRE va a una
    // sucursal puntual — no existe más la factura "al grupo consolidado".
    if (selectedCustomer.isGroup && selectedBranchId === '') {
      setError('Elegí la sucursal que recibe el pedido (el cliente es un grupo/franquicia)')
      return false
    }
    if (!paymentMethodId) {
      setError('Seleccioná un método de pago')
      return false
    }
    if (hasItems) {
      if (itemsTotal <= 0) {
        setError('El total del pedido debe ser mayor a 0')
        return false
      }
    } else {
      const amountNum = parseFloat(amount)
      if (Number.isNaN(amountNum) || amountNum <= 0) {
        setError('Ingresá un monto válido (o cargá al menos un producto)')
        return false
      }
    }
    return true
  }

  /** Construye el payload — se llama SOLO después de validateOrder(), pero por
   *  defensa en profundidad re-narrowa los campos obligatorios y devuelve null
   *  si faltara algo (el confirmador cierra la preview en ese caso). */
  const buildPayload = () => {
    if (!selectedCustomer || !paymentMethodId) return null

    // Defensa en profundidad (Punto 6): grupo sin sucursal elegida = payload inválido.
    if (selectedCustomer.isGroup && selectedBranchId === '') return null

    const validItems: OrderItemInput[] = draftItems
      .filter((it) => it.productName.trim() !== '')
      .map((it) => ({
        productName: it.productName.trim(),
        quantity: it.quantity || 1,
        unitPrice: it.unitPrice || 0,
      }))

    return {
      customerId: selectedCustomer.id,
      // Sucursal puntual del grupo (obligatoria para grupos/franquicias);
      // clientes simples van sin branch (null).
      branchId: selectedBranchId === '' ? null : selectedBranchId,
      paymentMethodId,
      autoAssignDriver: autoAssign,
      driverId: autoAssign ? null : driverId === '' ? null : driverId,
      ...(hasItems ? { items: validItems } : { amount: parseFloat(amount).toFixed(2) }),
      deliveryAddress: deliveryAddress.trim() || null,
      notes: notes.trim() || null,
    }
  }

  /** Paso 1: validar y abrir la previsualización (doble confirmación). */
  const handleReview = () => {
    if (validateOrder()) setPreviewOpen(true)
  }

  /** Paso 2: crear la orden SOLO desde la previsualización. */
  const handleConfirmCreate = () => {
    // Re-valida por si el usuario cambió algo entre pasos (defensa en profundidad).
    if (!validateOrder()) {
      setPreviewOpen(false)
      return
    }
    const payload = buildPayload()
    if (!payload) {
      setPreviewOpen(false)
      return
    }
    createOrder(payload, {
      onSuccess: (order) => {
        navigate(`/admin/ordenes/${order.id}`)
      },
      onError: (err) => {
        setError(err instanceof Error ? err.message : 'Error al crear la orden')
        setPreviewOpen(false)
      },
    })
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Nueva orden</h1>
        <p className="text-sm text-gray-500">
          Registrá un pedido en segundos: buscá al cliente, cargá los productos y asigná el reparto.
        </p>
      </div>

      <Card className="p-6 space-y-6">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Cliente */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-700">
              Cliente <span className="text-red-500">*</span>
            </label>
            <button
              type="button"
              onClick={() => setCustomerModalOpen(true)}
              className="inline-flex items-center gap-1 text-sm font-medium text-spi-green hover:text-green-700"
            >
              <UserPlus className="h-4 w-4" />
              Nuevo cliente
            </button>
          </div>
          {selectedCustomer ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-spi-border bg-gray-50 dark:bg-white/5 p-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-spi-navy/10 text-spi-navy dark:bg-white/10 dark:text-white">
                  <Users className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">
                    {selectedCustomer.name}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {[selectedCustomer.rif, selectedCustomer.phone, selectedCustomer.email]
                      .filter(Boolean)
                      .join(' · ') || 'Sin datos de contacto'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedCustomer(null)
                  setCustomerQuery('')
                }}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                title="Quitar cliente y volver a buscar"
              >
                <X className="h-4 w-4" />
                Quitar
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={customerQuery}
                  onChange={(e) => {
                    setCustomerQuery(e.target.value)
                    setSelectedCustomer(null)
                  }}
                  placeholder="Buscar cliente por nombre, teléfono o email..."
                  className="w-full rounded-lg border border-spi-border bg-surface py-2 pl-9 pr-3 text-sm text-spi-text placeholder-gray-400 outline-none focus:border-spi-text focus:ring-2 focus:ring-spi-text/20"
                />
              </div>
              {customerQuery.trim() !== '' && (
                customerOptions.length > 0 ? (
                  <ul className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-spi-border divide-y divide-spi-border">
                    {customerOptions
                      .filter((c) => c.isActive)
                      .map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCustomer(c)
                              setCustomerQuery(c.name)
                            }}
                            className="w-full flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-white/5"
                          >
                            <span className="text-gray-800">{c.name}</span>
                            <span className="text-xs text-gray-400">{c.phone ?? c.email ?? ''}</span>
                          </button>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="mt-2 rounded-lg border border-dashed border-spi-border px-3 py-2 text-sm text-gray-400">
                    No se encontraron clientes
                  </p>
                )
              )}
            </>
          )}
        </div>

        {/* Sucursal — OBLIGATORIA si el cliente es grupo/franquicia (decisión
            CTO Punto 6: los pedidos SIEMPRE van a una sucursal puntual; la
            consolidación grupo/individual SOLO aplica a notas de entrega) */}
        {selectedCustomer?.isGroup && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-700">
              Sucursal de facturación <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-gray-400 mb-1.5">
              Elegí la sucursal que recibe el pedido: cada orden se factura a una sucursal puntual
              del grupo.
            </p>
            <select
              value={selectedBranchId}
              onChange={(e) =>
                setSelectedBranchId(e.target.value === '' ? '' : parseInt(e.target.value))
              }
              className="w-full rounded-lg border border-spi-border bg-surface px-3 py-2 text-sm text-spi-text outline-none focus:border-spi-text focus:ring-2 focus:ring-spi-text/20"
            >
              <option value="">Seleccioná una sucursal...</option>
              {branches
                .filter((b) => b.isActive)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {b.isBillingAddress ? ' · facturación' : ''}
                  </option>
                ))}
            </select>
          </div>
        )}

        {/* Productos */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-700">
              Productos
            </label>
            <button
              type="button"
              onClick={addDraft}
              className="inline-flex items-center gap-1 text-sm font-medium text-spi-green hover:text-green-700"
            >
              <Plus className="h-4 w-4" />
              Agregar producto
            </button>
          </div>
          <div className="space-y-2">
            {draftItems.map((item) => (
              <div
                key={item.key}
                className="grid grid-cols-[1fr_64px_96px_36px] gap-2 items-center"
              >
                <input
                  type="text"
                  value={item.productName}
                  onChange={(e) => updateDraft(item.key, { productName: e.target.value })}
                  placeholder="Producto / servicio"
                  className="w-full rounded-lg border border-spi-border bg-surface px-3 py-2 text-sm text-spi-text placeholder-gray-400 outline-none focus:border-spi-text focus:ring-2 focus:ring-spi-text/20"
                />
                <input
                  type="number"
                  min="1"
                  value={item.quantity || ''}
                  onChange={(e) =>
                    updateDraft(item.key, { quantity: parseInt(e.target.value) || 0 })
                  }
                  placeholder="Cant."
                  title="Cantidad"
                  className="w-full rounded-lg border border-spi-border bg-surface px-2 py-2 text-sm text-spi-text outline-none focus:border-spi-text focus:ring-2 focus:ring-spi-text/20"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.unitPrice || ''}
                  onChange={(e) =>
                    updateDraft(item.key, { unitPrice: parseFloat(e.target.value) || 0 })
                  }
                  placeholder="Precio"
                  title="Precio unitario"
                  className="w-full rounded-lg border border-spi-border bg-surface px-2 py-2 text-sm text-spi-text outline-none focus:border-spi-text focus:ring-2 focus:ring-spi-text/20"
                />
                <button
                  type="button"
                  onClick={() => removeDraft(item.key)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                  title="Quitar producto"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          {hasItems ? (
            <p className="mt-2 text-sm font-semibold text-gray-700">
              Total: <span className="text-spi-green">{formatMoney(itemsTotal.toFixed(2))}</span>
            </p>
          ) : (
            <div className="mt-4">
              <Input
                label="Total (USD)"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onBlur={() => setAmount(parseFloat(amount || '0').toFixed(2))}
                hint={`Vista previa: ${formatMoney(amount)}`}
              />
            </div>
          )}
        </div>

        {/* Reparto: auto-asignación + método de pago */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-700">
              <input
                type="checkbox"
                checked={autoAssign}
                onChange={(e) => setAutoAssign(e.target.checked)}
                className="h-4 w-4 rounded border-spi-border text-spi-green focus:ring-spi-green"
              />
              <Zap className="h-4 w-4 text-spi-gold" />
              Asignar conductor automáticamente
            </label>

            {autoAssign ? (
              <div className="mt-2 rounded-lg border border-spi-border bg-gray-50 dark:bg-white/5 p-3">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  Se asigna al conductor con menos entregas activas
                </p>
                <p className="mt-0.5 text-xs text-gray-400">
                  Al crear la orden, el sistema elige automáticamente quién la reparte. No se puede
                  editar a mano.
                </p>
              </div>
            ) : driverId ? (
              /* 4-sí (CTO): conductor elegido → tarjeta con su info + «Cambiar» */
              (() => {
                const chosen = (drivers ?? []).find((d) => d.id === driverId)
                return (
                  <div className="mt-2 rounded-lg border border-spi-border bg-gray-50 dark:bg-white/5 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-spi-green/15 text-spi-green">
                          <UserPlus className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                            {chosen?.name ?? 'Conductor'}
                          </p>
                          <p className="text-xs text-gray-400">
                            {chosen
                              ? chosen.activeOrderCount > 0
                                ? `${chosen.activeOrderCount} activa(s)`
                                : 'libre'
                              : ''}
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setDriverId('')}
                      >
                        <Pencil className="h-4 w-4" />
                        Cambiar
                      </Button>
                    </div>
                  </div>
                )
              })()
            ) : (
              <select
                value={driverId}
                onChange={(e) => setDriverId(e.target.value === '' ? '' : parseInt(e.target.value))}
                className="mt-2 w-full rounded-lg border border-spi-border bg-surface px-3 py-2 text-sm text-spi-text outline-none focus:border-spi-text focus:ring-2 focus:ring-spi-text/20"
              >
                <option value="">Sin asignar</option>
                {(drivers ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {d.activeOrderCount > 0 ? ` · ${d.activeOrderCount} activa(s)` : ' · libre'}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-700">
              Método de pago <span className="text-red-500">*</span>
            </label>
            <select
              value={paymentMethodId}
              onChange={(e) =>
                setPaymentMethodId(e.target.value === '' ? '' : parseInt(e.target.value))
              }
              className="w-full rounded-lg border border-spi-border bg-surface px-3 py-2 text-sm text-spi-text outline-none focus:border-spi-text focus:ring-2 focus:ring-spi-text/20"
            >
              <option value="">Seleccioná...</option>
              {activePayments.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <Input
          label="Dirección de entrega"
          value={deliveryAddress}
          onChange={(e) => setDeliveryAddress(e.target.value)}
          placeholder="Opcional — si difiere de la del cliente"
        />

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-700">
            Notas
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Instrucciones, referencias, etc."
            className="w-full rounded-lg border border-spi-border bg-surface px-3 py-2 text-sm text-spi-text placeholder-gray-400 outline-none focus:border-spi-text focus:ring-2 focus:ring-spi-text/20"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={() => navigate('/admin/ordenes')}>
            <X className="h-4 w-4" />
            Cancelar
          </Button>
          <Button type="button" onClick={handleReview}>
            <Eye className="h-4 w-4" />
            Revisar orden
          </Button>
        </div>
      </Card>

      {/* Modal — Previsualización de la orden (paso 2 de la doble confirmación) */}
      <Modal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Revisar la orden"
        size="full"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPreviewOpen(false)}>
              <Pencil className="h-4 w-4" />
              Volver a edición
            </Button>
            <Button onClick={handleConfirmCreate} loading={isPending}>
              <Package className="h-4 w-4" />
              Crear orden
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Cliente — inmutable */}
          <div className="rounded-lg border border-spi-border p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
              Cliente
            </p>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-spi-navy/10 text-spi-navy dark:bg-white/10 dark:text-white">
                <Users className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-base font-semibold text-gray-900">{selectedCustomer?.name}</p>
                <p className="text-sm text-gray-500 truncate">
                  {[selectedCustomer?.rif, selectedCustomer?.phone, selectedCustomer?.email]
                    .filter(Boolean)
                    .join(' · ') || 'Sin datos de contacto'}
                </p>
                {selectedCustomer?.address && (
                  <p className="text-sm text-gray-500">{selectedCustomer.address}</p>
                )}
                {selectedCustomer?.isGroup && (
                  <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                    <Building2 className="h-3 w-3" />
                    {selectedBranchId
                      ? branches.find((b) => b.id === selectedBranchId)?.name ?? 'Sucursal'
                      : 'Seleccioná una sucursal'}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Detalle: productos o monto único */}
          <div className="rounded-lg border border-spi-border p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
              Detalle
            </p>
            {hasItems ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-spi-border text-left text-xs uppercase tracking-wider text-gray-400">
                      <th className="py-2 pr-3">Producto</th>
                      <th className="py-2 pr-3 text-right">Cant.</th>
                      <th className="py-2 pr-3 text-right">Precio</th>
                      <th className="py-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-spi-border">
                    {draftItems
                      .filter((it) => it.productName.trim() !== '')
                      .map((it) => (
                        <tr key={it.key}>
                          <td className="py-2 pr-3 font-medium text-gray-800">
                            {it.productName.trim()}
                          </td>
                          <td className="py-2 pr-3 text-right text-gray-600">{it.quantity || 1}</td>
                          <td className="py-2 pr-3 text-right text-gray-600">
                            {formatMoney((it.unitPrice || 0).toFixed(2))}
                          </td>
                          <td className="py-2 text-right font-medium text-gray-800">
                            {formatMoney(((it.unitPrice || 0) * (it.quantity || 1)).toFixed(2))}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-spi-border">
                      <td
                        colSpan={3}
                        className="py-2 pr-3 text-right text-sm font-semibold text-gray-700"
                      >
                        Total
                      </td>
                      <td className="py-2 text-right text-base font-bold text-spi-green">
                        {formatMoney(itemsTotal.toFixed(2))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Monto único (sin productos)</span>
                <span className="text-base font-bold text-spi-green">{formatMoney(amount)}</span>
              </div>
            )}
          </div>

          {/* Reparto y pago */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-lg border border-spi-border p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Reparto
              </p>
              <p className="text-sm text-gray-800">
                {autoAssign
                  ? 'Asignación automática (conductor con menos entregas)'
                  : drivers?.find((d) => d.id === driverId)?.name ?? 'Sin asignar'}
              </p>
            </div>
            <div className="rounded-lg border border-spi-border p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Método de pago
              </p>
              <p className="text-sm text-gray-800">
                {activePayments.find((p) => p.id === paymentMethodId)?.name ?? '—'}
              </p>
            </div>
          </div>

          {/* Dirección y notas */}
          <div className="rounded-lg border border-spi-border p-4 space-y-3">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Dirección de entrega
              </p>
              <p className="text-sm text-gray-800">{deliveryAddress.trim() || 'Sin indicar'}</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Notas
              </p>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{notes.trim() || 'Sin notas'}</p>
            </div>
          </div>

          <p className="text-center text-xs text-gray-400">
            Revisá los datos antes de confirmar: la orden se crea definitivamente al pulsar
            «Crear orden».
          </p>
        </div>
      </Modal>

      {/* Modal crear cliente */}
      <Modal
        isOpen={customerModalOpen}
        onClose={() => setCustomerModalOpen(false)}
        title="Nuevo cliente"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCustomerModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateCustomer} loading={creatingCustomer}>
              <UserPlus className="h-4 w-4" />
              Crear cliente
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Nombre *"
            value={newCustomer.name}
            onChange={(e) => setNewCustomer((c) => ({ ...c, name: e.target.value }))}
            placeholder="Nombre y apellido"
          />
          <Input
            label="Teléfono"
            value={newCustomer.phone}
            onChange={(e) => setNewCustomer((c) => ({ ...c, phone: e.target.value }))}
            placeholder="+58 412 000 0000"
          />
          <Input
            label="Email"
            type="email"
            value={newCustomer.email}
            onChange={(e) => setNewCustomer((c) => ({ ...c, email: e.target.value }))}
            placeholder="opcional"
          />
          <Input
            label="Dirección"
            value={newCustomer.address}
            onChange={(e) => setNewCustomer((c) => ({ ...c, address: e.target.value }))}
            placeholder="opcional"
          />
        </div>
      </Modal>
    </div>
  )
}
