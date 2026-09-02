
# Utils

Utils API v1.2.0 incluye todos los recursos, puntos finales y métodos que lo ayudan a administrar el funcionamiento de su restaurante.

Las siguientes secciones lo guiarán a través del proceso permitido por esta API.

## Horarios del corredor

<a href="/es/api-reference/corridor-schedules" target="_blank" class="api">API Reference</a>

La API de Utils le permite administrar los horarios de sus corredores</br>

Puede crear, actualizar y obtener horarios de corredores en la plataforma.</br>

Establecer horarios para sus corredores le permite habilitarlos / deshabilitarlos en la aplicación de acuerdo con la operación de su horario.</br>

!!! important
La tienda hija usa la misma configuración de programación que la tienda principal.

**Las reglas principales que implican la gestión de horarios a través de la API de Utils consisten en**:

- Los corredores están disponibles las 24 horas o según el horario de la tienda. Cualquier ausencia de parametrización horaria para cualquier día de la semana o festivos para los pasillos significa que siempre estarán disponibles para los usuarios.

- Una vez que se crea un horario para cualquier corredor, **estará disponible en la aplicación en ese momento**.

- **Puede establecer muchos intervalos de tiempo para un corredor**, pero esos intervalos no se pueden superponer.

- El intervalo de tiempo consta de días de la semana o feriados con hora de inicio y hora de finalización, **la hora se indica en formato de 24 horas HH:mm:ss**.

- Los valores permitidos para indicar los días programados en los horarios son los siguientes:
  - **mon** = Lunes
  - **tue** = Martes
  - **wed** = Miércoles
  - **thu** = Jueves
  - **fri** = Viernes
  - **sat** = Sábado
  - **sun** = Domingo
  - **hol** = Feriado
- Las principales propiedades necesarias para la gestión de horarios a través de la API de Utils consisten en:
  - **store_id**: El identificador de la tienda del lado de Rappi
  - **integration_id**: El identificador de la tienda del lado del aliado
  - **corridor_id**: El identificador del corredor
  - **days**: Días programados de la semana en los que los pasillos o productos podrían estar disponibles (valores: lun, tue, mié, jue, vie, sáb, dom, hol)
  - **starts_time**: un tiempo específico para los días dados, cuando el corredor o producto comienza a estar disponible para los usuarios
  - **ends_time**: un tiempo específico para los días dados, cuando el corredor o el producto dejan de estar disponibles para los usuarios

Las siguientes secciones lo guían a través del proceso de configuración de horarios de corredor.

!!! important
La información de los corredores están representados por tienda. En el caso de las tiendas Rappi maneja dos ids, el store_id el id de la tienda en Rappi y el integration_id el id de la tienda del aliado. Por ellos se proposionan endpoints para el manejo de los corredores tanto por store_id como por integration_id Si usted maneja sus propios ids de las tiendas debe usar los endpoints **Por Integración Id**. Si usted usa los ids de las tiendas porporcionados por Rappi debe usar los endpoints **Por Tienda**.

### Por ID de tienda

#### Información del corredor

<a href="/es/api-reference/corridor-schedules#get-corridor-store-store-id" target="_blank" class="api">API Reference</a>

Use el endpoint <a href="/es/api-reference/corridor-schedules#get-corridor-store-store-id" target="_blank">`GET corridor/stores/{storeId}`</a> para conseguir los corredores de tu tienda.

Para conseguir los corredores de tu tienda:

Realiza una solicitud `GET` a la siguiente URL.

**URL**: `https://{COUNTRY_DOMAIN}/api/rest-ops-utils/corridor/store/{storeId}`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

El sistema devuelve una respuesta `JSON` como la siguiente

```json
[
  {
    "id": 123,
    "name": "Bebidas Calientes",
    "description": "Corredor Bebidas Calientes",
    "store_id": 999
  },
  {
    "id": 321,
    "name": "Bebidas Frias",
    "description": "Corredor Bebidas Frias",
    "store_id": 999
  }
]
```

#### Obtener horarios de corredor

<a href="/es/api-reference/corridor-schedules#get-corridor-schedule-corridor-id-store-store-id" target="_blank" class="api">API Reference</a>

Utilice el endpoint <a href="/es/api-reference/corridor-schedules#get-corridor-schedule-corridor-id-store-store-id" target="_blank">`GET corridor/schedule/{corridorId}/store/{storeId}`</a> para obtener los horarios de tu tienda por corredor.

Para obtener los horarios del corredor para su tienda por corredor:

Realiza una solicitud `GET` a la siguiente URL.

**URL**: `https://{COUNTRY_DOMAIN}/api/rest-ops-utils/corridor/schedule/{corridorId}/store/{storeId}`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

El sistema devuelve una respuesta `JSON` como la siguiente:

```json
{
  "corridor_id": 321,
  "store_id": 999,
  "schedule_details": [
    {
      "id": 1,
      "days": "mon,tue,wed,thu,fri,sat,sun,hol",
      "starts_time": "08:00:00",
      "ends_time": "20:00:00"
    }
  ]
}
```

#### Creación de horarios de corredores

<a href="/es/api-reference/corridor-schedules#post-corridor-schedule-corridor-id-store-store-id" target="_blank" class="api">API Reference</a>

Use el endpoint <a href="/es/api-reference/corridor-schedules#post-corridor-schedule-corridor-id-store-store-id" target="_blank">`POST /corridor/schedule/{corridorId}/store/{storeId}`</a> para crear los horarios de los corredores de su tienda.

Para crear los horarios de su corredor:

Realiza una solicitud `POST` a la siguiente URL y agrega un objeto `JSON` al cuerpo de la solicitud con los siguientes objetos.

**URL**: `https://{COUNTRY_DOMAIN}/api/rest-ops-utils/corridor/schedule/{corridorId}/store/{storeId}`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

Este es un ejemplo del objeto `JSON` en el cuerpo de la solicitud:

```json
{
  "schedule_details": [
    {
      "days": "mon,tue,wed,thu,fri,sat,sun",
      "starts_time": "08:00:00",
      "ends_time": "20:00:00"
    },
    {
      "days": "hol",
      "starts_time": "13:00:00",
      "ends_time": "22:00:00"
    }
  ]
}
```

!!! note
Los valores de este `JSON` no son datos reales. Asegúrate de reemplazarlos con tus datos cuando realice solicitudes de API.

El sistema devuelve una respuesta `JSON` como la siguiente:

```json
{
  "corridor_id": 123,
  "store_id": 999,
  "schedule_details": [
    {
      "id": 2,
      "days": "mon,tue,wed,thu,fri,sat,sun",
      "starts_time": "08:00:00",
      "ends_time": "20:00:00"
    },
    {
      "id": 3,
      "days": "hol",
      "starts_time": "13:00:00",
      "ends_time": "22:00:00"
    }
  ]
}
```

#### Actualización de horarios de corredor

<a href="/es/api-reference/corridor-schedules#put-corridor-schedule-corridor-id-store-store-id" target="_blank" class="api">API Reference</a>

Use el endpoint <a href="/es/api-reference/corridor-schedules#put-corridor-schedule-corridor-id-store-store-id" target="_blank">`PUT /corridor/schedule/{corridorId}/store/{storeId}`</a> para actualizar los horarios de los corredores de su tienda.

Para actualizar los horarios de su corredor:

Realiza una solicitud `PUT` a la siguiente URL y agrega un`JSON` al cuerpo de la solicitud con los siguientes objetos.

**URL**: `https://{COUNTRY_DOMAIN}/api/rest-ops-utils/corridor/schedule/{corridorId}/store/{storeId}`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

Este es un ejemplo del `JSON` en el cuerpo de la solicitud:

```json
{
  "schedule_details": [
    {
      "id": 2,
      "days": "mon,tue,wed,thu,fri,sat,sun",
      "starts_time": "10:00:00",
      "ends_time": "16:00:00"
    }
  ]
}
```

!!! note
Los valores de este `JSON` no son datos reales. Asegúrate de reemplazarlos con tus datos cuando realice solicitudes de API.

El sistema devuelve una respuesta `JSON` como la siguiente:

```json
{
  "corridor_id": 123,
  "store_id": 999,
  "schedule_details": [
    {
      "id": 2,
      "days": "mon,tue,wed,thu,fri,sat,sun",
      "starts_time": "10:00:00",
      "ends_time": "16:00:00"
    }
  ]
}
```

#### Eliminación de horarios de corredor

<a href="/es/api-reference/corridor-schedules#delete-corridor-schedule-corridor-id-store-store-id" target="_blank" class="api">API Reference</a>

Use el endpoint <a href="/es/api-reference/corridor-schedules#delete-corridor-schedule-corridor-id-store-store-id" target="_blank">`DELETE /corridor/schedule/{corridorId}/store/{storeId}/{corridorScheduleId}`</a> para eliminar los horarios de los corredores de su tienda.

Para eliminar un horario de su corredor:

Realiza una solicitud `DELETE` a la siguiente URL.

**URL**: `https://{COUNTRY_DOMAIN}/api/rest-ops-utils/corridor/schedule/{corridorId}/store/{storeId}/{corridorScheduleId}`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

El sistema devuelve una respuesta `JSON` como la siguiente:

```json
{
  "corridor_id": 123,
  "store_id": 999,
  "schedule_details": [
    {
      "id": 2,
      "days": "mon,tue,wed,thu,fri,sat,sun",
      "starts_time": "10:00:00",
      "ends_time": "16:00:00"
    }
  ]
}
```

!!! note
La lista en schedule_details representa los horarios que aun persisten en su corredor.

### Por ID de integración

#### Información del corredor

<a href="/es/api-reference/corridor-schedules-by-integration#get-corridor-integration-integration-id" target="_blank" class="api">API Reference</a>

Use el endpont <a href="/es/api-reference/corridor-schedules-by-integration#get-corridor-integration-integration-id" target="_blank">`GET corridor/integration/{integrationId}`</a> para conseguir los corredores de tu tienda.

Para conseguir los corredores de tu tienda:

Realiza una solicitud `GET` a la siguiente URL.

**URL**: `https://{COUNTRY_DOMAIN}/api/rest-ops-utils/corridor/integration/{integrationId}`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

El sistema devuelve una respuesta `JSON` como la siguiente

```json
[
  {
    "id": 123,
    "name": "Bebidas Calientes",
    "description": "Corredor Bebidas Calientes",
    "integration_id": "888"
  },
  {
    "id": 321,
    "name": "Bebidas Frias",
    "description": "Corredor Bebidas Frias",
    "integration_id": "888"
  }
]
```

#### Obtener horarios de corredor

<a href="/es/api-reference/corridor-schedules-by-integration#get-corridor-schedule-corridor-id-integration-integration-id" target="_blank" class="api">API Reference</a>

Utilice el endpoint <a href="/es/api-reference/corridor-schedules-by-integration#get-corridor-schedule-corridor-id-integration-integration-id" target="_blank">`GET corridor/schedule/{corridorId}/integration/{integrationId}`</a> para obtener los horarios de tu tienda por corredor.

Para obtener los horarios del corredor para su tienda por corredor:

Realiza una solicitud `GET` a la siguiente URL.

**URL**: `https://{COUNTRY_DOMAIN}/api/rest-ops-utils/corridor/schedule/{corridorId}/integration/{integrationId}`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

El sistema devuelve una respuesta `JSON` como la siguiente:

```json
{
  "corridor_id": 321,
  "integration_id": "888",
  "schedule_details": [
    {
      "id": 1,
      "days": "mon,tue,wed,thu,fri,sat,sun,hol",
      "starts_time": "08:00:00",
      "ends_time": "20:00:00"
    }
  ]
}
```

#### Creación de horarios de corredores

<a href="/es/api-reference/corridor-schedules-by-integration#post-corridor-schedule-corridor-id-integration-integration-id" target="_blank" class="api">API Reference</a>

Use el endpoint <a href="/es/api-reference/corridor-schedules-by-integration#post-corridor-schedule-corridor-id-integration-integration-id" target="_blank">`POST /corridor/schedule/{corridorId}/integration/{integrationId}`</a> para crear los horarios de los corredores de su tienda.

Para crear los horarios de su corredor:

Realiza una solicitud `POST` a la siguiente URL y agrega un objeto `JSON` al cuerpo de la solicitud con los siguientes objetos.

**URL**: `https://{COUNTRY_DOMAIN}/api/rest-ops-utils/corridor/schedule/{corridorId}/integration/{integrationId}`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

Este es un ejemplo del objeto `JSON` en el cuerpo de la solicitud:

```json
{
  "schedule_details": [
    {
      "days": "mon,tue,wed,thu,fri,sat,sun",
      "starts_time": "08:00:00",
      "ends_time": "20:00:00"
    },
    {
      "days": "hol",
      "starts_time": "13:00:00",
      "ends_time": "22:00:00"
    }
  ]
}
```

!!! note
Los valores de este `JSON` no son datos reales. Asegúrate de reemplazarlos con tus datos cuando realice solicitudes de API.

El sistema devuelve una respuesta `JSON` como la siguiente:

```json
{
  "corridor_id": 123,
  "integration_id": "888",
  "schedule_details": [
    {
      "id": 2,
      "days": "mon,tue,wed,thu,fri,sat,sun",
      "starts_time": "08:00:00",
      "ends_time": "20:00:00"
    },
    {
      "id": 3,
      "days": "hol",
      "starts_time": "13:00:00",
      "ends_time": "22:00:00"
    }
  ]
}
```

#### Actualización de horarios de corredor

<a href="/es/api-reference/corridor-schedules-by-integration#put-corridor-schedule-corridor-id-integration-integration-id" target="_blank" class="api">API Reference</a>

Use el endpoint <a href="/es/api-reference/corridor-schedules-by-integration#put-corridor-schedule-corridor-id-integration-integration-id" target="_blank">`PUT /corridor/schedule/{corridorId}/integration/{integrationId}`</a> para actualizar los horarios de los corredores de su tienda.

Para actualizar los horarios de su corredor:

Realiza una solicitud `PUT` a la siguiente URL y agrega un`JSON` al cuerpo de la solicitud con los siguientes objetos.

**URL**: `https://{COUNTRY_DOMAIN}/api/rest-ops-utils/corridor/schedule/{corridorId}/integration/{integrationId}`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

Este es un ejemplo del `JSON` en el cuerpo de la solicitud:

```json
{
  "schedule_details": [
    {
      "id": 2,
      "days": "mon,tue,wed,thu,fri,sat,sun",
      "starts_time": "10:00:00",
      "ends_time": "16:00:00"
    }
  ]
}
```

!!! note
Los valores de este `JSON` no son datos reales. Asegúrate de reemplazarlos con tus datos cuando realice solicitudes de API.

El sistema devuelve una respuesta `JSON` como la siguiente:

```json
{
  "corridor_id": 123,
  "integration_id": "888",
  "schedule_details": [
    {
      "id": 2,
      "days": "mon,tue,wed,thu,fri,sat,sun",
      "starts_time": "10:00:00",
      "ends_time": "16:00:00"
    }
  ]
}
```

#### Eliminación de horarios de corredor

<a href="/es/api-reference/corridor-schedules-by-integration#delete-corridor-schedule-corridor-id-integration-integration-id" target="_blank" class="api">API Reference</a>

Use el endpoint <a href="/es/api-reference/corridor-schedules-by-integration#delete-corridor-schedule-corridor-id-integration-integration-id" target="_blank">`DELETE /corridor/schedule/{corridorId}/integration/{integrationId}/{corridorScheduleId}`</a> para eliminar los horarios de los corredores de su tienda.

Para eliminar un horario de su corredor:

Realiza una solicitud `DELETE` a la siguiente URL.

**URL**: `https://{COUNTRY_DOMAIN}/api/rest-ops-utils/corridor/schedule/{corridorId}/integration/{integrationId}/{corridorScheduleId}`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

El sistema devuelve una respuesta `JSON` como la siguiente:

```json
{
  "corridor_id": 123,
  "integration_id": "888",
  "schedule_details": [
    {
      "id": 2,
      "days": "mon,tue,wed,thu,fri,sat,sun",
      "starts_time": "10:00:00",
      "ends_time": "16:00:00"
    }
  ]
}
```

!!! note
La lista en schedule_details representa los horarios que aun persisten en su corredor.

## Horarios de productos

<a git shref="/es/api-reference/product-schedules" target="_blank" class="api">API Reference</a>

La API de Utils le permite administrar los horarios de sus productos.</br>

Puede crear, actualizar y obtener horarios de productos en la plataforma.</br>

La configuración de horarios para sus productos le permite habilitarlos / deshabilitarlos en la aplicación de acuerdo con la operación de su horario.</br>

!!! important
La tienda hija usa la misma configuración de programación de horario que la tienda principal.

**Las principales reglas que involucran la administración de horarios a través de la API de Utils consisten en lo siguiente**:

- Los productos están disponibles las 24 horas o según el horario de la tienda / pasillo. Cualquier ausencia de parametrización horaria para cualquier día de la semana o festivos de los productos significa que siempre estarán disponibles para los usuarios.

- Una vez que se crea un horario para cualquier producto, **estará disponible en la aplicación en ese momento**.

- **Puede establecer muchos intervalos de tiempo para un producto**, pero esos intervalos no se pueden superponer.

- El intervalo de tiempo consta de días de la semana o feriados con hora de inicio y hora de finalización, que **la hora se indica en formato de 24 horas HH:mm:ss**.

- Los valores permitidos para indicar los días programados en los horarios son los siguientes:

  - **mon** = Lunes
  - **tue** = Martes
  - **wed** = Miércoles
  - **thu** = Jueves
  - **fri** = Viernes
  - **sat** = Sábado
  - **sun** = Domingo
  - **hol** = Feriado

- `Cualquier horario creado para un producto tiene mayor prioridad que el horario del corredor`. Si solo un producto está disponible en un intervalo de tiempo específico, el corredor que lo contiene también estará disponible independientemente de no tener un horario en el mismo intervalo de tiempo.

- Las principales propiedades necesarias para la gestión de horarios a través de la API de Utils consisten en:
  - **store_id**: El identificador de la tienda en Rappi
  - **integration_id**: El identificador de la tienda en el aliado
  - **corridor_id**: El identificador del corredor
  - **product_id**: El identificador del producto en Rappi
  - **sku**: El identificador del producto en el aliado
  - **days**: Días programados de la semana en los que los pasillos o productos podrían estar disponibles (valores: mon,tue,wed,thu,fri,sat,sun,hol))
  - **starts_time**: un tiempo específico para los días dados, cuando el corredor o producto comienza a estar disponible para los usuarios
  - **ends_time**: un tiempo específico para los días dados, cuando el corredor o el producto dejan de estar disponibles para los usuarios

Las siguientes secciones lo guiarán a través del proceso de configuración de programas de productos.

!!! important
Los horarios de los productos se puede manejar tanto con el **product_id** (el identificador del producto en Rappi) como por **sku**
(identificador del producto del lado del aliado)
Si usted maneja sus propios ids de los productos debe usar los endpoints **Por Sku**.
Si usted usa los ids de los productos porporcionados por Rappi debe usar los endpoints **Por Product Id**.

### Por producto

#### Información del producto

<a href="/es/api-reference/product-schedules#get-product-corridor-corridor-id-store-store-id" target="_blank" class="api">API Reference</a>

Use el endpoint <a href="/es/api-reference/product-schedules#get-product-corridor-corridor-id-store-store-id" target="_blank">`GET product/corridor/{corridorId}/store/{storeId}`</a> para conseguir los productos de tu tienda por corredor.

Para obtener los productos de su tienda por corredor:

Realiza una solicitud `GET` a la siguiente URL.

**URL**: `https://{COUNTRY_DOMAIN}/api/rest-ops-utils/product/corridor/{corridorId}/store/{storeId}`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

El sistema devuelve una respuesta `JSON` como la siguiente

```json
[
  {
    "product_id": 789,
    "name": "Americano Caliente 16 oz",
    "description": "16 oz. Espresso con agua caliente.",
    "corridor_id": 123,
    "store_id": 999
  },
  {
    "product_id": 987,
    "name": "Americano Caliente 20 oz",
    "description": "20 oz. Espresso con agua caliente.",
    "corridor_id": 123,
    "store_id": 999
  }
]
```

#### Obtener horarios de productos

<a href="/es/api-reference/product-schedules#get-product-schedule-product-id-corridor-corridor-id-store-store-id" target="_blank" class="api">API Reference</a>

Use el endpoint<a href="/es/api-reference/product-schedules#get-product-schedule-product-id-corridor-corridor-id-store-store-id" target="_blank">`GET product/schedule/{productId}/corridor/{corridorId}/store/{storeId}`</a> para obtener los horarios de su producto por tienda y corredor.

Obtener los horarios de su producto por un corredor:

Realiza una solicitud `GET` a la siguiente URL.

**URL**: `https://{COUNTRY_DOMAIN}/api/rest-ops-utils/product/schedule/{productId}/corridor/{corridorId}/store/{storeId}`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

El sistema devuelve una respuesta `JSON` como la siguiente

```json
{
  "product_id": 789,
  "corridor_id": 123,
  "store_id": 999,
  "schedule_details": [
    {
      "id": 4,
      "days": "mon,tue,wed,thu,fri,sat,sun,hol",
      "starts_time": "08:00:00",
      "ends_time": "23:00:00"
    }
  ]
}
```

#### Creación de horarios de productos

<a href="/es/api-reference/product-schedules#post-product-schedule-product-id-corridor-corridor-id-store-store-id" target="_blank" class="api">API Reference</a>

Use el endpoint <a href="/es/api-reference/product-schedules#post-product-schedule-product-id-corridor-corridor-id-store-store-id" target="_blank">`POST product/schedule/{productId}/corridor/{corridorId}/store/{storeId}`</a> para crear los horarios de su producto por tienda y corredor.

Para crear los horarios de su producto por un corredor:

Realice una solicitud `POST` a la siguiente URL y agregue un`JSON` al cuerpo de la solicitud con los siguientes objetos.

**URL**: `https://{COUNTRY_DOMAIN}/api/rest-ops-utils/product/schedule/{productId}/corridor/{corridorId}/store/{storeId}`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

Este es un ejemplo del objeto `JSON` en el cuerpo de la solicitud:

```json
{
  "schedule_details": [
    {
      "days": "mon,tue,wed,thu,fri,sat,sun",
      "starts_time": "08:00:00",
      "ends_time": "20:00:00"
    },
    {
      "days": "hol",
      "starts_time": "13:00:00",
      "ends_time": "22:00:00"
    }
  ]
}
```

!!! note
Los valores de este `JSON` no son datos reales. Asegúrate de reemplazarlos con tus datos cuando realice solicitudes de API.

El sistema devuelve una respuesta `JSON` como la siguiente:

```json
{
  "product_id": 789,
  "corridor_id": 123,
  "store_id": 999,
  "schedule_details": [
    {
      "id": 5,
      "days": "mon,tue,wed,thu,fri,sat,sun",
      "starts_time": "08:00:00",
      "ends_time": "20:00:00"
    },
    {
      "id": 6,
      "days": "hol",
      "starts_time": "13:00:00",
      "ends_time": "22:00:00"
    }
  ]
}
```

#### Actualización de horarios de productos

<a href="/es/api-reference/product-schedules#put-product-schedule-product-id-corridor-corridor-id-store-store-id" target="_blank" class="api">API Reference</a>

Use el endpoint <a href="/es/api-reference/product-schedules#put-product-schedule-product-id-corridor-corridor-id-store-store-id" target="_blank">`PUT product/schedule/{productId}/corridor/{corridorId}/store/{storeId}`</a> para actualizar los horarios de su producto por tienda y corredor.

Para actualizar los horarios de su producto por un corredor:

Realiza una solicitud `PUT` a la siguiente URL y agrega un`JSON` al cuerpo de la solicitud con los siguientes objetos.

**URL**: `https://{COUNTRY_DOMAIN}/api/rest-ops-utils/product/schedule/{productId}/corridor/{corridorId}/store/{storeId}`

`{COUNTRY_DOMAIN}`: Este es su dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

Este es un ejemplo del `JSON` en el cuerpo de la solicitud:

```json
{
  "schedule_details": [
    {
      "id": 5,
      "days": "mon,tue,wed,thu,fri,sat,sun",
      "starts_time": "10:00:00",
      "ends_time": "16:00:00"
    }
  ]
}
```

!!! note
Los valores de este `JSON` no son datos reales. Asegúrate de reemplazarlos con tus datos cuando realice solicitudes de API.

El sistema devuelve una respuesta `JSON` como la siguiente:

```json
{
  "product_id": 789,
  "corridor_id": 123,
  "store_id": 999,
  "schedule_details": [
    {
      "id": 5,
      "days": "mon,tue,wed,thu,fri,sat,sun",
      "starts_time": "10:00:00",
      "ends_time": "16:00:00"
    }
  ]
}
```

#### Eliminación de horarios de productos

<a href="/es/api-reference/product-schedules#delete-product-schedule-product-id-corridor-corridor-id-store-store-id" target="_blank" class="api">API Reference</a>

Use el endpoint <a href="/es/api-reference/product-schedules#delete-product-schedule-product-id-corridor-corridor-id-store-store-id" target="_blank">`DELETE product/schedule/{productId}/corridor/{corridorId}/store/{storeId}/{corridorProductScheduleId}`</a> para eliminar los horarios de su producto por tienda y corredor.

Para eliminar los horarios de su producto por un corredor:

Realiza una solicitud `DELETE` a la siguiente URL.

**URL**: `https://{COUNTRY_DOMAIN}/api/rest-ops-utils/product/schedule/{productId}/corridor/{corridorId}/store/{storeId}/{corridorProductScheduleId}`

`{COUNTRY_DOMAIN}`: Este es su dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

```json
{
  "product_id": 789,
  "corridor_id": 123,
  "store_id": 999,
  "schedule_details": [
    {
      "id": 5,
      "days": "mon,tue,wed,thu,fri,sat,sun",
      "starts_time": "10:00:00",
      "ends_time": "16:00:00"
    }
  ]
}
```

!!! note
La lista en schedule_details representa los horarios que aun persisten en su producto.

### Por SKU

#### Información del SKU

<a href="/es/api-reference/product-schedules-by-sku#get-sku-corridor-corridor-id-integration-integration-id" target="_blank" class="api">API Reference</a>

Use el endpoint <a href="/es/api-reference/product-schedules-by-sku#get-sku-corridor-corridor-id-integration-integration-id" target="_blank">`GET sku/corridor/{corridorId}/integration/{integrationId}`</a> para conseguir los productos de tu tienda por corredor.

Para obtener los skus de su tienda por corredor:

Realiza una solicitud `GET` a la siguiente URL.

**URL**: `https://{COUNTRY_DOMAIN}/api/rest-ops-utils/sku/corridor/{corridorId}/integration/{integrationId}`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

El sistema devuelve una respuesta `JSON` como la siguiente

```json
[
  {
    "sku": 987,
    "name": "Americano Caliente 16 oz",
    "description": "16 oz. Espresso con agua caliente.",
    "corridor_id": 123,
    "integration_id": "888"
  },
  {
    "sku": 988,
    "name": "Americano Caliente 20 oz",
    "description": "20 oz. Espresso con agua caliente.",
    "corridor_id": 123,
    "integration_id": "888"
  }
]
```

#### Obtener horarios de productos

<a href="/es/api-reference/product-schedules-by-sku#get-sku-schedule-sku-corridor-corridor-id-integration-integration-id" target="_blank" class="api">API Reference</a>

Use el endpoint<a href="/es/api-reference/product-schedules-by-sku#get-sku-schedule-sku-corridor-corridor-id-integration-integration-id" target="_blank">`GET sku/schedule/{sku}/corridor/{corridorId}/integration/{integrationId}`</a> para obtener los horarios de su producto por tienda y corredor.

Obtener los horarios de su producto por un corredor:

Realiza una solicitud `GET` a la siguiente URL.

**URL**: `https://{COUNTRY_DOMAIN}/api/rest-ops-utils/sku/schedule/{sku}/corridor/{corridorId}/integration/{integrationId}`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

El sistema devuelve una respuesta `JSON` como la siguiente

```json
{
  "sku": 987,
  "corridor_id": 123,
  "integration_id": "888",
  "schedule_details": [
    {
      "id": 4,
      "days": "mon,tue,wed,thu,fri,sat,sun,hol",
      "starts_time": "08:00:00",
      "ends_time": "23:00:00"
    }
  ]
}
```

#### Creación de horarios de productos

<a href="/es/api-reference/product-schedules-by-sku#post-sku-schedule-sku-corridor-corridor-id-integration-integration-id" target="_blank" class="api">API Reference</a>

Use el endpoint <a href="/es/api-reference/product-schedules-by-sku#post-sku-schedule-sku-corridor-corridor-id-integration-integration-id" target="_blank">`POST sku/schedule/{sku}/corridor/{corridorId}/integration/{integrationId}`</a> para crear los horarios de su producto por tienda y corredor.

Para crear los horarios de su producto por un corredor:

Realice una solicitud `POST` a la siguiente URL y agregue un`JSON` al cuerpo de la solicitud con los siguientes objetos.

**URL**: `https://{COUNTRY_DOMAIN}/api/rest-ops-utils/sku/schedule/{sku}/corridor/{corridorId}/integration/{integrationId}`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

Este es un ejemplo del objeto `JSON` en el cuerpo de la solicitud:

```json
{
  "schedule_details": [
    {
      "days": "mon,tue,wed,thu,fri,sat,sun",
      "starts_time": "08:00:00",
      "ends_time": "20:00:00"
    },
    {
      "days": "hol",
      "starts_time": "13:00:00",
      "ends_time": "22:00:00"
    }
  ]
}
```

!!! note
Los valores de este `JSON` no son datos reales. Asegúrate de reemplazarlos con tus datos cuando realice solicitudes de API.

El sistema devuelve una respuesta `JSON` como la siguiente:

```json
{
  "sku": 987,
  "corridor_id": 123,
  "integration_id": "888",
  "schedule_details": [
    {
      "id": 5,
      "days": "mon,tue,wed,thu,fri,sat,sun",
      "starts_time": "08:00:00",
      "ends_time": "20:00:00"
    },
    {
      "id": 6,
      "days": "hol",
      "starts_time": "13:00:00",
      "ends_time": "22:00:00"
    }
  ]
}
```

#### Actualización de horarios de productos

<a href="/es/api-reference/product-schedules-by-sku#put-sku-schedule-sku-corridor-corridor-id-integration-integration-id" target="_blank" class="api">API Reference</a>

Use el endpoint <a href="/es/api-reference/product-schedules-by-sku#put-sku-schedule-sku-corridor-corridor-id-integration-integration-id" target="_blank">`PUT sku/schedule/{sku}/corridor/{corridorId}/integration/{integrationId}`</a> para actualizar los horarios de su producto por tienda y corredor.

Para actualizar los horarios de su producto por un corredor:

Realiza una solicitud `PUT` a la siguiente URL y agrega un`JSON` al cuerpo de la solicitud con los siguientes objetos.

**URL**: `https://{COUNTRY_DOMAIN}/api/rest-ops-utils/sku/schedule/{sku}/corridor/{corridorId}/integration/{integrationId}`

`{COUNTRY_DOMAIN}`: Este es su dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

Este es un ejemplo del `JSON` en el cuerpo de la solicitud:

```json
{
  "schedule_details": [
    {
      "id": 5,
      "days": "mon,tue,wed,thu,fri,sat,sun",
      "starts_time": "10:00:00",
      "ends_time": "16:00:00"
    }
  ]
}
```

!!! note
Los valores de este `JSON` no son datos reales. Asegúrate de reemplazarlos con tus datos cuando realice solicitudes de API.

El sistema devuelve una respuesta `JSON` como la siguiente:

```json
{
  "sku": 987,
  "corridor_id": 123,
  "integration_id": "888",
  "schedule_details": [
    {
      "id": 5,
      "days": "mon,tue,wed,thu,fri,sat,sun",
      "starts_time": "10:00:00",
      "ends_time": "16:00:00"
    }
  ]
}
```

#### Eliminacion de horarios de productos

<a href="/es/api-reference/product-schedules-by-sku#delete-sku-schedule-sku-corridor-corridor-id-integration-integration-id" target="_blank" class="api">API Reference</a>

Use el endpoint <a href="/es/api-reference/product-schedules-by-sku#delete-sku-schedule-sku-corridor-corridor-id-integration-integration-id" target="_blank">`PUT sku/schedule/{sku}/corridor/{corridorId}/integration/{integrationId}/{corridorProductScheduleId}`</a> para eliminar los horarios de su producto por tienda y corredor.

Para eliminar los horarios de su producto por un corredor:

Realiza una solicitud `DELETE` a la siguiente URL.

**URL**: `https://{COUNTRY_DOMAIN}/api/rest-ops-utils/sku/schedule/{sku}/corridor/{corridorId}/integration/{integrationId}/{corridorProductScheduleId}`

`{COUNTRY_DOMAIN}`: Este es su dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

El sistema devuelve una respuesta `JSON` como la siguiente

```json
{
  "sku": 987,
  "corridor_id": 123,
  "integration_id": "888",
  "schedule_details": [
    {
      "id": 5,
      "days": "mon,tue,wed,thu,fri,sat,sun",
      "starts_time": "10:00:00",
      "ends_time": "16:00:00"
    }
  ]
}
```

!!! note
La lista en schedule_details representa los horarios que aun persisten en su producto.

## Horarios de tiendas

<a git shref="/es/api-reference/store-schedules" target="_blank" class="api">API Reference</a>

La API de Utils le permite administrar los horarios de sus tiendas.</br>

Puede crear, actualizar y obtener horarios de tiendas en la plataforma.</br>

!!! important
Cada tienda usa su propia configuración de programación de horario.

**Las principales reglas que involucran la administración de horarios a través de la API de Utils consisten en lo siguiente**:

- Una franja horaria es un segmento de tiempo en el cual la tienda tiene operaciones. Pueden existir multiples franjas horarias en un día de operación. La franja horaria se compone de un starts_time and ends_time, estos campos son hora inicio y hora final de la franja está denotada por formato 24 horas HH:mm:ss

- Una vez que se crea una franja horaria para cualquier tienda, **estará disponible en la aplicación en ese momento**.

- **Puede establecer muchos intervalos de tiempo para una tienda**, pero esos intervalos no se pueden superponer.

- Los tipos de horarios constan en días del horario regular semanal, días feriados y días especiales.

- El horario regular es un conjunto de franjas horarias que representan el horario de operaciones durante la semana (Lunes - Domingo).

- Los valores permitidos para indicar un día en un horario regular son los siguientes:

  - **mon** = Lunes
  - **tue** = Martes
  - **wed** = Miércoles
  - **thu** = Jueves
  - **fri** = Viernes
  - **sat** = Sábado
  - **sun** = Domingo

- Los días festivos son conjunto de horarios clasificados por día y mes, los cuales se encuentran previamente configurados por Rappi de acuerdo al calendario oficial de cada pais.

- Una tienda es tomada como 24 horas si no tiene parametrización para ningún dia normal y festivo.

!!! note
Rappi te dá la facilidad de tener un horario especial para esos días dado que generalmente representan ventas como un día dominical.

- Sabemos que quieres celebrar fechas especiales, por ejemplo, el aniversario de tu establecimiento, por ende te damos la posibilidad de crear días especiales y además administrar las franjas horarias para ese día.

!!! important
Se recomienda que la hora de cierre (la ultima franja horaria del día en curso) sea configurada con base al tiempo de coccion promedio de tu tienda, con esto evitarías que se generase una orden en el ultimo minuto antes de cerrar el establecimiento. Además, le darás tiempo a nuestro RT para que pueda recoger el pedido.

- Las principales propiedades necesarias para la gestión de horarios a través de la API de Utils consisten en:
  - **store_id**: El identificador de la tienda en Rappi
  - **day**: Día programado de la semana en la que la tienda podría estar disponible (valores: mon,tue,wed,thu,fri,sat,sun)
  - **starts_time**: Un tiempo específico para los días dados, cuando la tienda comienza a estar disponible para los usuarios
  - **ends_time**: Un tiempo específico para los días dados, cuando la tienda deja de estar disponible para los usuarios

### Por tienda

#### Información del horario regular

<a href="/es/api-reference/store-schedules#get-store-schedule" target="_blank" class="api">API Reference</a>

Use el endpoint <a href="/es/api-reference/store-schedules#get-store-schedule" target="_blank">`GET store/schedule/{storeId}`</a> para conseguir todo el horario regular de su tienda.

Para obtener el horario regular de su tienda:

Realiza una solicitud `GET` a la siguiente URL.

**URL**: `https://{COUNTRY_DOMAIN}/api/rest-ops-utils/store/schedule/{storeId}`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

El sistema devuelve una respuesta `JSON` como la siguiente

```json
{
  "storeScheduleDays": [
    {
      "day": "mon",
      "storeSchedules": [
        {
          "id": 1171828,
          "startsTime": "07:00:00",
          "endsTime": "09:00:00"
        }
      ]
    },
    {
      "day": "tue",
      "storeSchedules": [
        {
          "id": 21126084,
          "startsTime": "00:00:00",
          "endsTime": "05:00:00"
        }
      ]
    },
    {
      "day": "sun",
      "storeSchedules": [
        {
          "id": 1171833,
          "startsTime": "00:00:00",
          "endsTime": "13:00:00"
        }
      ]
    }
  ]
}
```

#### Información del horario para festivos

<a href="/es/api-reference/store-schedules#get-store-holiday-schedule" target="_blank" class="api">API Reference</a>

Use el endpoint <a href="/es/api-reference/store-schedules#get-store-holiday-schedule" target="_blank">`GET store/schedule/{storeId}/holiday`</a> para conseguir todos los horarios para días festivos de su tienda.

Para obtener los horarios para días festivos de su tienda:

Realiza una solicitud `GET` a la siguiente URL.

**URL**: `https://{COUNTRY_DOMAIN}/api/rest-ops-utils/store/schedule/{storeId}/holiday`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

El sistema devuelve una respuesta `JSON` como la siguiente

```json
{
  "storeSpecialScheduleDays": [
    {
      "id": 270,
      "name": "Festivo",
      "month": 2,
      "day": 22,
      "cityId": null,
      "storeSchedules": []
    },
    {
      "id": 10342,
      "name": "Festivo",
      "month": 3,
      "day": 15,
      "cityId": null,
      "storeSchedules": [
        {
          "id": 2334763,
          "startsTime": "00:00:00",
          "endsTime": "10:00:00"
        }
      ]
    }
  ]
}
```

#### Información del horario para días especiales

<a href="/es/api-reference/store-schedules#get-store-special-schedule" target="_blank" class="api">API Reference</a>

Use el endpoint <a href="/es/api-reference/store-schedules#get-store-special-schedule" target="_blank">`GET store/schedule/{storeId}/special`</a> para conseguir todos los horarios para días especiales de su tienda.

Para obtener los horarios para días especiales de su tienda:

Realiza una solicitud `GET` a la siguiente URL.

**URL**: `https://{COUNTRY_DOMAIN}/api/rest-ops-utils/store/schedule/{storeId}/special`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

El sistema devuelve una respuesta `JSON` como la siguiente

```json
{
  "storeSpecialScheduleDays": [
    {
      "id": 270,
      "name": "Cumpleaños de Daniel",
      "month": 6,
      "day": 20,
      "cityId": null,
      "storeSchedules": []
    },
    {
      "id": 10342,
      "name": "Aniversario",
      "month": 3,
      "day": 15,
      "cityId": null,
      "storeSchedules": [
        {
          "id": 2334761,
          "startsTime": "00:00:00",
          "endsTime": "10:00:00"
        }
      ]
    }
  ]
}
```

#### Creación de franjas horarias para horario regular

<a href="/es/api-reference/store-schedules#post-store-schedule" target="_blank" class="api">API Reference</a>

Use el endpoint <a href="/es/api-reference/store-schedules#post-store-schedule" target="_blank">`POST store/schedule/{storeId}`</a> para crear una franja horaria en un día de horario regular.

Para crear una franja horaria en un día de horario regular de su tienda:

Realiza una solicitud `POST` a la siguiente URL.

**URL**: `https://{COUNTRY_DOMAIN}/api/rest-ops-utils/store/schedule/{storeId}`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

Este es un ejemplo del objeto `JSON` en el cuerpo de la solicitud:

```json
{
  "day": "mon",
  "starts_time": "08:00:00",
  "ends_time": "09:00:00"
}
```

!!! note
Los valores de este `JSON` no son datos reales. Asegúrate de reemplazarlos con tus datos cuando realice solicitudes de API.

El sistema devuelve una respuesta `JSON` como la siguiente

```json
{
  "day": "mon",
  "storeSchedules": [
    {
      "id": 21126292,
      "starts_time": "08:00:00",
      "ends_time": "09:00:00"
    }
  ]
}
```

#### Creación de franjas horarias para días festivos

<a href="/es/api-reference/store-schedules#post-store-holiday-schedule" target="_blank" class="api">API Reference</a>

Use el endpoint <a href="/es/api-reference/store-schedules#post-store-holiday-schedule" target="_blank">`POST store/schedule/{storeId}/holiday/{holidayDayId}`</a> para crear una franja horaria en un día festivo.

Para crear una franja horaria en un día festivo:

Realiza una solicitud `POST` a la siguiente URL.

**URL**: `https://{COUNTRY_DOMAIN}/api/rest-ops-utils/store/schedule/{storeId}/holiday/{holidayDayId}`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

Este es un ejemplo del objeto `JSON` en el cuerpo de la solicitud:

```json
[
  {
    "startsTime": "10:00:00",
    "endsTime": "12:00:00"
  },
  {
    "startsTime": "13:00:00",
    "endsTime": "15:00:00"
  }
]
```

!!! note
Los valores de este `JSON` no son datos reales. Asegúrate de reemplazarlos con tus datos cuando realice solicitudes de API.

El sistema devuelve una respuesta `JSON` como la siguiente

```json
[
  {
    "id": 21126293,
    "startsTime": "10:00:00",
    "endsTime": "12:00:00"
  },
  {
    "id": 21126294,
    "startsTime": "13:00:00",
    "endsTime": "15:00:00"
  }
]
```

#### Creación de dia especial

<a href="/es/api-reference/store-schedules#post-store-special-day" target="_blank" class="api">API Reference</a>

Use el endpoint <a href="/es/api-reference/store-schedules#post-store-special-day" target="_blank">`POST store/schedule/{storeId}/special`</a> para crear un dia especial para su tienda.

Para crear un dia especial para su tienda

Realiza una solicitud `POST` a la siguiente URL.

**URL**: `https://{COUNTRY_DOMAIN}/api/rest-ops-utils/store/schedule/{storeId}/special`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

Este es un ejemplo del objeto `JSON` en el cuerpo de la solicitud:

```json
{
  "day": 10,
  "month": 10,
  "name": "Dia especial",
  "schedules": [
    {
      "startsTime": "09:00:00",
      "endsTime": "12:00:00"
    },
    {
      "startsTime": "15:00:00",
      "endsTime": "16:00:00"
    }
  ]
}
```

!!! note
Los valores de este `JSON` no son datos reales. Asegúrate de reemplazarlos con tus datos cuando realice solicitudes de API.

El sistema devuelve una respuesta `JSON` como la siguiente

```json
{
  "name": "Dia especial",
  "month": 11,
  "day": 10,
  "storeSchedules": [
    {
      "id": 21126295,
      "startsTime": "09:00:00",
      "endsTime": "12:00:00"
    },
    {
      "id": 21126296,
      "startsTime": "15:00:00",
      "endsTime": "16:00:00"
    }
  ]
}
```

#### Creación de franjas horarias para días especiales

<a href="/es/api-reference/store-schedules#post-store-special-schedule" target="_blank" class="api">API Reference</a>

Use el endpoint <a href="/es/api-reference/store-schedules#post-store-special-schedule" target="_blank">`POST store/schedule/{storeId}/special/{specialDayId}`</a> para crear una franja horaria en un día especial.

Para crear una franja horaria en un día especial:

Realiza una solicitud `POST` a la siguiente URL.

**URL**: `https://{COUNTRY_DOMAIN}/api/rest-ops-utils/store/schedule/{storeId}/special/{specialDayId}`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

Este es un ejemplo del objeto `JSON` en el cuerpo de la solicitud:

```json
[
  {
    "startsTime": "12:00:00",
    "endsTime": "13:00:00"
  },
  {
    "startsTime": "21:00:00",
    "endsTime": "22:00:00"
  }
]
```

!!! note
Los valores de este `JSON` no son datos reales. Asegúrate de reemplazarlos con tus datos cuando realice solicitudes de API.

El sistema devuelve una respuesta `JSON` como la siguiente

```json
[
  {
    "id": 21126293,
    "startsTime": "12:00:00",
    "endsTime": "13:00:00"
  },
  {
    "id": 21126294,
    "startsTime": "21:00:00",
    "endsTime": "22:00:00"
  }
]
```

#### Actualización de franjas horarias

<a href="/es/api-reference/store-schedules#put-store-schedule" target="_blank" class="api">API Reference</a>

Use el endpoint <a href="/es/api-reference/store-schedules#put-store-schedule" target="_blank">`PUT store/schedule/{storeId}/{storeScheduleId}`</a> para actualizar una franja horaria.

Para actualizar una franja horaria de su tienda:

Realiza una solicitud `PUT` a la siguiente URL.

**URL**: `https://{COUNTRY_DOMAIN}/api/rest-ops-utils/store/schedule/{storeId}/{storeScheduleId}`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

Este es un ejemplo del objeto `JSON` en el cuerpo de la solicitud:

```json
{
  "startsTime": "07:00:00",
  "endsTime": "08:00:00"
}
```

!!! note
Los valores de este `JSON` no son datos reales. Asegúrate de reemplazarlos con tus datos cuando realice solicitudes de API.

El sistema devuelve una respuesta `JSON` como la siguiente

```json
{
  "day": "mon",
  "storeSchedules": [
    {
      "id": 1171828,
      "startsTime": "07:00:00",
      "endsTime": "08:00:00"
    }
  ]
}
```

!!! note
Dado el ID de la franja horaria, el sistema determinará a que tipo de horario pertenece, en este ejemplo, el sistema identificó que esta franja horaria pertenece al día Lunes del horario regular

#### Eliminación de franjas horarias

<a href="/es/api-reference/store-schedules#delete-store-schedule" target="_blank" class="api">API Reference</a>

Use el endpoint <a href="/es/api-reference/store-schedules#delete-store-schedule" target="_blank">`DELETE store/schedule/{storeId}/{storeScheduleId}`</a> para eliminar una franja horaria.

Para eliminar una franja horaria de su tienda:

Realiza una solicitud `DELETE` a la siguiente URL.

**URL**: `https://{COUNTRY_DOMAIN}/api/rest-ops-utils/store/schedule/{storeId}/{storeScheduleId}`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

El sistema no devuelve una respuesta, por lo que si recibe un status 200 OK, significa que la eliminación fue exitosa.

#### Eliminación de dias especiales

<a href="/es/api-reference/store-schedules#delete-store-special-day" target="_blank" class="api">API Reference</a>

Use el endpoint <a href="/es/api-reference/store-schedules#delete-store-special-day" target="_blank">`DELETE store/schedule/{storeId}/special/{specialDayId}`</a> para eliminar un dia especial

Para eliminar una dia especial de su tienda:

Realiza una solicitud `DELETE` a la siguiente URL.

**URL**: `https://{COUNTRY_DOMAIN}/api/rest-ops-utils/store/schedule/{storeId}/special/{specialDayId}`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

El sistema no devuelve una respuesta, por lo que si recibe un status 200 OK, significa que la eliminación fue exitosa.

## Estados del menu de las tiendas

La API de Utils te permite obtener todos los menús de una tienda y comprobar su estado.

### Obtener el estado de los menús de la tienda

<a href="/es/api-reference/product-status" target="_blank" class="api">API Reference</a>

Para obtener el estado de todos los menús de una tienda:

Realiza una solicitud `GET` a la siguiente URL:

**URL**: `https://{COUNTRY_DOMAIN}/api/rest-ops-utils/store/menu/{storeId}/details?from={from}&to={to}`

- `{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

- `{storeId}`: Este es el identificador de tu tienda

- `{from}`: Fecha de inicio en formato yyyy/MM/dd

- `{to}`: Fecha de fin en formato yyyy/MM/dd

El sistema devuelve una respuesta `JSON` como la siguiente:

```json
[
  {
    "menu_id": "23236",
    "status": "ERROR_MA",
    "status_description": "An error has occurred in the sent menu flow.",
    "created_at": "2021-04-29 13:41:49.389",
    "updated_at": "2021-04-29 13:42:01.024",
    "error_description": "[Store: CO900113276]: Error finishing review. Code: 400 BAD_REQUEST. Message: {\"id\":400,\"message\":\"Estado inválido\",\"code\":\"partner.menu.status.invalid\"}"
  },
  {
    "menu_id": "23193",
    "status": "APPROVED",
    "status_description": "Final status when the review is approved in the partner manager portal.",
    "created_at": "2021-04-27 17:40:32.021",
    "updated_at": "2021-04-27 17:44:00.268",
    "error_description": ""
  }
]
```

### Obtener el estado de los productos de la tienda

<a href="/es/api-reference/product-status" target="_blank" class="api">API Reference</a>

Para obtener el estado de todos los productos de una tienda:

Realiza una solicitud `GET` a la siguiente URL:

**URL**: `https://{COUNTRY_DOMAIN}/api/rest-ops-utils/menu/integration/{integrationId}`

- `{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

- `{integrationId}`: Este es el identificador de tu tienda padre. Si utiliza él id de una tienda hija, automáticamente tomara la data de la tienda padre.

  El sistema devuelve una respuesta `JSON` como la siguiente:

```json
{
  "corridors": [
    {
      "id": "1000",
      "name": "Platos variados",
      "description": "",
      "storeId": "9000",
      "integrationId": "9000"
    }
  ],
  "products": [
    {
      "id": "10",
      "sku": "2021",
      "name": "Plato normal",
      "description": "Tiene de todo",
      "active": true,
      "isAvailable": true,
      "corridorId": "1000"
    }
  ],
  "toppingsCategories": [
    {
      "id": "20",
      "sku": null,
      "description": "Acompañamiento",
      "productId": "10",
      "toppings": [
        {
          "id": "341376951",
          "sku": "3033",
          "description": "Papas",
          "activated": true
        }
      ]
    }
  ]
}
```

## Preguntas frecuentes acerca de actualización del horarios

1.  ¿Qué significa que un corredor tenga horario?

    Significa que el corredor se mostrará en la aplicación de usuario solo en el horario configurado.

2.  ¿Qué pasa si un corredor tiene un horario diferente al horario de la tienda?

    Que un corredor tenga horario diferente al horario de la tienda significa que el corredor se va a mostrar solo en el horario configurado, por ejemplo: si su tienda opera de 8:00 am a 6:00 pm, y usted tiene un corredor “Desayunos” con horario de 8:00 am a 11:30 am, el corredor solo se mostrará en ese horario aunque su tienda esté abierta más tiempo

3.  ¿Qué significa que un producto tenga horario?

    Significa que el producto se mostrará en la aplicación de usuario solo en el horario configurado.

4.  ¿Qué pasa si configura horarios diferentes para el corredor y el producto?

        Al configurar horarios diferentes, prevalece el horario del producto sobre el horario del corredor, por ende el corredor se habilita de acuerdo al horario del producto mostrando solo ese producto.

    Por ejemplo si un producto “Jugo de Naranja” está incluido en el corredor “Desayuno”, y el horario del producto es de 7:00 am a 11:30 am y el del corredor es de 8:00 am a 11:30 am, entonces a las 7:00 am se habilita el corredor “Desayuno” y solo muestra el producto “Jugo de Naranja”, y a las 8:00 am el corredor muestra los demás productos que contiene y que manejan su mismo horario.

5.  ¿Qué configuración se maneja de los horarios?

    La configuración permite el manejo de un calendario, es decir por días y por horas, así mismo incluye una hora de inicio y una hora de finalización.

6.  ¿Qué pasa si los corredores y los productos NO tienen horario configurado?

    El horario de los mismos será el mismo que tenga configurado como horario de operación de la tienda, por ende se mostrará todo el menú durante el tiempo de apertura de la tienda

7.  ¿Se puede actualizar el horario de los corredores y productos solo de una tienda hija?

    Sin importar si envía la información a nivel de la tienda hija se actualiza la a nivel de tienda padre, es decir la actualización se hace para tiendas padre, por ende se ve reflejado el cambio tanto en la tienda padre como en todas las tiendas hijas asociadas a la misma

8.  ¿Prevale el horario de las tiendas frente a el horario de los productos y corredores

    Prevalece el horario de la tienda sobre los horarios de los corredores y de los productos
