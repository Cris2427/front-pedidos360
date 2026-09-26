// src/api/client.ts
// Cliente HTTP reutilizable para el backend protegido por API Gateway + JWT authorizer.
// Se encarga de: obtener el access token de Entra (aud = tu API), inyectar el
// header Authorization, y normalizar errores. Cada dominio tiene su archivo
// hermano (src/api/orders.ts, src/api/catalog.ts) y reutiliza este cliente.

import type { IPublicClientApplication, AccountInfo } from '@azure/msal-browser';
import { BrowserAuthError, InteractionRequiredAuthError } from '@azure/msal-browser';
import { apiConfig, apiRequest } from '../authConfig';

export class ApiError extends Error {
  status: number;
  statusText: string;
  body: unknown;

  constructor(status: number, statusText: string, body: unknown) {
    super(`API ${status} ${statusText}`);
    this.name = 'ApiError';
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Obtiene un access token para el backend (aud = tu API).
 * - Intenta silenciosamente (acquireTokenSilent → usa cache o iframe oculto).
 * - Si falla (consentimiento nuevo, sesión expirada, MFA, o el iframe silencioso
 *   no funciona por bloqueo de cookies de terceros → error `timed_out`),
 *   cae a un redirect interactivo para obtener/consentir el scope de la API.
 *   El redirect recarga la página; al volver, MSAL ya tiene el token en cache.
 */
export async function acquireApiToken(
  instance: IPublicClientApplication,
  account: AccountInfo,
): Promise<string> {
  try {
    const result = await instance.acquireTokenSilent({ ...apiRequest, account });
    return result.accessToken;
  } catch (error) {
    const needsInteraction =
      error instanceof InteractionRequiredAuthError ||
      (error instanceof BrowserAuthError &&
        ['timed_out', 'monitor_window_timeout', 'no_token_request_cache_error'].includes(
          error.errorCode,
        ));
    if (needsInteraction) {
      // No vuelve: la página navega a Entra y regresa al redirectUri.
      await instance.acquireTokenRedirect({ ...apiRequest, account });
    }
    throw error;
  }
}

export interface ApiClient {
  request<T>(path: string, init?: RequestInit): Promise<T>;
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
  put<T>(path: string, body: unknown): Promise<T>;
  del<T>(path: string): Promise<T>;
}

export function createApiClient(
  instance: IPublicClientApplication,
  account: AccountInfo,
): ApiClient {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!apiConfig.baseUrl) {
      throw new Error('VITE_API_BASE_URL no está configurado en .env');
    }
    if (apiConfig.scopes.length === 0) {
      throw new Error('VITE_API_SCOPE no está configurado en .env');
    }

    const token = await acquireApiToken(instance, account);
    const url = `${apiConfig.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

    const response = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
        Authorization: `Bearer ${token}`,
      },
    });

    const text = await response.text();
    const body = text ? safeJson(text) : null;

    if (!response.ok) {
      throw new ApiError(response.status, response.statusText, body);
    }
    return body as T;
  }

  return {
    request,
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, body: unknown) =>
      request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
    put: <T>(path: string, body: unknown) =>
      request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
    del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  };
}

/**
 * Normaliza la respuesta de un endpoint de listado: algunas Lambdas devuelven
 * el array pelado y otras lo envuelven (`{ items: [...] }`, `{ data: [...] }`).
 * Así el front no se rompe si el backend cambia de forma.
 */
export function unwrapList<T>(raw: unknown, ...keys: string[]): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    for (const key of [...keys, 'items', 'data', 'results']) {
      if (Array.isArray(obj[key])) return obj[key] as T[];
    }
  }
  return [];
}
