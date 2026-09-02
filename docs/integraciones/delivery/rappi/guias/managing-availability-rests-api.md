
# Gestionar Disponibilidad

<a href="/es/api-reference/availability-rests-api" target="_blank" class="api">Referencia de API</a>

La API de Rappi te permite configurar la disponibilidad de los elementos de tus menús y tus tiendas, utilizando el recurso <a href="/es/api-reference/availability-rests-api" target="_blank">`items`</a> con los nuevos dominios.

Las siguientes secciones te guían a través del proceso de configuración de estas opciones para tu integración.

## Disponibilidad del Artículo

Consulta o configura la disponibilidad de los elementos de tu menú y desactívalos cuando estén agotados, para evitar pedidos entrantes que contengan productos no disponibles.

La API de Rappi te permite consultar o configurar la disponibilidad mediante:

- **Item SKU**: Este es el SKU que proporcionaste para el artículo a Rappi cuando lo agregaste al menú.
- **Item ID**: Este es el identificador que Rappi le proporcionó al agregarlo al menú.

### Configuración de la Disponibilidad de Productos por SKU o ID

<a href="/es/api-reference/availability-rests-api#patch-stores-store-id-products-identity-type-stock" target="_blank" class="api">Referencia de API</a>

Utiliza el endpoint <a href="/es/api-reference/availability-rests-api#patch-stores-store-id-products-identity-type-stock" target="_blank">`PATCH stores/{store_id}/products/{identity_type}/stock`</a> para configurar la disponibilidad de tus productos por SKU o ID de una tienda específica.

Para configurar la disponibilidad de tus productos, realiza una solicitud `PATCH` a la siguiente URL y agrega un`JSON` al cuerpo de la solicitud con los siguientes objetos.

**URL**: `https://{COUNTRY_DOMAIN}/restaurants/menu/v1/stores/{STORE_ID}/products/{IDENTITY_TYPE}/stock`

- `{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).
- `{STORE_ID}`: Este es el identificador de la tienda.
- `{IDENTITY_TYPE}`: Los posibles valores son `RAPPI`, `SKU`; donde debes usar RAPPI si los identificadores usados para la activación/desactivación son ID de articulos en la app de Rappi, y SKU si se usan los identificadores de la tienda.

Este es un ejemplo del `JSON` en el cuerpo de la solicitud:

```json
{
  "available": ["123123"],
  "unavailable": []
}
```

!!! note
Los valores de este objeto `JSON` no son datos reales. Asegúrate de reemplazarlos con tus propios datos cuando realices solicitudes de API. Puedes agregar más elementos a los objetos `available` and `unavailable` en el `JSON` separados por una coma.

El sistema responde un Status Code '202'.

### Configuración de la Disponibilidad de Toppings por SKU o ID

<a href="/es/api-reference/availability-rests-api#patch-stores-store-id-toppings-identity-type-stock" target="_blank" class="api">Referencia de API</a>

Utiliza el endpoint <a href="/es/api-reference/availability-rests-api#patch-stores-store-id-toppings-identity-type-stock" target="_blank">`PATCH stores/{STORE_ID}/toppings/{IDENTITY_TYPE}/stock`</a> para configurar la disponibilidad de tus toppings por SKU o ID de una tienda específica.

Para configurar la disponibilidad de tus toppings, realiza una solicitud `PATCH` a la siguiente URL y agrega un`JSON` al cuerpo de la solicitud con los siguientes objetos.

**URL**: `https://{COUNTRY_DOMAIN}/restaurants/menu/v1/stores/{STORE_ID}/toppings/{IDENTITY_TYPE}/stock`

- `{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).
- `{STORE_ID}`: Este es el identificador de la tienda.
- `{IDENTITY_TYPE}`: Los posibles valores son `RAPPI`, `SKU`; donde debes usar RAPPI si los identificadores usados para la activación/desactivación son ID de articulos en la app de Rappi, y SKU si se usan los identificadores de la tienda.

Este es un ejemplo del `JSON` en el cuerpo de la solicitud:

```json
{
  "available": ["123123"],
  "unavailable": []
}
```

!!! note
Los valores de este objeto `JSON` no son datos reales. Asegúrate de reemplazarlos con tus propios datos cuando realices solicitudes de API. Puedes agregar más elementos a los objetos `available` and `unavailable` en el `JSON` separados por una coma.

El sistema responde un Status Code '202'.

### Configuración de la Disponibilidad de Items por SKU o ID

<a href="/es/api-reference/availability-rests-api#patch-stores-store-id-items-identity-type-stock" target="_blank" class="api">Referencia de API</a>

Utiliza el endpoint <a href="/es/api-reference/availability-rests-api#patch-stores-store-id-items-identity-type-stock" target="_blank">`PATCH stores/{STORE_ID}/items/{IDENTITY_TYPE}/stock`</a> para configurar la disponibilidad de tus items por SKU o ID de una tienda específica.

Para configurar la disponibilidad de tus items, realiza una solicitud `PATCH` a la siguiente URL y agrega un`JSON` al cuerpo de la solicitud con los siguientes objetos.

**URL**: `https://{COUNTRY_DOMAIN}/restaurants/menu/v1/stores/{STORE_ID}/items/{IDENTITY_TYPE}/stock`

- `{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).
- `{STORE_ID}`: Este es el identificador de la tienda.
- `{IDENTITY_TYPE}`: Los posibles valores son `RAPPI`, `SKU`; donde debes usar RAPPI si los identificadores usados para la activación/desactivación son ID de articulos en la app de Rappi, y SKU si se usan los identificadores de la tienda.

Este es un ejemplo del `JSON` en el cuerpo de la solicitud:

```json
{
  "available": ["123123"],
  "unavailable": []
}
```

!!! note
Los valores de este objeto `JSON` no son datos reales. Asegúrate de reemplazarlos con tus propios datos cuando realices solicitudes de API. Puedes agregar más elementos a los objetos `available` and `unavailable` en el `JSON` separados por una coma.

El sistema responde un Status Code '202'.

### Consultar la Disponibilidad de Productos por SKU o ID

<a href="/es/api-reference/availability-rests-api#post-stores-store-id-products-identity-type-stock-status" target="_blank" class="api">Referencia de API</a>

Utiliza el endpoint <a href="/es/api-reference/availability-rests-api#post-stores-store-id-products-identity-type-stock-status" target="_blank">`POST stores/{STORE_ID}/products/{IDENTITY_TYPE}/stock/status`</a> para consultar la disponibilidad de tus productos por SKU o ID de una tienda específica.

Para consultar la disponibilidad de tus productos, realiza una solicitud `POST` a la siguiente URL y agrega un`JSON` al cuerpo de la solicitud con los siguientes objetos.

**URL**: `https://{COUNTRY_DOMAIN}/restaurants/menu/v1/stores/{STORE_ID}/products/{IDENTITY_TYPE}/stock/status`

- `{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).
- `{STORE_ID}`: Este es el identificador de la tienda.
- `{IDENTITY_TYPE}`: Los posibles valores son `RAPPI`, `SKU`; donde debes usar RAPPI si los identificadores usados para la consulta son ID de articulos en la app de Rappi, y SKU si se usan los identificadores de la tienda.

Este es un ejemplo del `JSON` en el cuerpo de la solicitud:

```json
{
  "products": ["2136854048"]
}
```

!!! note
Los valores de este objeto `JSON` no son datos reales. Asegúrate de reemplazarlos con tus propios datos cuando realices solicitudes de API. Puedes agregar más elementos al objeto `products` en el `JSON` separados por una coma.

Este es un ejemplo `JSON` de la respuesta:

```json
[
  {
    "item_id": 2136411305,
    "item_sku": "SKU-1",
    "item_type": "PRODUCT",
    "stock_out_state": "AVAILABLE"
  }
]
```

### Consultar la Disponibilidad de Toppings por SKU o ID

<a href="/es/api-reference/availability-rests-api#post-stores-store-id-toppings-identity-type-stock-status" target="_blank" class="api">Referencia de API</a>

Utiliza el endpoint <a href="/es/api-reference/availability-rests-api#post-stores-store-id-toppings-identity-type-stock-status" target="_blank">`POST stores/{STORE_ID}/toppings/{IDENTITY_TYPE}/stock/status`</a> para consultar la disponibilidad de tus toppings por SKU o ID de una tienda específica.

Para consultar la disponibilidad de tus toppings, realiza una solicitud `POST` a la siguiente URL y agrega un`JSON` al cuerpo de la solicitud con los siguientes objetos.

**URL**: `https://{COUNTRY_DOMAIN}/restaurants/menu/v1/stores/{STORE_ID}/toppings/{IDENTITY_TYPE}/stock/status`

- `{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).
- `{STORE_ID}`: Este es el identificador de la tienda.
- `{IDENTITY_TYPE}`: Los posibles valores son `RAPPI`, `SKU`; donde debes usar RAPPI si los identificadores usados para la consulta son ID de articulos en la app de Rappi, y SKU si se usan los identificadores de la tienda.

Este es un ejemplo del `JSON` en el cuerpo de la solicitud:

```json
{
  "toppings": ["2136854048"]
}
```

!!! note
Los valores de este objeto `JSON` no son datos reales. Asegúrate de reemplazarlos con tus propios datos cuando realices solicitudes de API. Puedes agregar más elementos al objeto `toppings` en el `JSON` separados por una coma.

Este es un ejemplo `JSON` de la respuesta:

```json
[
  {
    "item_id": 2136411307,
    "item_sku": "SKU-1",
    "item_type": "TOPPING",
    "stock_out_state": "UNAVAILABLE"
  }
]
```

### Consultar la Disponibilidad de Items por SKU o ID

<a href="/es/api-reference/availability-rests-api#post-stores-store-id-items-identity-type-stock-status" target="_blank" class="api">Referencia de API</a>

Utiliza el endpoint <a href="/es/api-reference/availability-rests-api#post-stores-store-id-items-identity-type-stock-status" target="_blank">`POST stores/{STORE_ID}/items/{IDENTITY_TYPE}/stock/status`</a> para consultar la disponibilidad de tus items por SKU o ID de una tienda específica.

Para consultar la disponibilidad de tus items, realiza una solicitud `POST` a la siguiente URL y agrega un`JSON` al cuerpo de la solicitud con los siguientes objetos.

**URL**: `https://{COUNTRY_DOMAIN}/restaurants/menu/v1/stores/{STORE_ID}/items/{IDENTITY_TYPE}/stock/status`

- `{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).
- `{STORE_ID}`: Este es el identificador de la tienda.
- `{IDENTITY_TYPE}`: Los posibles valores son `RAPPI`, `SKU`; donde debes usar RAPPI si los identificadores usados para la consulta son ID de articulos en la app de Rappi, y SKU si se usan los identificadores de la tienda.

Este es un ejemplo del `JSON` en el cuerpo de la solicitud:

```json
{
  "items": ["2136854048"]
}
```

!!! note
Los valores de este objeto `JSON` no son datos reales. Asegúrate de reemplazarlos con tus propios datos cuando realices solicitudes de API. Puedes agregar más elementos al objeto `items` en el `JSON` separados por una coma.

Este es un ejemplo `JSON` de la respuesta:

```json
[
  {
    "item_id": 2136411305,
    "item_sku": "SKU-1",
    "item_type": "PRODUCT",
    "stock_out_state": "AVAILABLE"
  },
  {
    "item_id": 2136411307,
    "item_sku": "SKU-2",
    "item_type": "TOPPING",
    "stock_out_state": "UNAVAILABLE"
  },
  {
    "item_id": 2136411304,
    "item_sku": "SKU-3",
    "item_type": "PRODUCT",
    "stock_out_state": "UNKNOWN"
  }
]
```
