import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      {Icon && (
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-200 mb-4">
          <Icon className="h-7 w-7 text-gray-400 dark:text-gray-9500" />
        </div>
      )}
      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-900 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-gray-500 dark:text-gray-600 text-center max-w-sm mb-6">
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="inline-flex items-center gap-2 rounded-lg bg-spi-navy text-white px-4 py-2 text-sm font-semibold hover:bg-spi-dark transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
