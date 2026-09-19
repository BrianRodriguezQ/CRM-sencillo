import { ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '../../lib/utils'
import { Loader2 } from 'lucide-react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'green'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

const variants = {
  primary: 'bg-spi-navy text-white hover:bg-spi-dark',
  secondary: 'bg-spi-gold text-white hover:bg-yellow-600',
  green:
    'bg-spi-green text-white hover:bg-green-500 shadow-lg shadow-spi-green/30 hover:shadow-spi-green/50',
  outline:
    'border-2 border-spi-text text-spi-text hover:bg-spi-text hover:text-white dark:hover:bg-spi-text dark:hover:text-spi-dark',
  ghost: 'text-spi-text hover:bg-gray-100 dark:hover:bg-white/10',
  danger: 'bg-red-600 text-white hover:bg-red-700',
}

const sizes = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3.5 py-1.5 text-sm',
  lg: 'px-5 py-2.5 text-base',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, disabled, className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-spi-gold focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed',
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    )
  },
)

Button.displayName = 'Button'
