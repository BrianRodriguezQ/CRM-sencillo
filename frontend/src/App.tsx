import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { AdminLayout } from './components/AdminLayout'
import { AuthPage } from './pages/AuthPage'
import { NotFound } from './pages/NotFound'
import { DashboardPage } from './pages/admin/DashboardPage'
import { OrdersPage } from './pages/admin/OrdersPage'
import { NewOrderPage } from './pages/admin/NewOrderPage'
import { OrderDetailPage } from './pages/admin/OrderDetailPage'
import { CustomersPage } from './pages/admin/CustomersPage'
import { CustomerDetailPage } from './pages/admin/CustomerDetailPage'
import { DriversPage } from './pages/admin/DriversPage'
import { SellersPage } from './pages/admin/SellersPage'
import { TeamPage } from './pages/admin/TeamPage'
import { TeamMemberDetailPage } from './pages/admin/TeamMemberDetailPage'
import { PaymentMethodsPage } from './pages/admin/PaymentMethodsPage'
import { NotasEntregaPage } from './pages/admin/NotasEntregaPage'
import { ProfilePage } from './pages/admin/ProfilePage'
import { EntregaPublicaPage } from './pages/EntregaPublicaPage'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<NotFound />} />
        </Route>

        <Route path="/login" element={<AuthPage />} />

        {/* WP3: ficha digital pública — la escanea el cliente desde el QR impreso.
            No requiere sesión: es el "respaldo vivo" anti-estafa de la entrega. */}
        <Route path="/entrega/:token" element={<EntregaPublicaPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="ordenes" element={<OrdersPage />} />
            <Route path="ordenes/nueva" element={<NewOrderPage />} />
            <Route path="ordenes/:id" element={<OrderDetailPage />} />
            <Route path="clientes" element={<CustomersPage />} />
            <Route path="clientes/:id" element={<CustomerDetailPage />} />
            {/* Ruta legacy → Equipo/Conductores (CTO 2026-09-18, decisión 1-B). */}
            <Route path="conductores" element={<Navigate to="/admin/equipo/conductores" replace />} />
            <Route path="equipo" element={<TeamPage />} />
            <Route path="equipo/conductores" element={<DriversPage />} />
            <Route path="equipo/operadores" element={<SellersPage />} />
            <Route path="equipo/:id" element={<TeamMemberDetailPage />} />
            <Route path="metodos-pago" element={<PaymentMethodsPage />} />
            <Route path="notas-entrega" element={<NotasEntregaPage />} />
            <Route path="perfil" element={<ProfilePage />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  )
}
