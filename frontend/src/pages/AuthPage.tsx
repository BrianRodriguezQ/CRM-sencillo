import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, ShieldCheck, AlertCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { ThemeToggle } from '../components/ThemeToggle'

const BRAND_NAME = 'L&L System'

export function AuthPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white dark:from-night dark:to-spi-dark flex flex-col">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-sm animate-fade-up">
          {/* Marca + bienvenida */}
          <div className="flex flex-col items-center text-center">
            <BrandMark />
            <h1 className="mt-4 text-xl font-bold text-spi-text tracking-tight">
              Bienvenido de vuelta
            </h1>
            <p className="mt-1 text-sm text-spi-gray">
              Ingresá para administrar tus pedidos y entregas.
            </p>
          </div>

          {/* Formulario */}
          <div className="mt-6 rounded-xl border border-spi-border bg-white/90 dark:bg-gray-900/80 shadow-lg shadow-gray-200/60 dark:shadow-black/30 p-5 sm:p-6 backdrop-blur-sm">
            <LoginForm />
          </div>

          <p className="mt-4 text-center text-[10px] text-gray-400">
            &copy; {new Date().getFullYear()} {BRAND_NAME} — Delivery CRM
          </p>
        </div>
      </div>
    </div>
  )
}

/* ─── Logo ─── */

function BrandMark() {
  return (
    <img 
      src="/logo-ll.png" 
      alt="L&L System" 
      className="h-14 w-14 drop-shadow-lg"
    />
  )
}

/* ─── Login Form ─── */

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [totpCode, setTotpCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const { login, verify2FA, completePasswordChange, challengeKind } = useAuth()

  const twoFactorStep = challengeKind === '2fa'
  const passwordChangeStep = challengeKind === 'password-change'

  const navigate = useNavigate()

  const goBackToLogin = () => {
    navigate(0)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email || !password) {
      setError('Todos los campos son requeridos')
      return
    }
    setLoading(true)
    try {
      const user = await login(email, password)
      if (!user) return
      navigate('/admin')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (totpCode.trim().length < 6) {
      setError('Ingresá el código de 6 dígitos o un código de recuperación')
      return
    }
    setLoading(true)
    try {
      const user = await verify2FA(totpCode.trim())
      if (!user) {
        setTotpCode('')
        return
      }
      navigate('/admin')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código incorrecto')
      setTotpCode('')
    } finally {
      setLoading(false)
    }
  }

  const handleCompletePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!newPassword || !confirmPassword) {
      setError('Completá ambas contraseñas')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }
    setLoading(true)
    try {
      await completePasswordChange(newPassword)
      navigate('/admin')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar la contraseña')
      setNewPassword('')
      setConfirmPassword('')
    } finally {
      setLoading(false)
    }
  }

  if (passwordChangeStep) {
    return (
      <form onSubmit={handleCompletePasswordChange} className="space-y-3">
        <InfoBanner>
          Tu contraseña actual es temporal y de un solo uso. Definí una nueva para entrar.
        </InfoBanner>

        {error && <ErrorBanner>{error}</ErrorBanner>}

        <Input
          label="Nueva contraseña"
          type="password"
          icon={Lock}
          placeholder="••••••••"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          autoFocus
        />

        <Input
          label="Confirmar nueva contraseña"
          type="password"
          icon={Lock}
          placeholder="••••••••"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
        />

        <Button type="submit" loading={loading} className="w-full">
          Guardar contraseña y entrar
        </Button>

        <button
          type="button"
          onClick={goBackToLogin}
          className="text-sm text-gray-500 hover:text-spi-text transition-colors w-full text-center cursor-pointer"
        >
          Volver a iniciar sesión
        </button>
      </form>
    )
  }

  if (twoFactorStep) {
    return (
      <form onSubmit={handleVerify2FA} className="space-y-3">
        <InfoBanner>
          Ingresá el código de 6 dígitos de tu app de autenticación, o un código de recuperación si
          no tenés acceso al dispositivo.
        </InfoBanner>

        {error && <ErrorBanner>{error}</ErrorBanner>}

        <Input
          label="Código de verificación"
          type="text"
          icon={ShieldCheck}
          placeholder="123456 ó XXXX-XXXX"
          value={totpCode}
          onChange={(e) => setTotpCode(e.target.value)}
          autoComplete="one-time-code"
          autoFocus
        />

        <Button type="submit" loading={loading} className="w-full">
          Verificar código
        </Button>

        <button
          type="button"
          onClick={goBackToLogin}
          className="text-sm text-gray-500 hover:text-spi-text transition-colors w-full text-center cursor-pointer"
        >
          Volver a iniciar sesión
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <Input
        label="Correo electrónico"
        type="email"
        icon={Mail}
        placeholder="correo@ejemplo.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
      />

      <div className="relative">
        <Input
          label="Contraseña"
          type={showPassword ? 'text' : 'password'}
          icon={Lock}
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 top-[38px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          tabIndex={-1}
          aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        >
          {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>

      <Button type="submit" loading={loading} className="w-full" size="lg">
        Iniciar sesión
      </Button>
    </form>
  )
}

function InfoBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 p-3 text-sm text-blue-700 dark:text-blue-300">
      <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  )
}

function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 p-3 text-sm text-red-600 dark:text-red-400 animate-scale-in">
      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  )
}
