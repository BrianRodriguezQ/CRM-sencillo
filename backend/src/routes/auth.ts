/**
 * Auth — CRM Batista (delivery/ventas).
 *
 * Conserva del modelo fuente SOLO lo que sigue teniendo sentido
 * single-tenant con 3 roles (superadmin | vendedor | conductor):
 *   - login con bloqueo por intentos fallidos
 *   - 2FA TOTP opt-in (setup/enable/disable) + códigos de recuperación
 *   - contraseña temporal pendiente de rotación en primer login (D4)
 *   - refresh token rotation (D2)
 *   - recuperación por 2FA (sin email: el reseteo de claves lo hace el superadmin)
 *   - perfil del usuario autenticado
 *
 * Se ELIMINA todo lo de companies/register/verify-email: los usuarios los crea
 * el superadmin (routes/users.ts), no hay self-registro.
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import {
  generateToken,
  generateChallengeToken,
  verifyChallengeToken,
  type JWTPayload,
} from '../utils/jwt.js'
import {
  createSession,
  rotateRefreshToken,
  revokeByRefreshToken,
  revokeAllUserSessions,
  getSessionByRefreshToken,
  SessionError,
} from '../utils/sessions.js'
import {
  encryptTotpSecret,
  decryptTotpSecret,
  newTotpSecret,
  generateRecoveryCodes,
  hashCode,
  normalizeOtpCode,
} from '../utils/totp.js'
import { verify as verifyTotp } from 'otplib'
import { authMiddleware } from '../middleware/auth.js'
import { rateLimit } from '../middleware/rate-limit.js'
import { stripHtml } from '../utils/sanitize.js'
import { passwordSchema } from '../utils/password-schema.js'
import { writeAuditLog, clientIp } from '../utils/audit-log.js'
import { isLocked, recordFailedAttempt, clearFailedAttempts } from '../utils/login-lockout.js'

type Variables = { user: JWTPayload }

const router = new Hono<{ Variables: Variables }>()

const loginSchema = z.object({
  email: z.preprocess(
    (v) => (typeof v === 'string' ? stripHtml(v).toLowerCase() : v),
    z.string().email('Email inválido'),
  ),
  password: z.string().min(1, 'Contraseña requerida'),
})

const loginLimit = rateLimit({
  windowMs: 60_000,
  max: 5,
  message: 'Demasiados intentos de inicio de sesión. Intentá de nuevo en 1 minuto.',
})

/* ─── D1/D2: emisión de sesión compartida (login + verify-2fa) ─── */

type SessionIssueResult = { status: 200 | 401 | 403; body: Record<string, unknown> }

function serializeUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    lastName: user.lastName,
    cedula: user.cedula,
    address: user.address,
    email: user.email,
    role: user.role,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    isActive: user.isActive,
    // Igual que en users.ts: el frontend ya tenía el campo en su tipo `User`,
    // pero el backend nunca lo mandaba, así que el aviso del perfil no podía
    // aparecer nunca.
    mustChangePassword: user.mustChangePassword === 1,
  }
}

/**
 * Crea la sesión (D2) y emite el par de tokens. Lo usan /login y /verify-2fa
 * para no duplicar lógica. Sin companies: single-tenant.
 */
async function issueSessionOrError(
  c: { req: { header: (name: string) => string | undefined } },
  user: typeof users.$inferSelect,
): Promise<SessionIssueResult> {
  const session = await createSession(user.id, {
    userAgent: c.req.header('user-agent'),
    ip: c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip'),
  })
  const accessToken = generateToken({
    id: user.id,
    email: user.email,
    role: user.role as JWTPayload['role'],
    sid: session.sessionId,
  })

  await writeAuditLog({
    userId: user.id,
    action: 'login',
    metadata: { email: user.email, role: user.role },
    ipAddress: c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip'),
  })

  return {
    status: 200,
    body: {
      success: true,
      data: {
        token: accessToken, // compat con clientes existentes
        accessToken,
        refreshToken: session.refreshToken,
        expiresIn: 900, // 15 min en segundos
        user: serializeUser(user),
      },
    },
  }
}

router.post('/login', loginLimit, zValidator('json', loginSchema), async (c) => {
  try {
    const { email, password } = c.req.valid('json')

    // Check account lockout BEFORE querying DB
    const lockStatus = isLocked(email)
    if (lockStatus.locked) {
      const minutes = Math.ceil(lockStatus.remainingMs / 60_000)
      // El lockout es por email, asi que puede ser una cuenta real o un email
      // inexistente. Buscamos el usuario para dejar el evento atado a la cuenta
      // cuando existe: antes iba userId: 0, la FK lo rechazaba y no quedaba
      // ningun registro de la cuenta bloqueada (ver migracion 0004).
      const [lockedUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1)
      await writeAuditLog({
        userId: lockedUser?.id ?? null,
        action: 'login_locked',
        metadata: { email },
        ipAddress: clientIp(c),
      })
      return c.json(
        {
          success: false,
          error: `Cuenta bloqueada por demasiados intentos fallidos. Intentá de nuevo en ${minutes} minuto(s).`,
        },
        423,
      )
    }

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)

    // Email not found — record failed attempt but give generic message
    if (!user) {
      recordFailedAttempt(email)
      await writeAuditLog({
        // Sin usuario: el email no existe. Antes iba 0 como centinela y la FK lo
        // rechazaba, asi que este evento no se registraba nunca (migracion 0004).
        userId: null,
        action: 'login_failed_email',
        metadata: { email },
        ipAddress: clientIp(c),
      })
      return c.json({ success: false, error: 'El email o la contraseña son incorrectos' }, 401)
    }

    // User exists but is deactivated
    if (!user.isActive) {
      recordFailedAttempt(email)
      await writeAuditLog({
        userId: user.id,
        action: 'login_failed_inactive',
        metadata: { email },
        ipAddress: clientIp(c),
      })
      return c.json(
        {
          success: false,
          error: 'Tu cuenta está desactivada. Contactá al administrador para reactivarla.',
        },
        403,
      )
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      recordFailedAttempt(email)
      await writeAuditLog({
        userId: user.id,
        action: 'login_failed_password',
        metadata: { email },
        ipAddress: clientIp(c),
      })
      return c.json({ success: false, error: 'El email o la contraseña son incorrectos' }, 401)
    }

    // Success — clear failed attempts
    clearFailedAttempts(email)

    // D4: contraseña temporal → el flujo salta directo a la rotación, sin TOTP.
    if (user.mustChangePassword === 1) {
      const challengeToken = generateChallengeToken(user.id)
      return c.json({
        success: true,
        data: { requiresPasswordChange: true, challengeToken },
      })
    }

    // D1: 2FA activa → desafío efímero, SIN tokens todavía
    if (user.totpEnabled === 1 && user.totpSecretEnc) {
      const challengeToken = generateChallengeToken(user.id)
      return c.json({
        success: true,
        data: { requires2FA: true, challengeToken },
      })
    }

    const { status, body } = await issueSessionOrError(c, user)
    return c.json(body, status)
  } catch (error) {
    console.error('Login error:', error)
    return c.json({ success: false, error: 'Error al iniciar sesión' }, 500)
  }
})

/*
 * NOTA: acá vivían POST /forgot-password y POST /reset-password (reset por
 * email con token de un solo uso). Se eliminaron junto con la tabla
 * `password_reset_tokens`: el sistema no manda mails. El reseteo de claves
 * ahora lo hace el superadmin (POST /api/users/:id/reset-password), que deja
 * una contraseña temporal + `mustChangePassword = 1` y revoca las sesiones.
 */

/* ═══ D2 — Refresh token rotation ═══ */

const refreshSchema = z.object({ refreshToken: z.string().min(20).max(200) })

router.post('/refresh', zValidator('json', refreshSchema), async (c) => {
  try {
    const { refreshToken } = c.req.valid('json')

    const result = await rotateRefreshToken(refreshToken)

    // Usuario puede haber sido desactivado entre rotaciones
    const [user] = await db.select().from(users).where(eq(users.id, result.userId)).limit(1)
    if (!user || !user.isActive) {
      await revokeAllUserSessions(result.userId)
      return c.json({ success: false, error: 'Usuario desactivado.' }, 403)
    }

    const accessToken = generateToken({
      id: user.id,
      email: user.email,
      role: user.role as JWTPayload['role'],
      sid: result.sessionId,
    })

    return c.json({
      success: true,
      data: {
        token: accessToken, // compat
        accessToken,
        // Grace period: '' significa "conservá el refresh que ya tenés"
        refreshToken: result.refreshToken === '' ? undefined : result.refreshToken,
        expiresIn: 900,
      },
    })
  } catch (error) {
    if (error instanceof SessionError) {
      return c.json({ success: false, error: error.message, code: error.code }, 401)
    }
    console.error('Refresh error:', error)
    return c.json({ success: false, error: 'Error al refrescar sesión' }, 500)
  }
})

const logoutSchema = z.object({ refreshToken: z.string().min(20).max(200) })

router.post('/logout', zValidator('json', logoutSchema), async (c) => {
  // Audit trail D2+: registrar el logout con el user real (antes de revocar, para
  // poder resolver userId desde la sesión).
  try {
    const session = await getSessionByRefreshToken(c.req.valid('json').refreshToken)
    if (session) {
      const [logoutUser] = await db
        .select({ id: users.id, email: users.email, role: users.role })
        .from(users)
        .where(eq(users.id, session.userId))
        .limit(1)
      if (logoutUser) {
        await writeAuditLog({
          userId: logoutUser.id,
          action: 'logout',
          metadata: { email: logoutUser.email, role: logoutUser.role },
          ipAddress: clientIp(c),
        })
      }
    }
  } catch (error) {
    console.error('Logout audit error:', error)
  }

  try {
    await revokeByRefreshToken(c.req.valid('json').refreshToken)
    return c.json({ success: true })
  } catch (error) {
    console.error('Logout error:', error)
    return c.json({ success: true }) // logout nunca falla para el cliente
  }
})

/* ─── Perfil del usuario autenticado ─── */

router.get('/profile', authMiddleware, async (c) => {
  const auth = c.get('user')
  const [user] = await db.select().from(users).where(eq(users.id, auth.id)).limit(1)
  if (!user) return c.json({ success: false, error: 'Usuario no encontrado' }, 404)

  return c.json({
    success: true,
    data: {
      ...serializeUser(user),
      totpEnabled: user.totpEnabled === 1,
      createdAt: user.createdAt,
    },
  })
})

/**
 * PATCH /profile — el usuario actualiza SUS propios datos de perfil.
 *
 * El email NO se edita acá (requerimiento CTO: el correo es readonly en el
 * perfil; si algún día se necesita cambiar, que lo haga el superadmin).
 */
const updateProfileSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es requerido').max(255).optional(),
  lastName: z.string().trim().max(255).optional().nullable(),
  cedula: z.string().trim().max(20).optional().nullable(),
  address: z.string().trim().max(255).optional().nullable(),
  phone: z.string().trim().max(50).optional().nullable(),
})

router.patch('/profile', authMiddleware, zValidator('json', updateProfileSchema), async (c) => {
  try {
    const auth = c.get('user')
    const data = c.req.valid('json')

    const [user] = await db.select().from(users).where(eq(users.id, auth.id)).limit(1)
    if (!user) return c.json({ success: false, error: 'Usuario no encontrado' }, 404)

    const [updated] = await db
      .update(users)
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.lastName !== undefined ? { lastName: data.lastName ?? null } : {}),
        ...(data.cedula !== undefined ? { cedula: data.cedula ?? null } : {}),
        ...(data.address !== undefined ? { address: data.address ?? null } : {}),
        ...(data.phone !== undefined ? { phone: data.phone ?? null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning()

    await writeAuditLog({
      userId: user.id,
      action: 'profile.updated',
      metadata: { email: user.email },
      ipAddress: clientIp(c),
    })

    return c.json({ success: true, data: { ...serializeUser(updated), createdAt: updated.createdAt } })
  } catch (error) {
    console.error('Update profile error:', error)
    return c.json({ success: false, error: 'Error al actualizar el perfil' }, 500)
  }
})

/** Tipos de imagen permitidos para el avatar. */
const ALLOWED_AVATAR_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}
const MAX_AVATAR_BYTES = 2 * 1024 * 1024 // 2MB

/**
 * POST /avatar — subir imagen de perfil (multipart, campo `file`).
 *
 * Se guarda en backend/uploads/avatars/{userId}-{ts}.{ext} y la ruta se sirve
 * SIN auth (índex.ts registra /uploads/avatars/* antes que /uploads/*):
 * el <img> del navegador no manda Bearer token.
 */
router.post('/avatar', authMiddleware, async (c) => {
  try {
    const auth = c.get('user')

    const [user] = await db.select().from(users).where(eq(users.id, auth.id)).limit(1)
    if (!user) return c.json({ success: false, error: 'Usuario no encontrado' }, 404)

    const body = await c.req.parseBody()
    const file = body['file']

    if (!(file instanceof File)) {
      return c.json({ success: false, error: 'Adjuntá un archivo de imagen' }, 400)
    }

    const ext = ALLOWED_AVATAR_TYPES[file.type]
    if (!ext) {
      return c.json(
        { success: false, error: 'Formato no permitido. Usá PNG, JPG o WebP.' },
        400,
      )
    }
    if (file.size > MAX_AVATAR_BYTES) {
      return c.json({ success: false, error: 'La imagen supera los 2MB' }, 400)
    }

    const uploadsDir = path.join(process.cwd(), 'uploads', 'avatars')
    await mkdir(uploadsDir, { recursive: true })
    const filename = `${user.id}-${Date.now()}.${ext}`
    await writeFile(path.join(uploadsDir, filename), Buffer.from(await file.arrayBuffer()))

    const avatarUrl = `/uploads/avatars/${filename}`
    await db
      .update(users)
      .set({ avatarUrl, updatedAt: new Date() })
      .where(eq(users.id, user.id))

    await writeAuditLog({
      userId: user.id,
      action: 'profile.avatar_updated',
      metadata: { email: user.email },
      ipAddress: clientIp(c),
    })

    return c.json({ success: true, data: { avatarUrl } })
  } catch (error) {
    console.error('Avatar upload error:', error)
    return c.json({ success: false, error: 'Error al subir la imagen' }, 500)
  }
})

/* ─── D4: rotación de contraseña temporal (single-use real) ─── */

const verifyLimit = rateLimit({
  windowMs: 60_000,
  max: 10,
  message: 'Demasiados intentos de verificación. Esperá un minuto.',
})

const completePasswordChangeSchema = z.object({
  challengeToken: z.string().min(20).max(1000),
  // Misma política que el resto de las claves (utils/password-schema.ts):
  // antes esta ruta pedía el mínimo por su cuenta y aceptaba "123456".
  newPassword: passwordSchema,
})

/**
 * Último paso del login con contraseña temporal: rota la clave y recién ahí
 * emite la sesión real. La temporal queda muerta (mustChangePassword=0 y hash
 * reemplazado) — no puede volver a usarse jamás.
 */
router.post(
  '/complete-password-change',
  verifyLimit,
  zValidator('json', completePasswordChangeSchema),
  async (c) => {
    try {
      const { challengeToken, newPassword } = c.req.valid('json')

      let userId: number
      try {
        userId = verifyChallengeToken(challengeToken).id
      } catch {
        return c.json(
          { success: false, error: 'Desafío inválido o expirado. Iniciá sesión de nuevo.' },
          401,
        )
      }

      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
      if (!user || !user.isActive || user.mustChangePassword !== 1) {
        return c.json({ success: false, error: 'Sesión de verificación inválida' }, 401)
      }

      // Prohibir "rotar" a la misma temporal
      const sameAsOld = await bcrypt.compare(newPassword, user.passwordHash)
      if (sameAsOld) {
        return c.json(
          { success: false, error: 'La nueva contraseña no puede ser igual a la temporal' },
          400,
        )
      }

      const newHash = await bcrypt.hash(newPassword, 10)
      await db
        .update(users)
        .set({
          passwordHash: newHash,
          mustChangePassword: 0,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id))

      await writeAuditLog({
        userId: user.id,
        action: 'temporary_password_rotated',
        metadata: { email: user.email },
        ipAddress: clientIp(c),
      })

      // El `user` viene de antes del UPDATE: si se pasa tal cual, el serializer
      // devuelve mustChangePassword=true (valor viejo) aunque en la DB ya sea 0.
      const { status, body } = await issueSessionOrError(c, { ...user, mustChangePassword: 0 })
      return c.json(body, status)
    } catch (error) {
      console.error('Complete-password-change error:', error)
      return c.json({ success: false, error: 'Error al actualizar la contraseña' }, 500)
    }
  },
)

/* ─── D1: 2FA TOTP ─── */

/* ─── Cambio de contraseña del usuario logueado ─── */

const passwordChangeLimit = rateLimit({
  windowMs: 60_000,
  max: 10,
  message: 'Demasiados cambios de contraseña. Esperá un minuto.',
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Ingresá tu contraseña actual'),
  newPassword: passwordSchema,
})

/**
 * Cambio de contraseña propio (usuario ya logueado).
 *
 * NO confundir con /complete-password-change: esa es la rotación de una
 * contraseña TEMPORAL en medio del login (hay challenge token y todavía no hay
 * sesión). Esta es para alguien que ya está adentro.
 *
 * Al cambiar, la sesión actual SOBREVIVE (el usuario acaba de probar que es él)
 * y las demás se revocan.
 */
router.post(
  '/change-password',
  passwordChangeLimit,
  authMiddleware,
  zValidator('json', changePasswordSchema),
  async (c) => {
    try {
      const auth = c.get('user')
      const { currentPassword, newPassword } = c.req.valid('json')

      const [user] = await db.select().from(users).where(eq(users.id, auth.id)).limit(1)
      if (!user || !user.isActive) {
        return c.json({ success: false, error: 'Usuario no encontrado' }, 404)
      }

      const currentIsValid = await bcrypt.compare(currentPassword, user.passwordHash)
      if (!currentIsValid) {
        await writeAuditLog({
          userId: user.id,
          action: 'password_change_failed',
          metadata: { email: user.email, reason: 'current_password_mismatch' },
          ipAddress: clientIp(c),
        })
        return c.json({ success: false, error: 'La contraseña actual no es correcta' }, 401)
      }

      const sameAsCurrent = await bcrypt.compare(newPassword, user.passwordHash)
      if (sameAsCurrent) {
        return c.json(
          { success: false, error: 'La nueva contraseña no puede ser igual a la actual' },
          400,
        )
      }

      const passwordHash = await bcrypt.hash(newPassword, 10)
      await db
        .update(users)
        .set({ passwordHash, mustChangePassword: 0, updatedAt: new Date() })
        .where(eq(users.id, user.id))

      await revokeAllUserSessions(user.id, auth.sid)

      await writeAuditLog({
        userId: user.id,
        action: 'password_changed',
        metadata: { email: user.email },
        ipAddress: clientIp(c),
      })

      return c.json({
        success: true,
        data: { user: serializeUser({ ...user, mustChangePassword: 0 }) },
      })
    } catch (error) {
      console.error('Change-password error:', error)
      return c.json({ success: false, error: 'Error al cambiar la contraseña' }, 500)
    }
  },
)

// Single-tenant con 3 roles de staff → 2FA disponible para todos los roles.
function canUseTwoFactor(_user: { role: string }): boolean {
  return true
}

const verify2faSchema = z.object({
  challengeToken: z.string().min(20).max(1000),
  code: z.string().min(6).max(12),
})

/**
 * Paso 2 del login con 2FA: canjea el challenge token por una sesión real.
 * Acepta código TOTP de 6 dígitos o un código de recuperación single-use.
 */
router.post('/verify-2fa', verifyLimit, zValidator('json', verify2faSchema), async (c) => {
  try {
    const { challengeToken, code } = c.req.valid('json')

    let userId: number
    try {
      userId = verifyChallengeToken(challengeToken).id
    } catch {
      return c.json(
        { success: false, error: 'Desafío inválido o expirado. Iniciá sesión de nuevo.' },
        401,
      )
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
    if (!user || !user.isActive || user.totpEnabled !== 1 || !user.totpSecretEnc) {
      return c.json({ success: false, error: 'Sesión de verificación inválida' }, 401)
    }

    const secret = decryptTotpSecret(user.totpSecretEnc)
    if (!secret) {
      console.error(`2FA: secret corrupto para user ${user.id}`)
      return c.json({ success: false, error: 'Error de configuración 2FA' }, 500)
    }

    const normalized = normalizeOtpCode(code)
    let valid = false
    let usedRecoveryCode = false
    let recoveryCodesLeft = 0

    if (/^\d{6}$/.test(normalized)) {
      try {
        const result = await verifyTotp({ secret, token: normalized, epochTolerance: 30 })
        valid = result.valid === true
      } catch {
        valid = false // token malformado
      }
    }

    if (!valid && user.recoveryCodes) {
      try {
        const hashes: string[] = JSON.parse(user.recoveryCodes)
        const idx = hashes.indexOf(hashCode(normalized))
        if (idx >= 0) {
          hashes.splice(idx, 1) // consumido — single-use
          recoveryCodesLeft = hashes.length
          await db
            .update(users)
            .set({
              recoveryCodes: JSON.stringify(hashes),
              updatedAt: new Date(),
            })
            .where(eq(users.id, user.id))
          valid = true
          usedRecoveryCode = true
        }
      } catch {
        // recovery_codes corrupto → ignorar y tratar como inválido
      }
    }

    if (!valid) {
      await writeAuditLog({
        userId: user.id,
        action: 'totp_failed',
        metadata: { email: user.email },
        ipAddress: clientIp(c),
      })
      return c.json({ success: false, error: 'Código incorrecto' }, 401)
    }

    // D4: identidad ya probada con 2FA — si la contraseña es temporal, rotarla primero
    if (user.mustChangePassword === 1) {
      const challengeToken = generateChallengeToken(user.id)
      return c.json({
        success: true,
        data: { requiresPasswordChange: true, challengeToken },
      })
    }

    const { status, body } = await issueSessionOrError(c, user)
    if (usedRecoveryCode) {
      await writeAuditLog({
        userId: user.id,
        action: '2fa_recovery_code_used',
        metadata: { email: user.email, remaining: recoveryCodesLeft },
        ipAddress: clientIp(c),
      })
    }
    return c.json(body, status)
  } catch (error) {
    console.error('Verify-2FA error:', error)
    return c.json({ success: false, error: 'Error al verificar el código' }, 500)
  }
})

const totpSetupSchema = z.object({})
const totpEnableSchema = z.object({ code: z.string().min(6).max(12) })
const totpDisableSchema = z.object({ password: z.string().min(1, 'Contraseña requerida') })

/** Estado 2FA del usuario logueado */
router.get('/2fa/status', authMiddleware, async (c) => {
  const auth = c.get('user')
  const [user] = await db
    .select({ totpEnabled: users.totpEnabled })
    .from(users)
    .where(eq(users.id, auth.id))
    .limit(1)
  if (!user) return c.json({ success: false, error: 'Usuario no encontrado' }, 404)
  return c.json({ success: true, data: { enabled: user.totpEnabled === 1 } })
})

/** Genera un secret nuevo (pendiente) y devuelve la URI otpauth para el QR */
router.post('/2fa/setup', authMiddleware, zValidator('json', totpSetupSchema), async (c) => {
  try {
    const auth = c.get('user')
    const [user] = await db.select().from(users).where(eq(users.id, auth.id)).limit(1)
    if (!user || !user.isActive) {
      return c.json({ success: false, error: 'Usuario no encontrado' }, 404)
    }
    if (!canUseTwoFactor(user)) {
      return c.json(
        { success: false, error: 'Tu perfil no permite activar la autenticación de dos pasos' },
        403,
      )
    }
    if (user.totpEnabled === 1) {
      return c.json(
        {
          success: false,
          error: 'El 2FA ya está activado. Desactivalo primero si querés regenerarlo.',
        },
        409,
      )
    }

    const secret = newTotpSecret()
    await db
      .update(users)
      .set({ totpSecretEnc: encryptTotpSecret(secret), updatedAt: new Date() })
      .where(eq(users.id, user.id))

    // URI estándar otpauth:// para Google Authenticator / Authy / etc.
    const label = encodeURIComponent(`CRM Batista:${user.email}`)
    const otpauthUrl = `otpauth://totp/${label}?secret=${secret}&issuer=CRM%20Batista&algorithm=SHA1&digits=6&period=30`

    return c.json({ success: true, data: { secret, otpauthUrl } })
  } catch (error) {
    console.error('2FA setup error:', error)
    return c.json({ success: false, error: 'Error al iniciar configuración 2FA' }, 500)
  }
})

/** Activa 2FA: verifica el primer código contra el secret pendiente */
router.post('/2fa/enable', authMiddleware, zValidator('json', totpEnableSchema), async (c) => {
  try {
    const auth = c.get('user')
    const { code } = c.req.valid('json')

    const [user] = await db.select().from(users).where(eq(users.id, auth.id)).limit(1)
    if (!user || !user.totpSecretEnc) {
      return c.json({ success: false, error: 'Primero ejecutá el setup de 2FA' }, 400)
    }
    if (!canUseTwoFactor(user)) {
      return c.json(
        { success: false, error: 'Tu perfil no permite activar la autenticación de dos pasos' },
        403,
      )
    }
    if (user.totpEnabled === 1) {
      return c.json({ success: false, error: 'El 2FA ya está activado' }, 409)
    }

    const secret = decryptTotpSecret(user.totpSecretEnc)
    if (!secret) {
      return c.json(
        { success: false, error: 'Secret 2FA inválido, ejecutá el setup de nuevo' },
        400,
      )
    }

    let valid = false
    try {
      const result = await verifyTotp({ secret, token: normalizeOtpCode(code), epochTolerance: 30 })
      valid = result.valid === true
    } catch {
      valid = false
    }
    if (!valid) {
      return c.json(
        { success: false, error: 'Código incorrecto. Probá con el código actual de tu app.' },
        400,
      )
    }

    const recoveryCodes = generateRecoveryCodes(10)
    await db
      .update(users)
      .set({
        totpEnabled: 1,
        recoveryCodes: JSON.stringify(recoveryCodes.map((rc) => hashCode(rc))),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))

    await writeAuditLog({
      userId: user.id,
      action: '2fa_enabled',
      metadata: { email: user.email },
      ipAddress: clientIp(c),
    })

    // Los códigos en claro se muestran UNA sola vez
    return c.json({ success: true, data: { recoveryCodes } })
  } catch (error) {
    console.error('2FA enable error:', error)
    return c.json({ success: false, error: 'Error al activar 2FA' }, 500)
  }
})

/** Desactiva 2FA: requiere contraseña vigente */
router.post('/2fa/disable', authMiddleware, zValidator('json', totpDisableSchema), async (c) => {
  try {
    const auth = c.get('user')
    const { password } = c.req.valid('json')

    const [user] = await db.select().from(users).where(eq(users.id, auth.id)).limit(1)
    if (!user) {
      return c.json({ success: false, error: 'Usuario no encontrado' }, 404)
    }
    if (user.totpEnabled !== 1) {
      return c.json({ success: false, error: 'El 2FA no está activado' }, 400)
    }

    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) {
      return c.json({ success: false, error: 'Contraseña incorrecta' }, 401)
    }

    await db
      .update(users)
      .set({ totpEnabled: 0, totpSecretEnc: null, recoveryCodes: null, updatedAt: new Date() })
      .where(eq(users.id, user.id))

    await writeAuditLog({
      userId: user.id,
      action: '2fa_disabled',
      metadata: { email: user.email },
      ipAddress: clientIp(c),
    })

    return c.json({ success: true })
  } catch (error) {
    console.error('2FA disable error:', error)
    return c.json({ success: false, error: 'Error al desactivar 2FA' }, 500)
  }
})

export default router
