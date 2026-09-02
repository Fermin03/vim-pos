
# Obtener Información de Tiendas

<a href="/es/api-reference/stores" target="_blank" class="api">Referencia de API</a>

Utiliza el endpoint <a href="/es/api-reference/stores#get-stores-pa" target="_blank">`GET stores-pa`</a> para recuperar la siguiente información de tus tiendas.

- `integrationId` _Es el id de la tienda que asigna en la integración._
- `rappiId` _Es el id de la tienda que asigna Rappi._
- `name` _Es el nombre de la tienda._

!!! important
Las tiendas a mostrar son aquellas que están asociadas únicamente a su **clientId**.

Para recuperar esta información:

Realiza una solicitud `GET` a la siguiente URL.

**URL**: `https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/stores-pa`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

El sistema devuelve una respuesta `JSON` con la información de tus tiendas.

## Información del menú

<a href="/es/api-reference/stores" target="_blank" class="api">Referencia de API</a>

Utiliza el endpoint <a href="/es/api-reference/stores#get-store-current-menu" target="_blank">`GET store/{RAPPI_ID}/menu/current`</a> para obtener la siguiente información de los items del menú de tu tienda.

### Productos

- `id` _Es el identificador del producto del lado de Rappi._
- `name` _Es el nombre del producto._
- `price` _Es el precio del producto._
- `toppings` _Es la lista de toppings de este producto._

### Toppings

- `id` _Es el identificador del topping del lado de Rappi._
- `name` _Es el nombre del topping._
- `price` _Es el precio del topping._
- `category` _Es la información de la categoría del topping._

### Categoria del topping

- `id` _Es el identificador de la categoría del topping del lado de Rappi._
- `name` _Es el nombre de la categoría del topping._

!!! important
Las tiendas a mostrar son aquellas que están asociadas únicamente a su **clientId**.

Para obtener esta información:

Realiza una solicitud `GET` a la siguiente URL.

**URL**: `https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/store/{RAPPI_ID}/menu/current`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

`{RAPPI_ID}`: Es el identificador de la tienda del lado de Rappi.

El sistema devuelve una respuesta `JSON` con la información del menú de la tienda.

## Código de registro

<a href="/es/api-reference/stores#get-stores-pa-check-in-code" target="_blank" class="api">Referencia de API</a>

Utiliza el endpoint <a href="/es/api-reference/stores#get-stores-pa-check-in-code" target="_blank">`GET /stores-pa/{storeId}/check-in-code`</a> para obtener la siguiente información del código de registro asignado para tu tienda.

- `store_id` _Es el id de la tienda consultada._
- `code` _Es el código de registro de la tienda que asigna Rappi._
- `created_at` _Es la fecha de creación del código de registro asignado para la tienda._
- `updated_at` _Es la fecha de actualización del código de registro asignado para la tienda._
- `expired_at` _Es la fecha de expiración del código de registro asignado para la tienda._

!!! important
La información del código de registro a mostrar es para aquellas tiendas que están asociadas únicamente a su **clientId**.

Para recuperar esta información:

Realiza una solicitud `GET` a la siguiente URL.

**URL**: `https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/stores-pa/{storeId}/check-in-code`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

El sistema devuelve una respuesta `JSON` con la información del código de registro para la tienda.
