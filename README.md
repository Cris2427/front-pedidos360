# front-pedidos360

Frontend del sistema **Pedidos360**: gestión de pedidos y catálogo,
notificaciones asíncronas y administración de la mensajería, con login
corporativo mediante **Microsoft Entra ID** y autorización por rol.

**Publicado en AWS Amplify:** https://main.d2yxpu4vls3p92.amplifyapp.com

Backend: [Cris2427/back-pedidos360](https://github.com/Cris2427/back-pedidos360)

> **DSY1107 · Desarrollo Cloud Native I** — Evaluaciones Parciales N°1 y N°3.
> Cristian Tapia · Camila Malhue

## Qué hace

Tres perfiles, y cada uno ve y puede cosas distintas:

| Rol | Menú | Qué puede hacer |
|---|---|---|
| **Cliente** | Dashboard · Pedidos · Notificaciones | Crear, editar y eliminar **sus** pedidos mientras están en CREADO; ver sus correos y boletas |
| **Operador** | Dashboard · Catálogo · Pedidos · Notificaciones | Todo lo anterior sobre todos los pedidos, avanzar el ciclo de estados y ver todo lo que hizo la mensajería |
| **Admin** | Dashboard · Catálogo · Mensajería | Administrar productos y stock; crear y eliminar colas, y ver topics y suscripciones. No participa del CRUD de pedidos |

El **dashboard se adapta al perfil**: el Cliente ve sus pedidos y su gasto, el
Operador la operación completa, el Admin el inventario.

Las **notificaciones** llegan unos segundos después de cada cambio de estado,
porque las procesa la mensajería (SNS + SQS + Lambda) y no la petición; la
pantalla se refresca sola cada 10 segundos y las ordena por la hora del evento.

La pantalla de **mensajería** no valida nada por su cuenta: las reglas son del
servidor, y cuando rechaza algo (un nombre inválido, borrar una cola que una
Lambda está consumiendo) muestra su motivo exacto.

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

## Desplegar

```bash
powershell -File infra\deploy-front.ps1 -WhatIf   # muestra qué haría, sin tocar nada
powershell -File infra\deploy-front.ps1
```

Publica el build en **AWS Amplify Hosting**, sin conectar GitHub: crea la app
y la rama si no existen, compila, sube el ZIP y espera a que termine. Se puede
correr las veces que haga falta.

Tres detalles que resuelve el script:

- **La dirección de retorno del login** se fija al compilar. El script compila
  con la URL de Amplify; el `.env` sigue con `localhost` para desarrollar.
- **Las rutas de React** (`/orders`, `/messaging`) no son archivos: una regla de
  la app devuelve `index.html` para que no den 404 al recargar.
- **El ZIP se arma con `/`** en las rutas internas: el `Compress-Archive` de
  PowerShell 5.1 puede usar `\`, y Amplify, que corre en Linux, no encontraría
  los archivos de `assets/`.

Para que el login funcione en la versión publicada, su URL tiene que estar en
Entra ID como **URI de redirección** de la aplicación de página única, y en el
**CORS** del API Gateway (lo configura el script del backend).

No se usó CloudFront porque el Learner Lab de AWS Academy no lo permite, y un
bucket de S3 solo sirve por HTTP, que Entra ID no acepta para el login.

### Configuración

Todo sale del `.env` (ver [`.env.example`](.env.example)); no hay valores
quemados en el código. El único punto de contacto con el backend es la URL de
la API:

```
VITE_API_BASE_URL=https://<id-de-tu-api>.execute-api.us-east-1.amazonaws.com
```

En Entra ID hacen falta **dos registros de aplicación**: uno para este frontend
(SPA, con Authorization Code + PKCE) y otro para la API, que expone cinco
scopes (`orders.read`, `orders.write`, `catalog.read`, `catalog.write` y
`messaging.manage`) y define los tres App Roles. `messaging.manage` es solo
para administradores: hay que conceder el consentimiento de administrador.

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
    notifications.ts  lo que registraron los consumidores
    messaging.ts      el microservicio administrador de colas, topics y bindings
  lib/
    jwt.ts            decodifica el token para inspeccionarlo (no valida firma)
    errors.ts         traduce un error HTTP a un mensaje entendible
    format.ts         pesos chilenos y números
  Landing.tsx         página pública
  Dashboard.tsx       resumen según el perfil
  Catalog.tsx         CRUD de productos y stock
  Orders.tsx          CRUD de pedidos y ciclo de estados
  Notifications.tsx   correos, órdenes de bodega y boletas, con refresco
  Messaging.tsx       crear y eliminar colas; ver topics y suscripciones (solo Admin)
  TokenInspector.tsx  claims del token, para verificar la configuración
  index.css           sistema visual completo
infra/
  deploy-front.ps1    publica el build en AWS Amplify
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
