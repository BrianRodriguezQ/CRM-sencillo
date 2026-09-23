import { useRef, useState, useEffect } from 'react'
import { Shield, Mail, Phone, Calendar, LogOut, KeyRound, Camera } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { Card } from '../../components/ui/Card'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { PrefixedNumberInput } from '../../components/ui/PrefixedNumberInput'
import { TwoFactorSection } from '../../components/TwoFactorSection'
import {
  useChangePassword,
  useUpdateProfile,
  useUploadAvatar,
} from '../../hooks/queries/useProfile'
import { PASSWORD_HINT, validatePassword } from '../../lib/passwordPolicy'
import { formatDate } from '../../lib/dates'

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Superadmin',
  operador: 'operador',
  conductor: 'Conductor',
  cobranza: 'Cobranza',
}

export function ProfilePage() {
  const { user, logout, fetchUser } = useAuth()
  const changePassword = useChangePassword()
  const updateProfile = useUpdateProfile()
  const uploadAvatar = useUploadAvatar()

  // Edición de datos del perfil
  const [name, setName] = useState('')
  const [lastName, setLastName] = useState('')
  const [cedula, setCedula] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Contraseña
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Sincroniza el formulario cuando llega el usuario (o se refresca)
  useEffect(() => {
    if (!user) return
    setName(user.name ?? '')
    setLastName(user.lastName ?? '')
    setCedula(user.cedula ?? '')
    setAddress(user.address ?? '')
    setPhone(user.phone ?? '')
  }, [user?.id, user?.name, user?.lastName, user?.cedula, user?.address, user?.phone])

  if (!user) return null

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!name.trim()) {
      setError('El nombre es requerido')
      return
    }

    try {
      setProfileSaving(true)
      await updateProfile.mutateAsync({
        name: name.trim(),
        lastName: lastName.trim() || null,
        // Si solo eligió el prefijo sin números, se guarda null (no "V-" suelto).
        cedula: /\d/.test(cedula) ? cedula : null,
        address: address.trim() || null,
        phone: phone.trim() || null,
      })
      await fetchUser()
      setSuccess('Perfil actualizado correctamente')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar el perfil')
    } finally {
      setProfileSaving(false)
    }
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError('')
    setSuccess('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      await uploadAvatar.mutateAsync(formData)
      await fetchUser()
      setSuccess('Foto de perfil actualizada')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir la foto')
    } finally {
      // Permite elegir el mismo archivo de nuevo
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!currentPassword) {
      setError('Ingresá tu contraseña actual')
      return
    }
    const policyErrors = validatePassword(newPassword)
    if (policyErrors.length > 0) {
      setError(policyErrors[0])
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }

    try {
      await changePassword.mutateAsync({ currentPassword, newPassword })
      setSuccess('Contraseña actualizada correctamente')
      setShowChangePassword(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      // El backend ya la marcó como rotada: refrescamos el usuario para que
      // desaparezca el aviso de "contraseña pendiente".
      await fetchUser()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cambiar la contraseña')
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Mi perfil</h1>
        <p className="text-sm text-gray-500">Tu información personal y configuración de cuenta.</p>
      </div>

      <div className="space-y-6">
        {success && (
          <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
            {success}
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {user.mustChangePassword && (
          <Card className="border-yellow-200 bg-yellow-50 p-4">
            <p className="text-sm font-medium text-yellow-800">
              Debes cambiar tu contraseña antes de continuar.
            </p>
          </Card>
        )}

        <Card className="p-6">
          <div className="flex items-start gap-5">
            <div className="flex flex-col items-center gap-2">
              <Avatar name={user.name} size="lg" src={user.avatarUrl} />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleAvatarChange}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={uploadAvatar.isPending}
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera className="h-3.5 w-3.5" />
                Cambiar foto
              </Button>
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-gray-900">
                {name || user.name}
                {lastName ? ` ${lastName}` : ''}
              </h2>
              <div className="mt-1 flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-spi-gold/10 px-2.5 py-0.5 text-xs font-medium text-yellow-700">
                  <Shield className="h-3 w-3" />
                  {ROLE_LABELS[user.role] ?? user.role}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    user.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      user.isActive ? 'bg-green-500' : 'bg-gray-400'
                    }`}
                  />
                  {user.isActive ? 'Activo' : 'Inactivo'}
                </span>
              </div>
            </div>
          </div>

          <form onSubmit={handleSaveProfile} className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Nombre *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tu nombre"
              required
            />
            <Input
              label="Apellido"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Tu apellido"
            />
            <PrefixedNumberInput
              label="Cédula"
              prefixOptions={['V-', 'E-']}
              value={cedula}
              onChange={setCedula}
              placeholder="12345678"
              maxLength={9}
              hint="V- (venezolano) o E- (extranjero) + números."
            />
            <Input
              label="Dirección"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Dirección corta"
            />
            <Input
              label="Teléfono"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Teléfono de contacto"
            />
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Input
                  label="Email"
                  value={user.email}
                  readOnly
                  hint="El correo no se puede editar"
                />
              </div>
              <Button type="submit" loading={profileSaving}>
                Guardar cambios
              </Button>
            </div>
          </form>

          {user.createdAt && (
            <div className="mt-6 flex items-center gap-3 text-sm text-gray-600">
              <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Miembro desde</p>
                <p className="font-medium text-gray-800">{formatDate(user.createdAt)}</p>
              </div>
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">Seguridad</h3>
          <div className="space-y-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowChangePassword(!showChangePassword)
                setError('')
                setCurrentPassword('')
                setNewPassword('')
                setConfirmPassword('')
              }}
            >
              <KeyRound className="h-4 w-4" />
              {showChangePassword ? 'Cancelar cambio' : 'Cambiar contraseña'}
            </Button>

            {showChangePassword && (
              <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                <Input
                  label="Contraseña actual"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Tu contraseña de hoy"
                  autoComplete="current-password"
                  autoFocus
                  required
                />
                <Input
                  label="Nueva contraseña"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  hint={PASSWORD_HINT}
                  autoComplete="new-password"
                  required
                />
                <Input
                  label="Confirmar contraseña"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repetí la contraseña"
                  autoComplete="new-password"
                  required
                />
                <Button type="submit" loading={changePassword.isPending}>
                  Guardar nueva contraseña
                </Button>
              </form>
            )}
          </div>
        </Card>

        <TwoFactorSection />

        <div className="pt-2">
          <Button type="button" variant="danger" onClick={logout}>
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </Button>
        </div>
      </div>
    </div>
  )
}
