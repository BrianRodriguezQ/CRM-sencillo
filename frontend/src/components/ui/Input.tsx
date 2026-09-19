import { InputHTMLAttributes, forwardRef, useId } from 'react'
import { cn } from '../../lib/utils'
import { LucideIcon } from 'lucide-react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  icon?: LucideIcon
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, icon: Icon, className, id, ...props }, ref) => {
    // El label tiene que estar atado al input: si no, clickearlo no enfoca el
    // campo y los lectores de pantalla no lo anuncian.
    const generatedId = useId()
    const inputId = id ?? generatedId

    return (
      <div className="space-y-1">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-gray-700 dark:text-gray-700"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {Icon && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Icon className="h-4 w-4 text-gray-400" />
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            className={cn(
              'w-full rounded-lg border border-spi-border bg-surface px-3 py-2 text-spi-text placeholder-gray-400 text-sm transition-colors focus:border-spi-text focus:outline-none focus:ring-2 focus:ring-spi-text/20',
              Icon && 'pl-8',
              error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20',
              className,
            )}
            {...props}
          />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        {!error && hint && <p className="text-xs text-gray-400">{hint}</p>}
      </div>
    )
  },
)

Input.displayName = 'Input'
