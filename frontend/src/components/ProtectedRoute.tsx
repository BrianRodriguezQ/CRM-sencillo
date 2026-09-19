import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Loader2 } from 'lucide-react'

export function ProtectedRoute() {
  const { user, token, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-spi-navy">
        <Loader2 className="h-8 w-8 animate-spin text-spi-gold" />
      </div>
    )
  }

  if (!token || !user) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
