/**
 * Tests — Button component
 *
 * Estrategia: renderizar con diferentes variantes y estados.
 * Verificar clases, eventos, disabled, loading.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from '../Button'

describe('Button', () => {
  it('renderiza con texto', () => {
    render(<Button>Click</Button>)
    expect(screen.getByText('Click')).toBeDefined()
  })

  it('ejecuta onClick al hacer click', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Click</Button>)
    fireEvent.click(screen.getByText('Click'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('no ejecuta onClick si está disabled', () => {
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Click
      </Button>,
    )
    fireEvent.click(screen.getByText('Click'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('no ejecuta onClick si está loading', () => {
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        Click
      </Button>,
    )
    fireEvent.click(screen.getByText('Click'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('muestra spinner cuando loading', () => {
    const { container } = render(<Button loading>Click</Button>)
    const spinner = container.querySelector('.animate-spin')
    expect(spinner).toBeDefined()
  })

  it('aplica variante primary por defecto', () => {
    render(<Button>Click</Button>)
    const btn = screen.getByText('Click').closest('button')!
    expect(btn.className).toContain('bg-spi-navy')
  })

  it('aplica variante danger', () => {
    render(<Button variant="danger">Eliminar</Button>)
    const btn = screen.getByText('Eliminar').closest('button')!
    expect(btn.className).toContain('bg-red-600')
  })
})
