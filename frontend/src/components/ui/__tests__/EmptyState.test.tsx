/**
 * Tests — EmptyState component
 *
 * Estrategia: renderizar con title, description, action, icon.
 * Verificar que se muestran los elementos correctos.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FileX } from 'lucide-react'
import { EmptyState } from '../EmptyState'

describe('EmptyState', () => {
  it('muestra el título', () => {
    render(<EmptyState title="Sin resultados" />)
    expect(screen.getByText('Sin resultados')).toBeDefined()
  })

  it('muestra descripción cuando se provee', () => {
    render(<EmptyState title="Vacío" description="No hay elementos para mostrar" />)
    expect(screen.getByText('No hay elementos para mostrar')).toBeDefined()
  })

  it('no muestra descripción si no se provee', () => {
    render(<EmptyState title="Solo título" />)
    expect(screen.queryByText('No hay elementos')).toBeNull()
  })

  it('muestra botón de acción cuando se provee', () => {
    render(<EmptyState title="Vacío" action={{ label: 'Crear nuevo', onClick: () => {} }} />)
    expect(screen.getByText('Crear nuevo')).toBeDefined()
  })

  it('ejecuta onClick del botón de acción', () => {
    const onClick = vi.fn()
    render(<EmptyState title="Vacío" action={{ label: 'Crear', onClick }} />)
    fireEvent.click(screen.getByText('Crear'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renderiza icono cuando se provee', () => {
    const { container } = render(<EmptyState title="Vacío" icon={FileX} />)
    const svg = container.querySelector('svg')
    expect(svg).toBeDefined()
  })
})
