/**
 * Valida la migracion 0012 (todos los clientes como grupo con sede) contra
 * una COPIA de la DB local. NO toca la DB real.
 *
 * Uso: npx tsx scripts/validate-migration-0012.ts [dataDir]
 *   dataDir default: ./.pglite
 *
 * Reporta: conteos antes/despues, grupos sin sucursal restantes, e
 * idempotencia (corre la migracion 2 veces y compara).
 */
import { fileURLToPath } from 'node:url'
import { readFileSync, cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'

const dataDir = process.argv[2] ?? './.pglite'
const migrationPath = fileURLToPath(
  new URL('../src/db/migrations/0012_all_customers_groups.sql', import.meta.url),
)
const sql = readFileSync(migrationPath, 'utf8')

async function main() {
  // Copia de la DB real a un directorio temporal
  const tempDir = mkdtempSync(join(tmpdir(), 'crm-0012-validate-'))
  try {
    cpSync(dataDir, tempDir, { recursive: true })

    const { PGlite } = await import('@electric-sql/pglite')
    const db = new PGlite(tempDir)

    // Antes: no puede consultar is_primary (la copia todavia no tiene la columna)
    const beforeQuery = `
      SELECT
        (SELECT count(*) FROM customers WHERE is_group = true AND parent_id IS NULL) AS grupos,
        (SELECT count(*) FROM customers WHERE is_group = false AND parent_id IS NULL) AS individuales_raiz,
        (SELECT count(*) FROM customers WHERE parent_id IS NOT NULL) AS sucursales,
        (SELECT count(*) FROM customers g
           WHERE g.is_group = true AND g.parent_id IS NULL
             AND NOT EXISTS (SELECT 1 FROM customers b WHERE b.parent_id = g.id)) AS grupos_sin_sucursal
    `
    const afterQuery = `
      SELECT
        (SELECT count(*) FROM customers WHERE is_group = true AND parent_id IS NULL) AS grupos,
        (SELECT count(*) FROM customers WHERE is_group = false AND parent_id IS NULL) AS individuales_raiz,
        (SELECT count(*) FROM customers WHERE parent_id IS NOT NULL) AS sucursales,
        (SELECT count(*) FROM customers WHERE parent_id IS NOT NULL AND is_primary = true) AS sucursales_principales,
        (SELECT count(*) FROM customers g
           WHERE g.is_group = true AND g.parent_id IS NULL
             AND NOT EXISTS (SELECT 1 FROM customers b WHERE b.parent_id = g.id)) AS grupos_sin_sucursal
    `

    const before = (await db.query(beforeQuery)).rows[0]
    console.log('ANTES de la migracion:')
    console.table(before)

    // Primera corrida
    await db.exec(sql)
    const after1 = (await db.query(afterQuery)).rows[0]
    console.log('\nDESPUES de la 1ra corrida:')
    console.table(after1)

    // Segunda corrida (idempotencia)
    await db.exec(sql)
    const after2 = (await db.query(afterQuery)).rows[0]
    console.log('\nDESPUES de la 2da corrida (idempotencia):')
    console.table(after2)

    // Detalle de un cliente convertido (ej.: el mas nuevo)
    const sample = await db.query(`
      SELECT g.id AS grupo_id, g.name, g.is_group, b.id AS sucursal_id, b.name AS sucursal_nombre,
             b.rif, b.phone, b.email, b.address, b.is_primary
      FROM customers g
      JOIN customers b ON b.parent_id = g.id
      WHERE g.parent_id IS NULL
      ORDER BY g.id
      LIMIT 5
    `)
    console.log('\nMuestra de grupos con su sucursal principal:')
    console.table(sample.rows)

    const ok1 = Number(after1.grupos_sin_sucursal) === 0
    const ok2 = JSON.stringify(after1) === JSON.stringify(after2)
    const ok3 = Number(after2.individuales_raiz) === 0
    console.log(`\n=> grupos sin sucursal tras migrar: ${ok1 ? 'OK (0)' : 'FALLO'}`)
    console.log(`=> idempotente: ${ok2 ? 'OK' : 'FALLO (los conteos cambiaron en la 2da corrida)'}`)
    console.log(`=> sin individuales raiz: ${ok3 ? 'OK' : 'FALLO'}`)

    if (!ok1 || !ok2 || !ok3) {
      console.error('VALIDACION FALLADA')
      process.exitCode = 1
    } else {
      console.log('VALIDACION OK')
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error('Error de validacion:', err)
  process.exit(1)
})