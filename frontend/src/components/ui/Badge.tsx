import { cn } from '../../lib/utils'

export interface BadgeProps {
  variant?: 'success' | 'warning' | 'error' | 'info' | 'default' | 'gold'
  size?: 'xs' | 'sm' | 'md' | 'lg'
  children: React.ReactNode
  className?: string
}

const variants: Record<string, string> = {
  success: 'bg-green-100 text-green-800',
  warning: 'bg-yellow-100 text-yellow-800',
  error: 'bg-red-100 text-red-800',
  info: 'bg-blue-100 text-blue-800',
  default: 'bg-gray-100 text-gray-700',
  gold: 'bg-amber-100 text-amber-800',
}

const sizes: Record<string, string> = {
  xs: 'text-[10px] px-1.5 py-0.5',
  sm: 'text-xs px-2 py-0.5',
  md: 'text-sm px-2.5 py-1',
  lg: 'text-base px-3 py-1.5',
}

export function Badge({ variant = 'info', size = 'sm', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {children}
    </span>
  )
}
