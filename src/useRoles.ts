// los roles salen del access token de la api, no del token del login
import { useEffect, useMemo, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { acquireApiToken } from './api/client';
import { decodeJwt } from './lib/jwt';

export interface RolesState {
  roles: string[];
  loading: boolean;
  has: (...roles: string[]) => boolean;
}

export function useRoles(): RolesState {
  const { instance, accounts } = useMsal();
  const account = accounts[0] ?? instance.getActiveAccount();
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!account) return;

    let cancelled = false;
    acquireApiToken(instance, account)
      .then((token) => {
        if (cancelled) return;
        setRoles(decodeJwt(token)?.roles ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setRoles([]);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [instance, account]);

  return useMemo(
    () => ({
      roles,
      loading,
      has: (...wanted: string[]) => wanted.some((r) => roles.includes(r)),
    }),
    [roles, loading],
  );
}
