import { cn } from '../../lib/utils'

interface CardProps {
  className?: string
  children: React.ReactNode
  padding?: boolean
  onClick?: () => void
}

export function Card({ className, children, padding = true, onClick }: CardProps) {
  const Component = onClick ? 'button' : 'div'
  return (
    <Component
      onClick={onClick}
      className={cn(
        'rounded-xl bg-surface shadow-sm border border-spi-border/60',
        padding && 'p-6',
        className,
      )}
    >
      {children}
    </Component>
  )
}
