import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import { useRoles } from './useRoles';
import { InteractionStatus } from '@azure/msal-browser';
import { loginRequest } from './authConfig';
import { RequireAuth } from './RequireAuth';
import { RequireRole } from './RequireRole';
import { Landing } from './Landing';
import { Dashboard } from './Dashboard';
import { CatalogView } from './Catalog';
import { OrdersView } from './Orders';

// que ve cada perfil, la misma tabla que aplica el backend
const SECCIONES = [
  { to: '/dashboard', texto: 'Dashboard', roles: null },
  { to: '/catalog', texto: 'Catálogo', roles: ['Admin', 'Operador'] },
  { to: '/orders', texto: 'Pedidos', roles: ['Cliente', 'Operador'] },
];

function Nav() {
  const { instance, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const { roles, loading: cargandoRoles } = useRoles();

  const handleLogin = () => {
    if (inProgress === InteractionStatus.None) {
      instance.loginRedirect(loginRequest).catch((e) => console.error(e));
    }
  };

  const handleLogout = () => {
    if (inProgress === InteractionStatus.None) {
      instance
        .logoutRedirect({ postLogoutRedirectUri: '/' })
        .catch((e) => console.error(e));
    }
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? 'nav-link active' : 'nav-link';

  return (
    <header className="navbar">
      <div className="logo">
        <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
          <path
            d="M13 2.2 23 7.4v11.2L13 23.8 3 18.6V7.4z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path d="M3 7.4 13 12.6l10-5.2M13 12.6v11.2" stroke="currentColor" strokeWidth="1.4" opacity="0.5" />
          <circle cx="13" cy="12.6" r="2.1" fill="currentColor" />
        </svg>
        <span>Pedidos360</span>
      </div>

      {isAuthenticated && !cargandoRoles && (
        <nav className="nav-links">
          {SECCIONES.filter(
            (s) => s.roles === null || s.roles.some((r) => roles.includes(r)),
          ).map((s) => (
            <NavLink key={s.to} to={s.to} className={linkClass}>
              {s.texto}
            </NavLink>
          ))}
        </nav>
      )}

      <div>
        {isAuthenticated ? (
          <button
            className="btn btn-ghost"
            onClick={handleLogout}
            disabled={inProgress !== InteractionStatus.None}
          >
            Cerrar Sesión
          </button>
        ) : (
          <button
            className="btn btn-primary"
            onClick={handleLogin}
            disabled={inProgress !== InteractionStatus.None}
          >
            Iniciar Sesión
          </button>
        )}
      </div>
    </header>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="layout">
        <Nav />
        <main className="container">
          <Routes>
            <Route path="/" element={<Landing />} />

            <Route element={<RequireAuth />}>
              <Route path="/dashboard" element={<Dashboard />} />

              <Route element={<RequireRole role={['Cliente', 'Operador']} />}>
                <Route path="/orders" element={<OrdersView />} />
              </Route>

              <Route element={<RequireRole role={['Admin', 'Operador']} />}>
                <Route path="/catalog" element={<CatalogView />} />
              </Route>
            </Route>

            <Route path="*" element={<Landing />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}