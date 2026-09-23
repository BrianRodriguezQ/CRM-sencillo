import { cn } from '../../lib/utils'

interface LoadingStateProps {
  /** Texto bajo el spinner. Default: "Cargando…" */
  label?: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

/**
 * Animación de carga: círculo incompleto girando (spinner clásico).
 * La órbita exterior queda tenue y el arco giratorio marca el progreso,
 * manteniendo el rol accesible (role="status") en todas las páginas.
 *
 * El keyframe se inyecta una vez por instancia; repetirlo no rompe nada
 * (CSS idempotente) y mantiene el componente autocontenido.
 */
export function LoadingState({ label = 'Cargando…', className, size = 'md' }: LoadingStateProps) {
  const px = size === 'sm' ? 'w-16' : size === 'lg' ? 'w-40' : 'w-28'

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex flex-col items-center justify-center gap-3 py-10', className)}
    >
      <style>{`@keyframes loading-spin {
  0%   { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}`}</style>

      <svg
        viewBox="0 0 48 48"
        className={cn(px, 'text-spi-navy animate-[loading-spin_1s_linear_infinite] dark:text-spi-text')}
        fill="none"
        aria-hidden="true"
      >
        {/* Órbita completa tenue (fondo estable) */}
        <circle cx="24" cy="24" r="20" stroke="currentColor" strokeOpacity="0.2" strokeWidth="5" />
        {/* Arco incompleto que gira */}
        <circle
          cx="24"
          cy="24"
          r="20"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray="85 50"
        />
      </svg>

      <p className="text-sm font-medium text-gray-500 animate-pulse dark:text-gray-400">{label}</p>
    </div>
  )
}
