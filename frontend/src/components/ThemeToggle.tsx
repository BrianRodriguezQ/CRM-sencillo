import { Sun, Moon } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import { cn } from '../lib/utils'

interface ThemeToggleProps {
  className?: string
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, toggle } = useTheme()

  return (
    <button
      onClick={toggle}
      className={cn(
        'p-2 rounded-lg transition-colors cursor-pointer',
        className ?? 'text-gray-300 hover:text-spi-gold hover:bg-white/10',
      )}
      aria-label={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
      title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
    >
      {theme === 'light' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  )
}
