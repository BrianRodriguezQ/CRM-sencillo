import { useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full' | '6xl'
  className?: string
  zIndex?: number // default: 50
}

const maxWidths: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-3xl',
  '6xl': 'max-w-6xl',
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'lg',
  className,
  zIndex = 50,
}: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex }}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          'relative w-full rounded-xl bg-surface shadow-xl max-h-[90vh] overflow-auto scrollbar-thin',
          maxWidths[size],
          className,
        )}
      >
        {title && (
          <div className="flex items-center justify-between border-b px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-spi-text">{title}</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="px-6 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-3 border-t px-6 py-4">{footer}</div>}
      </div>
    </div>
  )
}
