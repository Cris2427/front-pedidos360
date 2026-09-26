import type { Configuration } from '@azure/msal-browser';
import { LogLevel } from '@azure/msal-browser';

export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_AZURE_TENANT_ID}`,
    redirectUri: import.meta.env.VITE_AZURE_REDIRECT_URI,
  },
  cache: {
    cacheLocation: 'localStorage',
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        if (level === LogLevel.Error) console.error(message);
      },
      logLevel: LogLevel.Error,
    },
  },
};

// Scopes solicitados en el login inicial. Con OIDC basta openid/profile;
// dejamos User.Read para poder inspeccionar el perfil vía Graph si se quiere.
export const loginRequest = {
  scopes: ['openid', 'profile', 'User.Read'],
};

// --- Configuración del backend protegido (API Gateway + JWT authorizer) ---
export const apiConfig = {
  baseUrl: (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '',
  // Puede haber varios scopes separados por espacio en el .env
  scopes: ((import.meta.env.VITE_API_SCOPE as string | undefined) ?? '')
    .split(' ')
    .map((s) => s.trim())
    .filter(Boolean),
};

// Scopes que se piden a Entra al llamar al backend. El access token resultante
// tendrá  aud = tu API  y el claim  scp  con estos scopes, que las Lambdas
// pueden verificar para autorización fina por ruta.
export const apiRequest = {
  scopes: apiConfig.scopes,
};