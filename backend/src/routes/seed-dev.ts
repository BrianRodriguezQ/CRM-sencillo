/**
 * Seed-dev — POST /api/seed-dev. Solo funciona si NODE_ENV !== 'production'.
 * Crea datos de ejemplo idempotentemente (superadmin demo, vendedores,
 * conductores, clientes y métodos de pago).
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { seedDemoData } from '../db/seed-data.js'
import { authMiddleware, requireSuperadmin } from '../middleware/auth.js'
import type { JWTPayload } from '../utils/jwt.js'

const router = new Hono<{ Variables: { user: JWTPayload } }>()

router.use('*', authMiddleware, requireSuperadmin)

router.post('/', zValidator('json', z.object({})), async (c) => {
  if (process.env.NODE_ENV === 'production') {
    return c.json({ success: false, error: 'Esta ruta solo está disponible en desarrollo' }, 404)
  }

  try {
    const result = await seedDemoData()
    return c.json({ success: true, data: result })
  } catch (error) {
    console.error('Seed-dev error:', error)
    return c.json({ success: false, error: 'Error al insertar datos de ejemplo' }, 500)
  }
})

export default router
