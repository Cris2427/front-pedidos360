import React from 'react';
import ReactDOM from 'react-dom/client';
import { PublicClientApplication, EventType } from '@azure/msal-browser';
import type { EventMessage, AuthenticationResult } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import { msalConfig } from './authConfig';
import App from './App';
import './index.css';

// 1. Crear la instancia global
const msalInstance = new PublicClientApplication(msalConfig);

// 2. Registrar el callback de eventos (cuenta activa tras un login exitoso)
msalInstance.addEventCallback((event: EventMessage) => {
  if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
    const payload = event.payload as AuthenticationResult;
    msalInstance.setActiveAccount(payload.account);

    // --- DEBUG: token recibido tras el login ---
    // console.group("[MSAL] LOGIN_SUCCESS");
    // console.log("Cuenta:", payload.account);
    // console.log("Scopes:", payload.scopes);
    // console.log("ID Token:", payload.idToken);
    // console.log("Access Token (Bearer):", payload.accessToken);
    // console.groupEnd();
  }
});

// 3. Inicializar MSAL ANTES de renderizar.
//    MSAL v3+ obliga a llamar a initialize() (prepara el cache y la metadata)
//    antes de usar loginRedirect / acquireTokenSilent / getActiveAccount.
//    Omitirlo produce: BrowserAuthError: uninitialized_public_client_application
msalInstance.initialize().then(() => {
  // Activar una cuenta previa si ya existe sesión en el navegador
  if (!msalInstance.getActiveAccount() && msalInstance.getAllAccounts().length > 0) {
    msalInstance.setActiveAccount(msalInstance.getAllAccounts()[0]);
  }

  // 4. Renderizar envolviendo <App /> dentro de <MsalProvider>
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <MsalProvider instance={msalInstance}>
        <App />
      </MsalProvider>
    </React.StrictMode>
  );
});
