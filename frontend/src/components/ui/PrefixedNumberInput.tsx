import { useId } from 'react'
import { cn } from '../../lib/utils'

interface PrefixedNumberInputProps {
  label?: string
  /**
   * Prefijo visible antes de los números. Para RIF fijo: "J-".
   * Para cédula con selector: pasar A LA VEZ prefixOptions=["V-", "E-"].
   */
  prefix?: string
  /** Alternativas de prefijo: si se pasa, se muestra un selector (V-/E-). */
  prefixOptions?: string[]
  /** Valor COMPLETO ("J-12345678" / "V-12345678" / ""). El form nunca ve el prefijo suelto. */
  value: string
  onChange: (full: string) => void
  placeholder?: string
  maxLength?: number
  error?: string
  hint?: string
  disabled?: boolean
}

/**
 * Campos de documento venezolano con prefijo + números: RIF (J- fijo) y
 * cédula (V- o E- a elección). El form trabaja con el valor completo.
 */
export function PrefixedNumberInput({
  label,
  prefix = 'J-',
  prefixOptions,
  value,
  onChange,
  placeholder = '12345678',
  maxLength = 9,
  error,
  hint,
  disabled,
}: PrefixedNumberInputProps) {
  const generatedId = useId()
  const inputId = `prefixed-${generatedId}`

  const options = prefixOptions && prefixOptions.length > 0 ? prefixOptions : [prefix]
  const activeOption = options.find((opt) => value.startsWith(opt)) ?? options[0]

  // Los dígitos son todo lo que sigue al prefijo activo (o al que matchee).
  const digits =
    [...options].sort((a, b) => b.length - a.length).find((opt) => value.startsWith(opt)) === undefined
      ? ''
      : value.slice(
          [...options].sort((a, b) => b.length - a.length).find((opt) => value.startsWith(opt))!.length,
        )

  const handleDigits = (raw: string) => {
    const onlyDigits = raw.replace(/\D/g, '').slice(0, maxLength)
    onChange(`${activeOption}${onlyDigits}`)
  }

  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <div className="flex">
        {prefixOptions && prefixOptions.length > 0 ? (
          <div className="shrink-0">
            <select
              aria-label={`Prefijo de ${label ?? 'documento'}`}
              value={activeOption}
              disabled={disabled}
              onChange={(e) => onChange(`${e.target.value}${digits}`)}
              className={cn(
                'h-full rounded-l-lg border border-r-0 border-spi-border bg-gray-100 dark:bg-white/10 px-2 py-2 text-sm font-semibold text-gray-700 outline-none cursor-pointer transition-colors focus:border-spi-text',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              {options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <span className="inline-flex shrink-0 items-center rounded-l-lg border border-r-0 border-spi-border bg-gray-100 dark:bg-white/10 px-3 py-2 text-sm font-semibold text-gray-600">
            {prefix}
          </span>
        )}
        <input
          id={inputId}
          type="text"
          inputMode="numeric"
          value={digits}
          onChange={(e) => handleDigits(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            'w-full rounded-r-lg border border-spi-border bg-surface px-3 py-2 text-sm text-spi-text placeholder-gray-400 transition-colors focus:border-spi-text focus:outline-none focus:ring-2 focus:ring-spi-text/20',
            error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20',
          )}
        />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {!error && hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  )
}
