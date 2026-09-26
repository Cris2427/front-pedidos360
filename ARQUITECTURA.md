# Pedidos360 — cómo está hecho

Guía de lectura del proyecto: qué hace cada archivo y por qué está ahí.

---

## El recorrido de una petición

Todo el sistema se entiende siguiendo un clic. Cuando el Operador aprieta
**Aceptar** en un pedido:

```
1. Navegador   Orders.tsx llama a ordersApi.updateStatus(...)
2. MSAL        client.ts pide el access token para la API (aud = Pedidos360-API)
3. HTTPS       PATCH /api/orders/o-001/status  +  Authorization: Bearer <token>
4. API Gateway el JWT authorizer valida firma, issuer, audience y expiración
                 ├─ token malo       -> 401, la Lambda ni se ejecuta
                 └─ token bueno      -> enruta a la Lambda de ESA ruta
5. Lambda      pedidos360-orders-status revisa el scope y el App Role
                 ├─ sin permiso      -> 403 diciendo qué falta
                 └─ con permiso      -> aplica las reglas de negocio
6. DynamoDB    descuenta stock (condicional) y cambia el estado (bloqueo optimista)
7. Respuesta   200 con el pedido actualizado, o 409 si chocó con una regla
```

Las tres capas de control son **independientes a propósito**: el menú oculta,
el guard bloquea la vista, y la Lambda decide de verdad. Las dos primeras son
comodidad; la tercera es la seguridad.

---

## Frontend (`src/`)

### Arranque y configuración

| Archivo | Para qué |
|---|---|
| `main.tsx` | Crea la instancia de MSAL, la **inicializa antes de renderizar** (obligatorio desde MSAL v3) y envuelve la app en `<MsalProvider>`. |
| `authConfig.ts` | Toda la configuración de Entra ID: clientId, authority, redirectUri y los scopes. Lee del `.env`, no tiene valores quemados. |
| `App.tsx` | El mapa del sitio: el menú según el perfil y qué guard protege cada ruta. |
| `index.css` | El sistema visual completo: paleta, tipografía y componentes. Todos los colores salen de variables en el primer bloque. |

### Autenticación y permisos

| Archivo | Para qué |
|---|---|
| `RequireAuth.tsx` | Guard de **autenticación**. Es una *layout route*: todo lo que cuelga de ella exige sesión. Si no hay, redirige al login solo. |
| `RequireRole.tsx` | Guard de **autorización**. Deja pasar si el usuario tiene alguno de los roles indicados; si no, muestra "Acceso restringido". |
| `useRoles.ts` | Lee los App Roles del usuario desde el claim `roles` del access token. Lo usan el guard y las vistas para mostrar u ocultar botones. |
| `useApi.ts` | Entrega un cliente HTTP ya ligado a la cuenta activa. Devuelve `null` mientras MSAL aún no resuelve la sesión. |
| `lib/jwt.ts` | Decodifica el payload de un JWT **solo para mirarlo**. No valida la firma: de eso se encarga el authorizer. |

> **Por qué los roles salen del access token y no del ID token:** los App Roles
> se definen en la aplicación de API (`Pedidos360-API`), así que viajan en el
> token cuya audiencia es esa API. El ID token del login no los trae.

### Llamadas al backend

| Archivo | Para qué |
|---|---|
| `api/client.ts` | El cliente HTTP reutilizable. Obtiene el token, inyecta `Authorization: Bearer`, normaliza errores en `ApiError`. Si el token silencioso falla, cae a un redirect interactivo. |
| `api/catalog.ts` | Las cinco operaciones del catálogo, una por endpoint. |
| `api/orders.ts` | Las cinco de pedidos, más la máquina de estados que la UI usa para dibujar solo los botones válidos. |
| `lib/errors.ts` | Traduce un error a un mensaje que se entiende. Si el backend explicó el problema, ese mensaje manda; si no, una pista según el código (401 token, 403 permiso, 404 ruta…). |
| `lib/format.ts` | Formato de pesos chilenos y de números. En un solo lugar para que no se repita. |

### Vistas

| Archivo | Para qué |
|---|---|
| `Landing.tsx` | Página pública. Lo único que ofrece es entrar. |
| `Dashboard.tsx` | Resumen **según el perfil**: el Cliente ve sus pedidos, el Operador la operación completa, el Admin el inventario. Cada panel pide solo los endpoints que su rol puede leer. |
| `Catalog.tsx` | CRUD de productos y ajuste de stock. El Operador entra en modo consulta. |
| `Orders.tsx` | CRUD de pedidos y avance del ciclo de estados. |
| `TokenInspector.tsx` | Muestra los claims del token (`aud`, `iss`, `scp`, `roles`, `exp`) y comprueba que llegaron los cuatro scopes. Es la evidencia de que la autenticación funciona. |

---

## Backend (repositorio `ms-pedidos360-api`)

> El backend se entrega en un repositorio aparte. Las rutas de esta sección son
> relativas a la raíz de **ese** repositorio, no de este.

**Una Lambda por método y ruta**: 10 funciones independientes. Comparten un
mismo zip y se distinguen por su `handler`, así cada ruta es una función
distinta en AWS sin duplicar el código común.

### `handlers/` — una función por archivo

| Archivo | Ruta | Quién puede |
|---|---|---|
| `catalog-get.mjs` | `GET /api/catalog` | cualquiera con `catalog.read` |
| `catalog-post.mjs` | `POST /api/catalog` | Admin |
| `catalog-put.mjs` | `PUT /api/catalog/{id}` | Admin |
| `catalog-stock-put.mjs` | `PUT /api/catalog/{id}/stock` | Admin |
| `catalog-delete.mjs` | `DELETE /api/catalog/{id}` | Admin |
| `orders-get.mjs` | `GET /api/orders` | Cliente (los suyos) · Operador (todos) |
| `orders-post.mjs` | `POST /api/orders` | Cliente · Operador |
| `orders-put.mjs` | `PUT /api/orders/{id}` | Cliente (los suyos) · Operador |
| `orders-delete.mjs` | `DELETE /api/orders/{id}` | Cliente (los suyos) · Operador |
| `orders-status-patch.mjs` | `PATCH /api/orders/{id}/status` | Operador |

Todos siguen la misma forma: comprobar scope → comprobar rol → validar el
cuerpo → aplicar la regla → responder.

### `lib/` — lo compartido

| Archivo | Para qué |
|---|---|
| `auth.mjs` | Lee `scp` y `roles` del token ya validado y decide si la petición sigue. `exigirScope` y `exigirRol` devuelven la respuesta 403 o `null`. |
| `http.mjs` | Respuestas JSON, headers CORS, lectura del cuerpo y un envoltorio que atrapa errores para no devolver una traza. |
| `reglas.mjs` | Las reglas del caso: la máquina de estados, qué se puede editar o borrar, y el cálculo del total de un pedido. |
| `store.mjs` | El acceso a datos. Dos implementaciones con la misma interfaz: DynamoDB para producción y una en memoria para las pruebas. |

### Detalles que vale la pena conocer

**El claim `roles` llega como texto con corchetes.** El API Gateway entrega
todos los claims como string, así que un claim de tipo array llega como
`"[Cliente]"`. Sin quitar los corchetes, ninguna comparación de rol coincide y
todo responde 403 con un token perfectamente válido.

**El total se recalcula siempre en el servidor.** Lo que manda el navegador se
ignora: puede venir manipulado.

**A un Cliente se le fuerza su propio `clienteId`** con la identidad del token,
y un pedido ajeno le responde 404 en vez de 403 — así no se le revela que
existe.

**El stock se descuenta con una condición en la base de datos**
(`stock >= cantidad`) dentro de la misma operación atómica. Dos pedidos
simultáneos no pueden dejarlo negativo.

**El cambio de estado usa bloqueo optimista**: solo se aplica si el pedido
sigue en el estado que se leyó. Dos operadores apretando "Aceptar" a la vez no
descuentan el stock dos veces.

**Los ids son correlativos** (`p-005`, `o-001`). DynamoDB no tiene
auto-incremento, así que un documento `_seq` por tabla lleva la cuenta y se
incrementa con `ADD`, que es atómico. Ese documento se filtra de los listados.

---

## Infraestructura (en el repositorio del backend)

| Archivo | Para qué |
|---|---|
| `infra/deploy-aws.ps1` | Despliega todo de una: tablas, semilla, las 10 funciones, el authorizer, las integraciones, las rutas, el CORS y los permisos. Es idempotente y acepta `-WhatIf` para ver qué haría sin tocar nada. |
| `infra/openapi-pedidos360.yaml` | La especificación de la API: los 10 endpoints con sus permisos, códigos de error y la Lambda de cada uno. Cubre el requisito de "OpenAPI por servicio". |

---

## Pruebas

```bash
node test-local.mjs        # desde la raíz del repositorio del backend
```

52 comprobaciones sobre las 10 funciones, **sin credenciales de AWS ni red**:
usan el store en memoria. Cubren permisos por scope y por rol, validaciones, el
ciclo de estados, las reglas de stock, el aislamiento entre clientes, la
numeración correlativa y las formas en que puede llegar el claim `roles`.

---

## Lo que NO está y por qué

El caso completo tiene cinco módulos. Esta entrega cubre los dos que pide la
evaluación —**Gestión de Pedidos** y **Catálogo**—. Quedan fuera, a propósito:

- **Notificaciones** (RabbitMQ), **Reportería** (Kafka) y **Auditoría**: son de
  etapas posteriores del caso.
- **Separar en dos Lambdas por dominio** (`ms-orders`, `ms-catalog`): hoy son 10
  funciones agrupadas por endpoint, que es lo que pidió el docente.
