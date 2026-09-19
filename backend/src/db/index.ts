/**
 * DB — PostgreSQL con PGlite por defecto.
 *
 * Estrategia de migración a producción (requisito CTO):
 * - Sin DATABASE_URL → PGlite embebido (Postgres real en un archivo local).
 *   Ideal para dev/standalone: cero infraestructura, mismo dialecto SQL.
 * - Con DATABASE_URL → postgres-js apuntando al Postgres del cliente.
 *
 * El schema es pg-core en ambos casos: las migraciones SQL generadas por
 * drizzle-kit son idénticas. "Migrar sin problemas" = setear DATABASE_URL.
 */
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

export type DbClient = ReturnType<typeof drizzle>

const connectionString = process.env.DATABASE_URL

let client: ReturnType<typeof postgres> | null = null
let pgliteInstance: any = null
let db: DbClient

if (connectionString) {
  client = postgres(connectionString, {
    max: parseInt(process.env.DB_POOL_MAX || '10', 10),
    idle_timeout: parseInt(process.env.DB_IDLE_TIMEOUT || '30', 10),
    connect_timeout: parseInt(process.env.DB_CONNECT_TIMEOUT || '10', 10),
    transform: { undefined: null },
  })
  db = drizzle(client)
} else {
  // PGlite: import dinámico para no bloquear el arranque con DATABASE_URL set
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle: drizzlePglite } = await import('drizzle-orm/pglite')
  pgliteInstance = new PGlite(process.env.PGLITE_DATA_DIR || './.pglite')
  // La operación es en hora de Venezuela: los timestamps sin TZ se guardan en
  // hora local de Caracas (el frontend los lee como LOCALES — ver lib/dates).
  // En producción con DATABASE_URL, setear el timezone en el server Postgres.
  await pgliteInstance.exec("SET TIME ZONE 'America/Caracas'")
  db = drizzlePglite(pgliteInstance) as unknown as DbClient
}

// ─── Cierre limpio de conexiones DB ───
export async function closeDatabase(): Promise<void> {
  if (client) {
    await client.end()
    client = null
  }
  if (pgliteInstance) {
    // PGlite no tiene método close() explícito, pero cerramos la conexión
    // El proceso de Node cerrará el archivo automáticamente al salir
    pgliteInstance = null
  }
}

export { db, client as sql }
