/**
 * Tests — NotificationBell
 *
 * Lógica del CRM: la campana avisa al conductor que tiene una orden asignada,
 * al vendedor que la orden cambió de estado, y a ambos cuando hay un mensaje.
 *
 * Comportamiento:
 *  - El badge sale del contador liviano (`/notifications/unread-count`).
 *  - La lista se pide solo al abrir el panel.
 *  - Cada aviso es clicable: marca ESE aviso como leído y navega a la orden
 *    (`/admin/ordenes/:id`) usando el `data.orderId` que adjunta el backend.
 *  - Cerrar el panel NO marca nada: lo leído se decide aviso por aviso, o con
 *    el botón explícito "Marcar todas como leídas".
 *  - Si entra un aviso nuevo y hay permiso del navegador, se dispara la
 *    notificación de escritorio.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NotificationBell } from '../NotificationBell'

const markAllReadMutate = vi.hoisted(() => vi.fn())
const markOneReadMutate = vi.hoisted(() => vi.fn())
const useNotificationsListMock = vi.hoisted(() => vi.fn())
const useUnreadCountMock = vi.hoisted(() => vi.fn())
const navigateMock = vi.hoisted(() => vi.fn())

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}))

// Avisos reales del sistema (los que genera notifyUser en backend/routes/orders.ts)
const orderAssigned = {
  id: 1,
  userId: 1,
  type: 'order_assigned',
  title: 'Nueva orden ORD-20260101-001',
  message: 'Se te asignó la orden ORD-20260101-001 por 1500.00.',
  isRead: false,
  createdAt: new Date(Date.now() - 5 * 60000).toISOString(),
  data: { orderId: 67, orderNumber: 'ORD-20260101-001' },
}

const orderStatus = {
  id: 2,
  userId: 1,
  type: 'order_status',
  title: 'Orden ORD-20251231-004 — delivered',
  message: 'La orden ORD-20251231-004 cambió a estado "delivered".',
  isRead: true,
  createdAt: new Date(Date.now() - 3 * 3600000).toISOString(),
  data: { orderId: 68, orderNumber: 'ORD-20251231-004', status: 'delivered' },
}

const orderMessage = {
  id: 3,
  userId: 1,
  type: 'order_message',
  title: 'Mensaje en orden ORD-20251231-005',
  message: '¿Está la dirección correcta?',
  isRead: false,
  createdAt: new Date(Date.now() - 10 * 60000).toISOString(),
  data: {},
}

vi.mock('../../../hooks/queries/useNotifications', () => ({
  useNotificationsList: (...args: unknown[]) => useNotificationsListMock(...args),
  useUnreadCount: () => useUnreadCountMock(),
  useMarkNotificationRead: () => ({ mutate: markOneReadMutate, isPending: false }),
  useMarkAllNotificationsRead: () => ({ mutate: markAllReadMutate, isPending: false }),
}))

const listData = {
  data: {
    items: [orderAssigned, orderStatus, orderMessage],
    unreadCount: 2,
    total: 3,
    page: 1,
    limit: 8,
    totalPages: 1,
  },
}

/** Abre el panel. */
function openBell() {
  fireEvent.click(screen.getByRole('button', { name: /abrir notificaciones/i }))
}

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useUnreadCountMock.mockReturnValue({ data: 2 })
    useNotificationsListMock.mockReturnValue(listData)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renderiza el ícono de campana', () => {
    render(<NotificationBell />)
    expect(screen.getByRole('button', { name: /abrir notificaciones/i })).toBeDefined()
  })

  it('el badge muestra el contador de no leídas', () => {
    render(<NotificationBell />)
    expect(screen.getByText('2')).toBeDefined()
  })

  it('el badge no se muestra si no hay no leídas', () => {
    useUnreadCountMock.mockReturnValue({ data: 0 })
    render(<NotificationBell />)
    expect(screen.queryByText('0')).toBeNull()
  })

  it('muestra "99+" cuando el contador supera 99', () => {
    useUnreadCountMock.mockReturnValue({ data: 150 })
    render(<NotificationBell />)
    expect(screen.getByText('99+')).toBeDefined()
  })

  it('la lista no se pide hasta abrir el panel', () => {
    render(<NotificationBell />)
    expect(useNotificationsListMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ enabled: false }),
    )
  })

  it('al abrir pide la lista habilitada', async () => {
    render(<NotificationBell />)
    openBell()
    await waitFor(() => {
      expect(useNotificationsListMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ enabled: true }),
      )
    })
  })

  it('abre el dropdown y muestra la lista', async () => {
    render(<NotificationBell />)
    openBell()
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined()
      expect(screen.getByText('Nueva orden ORD-20260101-001')).toBeDefined()
      expect(screen.getByText(/cambió a estado "delivered"/)).toBeDefined()
    })
  })

  it('muestra mensajes e íconos por tipo', async () => {
    render(<NotificationBell />)
    openBell()
    await waitFor(() => {
      expect(screen.getByText('Se te asignó la orden ORD-20260101-001 por 1500.00.')).toBeDefined()
      expect(screen.getByText('¿Está la dirección correcta?')).toBeDefined()
      expect(screen.getByText('hace 5 min')).toBeDefined()
      expect(screen.getByText('hace 3 h')).toBeDefined()
    })
  })

  it('clic en un aviso lo marca leído y navega a la orden', async () => {
    render(<NotificationBell />)
    openBell()
    await waitFor(() => expect(screen.getByText('Nueva orden ORD-20260101-001')).toBeDefined())

    fireEvent.click(screen.getByText('Nueva orden ORD-20260101-001'))

    expect(markOneReadMutate).toHaveBeenCalledWith(1)
    expect(navigateMock).toHaveBeenCalledWith('/admin/ordenes/67')
  })

  it('clic en un aviso ya leído navega igual pero no lo vuelve a marcar', async () => {
    render(<NotificationBell />)
    openBell()
    await waitFor(() =>
      expect(screen.getByText('Orden ORD-20251231-004 — delivered')).toBeDefined(),
    )

    fireEvent.click(screen.getByText('Orden ORD-20251231-004 — delivered'))

    expect(markOneReadMutate).not.toHaveBeenCalled()
    expect(navigateMock).toHaveBeenCalledWith('/admin/ordenes/68')
  })

  it('un aviso sin orden asociada se marca leído pero no navega', async () => {
    render(<NotificationBell />)
    openBell()
    await waitFor(() => expect(screen.getByText('¿Está la dirección correcta?')).toBeDefined())

    fireEvent.click(screen.getByText('¿Está la dirección correcta?'))

    expect(markOneReadMutate).toHaveBeenCalledWith(3)
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('muestra "Marcar todas como leídas" cuando hay no leídas', async () => {
    render(<NotificationBell />)
    openBell()
    await waitFor(() => {
      expect(screen.getByText('Marcar todas como leídas')).toBeDefined()
    })
  })

  it('el botón "Marcar todas" llama al mutate', async () => {
    render(<NotificationBell />)
    openBell()
    await waitFor(() => expect(screen.getByText('Marcar todas como leídas')).toBeDefined())

    fireEvent.click(screen.getByText('Marcar todas como leídas'))

    expect(markAllReadMutate).toHaveBeenCalled()
  })

  it('cierra al hacer click afuera', async () => {
    render(<NotificationBell />)
    openBell()
    await waitFor(() => expect(screen.getByRole('dialog')).toBeDefined())
    fireEvent.mouseDown(document.body)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('cierra con Escape', async () => {
    render(<NotificationBell />)
    openBell()
    await waitFor(() => expect(screen.getByRole('dialog')).toBeDefined())
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('cerrar el panel NO marca todo como leído', async () => {
    render(<NotificationBell />)
    openBell()
    await waitFor(() => expect(screen.getByRole('dialog')).toBeDefined())

    fireEvent.mouseDown(document.body)

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(markAllReadMutate).not.toHaveBeenCalled()
  })

  it('botón del dropdown para pedir permiso del navegador', async () => {
    const onRequest = vi.fn()
    render(<NotificationBell permission="default" onRequestPermission={onRequest} />)
    openBell()
    await waitFor(() => {
      fireEvent.click(screen.getByText('Activar notificaciones'))
      expect(onRequest).toHaveBeenCalledTimes(1)
    })
  })

  it('no muestra botón de permiso si permission=granted', async () => {
    render(<NotificationBell permission="granted" />)
    openBell()
    await waitFor(() => expect(screen.getByRole('dialog')).toBeDefined())
    expect(screen.queryByText('Activar notificaciones')).toBeNull()
  })

  it('estado vacío: mensaje amigable', async () => {
    useUnreadCountMock.mockReturnValue({ data: 0 })
    useNotificationsListMock.mockReturnValue({
      data: { items: [], unreadCount: 0, total: 0, page: 1, limit: 8, totalPages: 0 },
    })
    render(<NotificationBell />)
    openBell()
    await waitFor(() => {
      expect(screen.getByText('No tenés notificaciones todavía.')).toBeDefined()
    })
  })

  it('dispara notificación de escritorio cuando ENTRA un aviso nuevo', async () => {
    const popups: Array<{ title: string }> = []
    class FakeNotification {
      static permission = 'granted'
      onclick: (() => void) | null = null
      constructor(public title: string) {
        popups.push({ title })
      }
    }
    vi.stubGlobal('Notification', FakeNotification)

    useUnreadCountMock.mockReturnValue({ data: 2 })
    const { rerender } = render(<NotificationBell />)

    // Primera lectura: no debe alertar (es el estado inicial, no algo nuevo)
    expect(popups).toHaveLength(0)

    // Entra un aviso nuevo → 3
    useUnreadCountMock.mockReturnValue({ data: 3 })
    rerender(<NotificationBell />)

    await waitFor(() => expect(popups).toHaveLength(1))
    expect(popups[0]?.title).toBe('Tenés avisos nuevos')
  })

  it('NO dispara notificación de escritorio sin permiso', async () => {
    const popups: Array<{ title: string }> = []
    class FakeNotification {
      static permission = 'default'
      onclick: (() => void) | null = null
      constructor(public title: string) {
        popups.push({ title })
      }
    }
    vi.stubGlobal('Notification', FakeNotification)

    useUnreadCountMock.mockReturnValue({ data: 2 })
    const { rerender } = render(<NotificationBell />)
    useUnreadCountMock.mockReturnValue({ data: 5 })
    rerender(<NotificationBell />)

    expect(popups).toHaveLength(0)
  })
})
