/**
 * App — CRM Batista.
 *
 * Exporta el Hono app SIN arrancar el servidor. Separado de index.ts para
 * poder importarlo en tests sin que se ejecute serve().
 *
 * Solo registra las rutas del dominio nuevo (delivery/ventas):
 *   /api/auth, /api/users, /api/customers, /api/payment-methods,
 *   /api/orders, /api/dashboard, /api/notifications, /api/reports,
 *   /api/seed-dev
 */
import { config } from 'dotenv'
config()

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { bodyLimit } from 'hono/body-limit'
import { rateLimit } from './middleware/rate-limit.js'
import type { JWTPayload } from './utils/jwt.js'
import authRoutes from './routes/auth.js'
import usersRoutes from './routes/users.js'
import customersRoutes from './routes/customers.js'
import paymentMethodsRoutes from './routes/payment-methods.js'
import ordersRoutes from './routes/orders.js'
import dashboardRoutes from './routes/dashboard.js'
import notificationsRoutes from './routes/notifications.js'
import reportsRoutes from './routes/reports.js'
import seedDevRoutes from './routes/seed-dev.js'
import eventsRoutes from './events/events-routes.js'
import deliverySheetRoutes from './routes/delivery-sheet.js'

type Variables = { user: JWTPayload }

const app = new Hono<{ Variables: Variables }>()

app.use(
  '/*',
  cors({
    origin: process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()) || ['http://localhost:5173'],
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  }),
)
app.use('/*', secureHeaders())

// Body size limit: 10MB para operaciones normales.
// Desactivado temporalmente - el parser JSON nativo de Hono maneja el body.
// app.use(
//   '/api/*',
//   bodyLimit({
//     maxSize: 10 * 1024 * 1024,
//     onError: (c) => {
//       return c.json({ success: false, error: 'Request demasiado grande (máximo 10MB)' }, 413)
//     },
//   }),
// )

// Global rate limit: 100 requests/minuto por IP.
// La ruta SSE está EXCLUIDA: una conexión long-lived no debe consumir
// cuota de requests (una pestaña abierta 8h = 1 request + heartbeats internos).
app.use(
  '/*',
  rateLimit({
    windowMs: 60_000,
    max: 100,
    message: 'Demasiadas solicitudes. Intentá de nuevo en un minuto.',
    skipPaths: ['/api/events'],
  }),
)

// ─── Rutas del dominio nuevo ───
app.route('/api/auth', authRoutes)
app.route('/api/users', usersRoutes)
app.route('/api/customers', customersRoutes)
app.route('/api/payment-methods', paymentMethodsRoutes)
app.route('/api/orders', ordersRoutes)
app.route('/api/dashboard', dashboardRoutes)
app.route('/api/notifications', notificationsRoutes)
app.route('/api/reports', reportsRoutes)
app.route('/api/seed-dev', seedDevRoutes)
app.route('/api/events', eventsRoutes)

// Ficha digital pública (WP3): el QR de la Nota de Entrega resuelve acá.
// Fuera de /api: el frontend la consume sin token (la escanea el cliente).
app.route('/api/entrega', deliverySheetRoutes)

// ─── Global error handler ───
app.onError((err, c) => {
  console.error('Unhandled error:', err)
  const isDev = process.env.NODE_ENV !== 'production'
  return c.json(
    {
      success: false,
      error: isDev ? err.message || 'Error interno del servidor' : 'Error interno del servidor',
    },
    500,
  )
})

app.notFound((c) => {
  return c.json({ success: false, error: 'Ruta no encontrada' }, 404)
})

export default app
