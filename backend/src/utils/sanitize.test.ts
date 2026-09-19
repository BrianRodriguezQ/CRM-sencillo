import { describe, it, expect } from 'vitest'
import { stripHtml } from './sanitize.js'

describe('stripHtml', () => {
  it('elimina etiquetas HTML simples', () => {
    expect(stripHtml('<p>hola</p>')).toBe('hola')
  })

  it('elimina etiquetas con atributos', () => {
    expect(stripHtml('<a href="http://evil.com">click aquí</a>')).toBe('click aquí')
  })

  it('elimina script tags (el contenido entre tags queda inerte)', () => {
    // stripHtml quita <script> y </script> pero el contenido queda como texto
    // Eso es suficiente — el script ya no es ejecutable
    expect(stripHtml('<script>alert("xss")</script>')).toBe('alert("xss")')
  })

  it('elimina etiquetas anidadas', () => {
    expect(stripHtml('<div><p><b>texto</b></p></div>')).toBe('texto')
  })

  it('elimina etiquetas self-closing', () => {
    expect(stripHtml('hola<br/>mundo')).toBe('holamundo')
  })

  it('no rompe con string vacío', () => {
    expect(stripHtml('')).toBe('')
  })

  it('no rompe con string sin HTML', () => {
    expect(stripHtml('hola mundo')).toBe('hola mundo')
  })

  it('no rompe con caracteres especiales', () => {
    expect(stripHtml('ñandú, té, café')).toBe('ñandú, té, café')
  })

  it('hace trim del resultado', () => {
    expect(stripHtml('  <p>hola</p>  ')).toBe('hola')
  })

  it('elimina etiquetas con saltos de línea', () => {
    expect(stripHtml('<div>\n<p>texto</p>\n</div>')).toBe('texto')
  })

  it('elimina etiquetas con estilos inline', () => {
    expect(stripHtml('<span style="color:red">peligro</span>')).toBe('peligro')
  })

  it('elimina etiquetas con eventos on*', () => {
    expect(stripHtml('<img onerror="alert(1)" src="x">')).toBe('')
  })

  it('interpreta < y > como tags aunque no sean HTML válido', () => {
    // El regex /<[^>]*>/g es básico — toma cualquier cosa entre < > como tag
    // Para sanitización real se necesita DOMPurify o similar
    expect(stripHtml('a < b y c > d')).toBe('a  d')
  })
})
