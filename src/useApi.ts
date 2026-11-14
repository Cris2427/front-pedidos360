import { useMemo } from 'react';
import { useMsal } from '@azure/msal-react';
import { createApiClient, type ApiClient } from './api/client';

// baseUrl: sin nada, la api de la ep4; las pantallas de kafka pasan la suya
export function useApi(baseUrl?: string): ApiClient | null {
  const { instance, accounts } = useMsal();
  const account = accounts[0] ?? instance.getActiveAccount() ?? null;

  return useMemo(() => {
    if (!account) return null;
    return createApiClient(instance, account, baseUrl);
  }, [instance, account, baseUrl]);
}