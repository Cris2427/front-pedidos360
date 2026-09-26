// src/RequireAuth.tsx
// Guard de AUTENTICACIÓN a nivel de ruta. Se usa como "layout route" en
// App.tsx envolviendo un <Outlet/>: agrupa todas las rutas que exigen sesión
// activa en un solo lugar, en vez de repetir un "if (isAuthenticated)" en
// cada página. Equivalente al CanActivate de un guard de Angular.
//
// MsalAuthenticationTemplate hace el trabajo: si no hay cuenta activa,
// dispara loginRedirect automáticamente (no hace falta un botón "Iniciar
// sesión" para entrar a una ruta protegida — el guard te manda al login).
import { Outlet } from 'react-router-dom';
import { MsalAuthenticationTemplate } from '@azure/msal-react';
import { InteractionType } from '@azure/msal-browser';
import { loginRequest } from './authConfig';

export function RequireAuth() {
  return (
    <MsalAuthenticationTemplate
      interactionType={InteractionType.Redirect}
      authenticationRequest={loginRequest}
      loadingComponent={() => (
        <div className="card text-center">
          <p>Redirigiendo a inicio de sesión…</p>
        </div>
      )}
      errorComponent={({ error }) => (
        <div className="card text-center">
          <p style={{ color: '#d9534f' }}>
            Error de autenticación: {error?.message}
          </p>
        </div>
      )}
    >
      {/* Todo lo que cuelgue de esta ruta en App.tsx se renderiza acá */}
      <Outlet />
    </MsalAuthenticationTemplate>
  );
}
