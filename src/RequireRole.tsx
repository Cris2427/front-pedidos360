// esto solo esconde la pantalla, no es seguridad: la lambda revisa el mismo
// rol en cada endpoint
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
