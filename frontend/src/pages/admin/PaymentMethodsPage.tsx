import { useState } from 'react'
import { CreditCard, Plus, Pencil, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import {
  usePaymentMethodsList,
  useCreatePaymentMethod,
  useUpdatePaymentMethod,
  useDeletePaymentMethod,
  type PaymentMethod,
} from '../../hooks/queries/usePaymentMethods'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { LoadingState } from '../../components/ui/LoadingState'

export function PaymentMethodsPage() {
  const { data: methods = [], isLoading } = usePaymentMethodsList()
  const sorted = [...methods].sort((a, b) => a.sortOrder - b.sortOrder)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<PaymentMethod | null>(null)
  const [form, setForm] = useState({ name: '', code: '', paymentDetails: '' })
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<PaymentMethod | null>(null)

  const { mutate: createMethod, isPending: creating } = useCreatePaymentMethod()
  const { mutate: updateMethod, isPending: updating } = useUpdatePaymentMethod()
  const { mutate: deleteMethod, isPending: deleting } = useDeletePaymentMethod()

  const saving = creating || updating

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', code: '', paymentDetails: '' })
    setError('')
    setModalOpen(true)
  }

  const openEdit = (m: PaymentMethod) => {
    setEditing(m)
    setForm({ name: m.name, code: m.code, paymentDetails: m.paymentDetails ?? '' })
    setError('')
    setModalOpen(true)
  }

  const handleSubmit = () => {
    setError('')
    if (!form.name.trim() || !form.code.trim()) {
      setError('Nombre y código son obligatorios')
      return
    }
    const payload = {
      name: form.name.trim(),
      code: form.code.trim().toLowerCase().replace(/\s+/g, '_'),
      paymentDetails: form.paymentDetails.trim() || null,
    }
    if (editing) {
      updateMethod(
        { id: editing.id, payload },
        {
          onSuccess: () => setModalOpen(false),
          onError: (err) =>
            setError(err instanceof Error ? err.message : 'Error al guardar el método'),
        },
      )
    } else {
      createMethod(payload, {
        onSuccess: () => setModalOpen(false),
        onError: (err) => setError(err instanceof Error ? err.message : 'Error al crear el método'),
      })
    }
  }

  const toggleActive = (m: PaymentMethod) => {
    updateMethod({ id: m.id, payload: { isActive: !m.isActive } })
  }

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= sorted.length) return
    const a = sorted[index]
    const b = sorted[target]
    if (!a || !b) return
    const aOrder = Math.min(a.sortOrder, b.sortOrder)
    const bOrder = Math.max(a.sortOrder, b.sortOrder)
    updateMethod({ id: a.id, payload: { sortOrder: bOrder } })
    updateMethod({ id: b.id, payload: { sortOrder: aOrder } })
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Métodos de pago</h1>
          <p className="text-sm text-gray-500">Opciones disponibles al crear órdenes.</p>
        </div>
        <Button type="button" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nuevo método
        </Button>
      </div>

      <Card>
        {isLoading ? (
          <LoadingState />
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center py-14">
            <CreditCard className="mb-3 h-8 w-8 text-gray-300" />
            <p className="text-sm text-gray-500 mb-4">Todavía no hay métodos de pago.</p>
            <Button type="button" onClick={openCreate} size="sm">
              Crear el primero
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-spi-border">
            {sorted.map((m, i) => (
              <li key={m.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-spi-gold/10 text-yellow-700">
                    <CreditCard className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{m.name}</p>
                    <p className="font-mono text-xs text-gray-400">{m.code}</p>
                    {m.paymentDetails && (
                      <p className="mt-1 max-w-md text-xs text-gray-500 whitespace-pre-line">
                        {m.paymentDetails}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <div className="mr-1 flex flex-col">
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      className="text-gray-400 hover:text-spi-text disabled:opacity-30"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      disabled={i === sorted.length - 1}
                      className="text-gray-400 hover:text-spi-text disabled:opacity-30"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                  <Button
                    type="button"
                    variant={m.isActive ? 'green' : 'secondary'}
                    size="sm"
                    onClick={() => toggleActive(m)}
                  >
                    {m.isActive ? 'Activo' : 'Inactivo'}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(m)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteTarget(m)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar método' : 'Nuevo método de pago'}
        size="md"
        zIndex={90}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModalOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={handleSubmit} loading={saving}>
              {editing ? 'Guardar' : 'Crear'}
            </Button>
          </>
        }
      >
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
            {error}
          </div>
        )}
        <div className="space-y-4">
          <Input
            label="Nombre *"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Efectivo, Transferencia, Zelle..."
            autoFocus
          />
          <Input
            label="Código *"
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            placeholder="efectivo, transferencia, zelle"
            hint="Identificador único en minúsculas (se normaliza automáticamente)"
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-700">
              Datos para el pago
            </label>
            <textarea
              value={form.paymentDetails}
              onChange={(e) => setForm((f) => ({ ...f, paymentDetails: e.target.value }))}
              rows={3}
              placeholder="Cuenta, alias, referencia, instrucciones que el cliente necesita..."
              className="w-full rounded-lg border border-spi-border bg-surface px-3 py-2 text-sm text-spi-text placeholder-gray-400 outline-none focus:border-spi-text focus:ring-2 focus:ring-spi-text/20"
            />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMethod(deleteTarget.id, {
              onSuccess: () => setDeleteTarget(null),
              onError: () => setDeleteTarget(null),
            })
          }
        }}
        title="Eliminar método de pago"
        message={`¿Seguro que querés eliminar ${deleteTarget?.name}? Las órdenes existentes no se verán afectadas.`}
        confirmLabel="Eliminar"
        loading={deleting}
      />
    </div>
  )
}
