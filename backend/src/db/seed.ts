/**
 * Seed — crea los datos de ejemplo del CRM Batista.
 *
 * Ejecutar con: npm run db:seed
 * Requiere JWT_SECRET seteado (porque importa db/seed-data que usa
 * password-hash internally).
 *
 * Idempotente: no duplica usuarios ni métodos de pago existentes.
 */
import { config } from 'dotenv'
config()

import { seedDemoData } from './seed-data.js'

const result = await seedDemoData()
console.log('Seed completado:', JSON.stringify(result, null, 2))
