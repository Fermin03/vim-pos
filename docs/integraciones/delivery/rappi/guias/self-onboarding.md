
# Self-Onboarding

<a href="/es/api-reference/stores" target="_blank" class="api">Referencia de API — Stores</a>
<a href="/es/api-reference/webhooks" target="_blank" class="api">Referencia de API — Webhooks</a>

El self-onboarding permite a los integradores POS asociar nuevas tiendas a su integración de forma autónoma, sin requerir intervención manual por cada tienda. Una vez que un TAM crea la `Integration` y el `clientId` en Auth0, su sistema puede aprovisionar y desaprovisionar tiendas de forma programática a cualquier escala.

## Prerrequisitos

Antes de utilizar el self-onboarding, un Technical Account Manager (TAM) debe realizar una configuración inicial única:

- Crear la entidad `Integration` en el backend de Rappi.
- Crear el `clientId` en Auth0 asociado a su integración.

Luego de esta configuración, todas las operaciones de aprovisionamiento son autoservicio.

## URL Base

Todos los endpoints de esta guía usan el path base `/api/v2/restaurants-integrations-public-api`.

Para dominios por país, consulte <a href="/es/rests-api/#dominios-por-pais" target="_blank">Dominios por País</a>. Para desarrollo, use `https://api.dev.rappi.com`.

**Ejemplo** — `GET /stores/integration-status` en producción Colombia:

```
GET https://api.rappi.com.co/api/v2/restaurants-integrations-public-api/stores/integration-status
```

## Autenticación

El self-onboarding utiliza un modelo de dos tokens. Su aplicación debe obtener dos tokens independientes antes de llamar a cualquier endpoint de self-onboarding:

### Token de integrador (sus credenciales)

Obtenga un token machine-to-machine (M2M) utilizando su `client_id` y `client_secret`. Para más detalles sobre cómo obtener este token, consulte la guía de <a href="/es/authentication-process/" target="_blank">Autenticación</a>.

Este token tiene una vida larga (TTL configurable). Guárdelo en caché y renuévelo solo cuando expire.

### Token de merchant (las credenciales de su merchant)

Para acceder a las tiendas de un merchant, su aplicación debe redirigirlo a través del flujo OAuth2 Authorization Code + PKCE de Rappi en Portal Partners. Esto autoriza a su integración a actuar en nombre del merchant.

| Entorno | Authorization URL | Token URL |
| ------- | ----------------- | --------- |
| Producción | `https://login.partners.rappi.com/authorize` | `https://login.partners.rappi.com/oauth/token` |
| Desarrollo | `https://login.partners.dev.rappi.com/authorize` | `https://login.partners.dev.rappi.com/oauth/token` |

> ℹ️ Los ejemplos a continuación usan el entorno de **Producción**. Reemplace las URLs con los endpoints de Desarrollo indicados arriba cuando realice pruebas.

> ⚠️ El `client_id` y su `redirect_uri` deben ser registrados con el equipo de integraciones de Rappi. Contáctese con su TAM.

**Paso 1 — Generar un code challenge PKCE**

Antes de redirigir, su backend debe generar un par PKCE:

1. Genere un `code_verifier` aleatorio y criptográficamente seguro (43–128 caracteres URL-safe)
2. Calcule `code_challenge = BASE64URL(SHA256(code_verifier))`

**Paso 2 — Redirigir al merchant**

Construya la URL de autorización y redirija el navegador del merchant:

```
GET https://login.partners.rappi.com/authorize
  ?client_id=YOUR_CLIENT_ID
  &redirect_uri=YOUR_REDIRECT_URI
  &response_type=code
  &scope=openid profile email
  &code_challenge=YOUR_CODE_CHALLENGE
  &code_challenge_method=S256
  &state=YOUR_RANDOM_STATE
```

> ⚠️ Siempre valide que el valor de `state` en la redirección coincide con el que envió — esto previene ataques CSRF.

**Paso 3 — El merchant se autentica**

El merchant inicia sesión con sus credenciales de Portal Partners. Una vez hecho esto, Portal Partners redirige de vuelta a su `redirect_uri` con un código de autorización:

```
GET YOUR_REDIRECT_URI?code=AUTHORIZATION_CODE&state=YOUR_RANDOM_STATE
```

**Paso 4 — Intercambiar el código por un JWT de merchant**

Su backend intercambia el código de autorización por un JWT de merchant:

```
POST https://login.partners.rappi.com/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=AUTHORIZATION_CODE
&client_id=YOUR_CLIENT_ID
&code_verifier=YOUR_CODE_VERIFIER
&redirect_uri=YOUR_REDIRECT_URI
```

> ℹ️ No se requiere `client_secret` — este es un cliente OAuth2 público que usa PKCE.

La respuesta es un JSON con varios tokens. Use el campo `id_token` — ese es el JWT del merchant y es el que contiene el email en sus claims:

```json
{
  "access_token": "<header>.<encrypted_key>.<iv>.<ciphertext>.<tag>",
  "id_token": "<header>.<payload>.<signature>",
  "token_type": "Bearer"
}
```

<aside class="warning">
  <p><b>Importante</b></p>
  <p>No use el campo <code>access_token</code>. En este flujo Auth0 lo devuelve como token opaco cifrado (JWE): Rappi no puede validarlo y la API responde <code>401 Invalid merchant token signature</code>. El mensaje dice "firma", pero el problema real es el formato.</p>
  <p><b>Cómo distinguirlos sin herramientas: cuente los puntos.</b> El <code>id_token</code> correcto es un JWT firmado y tiene <b>dos puntos</b> (tres partes). El <code>access_token</code> opaco tiene <b>cuatro puntos</b> (cinco partes).</p>
  <p>Si decodifica el primer segmento en Base64, el correcto declara <code>"alg":"RS256"</code>; el incorrecto declara <code>"alg":"dir"</code> junto con un campo <code>"enc"</code>. No se guíe por los primeros caracteres del token: dependen del orden de los campos del header y pueden cambiar sin que el token deje de ser válido.</p>
</aside>

El flujo no solicita `offline_access`, por lo que la respuesta no incluye `refresh_token`: cuando el `id_token` vence, el merchant debe repetir el flujo de autorización en el navegador. La vigencia del `id_token` la define la configuración de la aplicación en Auth0.

**Paso 5 — Usar ambos tokens en cada request**

| Header | Valor | Propósito |
| ------ | ----- | --------- |
| `X-Authorization` | `Bearer <integrator JWT>` | Identifica su integración |
| `Authorization-Partners` | `Bearer <merchant id_token>` | Otorga acceso a las tiendas del merchant |

<aside class="notice">
  <p>NOTA</p>
  <p>Ambos tokens son necesarios para los pasos 2, 3 y 5. El paso 1 (configuración del webhook) solo requiere el token del integrador.</p>
</aside>

## Flujo Paso a Paso

### Paso 1 — Configurar el webhook (una sola vez)

Registre una URL de webhook para su integración, de modo que Rappi pueda notificarle cuando una operación de aprovisionamiento finalice. Esta es una configuración única por integración.

Utilice el endpoint <a href="/es/api-reference/webhooks#post-integration-webhook" target="_blank">`POST /clients/{clientId}/webhooks`</a>:

```
POST /clients/{clientId}/webhooks
```

**Cuerpo de la solicitud:**

```json
{
  "event": "STORE_PROVISIONING_STATUS",
  "url": "https://your-endpoint.com/rappi/events",
  "secret": "your-hmac-secret"
}
```

El campo `event` especifica qué evento configurar (actualmente solo se soporta `STORE_PROVISIONING_STATUS`). El campo `secret` es opcional. Si se proporciona, Rappi firmará cada payload con HMAC-SHA256 e incluirá la firma en el header `Rappi-Signature` para que pueda verificar el origen de la solicitud. **Si se omite, no se enviará firma** — proporcione su propio secret y guárdelo de forma segura si necesita verificar la autenticidad del webhook.

Una respuesta `201 Created` confirma que el webhook está configurado (o `200 OK` si actualiza una configuración existente). A partir de este momento, todos los resultados de aprovisionamiento y desaprovisionamiento de su integración serán enviados a esta URL.

<aside class="notice">
  <p>NOTA</p>
  <p>El webhook <code>STORE_PROVISIONING_STATUS</code> se configura a nivel de integración y aplica a todas las tiendas. No es necesario configurarlo por tienda.</p>
</aside>

### Paso 2 — Obtener Tiendas

Antes de aprovisionar, verifique qué tiendas ya están integradas y cuáles no. Esto evita solicitudes de aprovisionamiento duplicadas.

Utilice el endpoint <a href="/es/api-reference/stores#get-integration-status" target="_blank">`GET /stores/integration-status`</a>:

```
GET /stores/integration-status
```

**Headers:**

| Header | Valor |
| ------ | ----- |
| `X-Authorization` | `Bearer <integrator JWT>` (M2M, Auth0) |
| `Authorization-Partners` | `Bearer <merchant id_token>` (OIDC, Auth0) |

Los IDs de tienda se obtienen automáticamente del email contenido en el JWT del merchant — no se requiere cuerpo en la solicitud.

**Respuesta:**

```json
{
  "stores": [
    {
      "store_id": "1",
      "name": "Your Brand Main",
      "brand": "YourBrand",
      "integrated": true,
      "integration_id": "your-integration-id",
      "children": [
        { "store_id": "3", "name": "Child Store 3", "brand": "YourBrand", "integrated": true,  "integration_id": "your-integration-id" },
        { "store_id": "4", "name": "Child Store 4", "brand": "YourBrand", "integrated": false }
      ]
    },
    {
      "store_id": "2",
      "name": "Your Brand Secondary",
      "brand": "YourBrand",
      "integrated": true,
      "integration_id": "your-integration-id",
      "children": []
    },
    {
      "store_id": "10",
      "name": "Sertester1",
      "brand": "YourBrand",
      "integrated": false,
      "children": [
        { "store_id": "20", "name": "Sertester1 Child 1", "brand": "YourBrand", "integrated": false },
        { "store_id": "21", "name": "Sertester1 Child 2", "brand": "YourBrand", "integrated": false }
      ]
    },
    {
      "store_id": "11",
      "name": "FIFOUno",
      "brand": "YourBrand",
      "integrated": false,
      "children": []
    }
  ]
}
```

Proceda a aprovisionar únicamente las tiendas donde `integrated` sea `false`. Cada entrada incluye `store_id`, `name` y `brand` para facilitar la identificación. El array `children` en la respuesta GET refleja la jerarquía actual de Rappi — sin embargo, al aprovisionar vía POST, cada tienda se integra como padre independiente sin importar su jerarquía actual.

### Paso 3 — Activación

Envíe una solicitud de aprovisionamiento para las tiendas que aún no están integradas. Esta operación es asincrónica — la API devuelve `202 Accepted` de inmediato y el resultado se entrega vía webhook. Puede aprovisionar hasta **20 tiendas por solicitud**.

Utilice el endpoint <a href="/es/api-reference/stores#post-provisioning" target="_blank">`POST /stores/provisioning`</a>:

```
POST /stores/provisioning
```

**Headers:**

| Header | Valor |
| ------ | ----- |
| `X-Authorization` | `Bearer <integrator JWT>` (M2M, Auth0) |
| `Authorization-Partners` | `Bearer <merchant id_token>` (OIDC, Auth0) |

**Cuerpo de la solicitud:**

```json
{
  "stores": [
    {
      "store_id": "10",
      "name": "Mi Tienda Principal",
      "status": "ACTIVE",
      "store_integration_id": "POS-001"
    },
    {
      "store_id": "101",
      "name": "Sucursal Norte",
      "status": "ACTIVE",
      "store_integration_id": "POS-NORTE"
    },
    {
      "store_id": "11",
      "name": "Mi Otra Tienda",
      "status": "ACTIVE"
    }
  ]
}
```

Los campos `store_id` y `name` son **requeridos** en cada ítem. El campo `status` es opcional y por defecto es `ACTIVE` si se omite. Cada tienda aprovisionada se convierte en un **padre independiente** — no se crea ninguna jerarquía padre/hijo. Si la tienda actualmente es hija en Partners, se promoverá automáticamente a padre independiente antes del aprovisionamiento (best-effort).

<aside class="notice">
  <p>GESTIÓN DE MENÚ</p>
  <p>Cada tienda integrada a través de self-onboarding debe administrar su menú de forma independiente. Rappi no hereda menús entre tiendas.</p>
</aside>

**Reglas de aprovisionamiento:**

| Regla | Descripción |
| ----- | ----------- |
| R1 | Todas las tiendas deben pertenecer al merchant autenticado. |
| R2 | Si una tienda ya está integrada con la misma integración, el aprovisionamiento es idempotente (no se realizan cambios). |
| R3 | Una tienda con hijas integradas **no puede desaprovisionarse** — será rechazada con `has_integrated_children`. Desaprovisione primero todas las hijas. |

Los siguientes campos son **opcionales** y controlan el comportamiento de la integración:

| Campo | Tipo | Por defecto | Descripción |
| ----- | ---- | ----------- | ----------- |
| `store_integration_id` | `string` | `store_id` de Rappi | Tu identificador interno de la tienda (Store ID en el POS). Úsalo para mapear la tienda de Rappi a tu propio sistema. |
| `ping_active` | `boolean` | `false` | Habilitar eventos de ping |
| `get_menu_active` | `boolean` | `false` | Habilitar eventos de obtención de menú |
| `cancellation_events` | `boolean` | `false` | Habilitar eventos de cancelación |

**Respuesta:** `202 Accepted`

```json
{
  "batch_id": "550e8400-e29b-41d4-a716-446655440000",
  "accepted": [
    { "store_id": "10", "integration_id": "your-integration-id" },
    { "store_id": "101", "integration_id": "your-integration-id" }
  ],
  "rejected": [
    { "store_id": "11", "reason": "not_owned" }
  ]
}
```

Posibles valores de `rejected[].reason`:

| Razón | Significado |
| ----- | ----------- |
| `not_owned` | La tienda no pertenece al merchant autenticado. |
| `missing_name` | El campo `name` está ausente o vacío. |
| `invalid_status` | El campo `status` tiene un valor inválido. |

Si **todas** las tiendas son rechazadas (ninguna pertenece al merchant), la API devuelve `422 Unprocessable Entity`.

### Paso 4 — Recibir el webhook

Cuando la operación de aprovisionamiento finaliza, Rappi envía un evento `STORE_PROVISIONING_STATUS` a la URL configurada en el paso 1.

Consulte <a href="/es/webhook-events#store-provisioning-status" target="_blank">STORE_PROVISIONING_STATUS</a> para la referencia completa del payload.

**Ejemplo de payload:**

```json
{
  "batchId": "550e8400-e29b-41d4-a716-446655440000",
  "integrationId": "your-integration-id",
  "operation": "PROVISION",
  "results": [
    { "storeId": "10", "integrationId": "your-integration-id", "brand": "YourBrand", "status": "ACTIVE", "httpCode": 201 },
    { "storeId": "101", "integrationId": "your-integration-id", "brand": "YourBrand", "status": "ACTIVE", "httpCode": 201 },
    { "storeId": "11", "integrationId": "your-integration-id", "brand": "YourBrand", "status": "FAILED", "errorMessage": "Store already exists", "httpCode": 409 }
  ],
  "timestamp": "2026-04-21T10:00:00Z"
}
```

Valores posibles de `results[].status`:

| Status | Significado |
| ------ | ----------- |
| `ACTIVE` | El aprovisionamiento finalizó con éxito. La tienda ya está integrada. |
| `INACTIVE` | El desaprovisionamiento finalizó con éxito. |
| `FAILED` | La operación falló. Revise `errorMessage` y `httpCode` para más detalles. |

`results[].httpCode` es el código HTTP de la operación subyacente (ej. `201` para éxito, `409` para conflicto, `204` para desaprovisionamiento).

`operation` es `PROVISION` o `DEPROVISION`.

### Paso 5 — Desactivación (opcional)

Para retirar tiendas de su integración, utilice el endpoint <a href="/es/api-reference/stores#post-deprovisioning" target="_blank">`POST /stores/deprovisioning`</a>. Al igual que el aprovisionamiento, esta operación es asincrónica — el resultado se entrega vía el mismo webhook `STORE_PROVISIONING_STATUS` con `operation: DEPROVISION` y `status: INACTIVE` por tienda.

```
POST /stores/deprovisioning
```

**Headers:**

| Header | Valor |
| ------ | ----- |
| `X-Authorization` | `Bearer <integrator JWT>` (M2M, Auth0) |
| `Authorization-Partners` | `Bearer <merchant id_token>` (OIDC, Auth0) |

**Cuerpo de la solicitud:**

```json
{
  "stores": [
    { "store_id": "10" }
  ]
}
```

El campo `store_id` es **requerido** por cada ítem.

**Respuesta:** `202 Accepted` con el mismo cuerpo de lote que el aprovisionamiento.

Si todas las tiendas son rechazadas, la API devuelve `422 Unprocessable Entity`.

## Resumen del Flujo Completo

```
[Una vez]     Configurar webhook → POST /clients/{clientId}/webhooks

[Por lote]    Obtener Tiendas    → GET /stores/integration-status
              Activación         → POST /stores/provisioning  (hasta 20 tiendas por solicitud)
              Aguardar resultado → webhook STORE_PROVISIONING_STATUS

[Opcional]    Desactivación     → POST /stores/deprovisioning
```

## Formato de Respuesta de Error

Todos los errores de esta API usan una estructura JSON consistente:

```json
{
  "message": "Descripción del error"
}
```

### Códigos HTTP

| Status | Cuándo |
|--------|--------|
| `400 Bad Request` | Solicitud inválida — campos faltantes, lista vacía, más de 20 tiendas, integraciones mezcladas |
| `401 Unauthorized` | Token de integrador ausente o inválido |
| `403 Forbidden` | Token del merchant no corresponde al `integrationId` de la integración, o merchant no autorizado en Partners |
| `422 Unprocessable Entity` | Todas las tiendas fueron rechazadas (ninguna pertenece al merchant) |
| `424 Failed Dependency` | Servicio de Partners no disponible |
| `500 Internal Server Error` | Error inesperado del servidor |

**Ejemplo — lista de tiendas excede el límite:**
```http
HTTP/1.1 400 Bad Request

{
  "message": "stores list exceeds maximum allowed size of 20"
}
```

**Ejemplo — merchant no autorizado:**
```http
HTTP/1.1 403 Forbidden

{
  "message": "Merchant not authorized in Partners"
}
```
