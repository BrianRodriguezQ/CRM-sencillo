/**
 * Tests — Badge component
 *
 * Renders children, applies variant and size classes.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge } from '../Badge'

describe('Badge', () => {
  it('renderiza children', () => {
    render(<Badge>Activo</Badge>)
    expect(screen.getByText('Activo')).toBeDefined()
  })

  it('aplica variante info por defecto', () => {
    render(<Badge>OK</Badge>)
    const span = screen.getByText('OK')
    expect(span.className).toContain('bg-blue-100')
  })

  it('aplica variante error', () => {
    render(<Badge variant="error">Error</Badge>)
    const span = screen.getByText('Error')
    expect(span.className).toContain('bg-red-100')
  })

  it('aplica variante warning', () => {
    render(<Badge variant="warning">Warn</Badge>)
    const span = screen.getByText('Warn')
    expect(span.className).toContain('bg-yellow-100')
  })

  it('aplica variante info', () => {
    render(<Badge variant="info">Info</Badge>)
    const span = screen.getByText('Info')
    expect(span.className).toContain('bg-blue-100')
  })

  it('aplica variante gold', () => {
    render(<Badge variant="gold">Gold</Badge>)
    const span = screen.getByText('Gold')
    expect(span.className).toContain('bg-amber-100')
  })

  it('aplica variante default', () => {
    render(<Badge variant="default">Default</Badge>)
    const span = screen.getByText('Default')
    expect(span.className).toContain('bg-gray-100')
  })

  it('aplica tamaño sm por defecto', () => {
    render(<Badge>Test</Badge>)
    const span = screen.getByText('Test')
    expect(span.className).toContain('text-xs')
  })

  it('aplica tamaño lg', () => {
    render(<Badge size="lg">Big</Badge>)
    const span = screen.getByText('Big')
    expect(span.className).toContain('text-base')
  })

  it('aplica className personalizada', () => {
    render(<Badge className="my-class">Test</Badge>)
    const span = screen.getByText('Test')
    expect(span.className).toContain('my-class')
  })

  it('es inline-flex', () => {
    render(<Badge>Test</Badge>)
    const span = screen.getByText('Test')
    expect(span.className).toContain('inline-flex')
  })

  it('es rounded-full', () => {
    render(<Badge>Test</Badge>)
    const span = screen.getByText('Test')
    expect(span.className).toContain('rounded-full')
  })
})
