import type { ComponentType } from 'react'
import {
  LayoutDashboard,
  Package,
  Users,
  Truck,
  Shield,
  CreditCard,
  FileText,
  Settings,
  Store,
} from 'lucide-react'

export type NavLink = {
  label: string
  href: string
  icon: ComponentType<{ className?: string }>
  badge?: number
}

export type NavSection = {
  title: string
  icon: ComponentType<{ className?: string }>
  links: NavLink[]
}

/**
 * Estructura del menú del panel.
 *
 * El acceso por rol NO se declara acá: vive en `lib/routeAccess.ts`, que es la
 * misma fuente que usa el guard del layout. Si se declararan en este archivo,
 * el menú y el guard podrían divergir y un rol abriría pantallas que no le
 * corresponden.
 *
 * INVARIANTE (hay un test): todo `href` de acá debe estar declarado en
 * `ROUTE_ROLES`. Si no lo está, la ruta queda abierta a TODOS los roles.
 *
 * Vive fuera de `AdminLayout.tsx` para no romper el Fast Refresh: un módulo
 * que exporta un componente no debería exportar también constantes.
 */
export const ADMIN_NAV_SECTIONS: NavSection[] = [
  {
    title: 'Núcleo',
    icon: LayoutDashboard,
    links: [
      { label: 'Panel', href: '/admin', icon: LayoutDashboard },
      { label: 'Órdenes', href: '/admin/ordenes', icon: Package },
    ],
  },
  {
    title: 'Gestión',
    icon: Settings,
    links: [
      { label: 'Clientes', href: '/admin/clientes', icon: Users },
      { label: 'Métodos de Pago', href: '/admin/metodos-pago', icon: CreditCard },
    ],
  },
  {
    title: 'Equipo',
    icon: Shield,
    links: [
      { label: 'Usuarios', href: '/admin/equipo', icon: Shield },
      { label: 'Conductores', href: '/admin/equipo/conductores', icon: Truck },
      { label: 'operadores', href: '/admin/equipo/operadores', icon: Store },
    ],
  },
  {
    title: 'Reportes',
    icon: FileText,
    links: [{ label: 'Notas de entrega', href: '/admin/notas-entrega', icon: FileText }],
  },
]
