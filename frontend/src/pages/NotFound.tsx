import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'

export function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-4">
      <h1 className="text-8xl font-bold text-spi-text">404</h1>
      <p className="mt-4 text-xl text-gray-600">Página no encontrada</p>
      <p className="mt-2 text-gray-500">La página que buscas no existe o fue movida.</p>
      <Link to="/" className="mt-8">
        <Button>Volver al inicio</Button>
      </Link>
    </div>
  )
}
