# front-pedidos360

Frontend del sistema **Pedidos360**: gestión de pedidos y catálogo, con login
corporativo mediante **Microsoft Entra ID** y autorización por rol.

Backend: [Cris2427/back-pedidos360](https://github.com/Cris2427/back-pedidos360)

> **DSY1107 · Desarrollo Cloud Native I** — Evaluación Parcial N°1.
> Cristian Tapia · Camila Malhue

## Qué hace

Tres perfiles, y cada uno ve y puede cosas distintas:

| Rol | Menú | Qué puede hacer |
|---|---|---|
| **Cliente** | Dashboard · Pedidos | Crear, editar y eliminar **sus** pedidos mientras están en CREADO |
| **Operador** | Dashboard · Catálogo · Pedidos | Todo lo anterior sobre todos los pedidos, y avanzar el ciclo de estados |
| **Admin** | Dashboard · Catálogo | Administrar productos y stock. No participa del CRUD de pedidos |

El **dashboard se adapta al perfil**: el Cliente ve sus pedidos y su gasto, el
Operador la operación completa, el Admin el inventario.

## Cómo está protegido

Tres capas, y solo la última es seguridad:

1. **El menú** oculta lo que no corresponde — comodidad.
2. **Los guards de ruta** (`RequireAuth`, `RequireRole`) bloquean la vista si
   alguien escribe la URL a mano — sigue siendo el navegador.
3. **El backend** revalida el scope y el App Role en cada llamada — esto es lo
   que de verdad decide.

Los App Roles se leen del claim `roles` del **access token de la API**, no del
ID token del login: los roles se definen en la aplicación `Pedidos360-API`, así
que viajan en el token cuya audiencia es esa API.

## Cómo correrlo

```bash
corepack pnpm install     # este repo usa pnpm; corepack viene con Node
cp .env.example .env      # completa con los valores de TU tenant
corepack pnpm dev         # http://localhost:5173
```

Otros comandos: `corepack pnpm build` (build + type-check) y
`corepack pnpm lint` (oxlint).

### Configuración

Todo sale del `.env` (ver [`.env.example`](.env.example)); no hay valores
quemados en el código. El único punto de contacto con el backend es la URL de
la API:

```
VITE_API_BASE_URL=https://<id-de-tu-api>.execute-api.us-east-1.amazonaws.com
```

En Entra ID hacen falta **dos registros de aplicación**: uno para este frontend
(SPA, con Authorization Code + PKCE) y otro para la API, que expone los cuatro
scopes (`orders.read`, `orders.write`, `catalog.read`, `catalog.write`) y
define los tres App Roles.

## Estructura

```
src/
  main.tsx            inicializa MSAL antes de renderizar
  authConfig.ts       configuración de Entra ID, leída del .env
  App.tsx             menú según perfil y guards por ruta
  RequireAuth.tsx     guard de autenticación
  RequireRole.tsx     guard de autorización
  useRoles.ts         App Roles del usuario, desde el access token
  useApi.ts           cliente HTTP ligado a la cuenta activa
  api/
    client.ts         token + Authorization: Bearer + errores normalizados
    catalog.ts        las cinco operaciones del catálogo
    orders.ts         las cinco de pedidos + la máquina de estados
  lib/
    jwt.ts            decodifica el token para inspeccionarlo (no valida firma)
    errors.ts         traduce un error HTTP a un mensaje entendible
    format.ts         pesos chilenos y números
  Landing.tsx         página pública
  Dashboard.tsx       resumen según el perfil
  Catalog.tsx         CRUD de productos y stock
  Orders.tsx          CRUD de pedidos y ciclo de estados
  TokenInspector.tsx  claims del token, para verificar la configuración
  index.css           sistema visual completo
```

Hay una guía de lectura más detallada en [`ARQUITECTURA.md`](ARQUITECTURA.md):
qué hace cada archivo, el recorrido completo de una petición y los detalles que
no son obvios.

## Stack

React 19 · Vite 8 · TypeScript · `@azure/msal-browser` / `@azure/msal-react` ·
`react-router-dom`

---

El andamiaje inicial de MSAL parte de la plantilla
[docentedev/cloud-01-entra-app-integration](https://github.com/docentedev/cloud-01-entra-app-integration).
Sobre eso construimos los módulos de pedidos y catálogo, los guards y el
dashboard por rol, el backend serverless y el despliegue.
