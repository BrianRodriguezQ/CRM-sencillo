import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Search,
  Users,
  Plus,
  Pencil,
  Power,
  PowerOff,
  Crown,
  KeyRound,
  CheckCircle2,
} from 'lucide-react'
import {
  useUsersList,
  useCreateUser,
  useUpdateUser,
  useToggleUserActive,
  useResetUserPassword,
  type UsersListParams,
} from '../../hooks/queries/useTeam'
import { useAuth, type User, type UserRole } from '../../context/AuthContext'
import { PASSWORD_HINT } from '../../lib/passwordPolicy'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { EmptyState } from '../../components/ui/EmptyState'
import { Avatar } from '../../components/ui/Avatar'
import { PrefixedNumberInput } from '../../components/ui/PrefixedNumberInput'
import { LoadingState } from '../../components/ui/LoadingState'
import { Pagination } from '../../components/ui/Pagination'

const ROLE_LABELS: Record<UserRole, string> = {
  superadmin: 'Superadmin',
  operador: 'operador',
  conductor: 'Conductor',
  cobranza: 'Cobranza',
}

const EMPTY_FORM = {
  name: '',
  lastName: '',
  cedula: '',
  address: '',
  email: '',
  phone: '',
  role: 'operador' as UserRole,
  password: '',
}

export function TeamPage() {
  const { user: currentUser } = useAuth()
  const [page, setPage] = useState(1)
  // CTO 2026-09-18: carga perezosa 5/10 (nunca listas enteras de opciones).
  const [perPage, setPerPage] = useState(10)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('')
  const [statusFilter, setStatusFilter] = useState<'activo' | 'inactivo' | ''>('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')

  // Reseteo de contraseña por el superadmin
  const [resetTarget, setResetTarget] = useState<User | null>(null)
  const [tempPassword, setTempPassword] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetDone, setResetDone] = useState('')

  const { mutate: createUser, isPending: creating } = useCreateUser()
  const { mutate: updateUser, isPending: updating } = useUpdateUser()
  const { mutate: toggleActive, isPending: toggling } = useToggleUserActive()
  const { mutate: resetPassword, isPending: resetting } = useResetUserPassword()

  const params: UsersListParams = {
    page,
    perPage,
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(roleFilter ? { role: roleFilter } : {}),
    ...(statusFilter ? { isActive: statusFilter === 'activo' } : {}),
  }

  const { data, isLoading } = useUsersList(params)
  const items = data?.items ?? []
  const total = data?.total ?? 0
  const saving = creating || updating

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError('')
    setModalOpen(true)
  }

  const openEdit = (u: User) => {
    setEditing(u)
    // En edición no se toca la contraseña: para eso está "Clave".
    setForm({
      ...EMPTY_FORM,
      name: u.name,
      lastName: u.lastName ?? '',
      cedula: u.cedula ?? '',
      address: u.address ?? '',
      email: u.email,
      phone: u.phone ?? '',
      role: u.role,
    })
    setError('')
    setModalOpen(true)
  }

  const openReset = (u: User) => {
    setResetTarget(u)
    setTempPassword('')
    setResetError('')
    setResetDone('')
  }

  const handleReset = () => {
    if (!resetTarget) return
    setResetError('')
    if (!tempPassword.trim()) {
      setResetError('Escribí una contraseña temporal')
      return
    }

    const target = resetTarget
    resetPassword(
      { id: target.id, password: tempPassword },
      {
        onSuccess: () => {
          setResetTarget(null)
          setTempPassword('')
          setResetDone(
            `Contraseña temporal de ${target.name} lista. Pasásela en mano: el sistema le va a pedir cambiarla cuando entre.`,
          )
        },
        onError: (err) =>
          setResetError(
            err instanceof Error ? err.message : 'No se pudo restablecer la contraseña',
          ),
      },
    )
  }

  const handleSubmit = () => {
    setError('')
    if (!form.name.trim() || !form.email.trim()) {
      setError('Nombre y email son obligatorios')
      return
    }

    // El backend EXIGE contraseña al crear: sin esto, el alta fallaba con 400.
    if (!editing && !form.password.trim()) {
      setError('Escribí una contraseña temporal para el nuevo miembro')
      return
    }

    if (editing) {
      updateUser(
        {
          id: editing.id,
          payload: {
            name: form.name.trim(),
            lastName: form.lastName.trim() || null,
            // Si solo eligió V-/E- sin números, se guarda null (no "V-" suelto).
            cedula: /\d/.test(form.cedula) ? form.cedula : null,
            address: form.address.trim() || null,
            email: form.email.trim(),
            role: form.role,
            phone: form.phone.trim() || null,
          },
        },
        {
          onSuccess: () => setModalOpen(false),
          onError: (err) =>
            setError(err instanceof Error ? err.message : 'Error al actualizar el usuario'),
        },
      )
    } else {
      createUser(
        {
          name: form.name.trim(),
          lastName: form.lastName.trim() || null,
          cedula: /\d/.test(form.cedula) ? form.cedula : null,
          address: form.address.trim() || null,
          email: form.email.trim(),
          phone: form.phone.trim() || null,
          role: form.role,
          password: form.password,
        },
        {
          onSuccess: () => {
            setModalOpen(false)
            setPage(1)
          },
          onError: (err) =>
            setError(err instanceof Error ? err.message : 'Error al crear el usuario'),
        },
      )
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Equipo</h1>
          <p className="text-sm text-gray-500">operadores y conductores de la plataforma.</p>
        </div>
        <Button type="button" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nuevo miembro
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
                placeholder="Buscar por nombre, correo o cédula..."
                className="w-full rounded-lg border border-spi-border bg-surface py-2 pl-9 pr-3 text-sm text-spi-text placeholder-gray-400 outline-none focus:border-spi-text focus:ring-2 focus:ring-spi-text/20"
              />
            </div>
            <select
              aria-label="Filtrar por rol"
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value as UserRole | '')
                setPage(1)
              }}
              className="rounded-lg border border-spi-border bg-surface px-3 py-2 text-sm text-spi-text outline-none focus:border-spi-text focus:ring-2 focus:ring-spi-text/20 cursor-pointer"
            >
              <option value="">Todos los roles</option>
              <option value="superadmin">Superadmin</option>
              <option value="operador">operador</option>
              <option value="conductor">Conductor</option>
              <option value="cobranza">Cobranza</option>
            </select>
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

      {resetDone && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{resetDone}</span>
        </div>
      )}

      <Card>
        {isLoading ? (
          <LoadingState />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Sin miembros"
            description="No hay personal para mostrar."
            action={{ label: 'Crear el primero', onClick: openCreate }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-spi-border text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3">Miembro</th>
                  <th className="px-4 py-3">Rol</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-spi-border">
                {items.map((u) => {
                  const isSelf = u.id === currentUser?.id
                  return (
                    <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-white/5">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={u.name} size="sm" />
                          <div>
                            <p className="font-medium text-gray-900">
                              {u.role !== 'superadmin' ? (
                                <Link
                                  to={`/admin/equipo/${u.id}`}
                                  className="underline-offset-2 hover:text-spi-green hover:underline"
                                >
                                  {u.name}
                                </Link>
                              ) : (
                                u.name
                              )}
                              {isSelf && <span className="ml-2 text-xs text-gray-400">(vos)</span>}
                            </p>
                            <p className="text-xs text-gray-400">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 rounded-full bg-spi-gold/10 px-2 py-0.5 text-xs font-medium text-yellow-700">
                          {u.role === 'superadmin' && <Crown className="h-3 w-3" />}
                          {ROLE_LABELS[u.role]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1">
                          <span
                            className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                              u.isActive ? 'text-green-600' : 'text-gray-400'
                            }`}
                          >
                            <span
                              className={`h-2 w-2 rounded-full ${
                                u.isActive ? 'bg-green-500' : 'bg-gray-300'
                              }`}
                            />
                            {u.isActive ? 'Activo' : 'Inactivo'}
                          </span>
                          {u.mustChangePassword && (
                            <span
                              className="inline-flex items-center gap-1 text-xs font-medium text-amber-600"
                              title="Todavía no cambió la contraseña temporal"
                            >
                              <KeyRound className="h-3 w-3" />
                              Clave pendiente
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {isSelf ? (
                            <span className="bg-gray-50 dark:bg-white/5 text-sm text-gray-400 rounded-lg">
                              <Button type="button" variant="ghost" size="sm" disabled>
                                <Power className="h-3.5 w-3.5" />
                                Activar
                              </Button>
                            </span>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              loading={toggling}
                              onClick={() => toggleActive(u.id)}
                            >
                              {u.isActive ? (
                                <PowerOff className="h-3.5 w-3.5" />
                              ) : (
                                <Power className="h-3.5 w-3.5" />
                              )}
                              {u.isActive ? 'Desactivar' : 'Activar'}
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(u)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Editar
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => openReset(u)}
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                            Clave
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {items.length > 0 && total > perPage && (
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
        title={editing ? 'Editar miembro' : 'Nuevo miembro'}
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
              {editing ? 'Guardar cambios' : 'Crear miembro'}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Nombre *"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              autoFocus
              required
            />
            <Input
              label="Apellido"
              value={form.lastName}
              onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
              placeholder="Apellido"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PrefixedNumberInput
              label="Cédula"
              prefixOptions={['V-', 'E-']}
              value={form.cedula}
              onChange={(v) => setForm((f) => ({ ...f, cedula: v }))}
              placeholder="12345678"
              maxLength={9}
              hint="Elegí V- (venezolano) o E- (extranjero) y completá los números."
            />
            <Input
              label="Dirección"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              placeholder="Dirección corta"
            />
          </div>
          <Input
            label="Email *"
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            disabled={!!editing}
            hint={editing ? 'El email no se puede editar' : undefined}
          />
          <Input
            label="Teléfono"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="+58 412 1234567"
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-700">
              Rol
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(['operador', 'conductor', 'cobranza', 'superadmin'] as UserRole[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, role: r }))}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    form.role === r
                      ? 'border-spi-navy bg-spi-navy text-white'
                      : 'border-spi-border text-gray-600 hover:border-spi-text'
                  }`}
                >
                  {ROLE_LABELS[r]}
                </button>
              ))}
            </div>
          </div>
          {!editing && (
            <>
              <Input
                label="Contraseña temporal *"
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                hint={PASSWORD_HINT}
                autoComplete="new-password"
              />
              <p className="bg-gray-50 dark:bg-white/5 border border-spi-border rounded-lg px-3 py-2 text-xs text-gray-400">
                Es TEMPORAL: pasásela en mano al miembro. El sistema le va a pedir que la cambie
                cuando entre, y no puede usarla de nuevo.
              </p>
            </>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={!!resetTarget}
        onClose={() => setResetTarget(null)}
        title="Restablecer contraseña"
        size="md"
        zIndex={90}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setResetTarget(null)}
              disabled={resetting}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={handleReset} loading={resetting}>
              Guardar temporal
            </Button>
          </>
        }
      >
        {resetError && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
            {resetError}
          </div>
        )}
        <p className="mb-4 text-sm text-gray-600">
          Le vas a dejar una contraseña TEMPORAL a{' '}
          <span className="font-medium text-gray-900">{resetTarget?.name}</span>. Se le cierran
          todas las sesiones abiertas y el sistema le va a pedir que la cambie cuando entre.
        </p>
        <Input
          label="Contraseña temporal *"
          type="password"
          value={tempPassword}
          onChange={(e) => setTempPassword(e.target.value)}
          hint={PASSWORD_HINT}
          autoComplete="new-password"
          autoFocus
        />
      </Modal>
    </div>
  )
}
