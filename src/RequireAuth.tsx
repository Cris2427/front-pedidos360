// si no hay sesion manda al login solo, sin apretar ningun boton
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
      <Outlet />
    </MsalAuthenticationTemplate>
  );
}
