import { Outlet, useLocation } from 'react-router-dom'
import { ThemeToggle } from './ThemeToggle'

const BRAND_NAME = 'L&L System'
const BRAND_TAGLINE = 'Gestión de pedidos y entregas en Venezuela'

export function Layout() {
  const location = useLocation()

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <header className="bg-spi-navy text-white sticky top-0 z-40 shadow-lg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-2">
              <BrandMark />
              <span className="text-base font-bold tracking-tight hidden sm:block">
                {BRAND_NAME}
              </span>
            </div>
            <span className="text-xs text-gray-400 hidden md:block">{BRAND_TAGLINE}</span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main key={location.pathname} className="flex-1 relative min-h-0">
        <Outlet />
      </main>

      <footer className="bg-spi-navy text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <BrandMark />
              <span className="text-sm font-semibold">{BRAND_NAME}</span>
            </div>
            <p className="text-xs text-gray-500">
              &copy; {new Date().getFullYear()} L&L System — Delivery CRM. Todos los derechos
              reservados.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

function BrandMark() {
  return (
    <img 
      src="/logo-ll.png" 
      alt="L&L System" 
      className="h-8 w-8 rounded-lg"
    />
  )
}
