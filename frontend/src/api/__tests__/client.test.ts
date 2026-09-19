/**
 * Tests — API Client
 *
 * Estrategia: mockear fetch global y storage.
 * Verificar que:
 * - GET/POST/PUT/DELETE funcionan
 * - Authorization header se envía con token
 * - 401 sin refresh → redirige a /login y limpia tokens (D2)
 * - 401 con refresh → refresh + retry del request original
 * - Errores se lanzan correctamente
 * - FormData se maneja sin Content-Type
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api, setAuthToken, setTokens, clearTokens } from '../client'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock window.location
const mockLocation = { href: '' }
Object.defineProperty(window, 'location', { value: mockLocation, writable: true })

function mockResponse(overrides: Partial<Response> = {}): Response {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({ success: true, data: { id: 1 } }),
    headers: new Headers(),
    redirected: false,
    statusText: 'OK',
    type: 'basic',
    url: '',
    clone: vi.fn(),
    body: null,
    bodyUsed: false,
    arrayBuffer: vi.fn(),
    blob: vi.fn(),
    formData: vi.fn(),
    text: vi.fn(),
    ...overrides,
  } as unknown as Response
}

beforeEach(() => {
  mockFetch.mockReset()
  mockLocation.href = ''
  clearTokens()
  setAuthToken(null)
  localStorage.clear()
  sessionStorage.clear()
})

describe('api.get', () => {
  it('hace GET a la URL correcta', async () => {
    mockFetch.mockResolvedValue(mockResponse())
    await api.get('/test')
    expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({ method: 'GET' }))
  })

  it('devuelve data tipada', async () => {
    mockFetch.mockResolvedValue(mockResponse())
    const result = await api.get<{ id: number }>('/test')
    expect(result.data).toEqual({ id: 1 })
  })
})

describe('api.post', () => {
  it('hace POST con body JSON', async () => {
    mockFetch.mockResolvedValue(mockResponse())
    await api.post('/test', { name: 'test' })
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'test' }),
      }),
    )
  })
})

describe('api.put', () => {
  it('hace PUT con body JSON', async () => {
    mockFetch.mockResolvedValue(mockResponse())
    await api.put('/test/1', { name: 'updated' })
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/test/1',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ name: 'updated' }),
      }),
    )
  })
})

describe('api.del', () => {
  it('hace DELETE', async () => {
    mockFetch.mockResolvedValue(mockResponse())
    await api.del('/test/1')
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/test/1',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })
})

describe('api.upload', () => {
  it('hace POST con FormData sin Content-Type', async () => {
    mockFetch.mockResolvedValue(mockResponse())
    const formData = new FormData()
    formData.append('file', 'test')
    await api.upload('/test/upload', formData)
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/test/upload',
      expect.objectContaining({
        method: 'POST',
        body: formData,
      }),
    )
  })
})

describe('Authorization header', () => {
  it('incluye token si existe en memoria', async () => {
    setAuthToken('mi-token')
    mockFetch.mockResolvedValue(mockResponse())
    await api.get('/test')
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer mi-token' }),
      }),
    )
  })

  it('no incluye Authorization si no hay token', async () => {
    mockFetch.mockResolvedValue(mockResponse())
    await api.get('/test')
    const callHeaders = mockFetch.mock.calls[0][1].headers
    expect(callHeaders.Authorization).toBeUndefined()
  })
})

describe('Error handling', () => {
  it('lanza error si fetch falla', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))
    await expect(api.get('/test')).rejects.toThrow('Network error')
  })

  it('lanza error si response no es ok', async () => {
    mockFetch.mockResolvedValue(
      mockResponse({
        ok: false,
        status: 400,
        json: vi.fn().mockResolvedValue({ success: false, error: 'Bad request' }),
      }),
    )
    await expect(api.get('/test')).rejects.toThrow('Bad request')
  })

  it('lanza error genérico si no hay mensaje', async () => {
    mockFetch.mockResolvedValue(
      mockResponse({
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValue({ success: false }),
      }),
    )
    await expect(api.get('/test')).rejects.toThrow('Error 500')
  })

  it('redirige a /login en 401 sin refresh disponible y limpia tokens', async () => {
    setAuthToken('token-expirado')
    mockFetch.mockResolvedValue(
      mockResponse({
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({ success: false, error: 'No autorizado' }),
      }),
    )
    await expect(api.get('/test')).rejects.toThrow('Sesión expirada')
    expect(sessionStorage.getItem('spi_refresh_token')).toBeNull()
    expect(mockLocation.href).toBe('/login')
  })

  it('D2: 401 con refresh válido → refresca y reintentá el request original', async () => {
    setTokens('access-viejo', 'refresh-guardado')

    // 1er call: request original → 401. 2do: refresh OK. 3er call: retry OK.
    mockFetch
      .mockResolvedValueOnce(
        mockResponse({
          ok: false,
          status: 401,
          json: vi.fn().mockResolvedValue({ success: false, error: 'No autorizado' }),
        }),
      )
      .mockResolvedValueOnce(
        mockResponse({
          json: vi.fn().mockResolvedValue({
            success: true,
            data: { accessToken: 'access-nuevo', refreshToken: 'refresh-nuevo' },
          }),
        }),
      )
      .mockResolvedValueOnce(mockResponse())

    const result = await api.get<{ id: number }>('/test')
    expect(result.data).toEqual({ id: 1 })

    // El retry debe llevar el access token NUEVO
    const retryCall = mockFetch.mock.calls[2]
    expect(retryCall[1].headers.Authorization).toBe('Bearer access-nuevo')
    // Rotación guardada en sessionStorage
    expect(sessionStorage.getItem('spi_refresh_token')).toBe('refresh-nuevo')
    expect(mockLocation.href).not.toBe('/login')
  })

  it('D2: 401 con refresh rechazado → logout y redirect', async () => {
    setTokens('access-viejo', 'refresh-invalido')

    mockFetch
      .mockResolvedValueOnce(
        mockResponse({
          ok: false,
          status: 401,
          json: vi.fn().mockResolvedValue({ success: false, error: 'No autorizado' }),
        }),
      )
      .mockResolvedValueOnce(
        mockResponse({
          ok: false,
          status: 401,
          json: vi.fn().mockResolvedValue({ success: false, error: 'Refresh inválido' }),
        }),
      )

    await expect(api.get('/test')).rejects.toThrow('Sesión expirada')
    expect(mockLocation.href).toBe('/login')
  })
})

describe('Content-Type header', () => {
  it('setea application/json para requests normales', async () => {
    mockFetch.mockResolvedValue(mockResponse())
    await api.post('/test', {})
    const callHeaders = mockFetch.mock.calls[0][1].headers
    expect(callHeaders['Content-Type']).toBe('application/json')
  })

  it('NO setea Content-Type para FormData', async () => {
    mockFetch.mockResolvedValue(mockResponse())
    await api.upload('/test', new FormData())
    const callHeaders = mockFetch.mock.calls[0][1].headers
    expect(callHeaders['Content-Type']).toBeUndefined()
  })
})
