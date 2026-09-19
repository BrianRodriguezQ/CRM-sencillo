/**
 * Entry point — CRM Batista.
 * Arranca el servidor HTTP. La app (app.ts) es importable sin efectos
 * secundarios, como requiere el patrón de tests del proyecto.
 */
// Zona horaria de Venezuela (UTC-4) ANTES de cualquier import que use new Date().
process.env.TZ = 'America/Caracas'

import { config } from 'dotenv'
config()

import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import app from './app.js'
import { authMiddleware } from './middleware/auth.js'

// Archivos subidos por el usuario — requiere autenticación.
// Solo sirve .pdf y .png que son los tipos válidos del sistema.
//
// ORDEN IMPORTANTE: los avatares se registran ANTES y se sirven SIN auth
// porque el <img> del navegador no manda el Bearer token. Los PDFs de notas
// de entrega siguen protegidos (ruta /uploads/* de abajo). Las imágenes adjuntas al chat
// (WP2) van por el mismo camino: la burbuja usa <img src>, no fetch.
app.use('/uploads/avatars/*', serveStatic({ root: './' }))
app.use('/uploads/communications/*', serveStatic({ root: './' }))
app.use('/uploads/*', authMiddleware, serveStatic({ root: './' }))

// En producción, servir el frontend SPA desde /public
if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: './public', index: 'index.html' }))
}

const port = parseInt(process.env.PORT || '3001', 10)

let server: ReturnType<typeof serve> | null = null

function startServer() {
  server = serve({ fetch: app.fetch, port }, (info) => {
    console.log(`CRM Batista API running on http://localhost:${info.port}`)
  })

  // Manejo de errores del servidor HTTP
  server.on('error', (err) => {
    console.error('Server error:', err)
  })
}

function shutdown(signal: string) {
  console.log(`\n${signal} recibido — cerrando servidor gracefully...`)

  if (server) {
    server.close(async () => {
      console.log('Servidor HTTP cerrado')
      // Cerrar conexiones de base de datos
      try {
        const { closeDatabase } = await import('./db/index.js')
        await closeDatabase()
        console.log('Conexiones DB cerradas')
      } catch (err) {
        console.error('Error cerrando DB:', err)
      }
      process.exit(0)
    })

    // Force exit después de 10s si no cierra limpio
    setTimeout(() => {
      console.error('Timeout — forzando salida')
      process.exit(1)
    }, 10_000)
  } else {
    process.exit(0)
  }
}

// ─── Handlers globales de errores no capturados ───
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err)
  shutdown('uncaughtException')
})

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason)
  shutdown('unhandledRejection')
})

// ─── Shutdown graceful en señales del SO ───
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

// En Windows, SIGBREAK (Ctrl+Break) también debería cerrar limpio
if (process.platform === 'win32') {
  process.on('SIGBREAK', () => shutdown('SIGBREAK'))
}

// ─── Arranque ───
startServer()
