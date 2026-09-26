// src/useRoles.ts
// Hook que entrega los App Roles del usuario (Admin / Operador / Cliente).
//
// Los roles viven en el claim `roles` del ACCESS TOKEN de la API (aud = tu
// backend), no en el ID token del login — por eso pedimos el mismo token que
// usa el resto de las llamadas y leemos sus claims.
//
// Esto es SOLO para la UX (mostrar u ocultar botones). La autorización real
// la hace la Lambda, que revalida el mismo claim en cada endpoint.
import { useEffect, useMemo, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { acquireApiToken } from './api/client';
import { decodeJwt } from './lib/jwt';

export interface RolesState {
  roles: string[];
  loading: boolean;
  /** true si el usuario tiene al menos uno de los roles indicados. */
  has: (...roles: string[]) => boolean;
}

export function useRoles(): RolesState {
  const { instance, accounts } = useMsal();
  const account = accounts[0] ?? instance.getActiveAccount();
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // RequireAuth garantiza que hay cuenta activa; el chequeo es defensivo.
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
