import { useState } from 'react'
import QRCode from 'qrcode'
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Copy,
  CheckCircle2,
  Download,
} from 'lucide-react'
import {
  useTwoFactorStatus,
  useStartTwoFactorSetup,
  useEnableTwoFactor,
  useDisableTwoFactor,
} from '../hooks/queries/useTwoFactor'
import { Card } from './ui/Card'
import { Input } from './ui/Input'
import { Button } from './ui/Button'
import { Badge } from './ui/Badge'

type Step = 'idle' | 'scanning' | 'recovery-shown'

/**
 * D1 — Sección de seguridad 2FA (TOTP) para la página de perfil.
 * Flujo: setup (QR) → confirmar con un código → mostrar los códigos de
 * recuperación UNA sola vez → desactivar pidiendo la contraseña.
 */
export function TwoFactorSection() {
  const status = useTwoFactorStatus()
  const startSetup = useStartTwoFactorSetup()
  const enableTwoFactor = useEnableTwoFactor()
  const disableTwoFactor = useDisableTwoFactor()

  const [step, setStep] = useState<Step>('idle')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [manualSecret, setManualSecret] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [codesCopied, setCodesCopied] = useState(false)

  const enabled = status.data === true
  const busy = startSetup.isPending || enableTwoFactor.isPending || disableTwoFactor.isPending

  const resetSetup = () => {
    setStep('idle')
    setQrDataUrl('')
    setManualSecret('')
    setCode('')
    setPassword('')
    setRecoveryCodes([])
    setError('')
  }

  const handleStartSetup = async () => {
    setError('')
    try {
      const data = await startSetup.mutateAsync()
      setQrDataUrl(await QRCode.toDataURL(data.otpauthUrl))
      setManualSecret(data.secret)
      setStep('scanning')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar la configuración')
    }
  }

  const handleEnable = async () => {
    setError('')
    if (code.trim().length < 6) {
      setError('Ingresá el código de 6 dígitos de tu app')
      return
    }
    try {
      setRecoveryCodes(await enableTwoFactor.mutateAsync(code.trim()))
      setStep('recovery-shown')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código incorrecto')
    }
  }

  const handleDisable = async () => {
    setError('')
    if (!password) {
      setError('Ingresá tu contraseña para confirmar')
      return
    }
    try {
      await disableTwoFactor.mutateAsync(password)
      resetSetup()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al desactivar el 2FA')
    }
  }

  const copySecret = async () => {
    await navigator.clipboard.writeText(manualSecret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const copyRecoveryCodes = async () => {
    await navigator.clipboard.writeText(recoveryCodes.join('\n'))
    setCodesCopied(true)
    setTimeout(() => setCodesCopied(false), 2000)
  }

  const downloadRecoveryCodes = () => {
    const content = [
      '=== CRM Batista — Códigos de recuperación 2FA ===',
      '',
      'Guardá este archivo en un lugar seguro.',
      'Cada código se usa UNA sola vez, si perdés tu dispositivo.',
      '',
      ...recoveryCodes.map((rc, i) => `  ${i + 1}. ${rc}`),
      '',
      `Generado: ${new Date().toLocaleString('es-AR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })}`,
    ].join('\n')

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `crm-batista-2fa-recovery-codes-${new Date().toISOString().slice(0, 10)}.txt`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card>
      <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
        <Shield className="h-5 w-5 text-gray-400" />
        Verificación en dos pasos (2FA)
        {status.data !== undefined && (
          <Badge variant={enabled ? 'success' : 'default'}>
            {enabled ? 'Activado' : 'Desactivado'}
          </Badge>
        )}
      </h3>

      {status.isLoading && <Loader2 className="h-5 w-5 animate-spin text-gray-400" />}

      {status.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          No se pudo consultar el estado del 2FA. Recargá la página.
        </div>
      )}

      {status.data !== undefined && error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Sin configurar */}
      {step === 'idle' && status.data !== undefined && !enabled && !status.isError && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Agregá una capa extra de seguridad a tu cuenta. Al activarla, el login va a pedir un
            código de tu app de autenticación (Google Authenticator, Authy, etc.).
          </p>
          <Button type="button" onClick={handleStartSetup} loading={busy} variant="secondary">
            <ShieldCheck className="h-4 w-4" />
            Activar 2FA
          </Button>
        </div>
      )}

      {/* Paso 1: escanear el QR y confirmar */}
      {step === 'scanning' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">1. Escaneá este código QR con tu app.</p>
          {qrDataUrl && (
            <div className="w-fit rounded-lg border border-gray-200 bg-white p-3">
              <img src={qrDataUrl} alt="Código QR para configurar 2FA" width={180} height={180} />
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="font-mono break-all">{manualSecret}</span>
            <button
              type="button"
              onClick={copySecret}
              className="flex shrink-0 items-center gap-1 hover:text-spi-text"
            >
              {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <p className="text-xs text-gray-400">
            ¿No podés escanear? Cargá el código de arriba a mano en la app.
          </p>
          <div className="max-w-xs">
            <Input
              label="2. Código de 6 dígitos de la app"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              autoComplete="one-time-code"
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={handleEnable} loading={busy}>
              Confirmar y activar
            </Button>
            <Button type="button" variant="ghost" onClick={resetSetup}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Paso 2: códigos de recuperación — única vez que se muestran */}
      {step === 'recovery-shown' && (
        <div className="space-y-3">
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
            <div className="mb-1 flex items-center gap-2 font-medium">
              <ShieldAlert className="h-4 w-4" />
              Guardá estos códigos AHORA
            </div>
            Si perdés tu dispositivo, cada código te da acceso una sola vez. No los vas a ver nunca
            más.
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {recoveryCodes.map((rc) => (
              <code
                key={rc}
                className="select-all rounded bg-gray-100 px-2 py-1.5 text-center font-mono text-sm"
              >
                {rc}
              </code>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={copyRecoveryCodes}>
              {codesCopied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {codesCopied ? 'Códigos copiados' : 'Copiar códigos'}
            </Button>
            <Button type="button" variant="secondary" onClick={downloadRecoveryCodes}>
              <Download className="h-4 w-4" />
              Descargar códigos (.txt)
            </Button>
            <Button type="button" variant="ghost" onClick={resetSetup}>
              Ya los guardé
            </Button>
          </div>
        </div>
      )}

      {/* Activado */}
      {step === 'idle' && enabled && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Tu cuenta está protegida con 2FA. Para desactivarlo, ingresá tu contraseña.
          </p>
          <div className="max-w-xs">
            <Input
              label="Contraseña"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={handleDisable}
            loading={busy}
            className="text-red-600 hover:text-red-700"
          >
            Desactivar 2FA
          </Button>
        </div>
      )}
    </Card>
  )
}
