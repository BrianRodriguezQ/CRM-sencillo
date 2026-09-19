import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Modal } from './Modal'
import { Button } from './Button'

const DISMISS_PREFIX = 'spi-dismiss-'

export interface DismissConfig {
  /** Clave única para guardar en localStorage (se guarda con prefijo spi-dismiss-) */
  key: string
  /** Texto del checkbox, default: "No volver a preguntar por 18 horas" */
  label?: string
  /** Duración en ms, default: 18 horas */
  durationMs?: number
}

/** Verifica si un confirm está silenciado */
// eslint-disable-next-line react-refresh/only-export-components
export function isDismissed(dismissKey: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    const raw = localStorage.getItem(DISMISS_PREFIX + dismissKey)
    if (!raw) return false
    const { t } = JSON.parse(raw)
    const elapsed = Date.now() - t
    const limit = 18 * 60 * 60 * 1000 // 18 horas
    if (elapsed > limit) {
      localStorage.removeItem(DISMISS_PREFIX + dismissKey)
      return false
    }
    return true
  } catch {
    localStorage.removeItem(DISMISS_PREFIX + dismissKey)
    return false
  }
}

interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  variant?: 'danger' | 'warning' | 'info'
  loading?: boolean
  dismiss?: DismissConfig
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirmar',
  variant = 'danger',
  loading = false,
  dismiss,
}: ConfirmDialogProps) {
  const [dontAsk, setDontAsk] = useState(false)

  const colors = {
    danger: { bg: 'bg-red-50', icon: 'text-red-600', btn: 'bg-red-600 hover:bg-red-700' },
    warning: {
      bg: 'bg-orange-50',
      icon: 'text-orange-600',
      btn: 'bg-orange-600 hover:bg-orange-700',
    },
    info: { bg: 'bg-blue-50', icon: 'text-blue-600', btn: 'bg-spi-navy hover:bg-spi-dark' },
  }

  const c = colors[variant]

  const handleConfirm = () => {
    if (dismiss && dontAsk) {
      try {
        localStorage.setItem(DISMISS_PREFIX + dismiss.key, JSON.stringify({ t: Date.now() }))
      } catch {
        /* localStorage lleno o deshabilitado */
      }
    }
    onConfirm()
  }

  const handleClose = () => {
    setDontAsk(false)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="" className="max-w-sm" zIndex={60}>
      <div className="text-center">
        <div
          className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${c.bg} mb-4`}
        >
          <AlertTriangle className={`h-6 w-6 ${c.icon}`} />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-500 mb-4">{message}</p>

        {dismiss && (
          <label className="flex items-center justify-center gap-2 mb-4 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontAsk}
              onChange={(e) => setDontAsk(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-spi-green focus:ring-spi-green/30"
            />
            <span className="text-xs text-gray-400">
              {dismiss.label ?? 'No volver a preguntar por 18 horas'}
            </span>
          </label>
        )}

        <div className="flex gap-3 justify-center">
          <Button variant="ghost" onClick={handleClose} disabled={loading}>
            Cancelar
          </Button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors ${c.btn} disabled:opacity-50`}
          >
            {loading && (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            )}
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
