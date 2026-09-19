import { useEffect, useState } from 'react'
import { getAuthToken } from '../api/client'

/**
 * Cache module-level: clave = `url::token` → object URL.
 * Las imágenes autenticadas (avatar etc.) se fetchean con el Bearer token
 * y se convierten a blob → object URL para renderizar en <img>.
 * El cache evita refetchear la misma imagen en cada render/re-monta.
 * Acotado: son pocas imágenes y de tamaño chico (≤2MB).
 */
const cache = new Map<string, string>()

async function resolveAuthedImage(url: string, token: string): Promise<string> {
  const key = `${url}::${token}`
  const cached = cache.get(key)
  if (cached) return cached

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`img ${res.status}`)
  const blob = await res.blob()
  const objUrl = URL.createObjectURL(blob)
  cache.set(key, objUrl)
  return objUrl
}

const isSystemPath = (src?: string | null) => typeof src === 'string' && src.startsWith('/uploads/')

/**
 * Carga una imagen del sistema que requiere autenticación (ruta /uploads/...).
 * Devuelve un object URL estable mientras el token no cambie.
 * Para URLs externas o data: devuelve la url tal cual.
 * Si no hay token o falla, devuelve null (el Avatar cae en las iniciales).
 */
export function useAuthedImage(src?: string | null): string | null {
  const needsAuth = isSystemPath(src)
  const [resolved, setResolved] = useState<string | null>(null)

  useEffect(() => {
    if (!needsAuth || !src) return
    let cancelled = false
    const token = getAuthToken()
    if (!token) return
    resolveAuthedImage(src, token)
      .then((objUrl) => {
        if (!cancelled) setResolved(objUrl)
      })
      .catch(() => {
        if (!cancelled) setResolved(null)
      })
    return () => {
      cancelled = true
    }
  }, [src, needsAuth])

  // URLs externas / data no pasan por auth
  if (!needsAuth) return src ?? null
  return resolved
}
