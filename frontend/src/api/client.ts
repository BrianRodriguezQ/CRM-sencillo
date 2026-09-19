export interface ApiResponse<T> {
  success: boolean
  data: T
  error?: string
  total?: number
  page?: number
  perPage?: number
}

const BASE_URL = '/api'

export { BASE_URL }

/**
 * D2 — Manejo de tokens:
 *
 * - Access token (15 min): MEMORIA por pestaña. Nunca en storage.
 * - Refresh token (30 días): sessionStorage por pestaña.
 *   sessionStorage NO se comparte entre pestañas → mantiene la decisión original
 *   de sesiones independientes por pestaña (admin/cliente sin pisarse) y
 *   sobrevive F5 dentro de la pestaña.
 * - En 401: un único refresh en vuelo (cola) → retry del request original una vez.
 *   Si el refresh falla → logout limpio.
 */

let currentToken: string | null = null

const REFRESH_KEY = 'spi_refresh_token'

/** Llamado por AuthContext al loguear/logout o montar con sesión existente */
export function setAuthToken(token: string | null) {
  currentToken = token
}

/** Token access VIGENTE en memoria (para SSE hooks que reconectan) */
export function getAuthToken(): string | null {
  return currentToken
}

function getRefreshToken(): string | null {
  try {
    return sessionStorage.getItem(REFRESH_KEY)
  } catch {
    return null
  }
}

function saveRefreshToken(token: string) {
  try {
    sessionStorage.setItem(REFRESH_KEY, token)
  } catch {
    // storage bloqueado — sesión solo vive mientras no haya refresh necesario
  }
}

function clearRefreshToken() {
  try {
    sessionStorage.removeItem(REFRESH_KEY)
  } catch {
    // noop
  }
}

export function setTokens(accessToken: string, refreshToken?: string) {
  currentToken = accessToken
  if (refreshToken) saveRefreshToken(refreshToken)
}

export function clearTokens() {
  currentToken = null
  clearRefreshToken()
}

/* ── Refresh con deduplicación: N requests en 401 esperan UN solo refresh ── */

let refreshPromise: Promise<boolean> | null = null

async function performRefresh(): Promise<boolean> {
  const rt = getRefreshToken()
  if (!rt) return false

  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
    })

    if (!res.ok || res.status === 401 || res.status === 403) {
      clearRefreshToken()
      return false
    }

    const json = await res.json()
    if (!json.success || !json.data?.accessToken) {
      clearRefreshToken()
      return false
    }

    currentToken = json.data.accessToken
    // Rotación: si vino refresh nuevo, reemplazar; si no, conservar el actual (grace period)
    if (json.data.refreshToken) saveRefreshToken(json.data.refreshToken)
    return true
  } catch {
    return false
  }
}

function requestRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

/**
 * D2 — Restaurar sesión al montar la app (F5 dentro de la pestaña).
 * Usa el refresh token de sessionStorage para obtener un access token fresco.
 * Devuelve true si hay sesión activa restaurada.
 */
export async function restoreSession(): Promise<boolean> {
  if (!getRefreshToken()) return false
  return requestRefresh()
}

/** Logout silencioso: revoca la sesión server-side si hay refresh disponible */
export async function logoutServerSide(): Promise<void> {
  const rt = getRefreshToken()
  if (!rt) return
  try {
    await fetch(`${BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
    })
  } catch {
    // fire-and-forget
  }
}

/** Endpoints que NO deben triggerear hard redirect en 401 */
const AUTH_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/logout',
  '/auth/verify-2fa', // D1: código incorrecto no debe expulsar al usuario del flujo
  '/auth/complete-password-change', // D4: ídem para la rotación de contraseña temporal
]

/**
 * Extrae un mensaje legible del campo `error` de la respuesta.
 *
 * El backend devuelve `error` como string en los errores de negocio, pero
 * `@hono/zod-validator` lo devuelve como OBJETO ({ issues, name }). Sin esto,
 * `new Error(objeto)` terminaba mostrando "[object Object]" en pantalla.
 */
function extractErrorMessage(error: unknown, status: number): string {
  if (typeof error === 'string' && error.trim()) return error

  if (error && typeof error === 'object') {
    const issues = (error as { issues?: { message?: unknown }[] }).issues
    if (Array.isArray(issues)) {
      const messages = issues
        .map((issue) => (typeof issue?.message === 'string' ? issue.message : null))
        .filter((message): message is string => Boolean(message))
      if (messages.length) return messages.join('. ')
    }
  }

  return `Error ${status}`
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  isRetry = false,
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {}

  const token = getToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const isFormData = body instanceof FormData
  if (!isFormData) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: isFormData ? (body as FormData) : body ? JSON.stringify(body) : undefined,
  })

  // 401 con sesión refrescable → refresh + retry UNA vez antes de rendirse
  if (res.status === 401 && !isRetry && !AUTH_PATHS.includes(path)) {
    if (getRefreshToken()) {
      const refreshed = await requestRefresh()
      if (refreshed) {
        return request<T>(method, path, body, true)
      }
    }

    // Refresh imposible o fallido: logout limpio + redirect
    clearTokens()
    window.location.href = '/login'
    throw new Error('Sesión expirada')
  }

  const json = await res.json()

  if (!res.ok || !json.success) {
    throw new Error(extractErrorMessage(json.error, res.status))
  }

  return json
}

function getToken(): string | null {
  return currentToken
}

/**
 * Descarga de archivos binarios (PDF) respetando el par access-token/refresh.
 *
 * `downloaded: false` NO es un error: es el caso "no hay nada que generar"
 * (ej. el período no tiene entregas). El backend lo responde con 200 + JSON en
 * vez de un PDF, así que decide el que llama cómo avisarlo — aviso neutro, no
 * error rojo. Los errores de verdad (sin permiso, sesión vencida, 500) siguen
 * lanzando excepción.
 */
export type DownloadResult = { downloaded: boolean; message?: string }

export async function downloadFile(
  path: string,
  fallbackName = 'documento.pdf',
): Promise<DownloadResult> {
  const isRetry = false

  const doFetch = async (retry: boolean): Promise<Response> => {
    const headers: Record<string, string> = {}
    const token = getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`

    const res = await fetch(`${BASE_URL}${path}`, { headers })

    if (res.status === 401 && !retry) {
      if (getRefreshToken()) {
        const refreshed = await requestRefresh()
        if (refreshed) return doFetch(true)
      }
      clearTokens()
      window.location.href = '/login'
      throw new Error('Sesión expirada')
    }

    return res
  }

  const res = await doFetch(isRetry)

  if (!res.ok) {
    let message = `Error ${res.status}`
    try {
      const json = await res.json()
      message = extractErrorMessage(json?.error, res.status)
    } catch {
      // respuesta no-JSON (HTML de error, etc.) → mensaje genérico
    }
    throw new Error(message)
  }

  // "No hay nada que generar": 200 + JSON en lugar de un PDF → no se descarga nada.
  const contentType = res.headers.get('Content-Type') ?? ''
  if (contentType.includes('application/json')) {
    const json = (await res.json().catch(() => null)) as { message?: unknown } | null
    const message =
      typeof json?.message === 'string' && json.message.trim()
        ? json.message
        : 'No hay nada para descargar en el período seleccionado'
    return { downloaded: false, message }
  }

  const blob = await res.blob()

  // Nombre del archivo: preferir el Content-Disposition que emite el backend.
  const disposition = res.headers.get('Content-Disposition') ?? ''
  const match = /filename="?([^";]+)"?/i.exec(disposition)
  const filename = match?.[1] ?? fallbackName

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)

  return { downloaded: true }
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
  upload: <T>(path: string, formData: FormData) => request<T>('POST', path, formData),
}
