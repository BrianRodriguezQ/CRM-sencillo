import { useState, useEffect, useRef } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { LogOut, Menu, X, PanelLeft, UserRound, ChevronDown, ShieldAlert } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { cn } from '../lib/utils'
import { ADMIN_NAV_SECTIONS } from '../lib/adminNav'
import { canAccessRoute } from '../lib/routeAccess'
import { ThemeToggle } from './ThemeToggle'
import { Avatar } from './ui/Avatar'
import { Button } from './ui/Button'
import { NotificationBell } from './ui/NotificationBell'
import { LiveClock } from './ui/LiveClock'
import { useSSE } from '../hooks/useSSE'

export function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('spi-admin-sidebar-collapsed') === '1'
    } catch {
      return false
    }
  })
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  // Realtime (WP1): una conexión SSE por sesión autenticada, vive mientras
  // el layout del panel esté montado (deslogueo la mata sola).
  useSSE(Boolean(user))

  useEffect(() => {
    try {
      localStorage.setItem('spi-admin-sidebar-collapsed', sidebarCollapsed ? '1' : '0')
    } catch {
      // storage no disponible (jsdom/privado) — no bloquear el layout
    }
  }, [sidebarCollapsed])

  const role = user?.role
  // El menú deriva del mismo mapa que el guard de abajo → no pueden divergir.
  const navSections = ADMIN_NAV_SECTIONS.map((section) => ({
    ...section,
    links: section.links.filter((l) => canAccessRoute(role, l.href)),
  })).filter((section) => section.links.length > 0)

  const canOpenCurrentRoute = canAccessRoute(role, location.pathname)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const isActive = (href: string) => {
    if (href === '/admin') return location.pathname === '/admin'
    return location.pathname.startsWith(href)
  }

  const isSectionActive = (links: { href: string }[]) => links.some((l) => isActive(l.href))

  const toggleSection = (title: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(title)) next.delete(title)
      else next.add(title)
      return next
    })
  }

  const renderSidebar = (opts?: { closeOnNavigate?: () => void; collapsed?: boolean }) => {
    const collapsed = opts?.collapsed ?? false
    const closeOnNavigate = opts?.closeOnNavigate

    return (
      <aside className="flex flex-1 flex-col bg-spi-navy min-w-0">
        <nav
          className={cn(
            'flex-1 overflow-y-auto transition-all',
            collapsed ? 'space-y-1 px-2 py-4' : 'space-y-2 px-3 py-4',
          )}
        >
          {collapsed ? (
            <div className="space-y-1">
              {navSections.flatMap((section) =>
                section.links.map((link) => (
                  <Link
                    key={link.href}
                    to={link.href}
                    onClick={closeOnNavigate}
                    title={link.label}
                    aria-label={link.label}
                    className={cn(
                      'flex items-center justify-center rounded-lg transition-colors',
                      'p-2.5',
                      isActive(link.href)
                        ? 'bg-spi-gold/20 text-spi-gold'
                        : 'text-white hover:bg-white/10 hover:text-white',
                    )}
                  >
                    <link.icon className="h-5 w-5 shrink-0" />
                  </Link>
                )),
              )}
            </div>
          ) : (
            navSections.map((section) => {
              const expanded = !collapsedSections.has(section.title)
              const anyActive = isSectionActive(section.links)

              return (
                <div key={section.title}>
                  <button
                    onClick={() => toggleSection(section.title)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors',
                      anyActive ? 'text-spi-gold' : 'text-white/60 hover:text-white',
                    )}
                  >
                    <section.icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-left">{section.title}</span>
                    <ChevronDown
                      className={cn(
                        'h-3.5 w-3.5 transition-transform duration-200',
                        expanded ? 'rotate-0' : '-rotate-90',
                      )}
                    />
                  </button>
                  {expanded && (
                    <div className="mt-1 space-y-0.5 pl-2">
                      {section.links.map((link) => (
                        <Link
                          key={link.href}
                          to={link.href}
                          onClick={closeOnNavigate}
                          className={cn(
                            'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                            isActive(link.href)
                              ? 'bg-spi-gold/20 text-spi-gold'
                              : 'text-white hover:bg-white/10 hover:text-white',
                          )}
                        >
                          <link.icon className="h-4 w-4 shrink-0" />
                          {link.label}
                          {typeof link.badge === 'number' && link.badge > 0 && (
                            <span className="ml-auto rounded-full bg-spi-gold px-2 py-0.5 text-[11px] font-bold leading-none text-spi-navy">
                              {link.badge}
                            </span>
                          )}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </nav>

        <div className="border-t border-white/10 p-3 shrink-0">
          <button
            onClick={handleLogout}
            title={collapsed ? 'Cerrar sesión' : undefined}
            aria-label={collapsed ? 'Cerrar sesión' : undefined}
            className={cn(
              'flex w-full items-center rounded-lg text-sm font-medium transition-colors',
              'text-white hover:bg-white/10 hover:text-white',
              collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
            )}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            {!collapsed && 'Cerrar sesión'}
          </button>
        </div>
      </aside>
    )
  }

  return (
    <div className="h-screen overflow-hidden bg-gray-50 dark:bg-surface">
      <div
        className={`lg:hidden fixed inset-0 z-40 transition-opacity duration-200 ${sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      >
        <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
        <div className="relative flex w-64 flex-col bg-spi-navy h-full">
          <div className="flex items-center justify-between px-4 h-16 border-b border-white/10 shrink-0">
            <Link
              to="/admin"
              onClick={() => setSidebarOpen(false)}
              className="flex items-center gap-2"
            >
              <img 
                src="/logo-ll.png" 
                alt="L&L System" 
                className="h-8 w-8 rounded" 
              />
              <span className="font-bold text-white">L&L System</span>
            </Link>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-2 text-white/60 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {renderSidebar({ closeOnNavigate: () => setSidebarOpen(false) })}
        </div>
      </div>

      <div
        className={cn(
          'hidden lg:fixed lg:inset-y-0 lg:flex lg:flex-col transition-[width] duration-200',
          sidebarCollapsed ? 'lg:w-16' : 'lg:w-64',
        )}
      >
        {renderSidebar({
          collapsed: sidebarCollapsed,
          closeOnNavigate: () => setSidebarCollapsed(true),
        })}
      </div>

      <div
        className={cn(
          'flex flex-col h-full transition-[padding] duration-200',
          sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64',
        )}
      >
        <header className="shrink-0 flex h-16 items-center gap-2 sm:gap-4 border-b border-spi-border bg-surface px-4 sm:px-6 shadow-sm">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2.5 -ml-2.5 text-gray-500 dark:text-gray-600 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link to="/admin" className="hidden lg:flex items-center gap-2 shrink-0">
            <img 
              src="/logo-ll.png" 
              alt="L&L System" 
              className="h-8 w-8 rounded" 
            />
            <span className="font-bold text-sm sm:text-base text-spi-text dark:text-white truncate">
              L&L System
            </span>
          </Link>
          <button
            onClick={() => setSidebarCollapsed((v) => !v)}
            className="hidden lg:inline-flex p-2 -ml-1 rounded-lg text-gray-500 dark:text-gray-200 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-spi-border/60 transition-colors"
            title={sidebarCollapsed ? 'Expandir menú' : 'Colapsar menú'}
            aria-label={sidebarCollapsed ? 'Expandir menú' : 'Colapsar menú'}
          >
            <PanelLeft
              className={cn(
                'h-5 w-5 transition-transform duration-200',
                sidebarCollapsed && '-scale-x-100',
              )}
            />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-1 sm:gap-2">
            <LiveClock />
            <NotificationBell />
            <ThemeToggle className="text-gray-400 hover:text-spi-text hover:bg-gray-100 dark:hover:bg-white/5" />
            <UserMenu />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto overflow-x-auto min-w-0 p-4 sm:p-6 lg:p-8">
          {/* Guard por rol: el menú oculta los links, esto bloquea la URL directa. */}
          {canOpenCurrentRoute ? <Outlet /> : <NoAccess />}
        </main>
      </div>
    </div>
  )
}

/** Pantalla para rutas del panel cuyo rol no tiene acceso (URL tecleada a mano). */
function NoAccess() {
  const navigate = useNavigate()

  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/30">
        <ShieldAlert className="h-6 w-6 text-red-500" />
      </div>
      <h2 className="text-lg font-semibold text-spi-text dark:text-white">
        No tenés acceso a esta sección
      </h2>
      <p className="mt-1 text-sm text-gray-500">Tu rol no tiene permisos para ver esta pantalla.</p>
      <Button className="mt-5" onClick={() => navigate('/admin')}>
        Volver al panel
      </Button>
    </div>
  )
}

function UserMenu() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const handleLogout = () => {
    setOpen(false)
    logout()
    navigate('/login')
  }

  const goProfile = () => {
    setOpen(false)
    navigate('/admin/perfil')
  }

  const roleLabel =
    user?.role === 'superadmin'
      ? 'Superadmin'
      : user?.role === 'operador'
        ? 'operador'
        : user?.role === 'cobranza'
          ? 'Cobranza'
          : 'Conductor'

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full p-1 pr-2 hover:bg-gray-100 dark:hover:bg-spi-border/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-label="Menú de usuario"
        aria-expanded={open}
      >
        <Avatar src={user?.avatarUrl} name={user?.name} size="sm" />
        <span className="hidden sm:block text-sm font-medium text-gray-700 dark:text-gray-700">
          {user?.name}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-gray-500 dark:text-gray-600 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-spi-border bg-surface shadow-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-spi-border">
            <p className="text-sm font-semibold text-spi-text truncate">{user?.name}</p>
            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            <p className="text-xs text-gray-400 mt-0.5 capitalize">{roleLabel}</p>
          </div>
          <button
            type="button"
            onClick={goProfile}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-spi-text hover:bg-gray-100 dark:hover:bg-spi-border/40 transition-colors"
          >
            <UserRound className="h-4 w-4 text-gray-500" />
            Mi perfil y seguridad
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors border-t border-spi-border"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  )
}
