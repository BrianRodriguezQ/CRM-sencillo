/**
 * Tests — SEOHead component
 *
 * Sets document.title and meta tags on mount, cleans up on unmount.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { SEOHead } from '../SEOHead'

describe('SEOHead', () => {
  afterEach(() => {
    document.title = 'L&L System'
    // Clean up meta tags
    document.querySelectorAll('meta[property^="og:"]').forEach((el) => el.remove())
    document.querySelectorAll('meta[name="description"]').forEach((el) => el.remove())
    document.querySelectorAll('link[rel="canonical"]').forEach((el) => el.remove())
  })

  it('setea document.title al montar', () => {
    render(<SEOHead title="Dashboard" description="Main dashboard" />)
    expect(document.title).toBe('Dashboard | L&L System')
  })

  it('setea meta description', () => {
    render(<SEOHead title="Test" description="Test description" />)
    const meta = document.querySelector('meta[name="description"]') as HTMLMetaElement
    expect(meta).toBeDefined()
    expect(meta.getAttribute('content')).toBe('Test description')
  })

  it('setea og:title', () => {
    render(<SEOHead title="Page" description="Desc" />)
    const meta = document.querySelector('meta[property="og:title"]') as HTMLMetaElement
    expect(meta).toBeDefined()
    expect(meta.getAttribute('content')).toBe('Page | L&L System')
  })

  it('setea og:description', () => {
    render(<SEOHead title="P" description="My desc" />)
    const meta = document.querySelector('meta[property="og:description"]') as HTMLMetaElement
    expect(meta).toBeDefined()
    expect(meta.getAttribute('content')).toBe('My desc')
  })

  it('setea og:type por defecto a website', () => {
    render(<SEOHead title="P" description="D" />)
    const meta = document.querySelector('meta[property="og:type"]') as HTMLMetaElement
    expect(meta.getAttribute('content')).toBe('website')
  })

  it('setea og:type personalizado', () => {
    render(<SEOHead title="P" description="D" ogType="article" />)
    const meta = document.querySelector('meta[property="og:type"]') as HTMLMetaElement
    expect(meta.getAttribute('content')).toBe('article')
  })

  it('setea og:image cuando se provee', () => {
    render(<SEOHead title="P" description="D" ogImage="https://example.com/img.png" />)
    const meta = document.querySelector('meta[property="og:image"]') as HTMLMetaElement
    expect(meta).toBeDefined()
    expect(meta.getAttribute('content')).toBe('https://example.com/img.png')
  })

  it('no setea og:image cuando no se provee', () => {
    render(<SEOHead title="P" description="D" />)
    const meta = document.querySelector('meta[property="og:image"]')
    expect(meta).toBeNull()
  })

  it('setea canonical cuando se provee', () => {
    render(<SEOHead title="P" description="D" canonical="https://example.com/page" />)
    const link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement
    expect(link).toBeDefined()
    expect(link.getAttribute('href')).toBe('https://example.com/page')
  })

  it('no setea canonical cuando no se provee', () => {
    render(<SEOHead title="P" description="D" />)
    const link = document.querySelector('link[rel="canonical"]')
    expect(link).toBeNull()
  })

  it('restaura document.title al desmontar', () => {
    const { unmount } = render(<SEOHead title="Temp" description="T" />)
    expect(document.title).toBe('Temp | L&L System')
    unmount()
    expect(document.title).toBe('L&L System')
  })
})
