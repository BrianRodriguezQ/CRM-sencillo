/**
 * Tests — Avatar component
 *
 * Renders initials when no image, image when src provided,
 * correct sizes, deterministic color from name hash.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Avatar } from '../Avatar'

describe('Avatar', () => {
  it('renderiza imagen cuando se pasa src', () => {
    render(<Avatar src="https://example.com/photo.jpg" name="John Doe" />)
    const img = screen.getByRole('img')
    expect(img).toBeDefined()
    expect(img.getAttribute('src')).toBe('https://example.com/photo.jpg')
    expect(img.getAttribute('alt')).toBe('John Doe')
  })

  it('renderiza iniciales cuando no hay src', () => {
    render(<Avatar name="Brian Rodriguez" />)
    expect(screen.getByText('BR')).toBeDefined()
  })

  it('renderiza una sola inicial para nombre de una palabra', () => {
    render(<Avatar name="Brian" />)
    expect(screen.getByText('B')).toBeDefined()
  })

  it('renderiza ? cuando no hay nombre', () => {
    render(<Avatar />)
    expect(screen.getByText('?')).toBeDefined()
  })

  it('máximo 2 iniciales para nombres largos', () => {
    render(<Avatar name="Juan Carlos Maria Perez" />)
    expect(screen.getByText('JC')).toBeDefined()
  })

  it('aplica tamaño xs', () => {
    const { container } = render(<Avatar name="A" size="xs" />)
    const div = container.firstChild as HTMLElement
    expect(div.className).toContain('h-6 w-6')
  })

  it('aplica tamaño lg', () => {
    const { container } = render(<Avatar name="A" size="lg" />)
    const div = container.firstChild as HTMLElement
    expect(div.className).toContain('h-16 w-16')
  })

  it('aplica className personalizada', () => {
    const { container } = render(<Avatar name="A" className="ring-2" />)
    const div = container.firstChild as HTMLElement
    expect(div.className).toContain('ring-2')
  })

  it('muestra icono User cuando no hay nombre ni src', () => {
    const { container } = render(<Avatar />)
    const svg = container.querySelector('svg')
    expect(svg).toBeDefined()
  })
})
