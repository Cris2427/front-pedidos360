# Pedidos360 · Entra ID + React + AWS (starter)

**DSY1107 · Desarrollo Cloud Native I** — starter de referencia para la
integración de autenticación/autorización del caso **Pedidos360**: frontend
en React (MSAL) + backend en AWS Lambda detrás de API Gateway, protegido con
Microsoft Entra ID.

📘 **Empieza por la guía**: [`docs/guia_entra_id_v2.html`](./docs/guia_entra_id_v2.html)
(descárgala y ábrela en el navegador — trae los pasos completos: tenant,
registro de las dos apps, roles, MSAL, JWT Authorizer, CORS y errores
comunes).

## Qué trae este starter

- Login/logout con **MSAL React** (Authorization Code + PKCE).
- Un `ApiClient` reutilizable (`src/api/client.ts`) que obtiene el access
  token para el backend y lo inyecta como `Authorization: Bearer …`, con
  fallback a `acquireTokenRedirect` cuando el token silencioso falla.
- Un panel (`TokenInspector`) para decodificar y ver los claims del token
  (`aud`, `iss`, `scp`, `roles`, `exp`) y comprobar que llegaron los cuatro
  scopes y el App Role del usuario.
- Los dos módulos del caso: **Catálogo** (`/catalog`) y **Gestión de Pedidos**
  (`/orders`), consumiendo el backend protegido vía API Gateway.
- **Guards de ruta explícitos** con `react-router-dom`:
  - `RequireAuth` — guard de autenticación (layout route, redirige sola al login).
  - `RequireRole` — guard de autorización (lee el claim `roles` del access
    token de la API; solo UX, la Lambda debe revalidar).
  - Rutas: `/` (pública), `/dashboard` (requiere sesión), `/catalog`
    (Admin u Operador), `/orders` (Cliente u Operador), `/admin` (Admin).
  - El menú se arma según el perfil, pero quien decide es el backend: cada
    Lambda revalida scope y rol.

## Backend

Vive en su propio repositorio, **`ms-pedidos360-api`**: una Lambda por método y
ruta (10 funciones) sobre DynamoDB, detrás de un API Gateway con JWT authorizer
de Entra ID. Usa scopes por dominio (`orders.read`, `catalog.write`, …) y
autoriza por App Role en cada endpoint.

El único punto de contacto entre los dos repositorios es la URL de la API, que
se configura en el `.env` de este proyecto:

```
VITE_API_BASE_URL=https://<id-de-tu-api>.execute-api.us-east-1.amazonaws.com
```

## Quick start

```bash
corepack pnpm install   # este repo usa pnpm (pnpm-lock.yaml); corepack viene con Node
cp .env.example .env    # completa con los valores de TU tenant (ver la guía, sección 4 y 6)
corepack pnpm dev       # http://localhost:5173
```

Otros comandos: `corepack pnpm build` (build + type-check), `corepack pnpm lint` (oxlint).

## Stack

React 19 · Vite 8 · TypeScript · `@azure/msal-browser` / `@azure/msal-react` ·
`react-router-dom` · AWS API Gateway (HTTP API) + Lambda (backend, repo aparte).

---

Basado en la plantilla [docentedev/cloud-01-entra-app-integration](https://github.com/docentedev/cloud-01-entra-app-integration),
extendido con el flujo de token hacia un backend propio, guards de ruta, y la
guía adaptada al caso Pedidos360.
