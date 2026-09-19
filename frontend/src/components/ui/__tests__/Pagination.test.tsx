/**
 * Tests — Pagination component
 *
 * Estrategia: renderizar con diferentes configuraciones de página.
 * Verificar navegación, info, botones disabled.
 * NOTA: Usar function matchers porque el texto está fragmentado en múltiples <span>.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Pagination } from '../Pagination'

describe('Pagination', () => {
  it('muestra "Sin resultados" si total=0', () => {
    render(<Pagination page={1} perPage={10} total={0} onPageChange={() => {}} />)
    expect(screen.getByText('Sin resultados')).toBeDefined()
  })

  it('muestra rango correcto en página 1', () => {
    const { container } = render(
      <Pagination page={1} perPage={10} total={25} onPageChange={() => {}} />,
    )
    expect(container.textContent).toContain('Mostrando')
    expect(container.textContent).toContain('1')
    expect(container.textContent).toContain('10')
    expect(container.textContent).toContain('25')
  })

  it('muestra rango correcto en página 3', () => {
    const { container } = render(
      <Pagination page={3} perPage={10} total={25} onPageChange={() => {}} />,
    )
    expect(container.textContent).toContain('21')
    expect(container.textContent).toContain('25')
  })

  it('deshabilita "Anterior" en primera página', () => {
    render(<Pagination page={1} perPage={10} total={50} onPageChange={() => {}} />)
    const prevBtn = screen.getByLabelText('Página anterior')
    expect((prevBtn as HTMLButtonElement).disabled).toBe(true)
  })

  it('deshabilita "Siguiente" en última página', () => {
    render(<Pagination page={5} perPage={10} total={50} onPageChange={() => {}} />)
    const nextBtn = screen.getByLabelText('Página siguiente')
    expect((nextBtn as HTMLButtonElement).disabled).toBe(true)
  })

  it('navega a anterior al hacer click', () => {
    const onPageChange = vi.fn()
    render(<Pagination page={3} perPage={10} total={50} onPageChange={onPageChange} />)
    fireEvent.click(screen.getByLabelText('Página anterior'))
    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it('navega a siguiente al hacer click', () => {
    const onPageChange = vi.fn()
    render(<Pagination page={3} perPage={10} total={50} onPageChange={onPageChange} />)
    fireEvent.click(screen.getByLabelText('Página siguiente'))
    expect(onPageChange).toHaveBeenCalledWith(4)
  })

  it('muestra totalPages correcto', () => {
    const { container } = render(
      <Pagination page={1} perPage={10} total={33} onPageChange={() => {}} />,
    )
    // totalPages = ceil(33/10) = 4 → se muestra como "1 / 4"
    expect(container.textContent).toContain('1 / 4')
  })

  it('renderiza selector de items por página si onPerPageChange existe', () => {
    render(
      <Pagination
        page={1}
        perPage={10}
        total={100}
        onPageChange={() => {}}
        onPerPageChange={() => {}}
      />,
    )
    expect(screen.getByText('Por pág:')).toBeDefined()
  })

  it('no renderiza selector si onPerPageChange no existe', () => {
    render(<Pagination page={1} perPage={10} total={100} onPageChange={() => {}} />)
    expect(screen.queryByText('Por pág:')).toBeNull()
  })
})
