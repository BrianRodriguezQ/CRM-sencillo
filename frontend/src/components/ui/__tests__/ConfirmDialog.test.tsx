/**
 * Tests — ConfirmDialog component
 *
 * Modal confirmation dialog with variants, loading state, dismiss config.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConfirmDialog, isDismissed } from '../ConfirmDialog'

describe('ConfirmDialog', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    title: '¿Eliminar?',
    message: 'Esta acción es irreversible',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('no renderiza cuando isOpen=false', () => {
    const { container } = render(<ConfirmDialog {...defaultProps} isOpen={false} />)
    expect(container.innerHTML).toBe('')
  })

  it('renderiza título y mensaje cuando isOpen=true', () => {
    render(<ConfirmDialog {...defaultProps} />)
    expect(screen.getByText('¿Eliminar?')).toBeDefined()
    expect(screen.getByText('Esta acción es irreversible')).toBeDefined()
  })

  it('muestra label de confirmación por defecto "Confirmar"', () => {
    render(<ConfirmDialog {...defaultProps} />)
    expect(screen.getByText('Confirmar')).toBeDefined()
  })

  it('muestra label de confirmación personalizado', () => {
    render(<ConfirmDialog {...defaultProps} confirmLabel="Sí, borrar" />)
    expect(screen.getByText('Sí, borrar')).toBeDefined()
  })

  it('muestra botón Cancelar', () => {
    render(<ConfirmDialog {...defaultProps} />)
    expect(screen.getByText('Cancelar')).toBeDefined()
  })

  it('ejecuta onClose al hacer click en Cancelar', () => {
    const onClose = vi.fn()
    render(<ConfirmDialog {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByText('Cancelar'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ejecuta onConfirm al hacer click en Confirmar', () => {
    const onConfirm = vi.fn()
    render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByText('Confirmar'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('deshabilita botones cuando loading=true', () => {
    render(<ConfirmDialog {...defaultProps} loading />)
    const confirmBtn = screen.getByText('Confirmar').closest('button')!
    const cancelBtn = screen.getByText('Cancelar').closest('button')!
    expect(confirmBtn.disabled).toBe(true)
    expect(cancelBtn.disabled).toBe(true)
  })

  it('muestra spinner cuando loading=true', () => {
    const { container } = render(<ConfirmDialog {...defaultProps} loading />)
    const spinner = container.querySelector('.animate-spin')
    expect(spinner).toBeDefined()
  })

  it('aplica variante danger por defecto', () => {
    render(<ConfirmDialog {...defaultProps} />)
    const icon = screen.getByText('¿Eliminar?').closest('div')!.querySelector('.text-red-600')
    expect(icon).toBeDefined()
  })

  it('aplica variante warning', () => {
    render(<ConfirmDialog {...defaultProps} variant="warning" />)
    const icon = screen.getByText('¿Eliminar?').closest('div')!.querySelector('.text-orange-600')
    expect(icon).toBeDefined()
  })

  it('aplica variante info', () => {
    render(<ConfirmDialog {...defaultProps} variant="info" />)
    const icon = screen.getByText('¿Eliminar?').closest('div')!.querySelector('.text-blue-600')
    expect(icon).toBeDefined()
  })

  it('muestra checkbox de dismiss cuando se pasa dismiss config', () => {
    render(<ConfirmDialog {...defaultProps} dismiss={{ key: 'test-key' }} />)
    expect(screen.getByText('No volver a preguntar por 18 horas')).toBeDefined()
  })

  it('no muestra checkbox cuando no hay dismiss config', () => {
    render(<ConfirmDialog {...defaultProps} />)
    expect(screen.queryByText('No volver a preguntar')).toBeNull()
  })

  it('muestra label personalizado del dismiss', () => {
    render(<ConfirmDialog {...defaultProps} dismiss={{ key: 'k', label: 'Custom label' }} />)
    expect(screen.getByText('Custom label')).toBeDefined()
  })

  it('guarda en localStorage al confirmar con dismiss checked', () => {
    render(<ConfirmDialog {...defaultProps} dismiss={{ key: 'my-key' }} />)
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByText('Confirmar'))
    const stored = localStorage.getItem('spi-dismiss-my-key')
    expect(stored).not.toBeNull()
  })

  it('resetea checkbox al cancelar', () => {
    const { unmount } = render(<ConfirmDialog {...defaultProps} dismiss={{ key: 'k' }} />)
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox) // check
    fireEvent.click(screen.getByText('Cancelar')) // close → unmounts Modal
    unmount()
    // Re-open
    render(<ConfirmDialog {...defaultProps} dismiss={{ key: 'k' }} />)
    const newCheckbox = screen.getByRole('checkbox') as HTMLInputElement
    expect(newCheckbox.checked).toBe(false)
  })
})

describe('isDismissed', () => {
  beforeEach(() => localStorage.clear())

  it('retorna false cuando no hay nada en localStorage', () => {
    expect(isDismissed('test')).toBe(false)
  })

  it('retorna true cuando fue guardado recientemente', () => {
    localStorage.setItem('spi-dismiss-test', JSON.stringify({ t: Date.now() }))
    expect(isDismissed('test')).toBe(true)
  })

  it('retorna false cuando pasaron más de 18 horas', () => {
    const eighteenHoursAgo = Date.now() - 18 * 60 * 60 * 1000 - 1
    localStorage.setItem('spi-dismiss-test', JSON.stringify({ t: eighteenHoursAgo }))
    expect(isDismissed('test')).toBe(false)
  })

  it('retorna false cuando el JSON está corrupto', () => {
    localStorage.setItem('spi-dismiss-test', 'not-json')
    expect(isDismissed('test')).toBe(false)
  })

  it('limpió la key corrupta de localStorage', () => {
    localStorage.setItem('spi-dismiss-test', 'not-json')
    isDismissed('test')
    expect(localStorage.getItem('spi-dismiss-test')).toBeNull()
  })
})
