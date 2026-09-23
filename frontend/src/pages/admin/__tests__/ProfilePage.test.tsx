/**
 * Tests — ProfilePage (cambio de contraseña propio)
 *
 * Antes el botón "Cambiar contraseña" llamaba a `completePasswordChange` del
 * AuthContext, que exige un challenge token del login → siempre tiraba
 * "No hay cambio de contraseña pendiente". Ahora pega contra
 * POST /auth/change-password con la contraseña actual.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders, userEvent } from '../../../test/test-utils'

const mockFetchUser = vi.fn(async () => {})

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 7,
      name: 'operador Uno',
      email: 'operador1@nameemp.com',
      role: 'operador',
      isActive: true,
      mustChangePassword: false,
    },
    logout: vi.fn(),
    fetchUser: mockFetchUser,
  }),
}))

vi.mock('../../../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn() },
  setAuthToken: vi.fn(),
  getAuthToken: vi.fn(() => null),
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
  logoutServerSide: vi.fn(async () => {}),
  restoreSession: vi.fn(async () => false),
}))

// Aislado: el 2FA tiene sus propios tests.
vi.mock('../../../components/TwoFactorSection', () => ({
  TwoFactorSection: () => <div>sección 2FA</div>,
}))

import { api } from '../../../api/client'
import { ProfilePage } from '../ProfilePage'

const mockedPost = api.post as unknown as Mock

async function openChangePasswordForm() {
  await userEvent.click(screen.getByRole('button', { name: /Cambiar contraseña/ }))
}

describe('ProfilePage — cambiar contraseña', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('pide la contraseña actual y no llama al backend si la nueva es débil', async () => {
    renderWithProviders(<ProfilePage />, { skipAuth: true, skipTheme: true })

    await openChangePasswordForm()
    expect(screen.getByLabelText('Contraseña actual')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Contraseña actual'), 'Batista2026!')
    await userEvent.type(screen.getByLabelText('Nueva contraseña'), 'abc123')
    await userEvent.type(screen.getByLabelText('Confirmar contraseña'), 'abc123')
    await userEvent.click(screen.getByRole('button', { name: /Guardar nueva contraseña/ }))

    // El mensaje es el de la política real (8 + mayúscula, no el viejo "6 caracteres")
    expect(
      await screen.findByText('La contraseña debe tener al menos 8 caracteres'),
    ).toBeInTheDocument()
    expect(mockedPost).not.toHaveBeenCalled()
  })

  it('avisa si la nueva contraseña no coincide con la confirmación', async () => {
    renderWithProviders(<ProfilePage />, { skipAuth: true, skipTheme: true })

    await openChangePasswordForm()
    await userEvent.type(screen.getByLabelText('Contraseña actual'), 'Batista2026!')
    await userEvent.type(screen.getByLabelText('Nueva contraseña'), 'Batista2027!')
    await userEvent.type(screen.getByLabelText('Confirmar contraseña'), 'Batista2028!')
    await userEvent.click(screen.getByRole('button', { name: /Guardar nueva contraseña/ }))

    expect(await screen.findByText('Las contraseñas no coinciden')).toBeInTheDocument()
    expect(mockedPost).not.toHaveBeenCalled()
  })

  it('manda las dos contraseñas al backend, refresca el usuario y limpia el formulario', async () => {
    mockedPost.mockResolvedValueOnce({ success: true, data: { user: { id: 7 } } })

    renderWithProviders(<ProfilePage />, { skipAuth: true, skipTheme: true })

    await openChangePasswordForm()
    await userEvent.type(screen.getByLabelText('Contraseña actual'), 'Batista2026!')
    await userEvent.type(screen.getByLabelText('Nueva contraseña'), 'Batista2027!')
    await userEvent.type(screen.getByLabelText('Confirmar contraseña'), 'Batista2027!')
    await userEvent.click(screen.getByRole('button', { name: /Guardar nueva contraseña/ }))

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/auth/change-password', {
        currentPassword: 'Batista2026!',
        newPassword: 'Batista2027!',
      })
    })
    expect(await screen.findByText('Contraseña actualizada correctamente')).toBeInTheDocument()
    expect(mockFetchUser).toHaveBeenCalled()
    expect(screen.queryByLabelText('Contraseña actual')).not.toBeInTheDocument()
  })

  it('muestra el error del backend si la contraseña actual es incorrecta', async () => {
    mockedPost.mockRejectedValueOnce(new Error('La contraseña actual no es correcta'))

    renderWithProviders(<ProfilePage />, { skipAuth: true, skipTheme: true })

    await openChangePasswordForm()
    await userEvent.type(screen.getByLabelText('Contraseña actual'), 'NoEsLaMia1!')
    await userEvent.type(screen.getByLabelText('Nueva contraseña'), 'Batista2027!')
    await userEvent.type(screen.getByLabelText('Confirmar contraseña'), 'Batista2027!')
    await userEvent.click(screen.getByRole('button', { name: /Guardar nueva contraseña/ }))

    expect(await screen.findByText('La contraseña actual no es correcta')).toBeInTheDocument()
    expect(screen.queryByText('Contraseña actualizada correctamente')).not.toBeInTheDocument()
  })

  it('no llama al backend si falta la contraseña actual', async () => {
    renderWithProviders(<ProfilePage />, { skipAuth: true, skipTheme: true })

    await openChangePasswordForm()
    await userEvent.type(screen.getByLabelText('Nueva contraseña'), 'Batista2027!')
    await userEvent.type(screen.getByLabelText('Confirmar contraseña'), 'Batista2027!')
    await userEvent.click(screen.getByRole('button', { name: /Guardar nueva contraseña/ }))

    // El campo es obligatorio (required) y además el handler la valida.
    expect(mockedPost).not.toHaveBeenCalled()
  })
})
