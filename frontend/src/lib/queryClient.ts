/**
 * QueryClient del CRM.
 *
 * Stale times agresivos porque:
 * - Dashboard: datos que cambian diario → 5 min stale
 * - Clientes: cambian poco → 10 min stale
 * - Órdenes: cambian con cada cambio de estado → invalidación explícita por mutación
 * - Notificaciones: cambian frecuentemente → 30s stale
 */

import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: true,
      staleTime: 1000 * 60 * 5, // 5 min default
      gcTime: 1000 * 60 * 30, // 30 min garbage collection (antes cacheTime)
    },
  },
})
