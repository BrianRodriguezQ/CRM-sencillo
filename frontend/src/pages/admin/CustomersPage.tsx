import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, Pencil, Phone, Mail, MapPin, Eye, Building2, Store, X, Info } from 'lucide-react'
import {
  useCustomersList,
  useCreateCustomer,
  useUpdateCustomer,
  type Customer,
  type BranchPayload,
} from '../../hooks/queries/useCustomers'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { Pagination } from '../../components/ui/Pagination'
import { EmptyState } from '../../components/ui/EmptyState'
import { PrefixedNumberInput } from '../../components/ui/PrefixedNumberInput'
import { LoadingState } from '../../components/ui/LoadingState'

/* ─── Punto 3 y 4 del mandato ─────────────────────────────────────────────
 * Ya no existe "cliente individual" como concepto: todo cliente es un grupo
 * con 1 o más sedes. No hay más tabs Clientes/Grupos: UNA sola lista que los
 * muestra todos, y el form crea el cliente con su SUCURSAL PRINCIPAL
 * (obligatoria) + secundarias opcionales. No hay toggle "es grupo/franquicia".
 * ───────────────────────────────────────────────────────────────────────── */

interface BranchFormRow {
  name: string
  contactPerson: string
  rif: string
  phone: string
  email: string
  address: string
  isBillingAddress: boolean
  isDeliveryAddress: boolean
}

interface CustomerForm {
  name: string
  rif: string
  phone: string
  email: string
  address: string
  notes: string
  branches: BranchFormRow[]
}

const EMPTY_BRANCH: BranchFormRow = {
  name: 'Sucursal principal',
  contactPerson: '',
  rif: '',
  phone: '',
  email: '',
  address: '',
  isBillingAddress: true,
  isDeliveryAddress: true,
}

const EMPTY_FORM: CustomerForm = {
  name: '',
  rif: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
  branches: [{ ...EMPTY_BRANCH }],
}

function branchToPayload(b: BranchFormRow): BranchPayload {
  return {
    name: b.name.trim(),
    rif: /\d/.test(b.rif) ? b.rif.trim() : null,
    phone: b.phone.trim() || null,
    email: b.email.trim() || null,
    address: b.address.trim() || null,
    contactPerson: b.contactPerson.trim() || null,
    isBillingAddress: b.isBillingAddress,
    isDeliveryAddress: b.isDeliveryAddress,
  }
}

/** Bloque de sucursal del form (principal y secundarias comparten este layout). */
function BranchFields({
  title,
  value,
  onChange,
  onRemove,
  showRif,
}: {
  title: string
  value: BranchFormRow
  onChange: (next: BranchFormRow) => void
  onRemove?: () => void
  showRif: boolean
}) {
  return (
    <div className="rounded-lg border border-spi-border bg-gray-50/50 dark:bg-white/5 p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <Store className="h-4 w-4 text-spi-navy" />
          {title}
        </p>
        {onRemove && (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <X className="h-3.5 w-3.5" />
            Quitar
          </Button>
        )}
      </div>
      <Input
        label="Nombre de la sucursal *"
        value={value.name}
        onChange={(e) => onChange({ ...value, name: e.target.value })}
        placeholder="Ej: Sucursal Centro"
        required
      />
      <Input
        label="Persona de contacto"
        value={value.contactPerson}
        onChange={(e) => onChange({ ...value, contactPerson: e.target.value })}
        placeholder="Encargado, gerente de la sucursal..."
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {showRif && (
          <PrefixedNumberInput
            label="RIF"
            prefix="J-"
            value={value.rif}
            onChange={(v) => onChange({ ...value, rif: v })}
            placeholder="123456789"
            maxLength={9}
            hint="Sufijo de rama opcional: 123456789-1"
          />
        )}
        <Input
          label="Teléfono"
          value={value.phone}
          onChange={(e) => onChange({ ...value, phone: e.target.value })}
          placeholder="+58 412 1234567"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Email"
          type="email"
          value={value.email}
          onChange={(e) => onChange({ ...value, email: e.target.value })}
          placeholder="sucursal@mail.com"
        />
        <Input
          label="Dirección"
          value={value.address}
          onChange={(e) => onChange({ ...value, address: e.target.value })}
          placeholder="Dirección de la sucursal"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        <label className="flex cursor-pointer items-center justify-between rounded-lg border border-spi-border bg-surface px-3 py-2.5">
          <span className="text-sm font-medium text-gray-900">Dirección de facturación</span>
          <input
            type="checkbox"
            checked={value.isBillingAddress}
            onChange={(e) => onChange({ ...value, isBillingAddress: e.target.checked })}
            className="h-4 w-4 accent-spi-text"
          />
        </label>
        <label className="flex cursor-pointer items-center justify-between rounded-lg border border-spi-border bg-surface px-3 py-2.5">
          <span className="text-sm font-medium text-gray-900">Dirección de entrega</span>
          <input
            type="checkbox"
            checked={value.isDeliveryAddress}
            onChange={(e) => onChange({ ...value, isDeliveryAddress: e.target.checked })}
            className="h-4 w-4 accent-spi-text"
          />
        </label>
      </div>
    </div>
  )
}

export function CustomersPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'activo' | 'inactivo' | ''>('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM)
  const [error, setError] = useState('')

  // Lista unificada (Punto 4): /customers trae raíces — grupos y ex
  // individuales convertidos por la migración 0012 — sin sucursales sueltas.
  const { data, isLoading } = useCustomersList({
    page,
    perPage,
    search,
    ...(statusFilter ? { isActive: statusFilter === 'activo' } : {}),
  })
  const { mutate: createCustomer, isPending: creating } = useCreateCustomer()
  const { mutate: updateCustomer, isPending: updating } = useUpdateCustomer()

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const saving = creating || updating

  const openCreate = () => {
    setEditing(null)
    setForm({
      ...EMPTY_FORM,
      branches: [{ ...EMPTY_BRANCH }],
    })
    setError('')
    setModalOpen(true)
  }

  const openEdit = (c: Customer) => {
    setEditing(c)
    // En edición solo se tocan los datos del cliente; las sedes se gestionan
    // desde la ficha (CustomerDetailPage).
    setForm({
      name: c.name,
      rif: c.rif ?? '',
      phone: c.phone ?? '',
      email: c.email ?? '',
      address: c.address ?? '',
      notes: c.notes ?? '',
      branches: [],
    })
    setError('')
    setModalOpen(true)
  }

  const setBranch = (index: number, next: BranchFormRow) => {
    setForm((f) => ({
      ...f,
      branches: f.branches.map((b, i) => (i === index ? next : b)),
    }))
  }

  const addBranch = () => {
    setForm((f) => ({
      ...f,
      branches: [...f.branches, { ...EMPTY_BRANCH, name: `Sucursal ${f.branches.length + 1}` }],
    }))
  }

  const removeBranch = (index: number) => {
    setForm((f) => ({
      ...f,
      branches: f.branches.filter((_, i) => i !== index),
    }))
  }

  const handleSubmit = () => {
    setError('')
    if (!form.name.trim()) {
      setError('El nombre del cliente es obligatorio')
      return
    }
    // La sucursal principal nunca se quita: el cliente SIEMPRE tiene al menos 1 sede.
    const principal = form.branches[0]
    if (!editing && !principal?.name.trim()) {
      setError('El nombre de la sucursal principal es obligatorio')
      return
    }
    if (!editing && form.branches.some((b, i) => i > 0 && !b.name.trim())) {
      setError('Completá el nombre de cada sucursal secundaria (o quitá la vacía)')
      return
    }

    const payload = {
      name: form.name.trim(),
      // Si solo tocó el prefijo J- sin números, se guarda null (no "J-" suelto).
      rif: /\d/.test(form.rif) ? form.rif.trim() : null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
      // Al crear, el cliente se arma con sus sedes (primera = principal).
      ...(editing ? {} : { branches: form.branches.map(branchToPayload) }),
    }

    if (editing) {
      updateCustomer(
        { id: editing.id, payload },
        {
          onSuccess: () => setModalOpen(false),
          onError: (err) =>
            setError(err instanceof Error ? err.message : 'Error al guardar el cliente'),
        },
      )
    } else {
      createCustomer(payload, {
        onSuccess: () => {
          setModalOpen(false)
          setPage(1)
        },
        onError: (err) =>
          setError(err instanceof Error ? err.message : 'Error al crear el cliente'),
      })
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-500">
            Todos los clientes: grupos, franquicias y negocios con una o más sedes.
          </p>
        </div>
        <Button type="button" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nuevo cliente
        </Button>
      </div>

      <Card className="mb-4">
        <div className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder="Buscar por nombre, teléfono, email o RIF..."
                className="w-full rounded-lg border border-spi-border bg-surface py-2 pl-9 pr-3 text-sm text-spi-text placeholder-gray-400 outline-none focus:border-spi-text focus:ring-2 focus:ring-spi-text/20"
              />
            </div>
            <select
              aria-label="Filtrar por estado"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as 'activo' | 'inactivo' | '')
                setPage(1)
              }}
              className="rounded-lg border border-spi-border bg-surface px-3 py-2 text-sm text-spi-text outline-none focus:border-spi-text focus:ring-2 focus:ring-spi-text/20 cursor-pointer"
            >
              <option value="">Todos los estados</option>
              <option value="activo">Activos</option>
              <option value="inactivo">Inactivos</option>
            </select>
          </div>
        </div>
      </Card>

      <Card>
        {isLoading ? (
          <LoadingState />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Sin clientes"
            description="No hay clientes para los filtros seleccionados."
            action={{ label: 'Crear el primero', onClick: openCreate }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-spi-border text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Contacto</th>
                  <th className="px-4 py-3">Dirección</th>
                  <th className="px-4 py-3 text-center">Sedes</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-spi-border">
                {items.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-white/5">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900">{c.name}</p>
                        {c.isGroup && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                            <Building2 className="h-3 w-3" />
                            Grupo
                          </span>
                        )}
                      </div>
                      {c.rif && <p className="text-xs text-gray-400">{c.rif}</p>}
                      <p className="text-xs text-gray-400">{c.isActive ? 'Activo' : 'Inactivo'}</p>
                    </td>
                    <td className="px-4 py-3">
                      {c.phone && (
                        <p className="flex items-center gap-1.5 text-gray-600">
                          <Phone className="h-3.5 w-3.5 text-gray-400" /> {c.phone}
                        </p>
                      )}
                      {c.email && (
                        <p className="flex items-center gap-1.5 text-gray-600">
                          <Mail className="h-3.5 w-3.5 text-gray-400" /> {c.email}
                        </p>
                      )}
                      {!c.phone && !c.email && <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {c.address ? (
                        <span className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-gray-400" /> {c.address}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {Number(c.branchCount ?? 0) > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                          <Store className="h-3 w-3" />
                          {c.branchCount} {c.branchCount === 1 ? 'sede' : 'sedes'}
                        </span>
                      ) : (
                        <span className="text-[11px] text-gray-400">Sin sedes</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/admin/clientes/${c.id}`)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Ver
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(c)}>
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </Button>
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

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar cliente' : 'Nuevo cliente'}
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
              {editing ? 'Guardar cambios' : 'Crear cliente'}
            </Button>
          </>
        }
      >
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
            {error}
          </div>
        )}
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Datos del cliente */}
          <Input
            label="Nombre del cliente *"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Ej: Grupo Los Andes C.A."
            required
            autoFocus
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PrefixedNumberInput
              label="RIF"
              prefix="J-"
              value={form.rif}
              onChange={(v) => setForm((f) => ({ ...f, rif: v }))}
              placeholder="123456789"
              maxLength={9}
              hint="Prefijo J- fijo; completa solo los números."
            />
            <Input
              label="Teléfono"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+58 412 1234567"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="cliente@mail.com"
            />
            <Input
              label="Dirección"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              placeholder="Dirección de entrega habitual"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-700">
              Notas
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="Observaciones, preferencias, referencia..."
              className="w-full rounded-lg border border-spi-border bg-surface px-3 py-2 text-sm text-spi-text placeholder-gray-400 outline-none focus:border-spi-text focus:ring-2 focus:ring-spi-text/20"
            />
          </div>

          {editing ? (
            /* En edición: las sedes se gestionan desde la ficha del cliente */
            <div className="flex items-start gap-2 rounded-lg border border-spi-border bg-gray-50 dark:bg-white/5 p-3 text-sm text-gray-600">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-spi-navy" />
              <span>
                Las sucursales se gestionan desde la ficha del cliente —{' '}
                <button
                  type="button"
                  className="font-semibold text-spi-navy underline underline-offset-2"
                  onClick={() => {
                    setModalOpen(false)
                    if (editing) navigate(`/admin/clientes/${editing.id}`)
                  }}
                >
                  abrir ficha
                </button>
                .
              </span>
            </div>
          ) : (
            <>
              <div className="border-t border-spi-border pt-4">
                <p className="mb-3 text-sm font-semibold text-gray-900">
                  Sucursal principal <span className="text-red-500">*</span>
                </p>
                <BranchFields
                  title="Sucursal principal"
                  value={form.branches[0] ?? EMPTY_BRANCH}
                  onChange={(next) => setBranch(0, next)}
                  showRif={false}
                />
              </div>

              {form.branches.slice(1).map((b, i) => {
                const index = i + 1
                return (
                  <div key={index} className="border-t border-spi-border pt-4">
                    <BranchFields
                      title={`Sucursal secundaria ${index}`}
                      value={b}
                      onChange={(next) => setBranch(index, next)}
                      onRemove={() => removeBranch(index)}
                      showRif
                    />
                  </div>
                )
              })}

              <Button type="button" variant="outline" className="w-full" onClick={addBranch}>
                <Plus className="h-4 w-4" />
                Agregar sucursal secundaria
              </Button>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}