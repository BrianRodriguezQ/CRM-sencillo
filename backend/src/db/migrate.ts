/**
 * Migrate — aplica las migraciones de Drizzle.
 *
 * Funciona tanto con PGlite (dev/standalone) como con Postgres real
 * (producción): usa el migrator oficial de Drizzle según el modo activo.
 */
import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
config()

async function migrate() {
  const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url))
  const migrationConfig = { migrationsFolder }

  if (process.env.DATABASE_URL) {
    const postgres = (await import('postgres')).default
    const { drizzle } = await import('drizzle-orm/postgres-js')
    const { migrate: migratePg } = await import('drizzle-orm/postgres-js/migrator')

    const sql = postgres(process.env.DATABASE_URL, { transform: { undefined: null } })
    const db = drizzle(sql)
    console.log('Running migrations on PostgreSQL (DATABASE_URL)…')
    await migratePg(db, migrationConfig)
    await sql.end()
  } else {
    const { PGlite } = await import('@electric-sql/pglite')
    const { drizzle } = await import('drizzle-orm/pglite')
    const { migrate: migratePglite } = await import('drizzle-orm/pglite/migrator')

    const pglite = new PGlite(process.env.PGLITE_DATA_DIR || './.pglite')
    const db = drizzle(pglite)
    console.log('Running migrations on PGlite (embedded Postgres)…')
    await migratePglite(db, migrationConfig)
  }

  console.log('All migrations completed')
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
