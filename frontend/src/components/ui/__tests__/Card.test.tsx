/**
 * Tests — Card component
 *
 * Renders children, applies padding, clickable variant, custom className.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Card } from '../Card'

describe('Card', () => {
  it('renderiza children', () => {
    render(<Card>Content</Card>)
    expect(screen.getByText('Content')).toBeDefined()
  })

  it('aplica padding por defecto', () => {
    const { container } = render(<Card>Content</Card>)
    const div = container.firstChild as HTMLElement
    expect(div.className).toContain('p-6')
  })

  it('quita padding cuando padding=false', () => {
    const { container } = render(<Card padding={false}>Content</Card>)
    const div = container.firstChild as HTMLElement
    expect(div.className).not.toContain('p-6')
  })

  it('renderiza como div por defecto', () => {
    const { container } = render(<Card>Content</Card>)
    const div = container.firstChild as HTMLElement
    expect(div.tagName).toBe('DIV')
  })

  it('renderiza como button cuando tiene onClick', () => {
    const { container } = render(<Card onClick={() => {}}>Clickable</Card>)
    const btn = container.firstChild as HTMLElement
    expect(btn.tagName).toBe('BUTTON')
  })

  it('ejecuta onClick al hacer click', () => {
    const onClick = vi.fn()
    render(<Card onClick={onClick}>Click me</Card>)
    fireEvent.click(screen.getByText('Click me'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('aplica className personalizada', () => {
    const { container } = render(<Card className="extra">Content</Card>)
    const div = container.firstChild as HTMLElement
    expect(div.className).toContain('extra')
  })

  it('siempre tiene rounded-xl y border', () => {
    const { container } = render(<Card>Content</Card>)
    const div = container.firstChild as HTMLElement
    expect(div.className).toContain('rounded-xl')
    expect(div.className).toContain('border')
  })
})
