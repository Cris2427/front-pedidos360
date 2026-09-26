// src/useApi.ts
// Hook que entrega un ApiClient ya ligado a la cuenta MSAL activa.
// Uso:
//   const api = useApi();
//   const data = await api?.get('/api/catalog');

import { useMemo } from 'react';
import { useMsal } from '@azure/msal-react';
import { createApiClient, type ApiClient } from './api/client';

export function useApi(): ApiClient | null {
  const { instance, accounts } = useMsal();
  const account = accounts[0] ?? instance.getActiveAccount() ?? null;

  return useMemo(() => {
    if (!account) return null;
    return createApiClient(instance, account);
  }, [instance, account]);
}
