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

// primero intenta en silencio; si el navegador bloquea el iframe o la sesion
// vencio, manda a entra con un redirect
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

    // aca va el token en cada llamada
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

// acepta tanto [] como { items: [] }
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
