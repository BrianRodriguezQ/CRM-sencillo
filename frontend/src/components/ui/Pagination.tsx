import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationProps {
  page: number
  perPage: number
  total: number
  onPageChange: (page: number) => void
  onPerPageChange?: (perPage: number) => void
}

function PaginationInfo({
  page,
  perPage,
  total,
}: {
  page: number
  perPage: number
  total: number
}) {
  if (total === 0) return <p className="text-sm text-gray-500">Sin resultados</p>

  const from = (page - 1) * perPage + 1
  const to = Math.min(page * perPage, total)

  return (
    <p className="text-sm text-gray-500">
      Mostrando <span className="font-medium">{from}</span>–
      <span className="font-medium">{to}</span> de <span className="font-medium">{total}</span>
    </p>
  )
}

// CTO 2026-09-18: carga perezosa 5 en 5 o 10 en 10 según el usuario — nunca
// listas enteras de opciones. Antes era [10, 25, 50, 100].
const PER_PAGE_OPTIONS = [5, 10] as const

export function Pagination({
  page,
  perPage,
  total,
  onPageChange,
  onPerPageChange,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  const isFirst = page <= 1
  const isLast = page >= totalPages

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t border-gray-100 dark:border-spi-border">
      <div className="flex items-center gap-3">
        <PaginationInfo page={page} perPage={perPage} total={total} />

        {onPerPageChange && (
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-400">Por pág:</label>
            <select
              value={perPage}
              onChange={(e) => onPerPageChange(parseInt(e.target.value))}
              className="text-xs rounded border border-gray-200 dark:border-spi-border bg-white dark:bg-surface px-1.5 py-1 text-gray-600 dark:text-gray-700 focus:outline-none focus:ring-1 focus:ring-spi-text/20"
            >
              {PER_PAGE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={isFirst}
          className="flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-700 hover:text-spi-text disabled:text-gray-300 disabled:cursor-not-allowed disabled:opacity-40 transition-colors rounded-md hover:bg-gray-50 dark:hover:bg-white/5"
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Anterior</span>
        </button>

        <span className="px-3 py-1.5 text-sm text-gray-500">
          {page} / {totalPages}
        </span>

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={isLast}
          className="flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-700 hover:text-spi-text disabled:text-gray-300 disabled:cursor-not-allowed disabled:opacity-40 transition-colors rounded-md hover:bg-gray-50 dark:hover:bg-white/5"
          aria-label="Página siguiente"
        >
          <span className="hidden sm:inline">Siguiente</span>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
