import { Link } from 'react-router-dom';
import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import { InteractionStatus } from '@azure/msal-browser';
import { loginRequest } from './authConfig';

function Marca() {
  return (
    <div className="portada-marca">
      <svg width="30" height="30" viewBox="0 0 26 26" fill="none" aria-hidden="true">
        <path
          d="M13 2.2 23 7.4v11.2L13 23.8 3 18.6V7.4z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M3 7.4 13 12.6l10-5.2M13 12.6v11.2"
          stroke="currentColor"
          strokeWidth="1.4"
          opacity="0.5"
        />
        <circle cx="13" cy="12.6" r="2.1" fill="currentColor" />
      </svg>
    </div>
  );
}

export function Landing() {
  const { instance, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const ocupado = inProgress !== InteractionStatus.None;

  const handleLogin = () => {
    if (inProgress === InteractionStatus.None) {
      instance.loginRedirect(loginRequest).catch((e) => console.error(e));
    }
  };

  if (isAuthenticated) {
    return (
      <div className="card portada">
        <Marca />
        <h2>Sesión iniciada</h2>
        <p className="subtitle">
          Tu panel muestra el resumen que corresponde a tu perfil.
        </p>
        <Link className="btn btn-primary btn-lg" to="/dashboard">
          Ir a mi panel
        </Link>
      </div>
    );
  }

  return (
    <div className="card portada">
      <Marca />
      <h2>Pedidos360</h2>
      <p className="subtitle">
        Gestión de pedidos y catálogo. Ingresa con tu cuenta institucional para
        acceder a los módulos que tengas asignados.
      </p>
      <button
        className="btn btn-primary btn-lg"
        onClick={handleLogin}
        disabled={ocupado}
      >
        {ocupado ? 'Redirigiendo…' : 'Ingresar con Microsoft'}
      </button>
      <p className="portada-pie">
        Acceso protegido con Microsoft Entra ID. Tus permisos dependen del rol
        asignado a tu cuenta.
      </p>
    </div>
  );
}
