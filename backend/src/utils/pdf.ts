/**
 * Utilidades de generación de PDF server-side — CRM Batista.
 *
 * pdfmake es CommonJS, así que se carga con `createRequire` para evitar
 * fricción con el modo ESM del backend. Las fuentes Roboto vienen embebidas
 * en base64 dentro del propio paquete (build/vfs_fonts), por lo que no hay
 * que copiar .ttf a disco ni depender de fuentes del sistema operativo.
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/**
 * Definición mínima del documento pdfmake. Se declara localmente para no
 * depender de los .d.ts del paquete en runtime (bundling a dist/).
 */
export interface PdfDocDefinition {
  pageSize?: string
  pageMargins?: number[]
  content: unknown[]
  styles?: Record<string, unknown>
  defaultStyle?: Record<string, unknown>
  header?: unknown
  footer?: unknown
  info?: Record<string, unknown>
}

interface PdfKitStream {
  on(event: 'data', cb: (chunk: Buffer) => void): void
  on(event: 'end', cb: () => void): void
  on(event: 'error', cb: (err: Error) => void): void
  end(): void
}

interface PdfPrinterInstance {
  createPdfKitDocument(doc: PdfDocDefinition): PdfKitStream
}

/** VFS de pdfmake: mapa nombre-de-fuente → contenido base64. */
const vfsFonts = require('pdfmake/build/vfs_fonts') as Record<string, string>

const fontDescriptors = {
  Roboto: {
    normal: Buffer.from(vfsFonts['Roboto-Regular.ttf'], 'base64'),
    bold: Buffer.from(vfsFonts['Roboto-Medium.ttf'], 'base64'),
    italics: Buffer.from(vfsFonts['Roboto-Italic.ttf'], 'base64'),
    bolditalics: Buffer.from(vfsFonts['Roboto-MediumItalic.ttf'], 'base64'),
  },
}

const PdfPrinter = require('pdfmake') as new (fonts: typeof fontDescriptors) => PdfPrinterInstance

// El printer cachea las fuentes: se construye UNA vez por proceso.
const printer = new PdfPrinter(fontDescriptors)

/** Renderiza un docDefinition de pdfmake a un Buffer PDF. */
export function renderPdf(doc: PdfDocDefinition): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const pdfDoc = printer.createPdfKitDocument(doc)
      const chunks: Buffer[] = []
      pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk))
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)))
      pdfDoc.on('error', reject)
      pdfDoc.end()
    } catch (err) {
      reject(err)
    }
  })
}
