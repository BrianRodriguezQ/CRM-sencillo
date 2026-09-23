import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Users, Plus, Pencil, Phone, Mail, MapPin, Eye, Building2 } from 'lucide-react'
import {
  useCustomersList,
  useCustomerGroups,
  useCreateCustomer,
  useUpdateCustomer,
  type Customer,
} from '../../hooks/queries/useCustomers'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { Pagination } from '../../components/ui/Pagination'
import { EmptyState } from '../../components/ui/EmptyState'
import { PrefixedNumberInput } from '../../components/ui/PrefixedNumberInput'
import { LoadingState } from '../../components/ui/LoadingState'

const EMPTY_FORM = { name: '', rif: '', phone: '', email: '', address: '', notes: '', isGroup: false }

type Tab = 'clientes' | 'grupos'

export function CustomersPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('clientes')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'activo' | 'inactivo' | ''>('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')

  const isGroupsTab = tab === 'grupos'

  // En la pestaña Grupos usamos el endpoint /customers/groups (solo isGroup).
  const listQuery = isGroupsTab
    ? useCustomerGroups({ page, perPage, search })
    : useCustomersList({
        page,
        perPage,
        search,
        ...(statusFilter ? { isActive: statusFilter === 'activo' } : {}),
      })
  const { data, isLoading } = listQuery
  const { mutate: createCustomer, isPending: creating } = useCreateCustomer()
  const { mutate: updateCustomer, isPending: updating } = useUpdateCustomer()

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const saving = creating || updating

  const openCreate = () => {
    setEditing(null)
    setForm({ ...EMPTY_FORM, isGroup: isGroupsTab })
    setError('')
    setModalOpen(true)
  }

  const openEdit = (c: Customer) => {
    setEditing(c)
    setForm({
      name: c.name,
      rif: c.rif ?? '',
      phone: c.phone ?? '',
      email: c.email ?? '',
      address: c.address ?? '',
      notes: c.notes ?? '',
      isGroup: Boolean(c.isGroup),
    })
    setError('')
    setModalOpen(true)
  }

  const switchTab = (t: Tab) => {
    setTab(t)
    setPage(1)
    setSearch('')
    setStatusFilter('')
  }

  const handleSubmit = () => {
    setError('')
    if (!form.name.trim()) {
      setError('El nombre es obligatorio')
      return
    }
    const payload = {
      name: form.name.trim(),
      // Si solo tocó el prefijo J- sin números, se guarda null (no "J-" suelto).
      rif: /\d/.test(form.rif) ? form.rif : null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
      isGroup: form.isGroup,
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
            {isGroupsTab
              ? 'Grupos y franquicias: clientes que agrupan varias sucursales.'
              : 'A quién venden los operadores.'}
          </p>
        </div>
        <Button type="button" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          {isGroupsTab ? 'Nuevo grupo' : 'Nuevo cliente'}
        </Button>
      </div>

      {/* Tabs: Clientes / Grupos (franquicias) */}
      <div className="mb-4 flex gap-1 rounded-xl border border-spi-border bg-surface p-1 w-fit">
        <button
          type="button"
          onClick={() => switchTab('clientes')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            !isGroupsTab
              ? 'bg-spi-text text-white'
              : 'text-gray-600 hover:bg-gray-100 dark:hover:bg-white/5'
          }`}
        >
          <Users className="h-4 w-4" />
          Clientes
        </button>
        <button
          type="button"
          onClick={() => switchTab('grupos')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            isGroupsTab
              ? 'bg-spi-text text-white'
              : 'text-gray-600 hover:bg-gray-100 dark:hover:bg-white/5'
          }`}
        >
          <Building2 className="h-4 w-4" />
          Grupos / Franquicias
        </button>
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
                placeholder={
                  isGroupsTab
                    ? 'Buscar grupo o franquicia por nombre, RIF...'
                    : 'Buscar por nombre, teléfono, email o RIF...'
                }
                className="w-full rounded-lg border border-spi-border bg-surface py-2 pl-9 pr-3 text-sm text-spi-text placeholder-gray-400 outline-none focus:border-spi-text focus:ring-2 focus:ring-spi-text/20"
              />
            </div>
            {!isGroupsTab && (
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
            )}
          </div>
        </div>
      </Card>

      <Card>
        {isLoading ? (
          <LoadingState />
        ) : items.length === 0 ? (
          <EmptyState
            icon={isGroupsTab ? Building2 : Users}
            title={isGroupsTab ? 'Sin grupos' : 'Sin clientes'}
            description={
              isGroupsTab
                ? 'Todavía no hay grupos/franquicias. Creá uno para poder agregarle sucursales.'
                : 'No hay clientes para los filtros seleccionados.'
            }
            action={{ label: isGroupsTab ? 'Crear el primero' : 'Crear el primero', onClick: openCreate }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-spi-border text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Contacto</th>
                  <th className="px-4 py-3">Dirección</th>
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
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/admin/clientes/${c.id}`)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        {c.isGroup ? 'Sucursales' : 'Ver'}
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
        title={editing ? 'Editar cliente' : isGroupsTab ? 'Nuevo grupo' : 'Nuevo cliente'}
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
              {editing ? 'Guardar cambios' : isGroupsTab ? 'Crear grupo' : 'Crear cliente'}
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
          {/* Toggle grupo/franquicia (visible al crear; en edición queda fijo) */}
          {!editing && (
            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-spi-border bg-surface px-3 py-2.5">
              <span className="flex flex-col">
                <span className="text-sm font-medium text-gray-900">Es grupo / franquicia</span>
                <span className="text-xs text-gray-500">
                  Agrupa varias sucursales con datos propios de facturación y entrega.
                </span>
              </span>
              <input
                type="checkbox"
                checked={form.isGroup}
                onChange={(e) => setForm((f) => ({ ...f, isGroup: e.target.checked }))}
                className="h-4 w-4 accent-spi-text"
              />
            </label>
          )}
          <Input
            label="Nombre *"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder={form.isGroup ? 'Ej: Grupo Los Andes C.A.' : 'Nombre y apellido'}
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
              rows={3}
              placeholder="Observaciones, preferencias, referencia..."
              className="w-full rounded-lg border border-spi-border bg-surface px-3 py-2 text-sm text-spi-text placeholder-gray-400 outline-none focus:border-spi-text focus:ring-2 focus:ring-spi-text/20"
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}