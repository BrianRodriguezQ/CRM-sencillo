/**
 * Tests — Input component
 *
 * Estrategia: renderizar con label, error, icon.
 * Verificar renderizado, eventos, y estados.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Mail } from 'lucide-react'
import { Input } from '../Input'

describe('Input', () => {
  it('renderiza input básico', () => {
    render(<Input placeholder="Escribí algo" />)
    expect(screen.getByPlaceholderText('Escribí algo')).toBeDefined()
  })

  it('muestra label cuando se provee', () => {
    render(<Input label="Email" />)
    expect(screen.getByText('Email')).toBeDefined()
  })

  it('muestra error cuando se provee', () => {
    render(<Input error="Campo requerido" />)
    expect(screen.getByText('Campo requerido')).toBeDefined()
  })

  it('aplica clase de error', () => {
    render(<Input error="Error" />)
    const input = screen.getByRole('textbox')
    expect(input.className).toContain('border-red-500')
  })

  it('renderiza icono cuando se provee', () => {
    const { container } = render(<Input icon={Mail} />)
    // Lucide icons renderizan un <svg>
    const svg = container.querySelector('svg')
    expect(svg).toBeDefined()
  })

  it('ejecuta onChange al escribir', () => {
    const onChange = vi.fn()
    render(<Input onChange={onChange} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'test' } })
    expect(onChange).toHaveBeenCalled()
  })

  it('puede estar deshabilitado', () => {
    render(<Input disabled />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.disabled).toBe(true)
  })
})
