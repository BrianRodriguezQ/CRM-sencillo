/**
 * Tests — Modal component
 *
 * Estrategia: renderizar con isOpen=true/false.
 * Verificar título, children, footer, close button.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Modal } from '../Modal'

describe('Modal', () => {
  it('no renderiza nada si isOpen=false', () => {
    const { container } = render(
      <Modal isOpen={false} onClose={() => {}}>
        <p>contenido</p>
      </Modal>,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renderiza contenido si isOpen=true', () => {
    render(
      <Modal isOpen={true} onClose={() => {}}>
        <p>contenido</p>
      </Modal>,
    )
    expect(screen.getByText('contenido')).toBeDefined()
  })

  it('muestra el título', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Mi Modal">
        <p>contenido</p>
      </Modal>,
    )
    expect(screen.getByText('Mi Modal')).toBeDefined()
  })

  it('cierra al hacer click en el overlay', () => {
    const onClose = vi.fn()
    render(
      <Modal isOpen={true} onClose={onClose}>
        <p>contenido</p>
      </Modal>,
    )
    // El overlay tiene bg-black/50
    const overlay = document.querySelector('.bg-black\\/50')
    if (overlay) fireEvent.click(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('cierra al hacer click en el botón X', () => {
    const onClose = vi.fn()
    render(
      <Modal isOpen={true} onClose={onClose} title="Con X">
        <p>contenido</p>
      </Modal>,
    )
    const closeBtn = screen.getByRole('button', { name: '' }) // X icon button
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalled()
  })

  it('renderiza footer cuando se provee', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} footer={<button>Guardar</button>}>
        <p>contenido</p>
      </Modal>,
    )
    expect(screen.getByText('Guardar')).toBeDefined()
  })

  it('bloquea scroll del body cuando está abierto', () => {
    render(
      <Modal isOpen={true} onClose={() => {}}>
        <p>contenido</p>
      </Modal>,
    )
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('restaura scroll del body al cerrar', () => {
    const { unmount } = render(
      <Modal isOpen={true} onClose={() => {}}>
        <p>contenido</p>
      </Modal>,
    )
    unmount()
    expect(document.body.style.overflow).toBe('')
  })
})
