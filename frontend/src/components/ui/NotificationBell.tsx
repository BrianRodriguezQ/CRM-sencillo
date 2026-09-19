import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell,
  Package,
  Truck,
  MessageSquare,
  ClipboardList,
  BellRing,
  ChevronRight,
  X,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { timeAgo } from '../../lib/dates'
import {
  useNotificationsList,
  useUnreadCount,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  type Notification,
} from '../../hooks/queries/useNotifications'

interface NotificationBellProps {
  permission?: NotificationPermission | null
  onRequestPermission?: () => void
}

const TYPE_META: Record<string, { icon: typeof Bell; color: string }> = {
  order_assigned: { icon: Truck, color: 'text-sky-600 dark:text-sky-400' },
  order_status: { icon: ClipboardList, color: 'text-spi-green' },
  order_message: { icon: MessageSquare, color: 'text-spi-gold' },
  order_created: { icon: Package, color: 'text-sky-600 dark:text-sky-400' },
  system: { icon: Bell, color: 'text-gray-400' },
}

const DEFAULT_META = { icon: Bell, color: 'text-gray-400' }

export function NotificationBell({ permission, onRequestPermission }: NotificationBellProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  // Badge: query liviana, siempre activa (incluso sin foco).
  const { data: unreadCount } = useUnreadCount()
  // Lista: solo cuando el panel está abierto.
  const { data: notifPage } = useNotificationsList({ page: 1, limit: 8 }, { enabled: open })

  const { mutate: markOneRead } = useMarkNotificationRead()
  const { mutate: markAllRead } = useMarkAllNotificationsRead()

  const unread = unreadCount ?? 0
  const items = notifPage?.items ?? []
  const hasUnread = items.some((n) => !n.isRead)

  const canRequest =
    permission === 'default' ||
    (permission == null && 'Notification' in window && Notification.permission === 'default')

  const requestPermission = useCallback(() => {
    if (onRequestPermission) {
      onRequestPermission()
      return
    }
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [onRequestPermission])

  const closePanel = useCallback(() => {
    setOpen(false)
  }, [])

  /**
   * Abrir un aviso: lo marca leído y te lleva a la orden que lo generó
   * (`data.orderId`, que el backend adjunta en cada notifyUser).
   * Si el aviso no apunta a una orden, solo se marca leído.
   */
  const openNotification = useCallback(
    (n: Notification) => {
      if (!n.isRead) markOneRead(n.id)
      closePanel()
      const orderId = n.data?.orderId
      if (orderId) navigate(`/admin/ordenes/${orderId}`)
    },
    [markOneRead, closePanel, navigate],
  )

  // Aviso de escritorio cuando ENTRA algo nuevo (no en la primera carga).
  // Requiere que el usuario haya aceptado el permiso desde "Activar notificaciones".
  const prevUnread = useRef<number | null>(null)
  useEffect(() => {
    if (prevUnread.current === null) {
      prevUnread.current = unread
      return
    }
    const isNew = unread > prevUnread.current
    prevUnread.current = unread
    if (!isNew) return
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return

    const popup = new Notification('Tenés avisos nuevos', {
      body: `${unread} sin leer en L&L System`,
      tag: 'll-system-notifications', // colapsa varios avisos en una sola ventana
    })
    popup.onclick = () => {
      window.focus()
      setOpen(true)
    }
  }, [unread])

  // Click afuera / Escape cierra el panel (sin marcar nada: lo leído se decide
  // aviso por aviso, o con el botón explícito "Marcar todas como leídas").
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closePanel()
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePanel()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, closePanel])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => (open ? closePanel() : setOpen(true))}
        className={cn(
          'relative inline-flex items-center justify-center rounded-lg p-2 transition-colors',
          open ? 'bg-gray-100 dark:bg-white/10' : 'hover:bg-gray-100 dark:hover:bg-white/10',
        )}
        title={unread > 0 ? `${unread} notificaciones sin leer` : 'Notificaciones'}
        aria-label={open ? 'Cerrar notificaciones' : 'Abrir notificaciones'}
      >
        <Bell className={cn('h-5 w-5', unread > 0 ? 'text-orange-500' : 'text-gray-400')} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-tight text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" aria-hidden="true" onClick={closePanel} />
          <div
            role="dialog"
            aria-label="Notificaciones"
            className="absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-spi-border bg-surface shadow-xl dark:bg-surface"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-spi-border px-4 py-3">
              <div className="flex items-center gap-2">
                <BellRing className="h-4 w-4 text-spi-gold" />
                <h3 className="text-sm font-semibold text-gray-900">Notificaciones</h3>
                {unread > 0 && (
                  <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </div>
              <button
                onClick={closePanel}
                className="p-1 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Lista */}
            <div className="max-h-80 overflow-y-auto">
              {items.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-gray-500">
                  No tenés notificaciones todavía.
                </div>
              ) : (
                <ul className="divide-y divide-spi-border">
                  {items.map((n) => {
                    const meta = TYPE_META[n.type] ?? DEFAULT_META
                    const Icon = meta.icon
                    return (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => openNotification(n)}
                          className={cn(
                            'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
                            'hover:bg-gray-50 dark:hover:bg-white/5',
                            !n.isRead ? 'bg-spi-gold/5' : 'opacity-75',
                          )}
                        >
                          <span
                            className={cn(
                              'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-white/10',
                              meta.color,
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span className="truncate text-xs font-semibold text-gray-900">
                                {n.title}
                              </span>
                              <time className="shrink-0 text-[10px] text-gray-400">
                                {timeAgo(n.createdAt)}
                              </time>
                            </span>
                            <span className="mt-0.5 block line-clamp-2 text-xs leading-relaxed text-gray-600">
                              {n.message}
                            </span>
                          </span>
                          {!n.isRead ? (
                            <span
                              className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500"
                              aria-label="No leída"
                            />
                          ) : (
                            n.data?.orderId && (
                              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-gray-300" />
                            )
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-2 border-t border-spi-border px-4 py-2.5">
              {hasUnread ? (
                <button
                  onClick={() => markAllRead()}
                  className="text-xs font-medium text-spi-green hover:text-green-700 dark:hover:text-green-400 transition-colors"
                >
                  Marcar todas como leídas
                </button>
              ) : (
                <span className="text-xs text-gray-400">
                  {items.length > 0 ? 'Todo leído' : ''}
                </span>
              )}
              {canRequest && (
                <button
                  onClick={requestPermission}
                  className="text-xs font-medium text-spi-green hover:text-green-700 dark:hover:text-green-400 transition-colors"
                >
                  Activar notificaciones
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
