import { Link } from 'react-router-dom';
import { LogIn } from 'lucide-react';

export default function OwnerEntry() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-xl border border-border p-10 w-full max-w-md text-center">
        <h1 className="text-2xl font-bold text-primary mb-3">Iniciar sesión</h1>
        <p className="text-sm text-text-secondary mb-8">Accede a tu panel para ver y gestionar tus propiedades.</p>
        <Link
          to="/auth"
          className="w-full inline-flex items-center justify-center gap-2 bg-primary text-white font-bold py-3 rounded-md hover:bg-opacity-90 transition-colors"
        >
          <LogIn size={18} />
          Iniciar sesión
        </Link>
      </div>
    </div>
  );
}
