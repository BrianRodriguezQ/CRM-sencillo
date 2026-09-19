/**
 * Tests — Skeleton component
 *
 * Renders table, card, and text variants with correct structure.
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Skeleton } from '../Skeleton'

describe('Skeleton', () => {
  describe('text variant (default)', () => {
    it('renderiza 3 líneas por defecto', () => {
      const { container } = render(<Skeleton />)
      const pulses = container.querySelectorAll('.animate-pulse')
      expect(pulses.length).toBe(3)
    })

    it('renderiza cantidad exacta de líneas cuando se pasa lines', () => {
      const { container } = render(<Skeleton lines={5} />)
      const pulses = container.querySelectorAll('.animate-pulse')
      expect(pulses.length).toBe(5)
    })

    it('aplica className personalizada', () => {
      const { container } = render(<Skeleton className="my-class" />)
      const wrapper = container.firstChild as HTMLElement
      expect(wrapper.className).toContain('my-class')
    })
  })

  describe('table variant', () => {
    it('renderiza header + 5 rows', () => {
      const { container } = render(<Skeleton variant="table" />)
      // Header: 5 pulses (3 visible + 1 sm:block + 1 ml-auto)
      // 5 rows × 2 pulses each (col + actions) + 5 row main pulses
      const rows = container.querySelectorAll('.border-b')
      expect(rows.length).toBe(5)
    })
  })

  describe('card variant', () => {
    it('renderiza 6 card placeholders', () => {
      const { container } = render(<Skeleton variant="card" />)
      const cards = container.querySelectorAll('.rounded-xl.border')
      // 6 card divs + the grid wrapper
      expect(cards.length).toBeGreaterThanOrEqual(6)
    })
  })
})
