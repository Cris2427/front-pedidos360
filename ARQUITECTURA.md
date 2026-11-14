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

## El recorrido de un evento de Kafka

Las pantallas Reportes y Auditoría no leen DynamoDB: leen lo que armaron los
consumidores de Kafka (carpeta `kafka/` del backend).

```
1. Publicador  bridge/producer.js valida el evento con el DTO y lo publica
               en pedidos.eventos con key pedidoId
2. Kafka       el líder de la partición lo guarda; con acks=all responde
               cuando otra copia también lo tiene (min ISR 2)
3. report      el grupo report lo lee, revisa la transición y actualiza el
               pedido en PostgreSQL (o lo manda a su DLT)
4. audit       el grupo audit lo lee y publica en audit.timeline quién hizo
               qué, cuándo y desde dónde
5. timeline    el grupo audit-timeline guarda ese registro en PostgreSQL
6. Navegador   Reports.tsx pide /api/report/... cada 5 s con el mismo
               access token de la API
7. Filtro JWT  shared/auth.js valida firma, emisor, audiencia, scope y
               App Role: 401 o 403 si algo falla, los KPIs si todo calza
```

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
| `api/client.ts` | El cliente HTTP reutilizable. Obtiene el token, inyecta `Authorization: Bearer`, normaliza errores en `ApiError`. Si el token silencioso falla, cae a un redirect interactivo. Recibe la URL de la API: por defecto la de AWS, y las pantallas de Kafka pasan la suya. |
| `api/catalog.ts` | Las cinco operaciones del catálogo, una por endpoint. |
| `api/orders.ts` | Las cinco de pedidos, más la máquina de estados que la UI usa para dibujar solo los botones válidos. |
| `api/notifications.ts` | Lo que registraron los consumidores de la mensajería. |
| `api/messaging.ts` | El microservicio administrador de colas, topics y suscripciones. |
| `api/analytics.ts` | Las APIs de Kafka de reportes y auditoría. Si el servicio no está corriendo, dice cuál. |
| `api/kafka.ts` | El microservicio administrador de Kafka: tópicos, grupos y DLT. |
| `lib/errors.ts` | Traduce un error a un mensaje que se entiende. Si el backend explicó el problema, ese mensaje manda; si no, una pista según el código (401 token, 403 permiso, 404 ruta…). |
| `lib/format.ts` | Formato de pesos chilenos y de números. En un solo lugar para que no se repita. |

### Vistas

| Archivo | Para qué |
|---|---|
| `Landing.tsx` | Página pública. Lo único que ofrece es entrar. |
| `Dashboard.tsx` | Resumen **según el perfil**: el Cliente ve sus pedidos, el Operador la operación completa, el Admin el inventario. Cada panel pide solo los endpoints que su rol puede leer. |
| `Catalog.tsx` | CRUD de productos y ajuste de stock. El Operador entra en modo consulta. |
| `Orders.tsx` | CRUD de pedidos y avance del ciclo de estados. |
| `Notifications.tsx` | Correos, órdenes de bodega y boletas, con refresco cada 10 s. |
| `Messaging.tsx` | Colas, topics y suscripciones de la mensajería (solo Admin). |
| `Reports.tsx` | Ventas por hora, productos más vendidos, pedidos activos y lead time por sucursal. Se actualiza cada 5 s (Operador y Admin). |
| `Audit.tsx` | El historial de un pedido y la búsqueda de registros por usuario, evento y fechas (solo Admin). |
| `Kafka.tsx` | Brokers, tópicos (crear, configurar, agregar particiones, borrar), grupos (mover offsets, borrar) y DLT (ver y reprocesar). Solo Admin. |
| `Graficos.tsx` | Los indicadores y el gráfico de barras que usan el Dashboard y Reportes. |
| `TokenInspector.tsx` | Muestra los claims del token (`aud`, `iss`, `scp`, `roles`, `exp`) y comprueba que llegaron los cuatro scopes. Es la evidencia de que la autenticación funciona. |

---

## Backend (repositorio `back-pedidos360`)

> El backend se entrega en un repositorio aparte. Las rutas de esta sección son
> relativas a la raíz de **ese** repositorio, no de este.

**Una Lambda por método y ruta**: 20 funciones de la API y 3 consumidoras de
la mensajería. Comparten un mismo zip y se distinguen por su `handler`, así
cada ruta es una función distinta en AWS sin duplicar el código común. Esta
sección muestra las de pedidos y catálogo; las de notificaciones y del
administrador de la mensajería están en el README del backend.

Todo lo de Kafka vive en la carpeta `kafka/` del backend, y su README explica
la arquitectura, los tópicos, la DLT, el administrador, el filtro JWT, la
prueba completa y las decisiones de diseño.

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
| `infra/deploy-aws.ps1` | Despliega todo de una: tablas, semilla, las funciones, el authorizer, las integraciones, las rutas, el CORS, los permisos, el topic SNS y las colas con sus DLQ. Es idempotente y acepta `-WhatIf` para ver qué haría sin tocar nada. |
| `infra/openapi-pedidos360.yaml` | La especificación de la API: los endpoints con sus permisos, códigos de error y la Lambda de cada uno. Cubre el requisito de "OpenAPI por servicio". |
| `kafka/docker-compose.yml` | ZooKeeper, 3 brokers, Kafka UI y PostgreSQL para la parte de Kafka. |

---

## Pruebas

```bash
node test-local.mjs        # desde la raíz del repositorio del backend
npm test                   # desde la carpeta kafka/ del backend
```

157 comprobaciones de la API, la mensajería y su administrador, **sin
credenciales de AWS ni red**: usan el store en memoria. Cubren permisos por
scope y por rol, validaciones, el ciclo de estados, las reglas de stock, el
aislamiento entre clientes, la numeración correlativa y las formas en que puede
llegar el claim `roles`.

Kafka tiene 81 pruebas más, **sin clúster ni PostgreSQL**: el DTO, el
consumidor (reintentos y DLT), los KPIs, la auditoría, el administrador y el
filtro JWT. La prueba completa contra el clúster está en el README de `kafka/`.

---

## Lo que NO está y por qué

El caso tiene cinco módulos y los cinco están: **Gestión de Pedidos** y
**Catálogo** (API en AWS), **Notificaciones** (SNS + SQS + Lambda, en lugar de
RabbitMQ) y **Reportería** y **Auditoría** (Kafka). Quedan fuera, a propósito:

- **El puente de la API de AWS a Kafka** (SNS → una cola SQS → Kafka): las
  Lambdas no llegan a un Kafka que corre en el equipo local, así que los
  eventos de Kafka los genera el publicador. Está explicado en el README de
  `kafka/` (ADR-001).
- **Las pantallas de Kafka en Amplify**: sus APIs corren en el equipo local,
  así que el front publicado no las muestra.
- **Separar en dos Lambdas por dominio** (`ms-orders`, `ms-catalog`): son
  funciones agrupadas por endpoint, que es lo que pidió el docente.
