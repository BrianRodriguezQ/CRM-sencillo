import { User } from 'lucide-react'
import { useAuthedImage } from '../../hooks/useAuthedImage'

interface AvatarProps {
  src?: string | null
  name?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizeClasses = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-16 w-16 text-lg',
  xl: 'h-24 w-24 text-2xl',
}

function getInitials(name?: string): string {
  if (!name) return '?'
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function stringToColor(str?: string): string {
  if (!str) return '#6366f1'
  const colors = [
    '#6366f1',
    '#8b5cf6',
    '#a855f7',
    '#ec4899',
    '#f43f5e',
    '#ef4444',
    '#f97316',
    '#eab308',
    '#22c55e',
    '#14b8a6',
    '#06b6d4',
    '#3b82f1',
  ]
  let hash = 0
  for (let i = 0; i < (str?.length || 0); i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

export function Avatar({ src, name, size = 'md', className = '' }: AvatarProps) {
  // Las imágenes del sistema (/uploads/...) requieren auth → se cargan vía fetch + object URL
  const resolvedSrc = useAuthedImage(src)

  if (resolvedSrc) {
    return (
      <img
        src={resolvedSrc}
        alt={name || 'Avatar'}
        className={`${sizeClasses[size]} rounded-full object-cover ${className}`}
      />
    )
  }

  return (
    <div
      className={`${sizeClasses[size]} rounded-full flex items-center justify-center font-medium text-white ${className}`}
      style={{ backgroundColor: stringToColor(name) }}
      title={name}
    >
      {getInitials(name) || <User className="h-1/2 w-1/2" />}
    </div>
  )
}
