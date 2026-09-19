interface SkeletonProps {
  className?: string
  lines?: number // for text blocks
  variant?: 'table' | 'card' | 'text'
}

function Pulse({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className}`} />
}

export function Skeleton({ className, lines, variant }: SkeletonProps) {
  if (variant === 'table') {
    return (
      <div className="space-y-2 p-6">
        {/* Header */}
        <div className="flex gap-4 mb-6">
          <Pulse className="h-4 w-1/3" />
          <Pulse className="h-4 w-1/4 hidden sm:block" />
          <Pulse className="h-4 w-1/6 hidden md:block" />
          <Pulse className="h-4 w-1/6 hidden lg:block" />
          <Pulse className="h-4 w-20 ml-auto" />
        </div>
        {/* Rows */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4 py-3 border-b border-gray-50">
            <Pulse className="h-4 w-1/3" />
            <Pulse className="h-4 w-1/4 hidden sm:block" />
            <Pulse className="h-4 w-1/6 hidden md:block" />
            <Pulse className="h-4 w-1/6 hidden lg:block" />
            <div className="flex gap-2 ml-auto">
              <Pulse className="h-4 w-8" />
              <Pulse className="h-4 w-8" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (variant === 'card') {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-100 p-5 space-y-3">
            <div className="flex items-start justify-between">
              <Pulse className="h-10 w-10 rounded-lg" />
              <Pulse className="h-5 w-16 rounded-full" />
            </div>
            <Pulse className="h-5 w-3/4" />
            <Pulse className="h-3 w-1/2" />
            <Pulse className="h-3 w-1/3" />
            <div className="flex gap-3 pt-2">
              <Pulse className="h-4 w-12" />
              <Pulse className="h-4 w-16" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  // Text variant (default)
  return (
    <div className={`space-y-2 ${className || ''}`}>
      {lines ? (
        Array.from({ length: lines }).map((_, i) => (
          <Pulse key={i} className={`h-4 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
        ))
      ) : (
        <>
          <Pulse className="h-4 w-full" />
          <Pulse className="h-4 w-5/6" />
          <Pulse className="h-4 w-2/3" />
        </>
      )}
    </div>
  )
}
