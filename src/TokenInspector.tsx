import { useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { acquireApiToken } from './api/client';
import { apiConfig } from './authConfig';
import { decodeJwt, scopesOf, type JwtClaims } from './lib/jwt';

// en el .env van con la uri completa y en el claim scp llegan cortos
const nombreCorto = (scope: string) => scope.split('/').pop() ?? scope;

export function TokenInspector() {
  const { instance, accounts } = useMsal();
  const [token, setToken] = useState<string | null>(null);
  const [claims, setClaims] = useState<JwtClaims | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleInspect = async () => {
    setError(null);
    const account = accounts[0] ?? instance.getActiveAccount();
    if (!account) {
      setError('No hay sesión activa.');
      return;
    }
    try {
      const accessToken = await acquireApiToken(instance, account);
      setToken(accessToken);
      setClaims(decodeJwt(accessToken));
      console.log('[TokenInspector] access_token:', accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al obtener el token');
    }
  };

  return (
    <div style={{ marginTop: '1.5rem', textAlign: 'left' }}>
      <h3>Inspector de Access Token (API)</h3>
      <button className="btn btn-primary" onClick={handleInspect}>
        Obtener e inspeccionar token
      </button>

      {error && <p style={{ color: '#d9534f', marginTop: '1rem' }}>{error}</p>}

      {claims && (
        <div style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
          <div><strong>aud:</strong> <code>{String(claims.aud)}</code></div>
          <div><strong>iss:</strong> <code>{String(claims.iss)}</code></div>
          <div><strong>scp:</strong> <code>{scopesOf(claims).join(', ') || '(ninguno)'}</code></div>
          <div><strong>roles:</strong> <code>{(claims.roles ?? []).join(', ') || '(ninguno)'}</code></div>
          <div>
            <strong>exp:</strong>{' '}
            <code>{claims.exp ? new Date(claims.exp * 1000).toLocaleString() : '?'}</code>
          </div>

          {/* revisa si llegaron los cuatro scopes del .env
              Si falta alguno, el permiso no está agregado o no se concedió
              el consentimiento en Entra ID (Permisos de API). */}
          <div style={{ marginTop: '0.75rem' }}>
            <strong>Scopes esperados por el .env:</strong>
            <ul style={{ listStyle: 'none', padding: 0, marginTop: '0.35rem' }}>
              {apiConfig.scopes.map((scope) => {
                const corto = nombreCorto(scope);
                const presente = scopesOf(claims).includes(corto);
                return (
                  <li key={scope} style={{ color: presente ? '#107c10' : '#a4262c' }}>
                    {presente ? '✓' : '✗'} <code>{corto}</code>
                    {!presente && ' — falta el permiso o el consentimiento en Entra ID'}
                  </li>
                );
              })}
            </ul>
          </div>

          <div style={{ marginTop: '0.5rem' }}>
            <strong>App Roles asignados:</strong>{' '}
            {(claims.roles ?? []).length > 0 ? (
              <code>{(claims.roles ?? []).join(', ')}</code>
            ) : (
              <span style={{ color: '#a4262c' }}>
                ninguno — asígnalos en Aplicaciones empresariales → Pedidos360-API →
                Usuarios y grupos
              </span>
            )}
          </div>
        </div>
      )}

      {token && (
        <details style={{ marginTop: '1rem' }}>
          <summary style={{ cursor: 'pointer', fontSize: '0.85rem' }}>
            Ver token completo (pegar en jwt.ms)
          </summary>
          <pre
            style={{
              backgroundColor: '#2d2d2d',
              color: '#67cdaa',
              padding: '1rem',
              borderRadius: '6px',
              marginTop: '0.5rem',
              fontSize: '0.75rem',
              overflowX: 'auto',
              wordBreak: 'break-all',
              whiteSpace: 'pre-wrap',
            }}
          >
            {token}
          </pre>
        </details>
      )}
    </div>
  );
}
