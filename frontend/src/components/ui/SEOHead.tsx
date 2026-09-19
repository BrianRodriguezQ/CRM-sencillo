import { useEffect } from 'react'

interface SEOProps {
  title: string
  description: string
  ogImage?: string
  ogType?: string
  canonical?: string
}

export function SEOHead({ title, description, ogImage, ogType = 'website', canonical }: SEOProps) {
  useEffect(() => {
    const fullTitle = `${title} | L&L System`
    document.title = fullTitle

    const setMeta = (name: string, content: string, property = false) => {
      const selector = property ? `meta[property="${name}"]` : `meta[name="${name}"]`
      let el = document.querySelector(selector) as HTMLMetaElement | null
      if (!el) {
        el = document.createElement('meta')
        if (property) el.setAttribute('property', name)
        else el.setAttribute('name', name)
        document.head.appendChild(el)
      }
      el.setAttribute('content', content)
    }

    setMeta('description', description)
    setMeta('og:title', fullTitle, true)
    setMeta('og:description', description, true)
    setMeta('og:type', ogType, true)
    if (ogImage) setMeta('og:image', ogImage, true)
    if (canonical) {
      let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null
      if (!link) {
        link = document.createElement('link')
        link.setAttribute('rel', 'canonical')
        document.head.appendChild(link)
      }
      link.setAttribute('href', canonical)
    }

    return () => {
      document.title = 'L&L System'
    }
  }, [title, description, ogImage, ogType, canonical])

  return null
}
