/**
 * Tests — TwoFactorSection
 *
 * Estrategia: mockear api.client (respuestas del backend) y el módulo `qrcode`
 * (jsdom no tiene canvas). Verifica el flujo setup → QR → confirmar → códigos de
 * recuperación, y el estado ya activado con su desactivación.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders, userEvent } from '../../test/test-utils'

vi.mock('../../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn() },
  setAuthToken: vi.fn(),
  getAuthToken: vi.fn(() => null),
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
  logoutServerSide: vi.fn(async () => {}),
  restoreSession: vi.fn(async () => false),
}))

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(async () => 'data:image/png;base64,FAKE-QR') },
}))

import { api } from '../../api/client'
import { TwoFactorSection } from '../TwoFactorSection'

const mockedGet = api.get as unknown as Mock
const mockedPost = api.post as unknown as Mock

describe('TwoFactorSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('muestra el estado desactivado y arranca la configuración (secret + QR)', async () => {
    mockedGet.mockResolvedValueOnce({ success: true, data: { enabled: false } })
    mockedPost.mockResolvedValueOnce({
      success: true,
      data: { secret: 'JBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://totp/CRM%20Batista:x?secret=X' },
    })

    renderWithProviders(<TwoFactorSection />, { skipAuth: true, skipTheme: true })

    expect(await screen.findByText('Desactivado')).toBeInTheDocument()
    expect(screen.getByText(/Agregá una capa extra de seguridad/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Activar 2FA/ }))

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/auth/2fa/setup', {})
    })
    expect(await screen.findByAltText('Código QR para configurar 2FA')).toBeInTheDocument()
    expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument()
  })

  it('activa el 2FA con el código y muestra los códigos de recuperación', async () => {
    mockedGet.mockResolvedValue({ success: true, data: { enabled: false } })
    mockedPost
      .mockResolvedValueOnce({
        success: true,
        data: { secret: 'JBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://totp/x' },
      })
      .mockResolvedValueOnce({ success: true, data: { recoveryCodes: ['AAA-111', 'BBB-222'] } })

    renderWithProviders(<TwoFactorSection />, { skipAuth: true, skipTheme: true })

    await userEvent.click(await screen.findByRole('button', { name: /Activar 2FA/ }))

    const codeInput = await screen.findByLabelText('2. Código de 6 dígitos de la app')
    await userEvent.type(codeInput, '123456')
    await userEvent.click(screen.getByRole('button', { name: /Confirmar y activar/ }))

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/auth/2fa/enable', { code: '123456' })
    })
    expect(await screen.findByText('Guardá estos códigos AHORA')).toBeInTheDocument()
    expect(screen.getByText('AAA-111')).toBeInTheDocument()
    expect(screen.getByText('BBB-222')).toBeInTheDocument()
  })

  it('copia la lista completa de códigos de recuperación al portapapeles', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    mockedGet.mockResolvedValue({ success: true, data: { enabled: false } })
    mockedPost
      .mockResolvedValueOnce({
        success: true,
        data: { secret: 'JBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://totp/x' },
      })
      .mockResolvedValueOnce({ success: true, data: { recoveryCodes: ['AAA-111', 'BBB-222'] } })

    renderWithProviders(<TwoFactorSection />, { skipAuth: true, skipTheme: true })

    await userEvent.click(await screen.findByRole('button', { name: /Activar 2FA/ }))
    await userEvent.type(await screen.findByLabelText('2. Código de 6 dígitos de la app'), '123456')
    await userEvent.click(screen.getByRole('button', { name: /Confirmar y activar/ }))

    await screen.findByText('Guardá estos códigos AHORA')
    await userEvent.click(screen.getByRole('button', { name: /Copiar códigos/ }))

    expect(writeText).toHaveBeenCalledWith('AAA-111\nBBB-222')
    expect(await screen.findByText('Códigos copiados')).toBeInTheDocument()
  })

  it('avisa si el código de la app es incorrecto', async () => {
    mockedGet.mockResolvedValueOnce({ success: true, data: { enabled: false } })
    mockedPost
      .mockResolvedValueOnce({
        success: true,
        data: { secret: 'JBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://totp/x' },
      })
      .mockRejectedValueOnce(new Error('Código incorrecto. Probá con el código actual de tu app.'))

    renderWithProviders(<TwoFactorSection />, { skipAuth: true, skipTheme: true })

    await userEvent.click(await screen.findByRole('button', { name: /Activar 2FA/ }))
    await userEvent.type(await screen.findByLabelText('2. Código de 6 dígitos de la app'), '000000')
    await userEvent.click(screen.getByRole('button', { name: /Confirmar y activar/ }))

    expect(
      await screen.findByText('Código incorrecto. Probá con el código actual de tu app.'),
    ).toBeInTheDocument()
  })

  it('exige la contraseña para desactivar y la manda al backend', async () => {
    mockedGet.mockResolvedValueOnce({ success: true, data: { enabled: true } })
    mockedPost.mockResolvedValue({ success: true, data: { enabled: false } })

    renderWithProviders(<TwoFactorSection />, { skipAuth: true, skipTheme: true })

    expect(await screen.findByText('Activado')).toBeInTheDocument()

    // Sin contraseña no llama al backend
    await userEvent.click(screen.getByRole('button', { name: /Desactivar 2FA/ }))
    expect(await screen.findByText('Ingresá tu contraseña para confirmar')).toBeInTheDocument()
    expect(mockedPost).not.toHaveBeenCalled()

    await userEvent.type(screen.getByLabelText('Contraseña'), 'Batista2026!')
    await userEvent.click(screen.getByRole('button', { name: /Desactivar 2FA/ }))

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/auth/2fa/disable', { password: 'Batista2026!' })
    })
  })

  it('avisa si no se pudo consultar el estado del 2FA', async () => {
    mockedGet.mockRejectedValueOnce(new Error('boom'))

    renderWithProviders(<TwoFactorSection />, { skipAuth: true, skipTheme: true })

    expect(
      await screen.findByText('No se pudo consultar el estado del 2FA. Recargá la página.'),
    ).toBeInTheDocument()
  })
})
