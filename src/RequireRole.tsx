// src/RequireRole.tsx
// Guard de AUTORIZACIÓN a nivel de ruta. Se anida DENTRO de <RequireAuth/> en
// App.tsx, así que cuando este guard corre ya sabemos que hay sesión activa —
// solo falta decidir si el usuario tiene el permiso para esta sección.
//
// Acepta un rol o una lista: <RequireRole role={['Admin', 'Operador']} />
// deja pasar a quien tenga cualquiera de los dos.
//
// Importante: esto SOLO oculta la vista en el navegador — es UX, no
// seguridad. Un usuario podría llamar la API directamente sin pasar por este
// guard, así que la Lambda revalida el mismo claim en cada endpoint.
import { Outlet } from 'react-router-dom';
import { useRoles } from './useRoles';

interface RequireRoleProps {
  role: string | string[];
}

export function RequireRole({ role }: RequireRoleProps) {
  const permitidos = Array.isArray(role) ? role : [role];
  const { has, loading } = useRoles();

  if (loading) {
    return (
      <div className="card text-center">
        <p>Verificando permisos…</p>
      </div>
    );
  }

  if (!has(...permitidos)) {
    return (
      <div className="card text-center">
        <h2>Acceso restringido</h2>
        <p className="subtitle">
          Esta sección requiere el App Role{' '}
          {permitidos.map((r, i) => (
            <span key={r}>
              {i > 0 && ' o '}
              <code>{r}</code>
            </span>
          ))}{' '}
          en la API. Pídele a un admin del tenant que te lo asigne en Entra ID
          (Aplicaciones empresariales → Pedidos360-API → Usuarios y grupos).
        </p>
      </div>
    );
  }

  return <Outlet />;
}
