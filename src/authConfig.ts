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

// los del login, solo para entrar
export const loginRequest = {
  scopes: ['openid', 'profile', 'User.Read'],
};

export const apiConfig = {
  baseUrl: (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '',
  scopes: ((import.meta.env.VITE_API_SCOPE as string | undefined) ?? '')
    .split(' ')
    .map((s) => s.trim())
    .filter(Boolean),
};

// estos son los de la api: el token que sale de aca trae aud y scp, que es
// lo que revisan las lambdas
export const apiRequest = {
  scopes: apiConfig.scopes,
};
