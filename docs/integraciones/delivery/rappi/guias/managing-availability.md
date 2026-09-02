
# Gestionar Disponibilidad

<a href="/es/api-reference/availability" target="_blank" class="api">Referencia de API</a>

La API de Rappi te permite configurar la disponibilidad de los elementos de tus menús y tus tiendas, utilizando el recurso <a href="/es/api-reference/availability" target="_blank">`items`</a>.

Las siguientes secciones te guían a través del proceso de configuración de estas opciones para tu integración.

## Disponibilidad del Artículo

Configura la disponibilidad de los elementos de tu menú y desactívalos cuando estén agotados, para evitar pedidos entrantes que contengan productos no disponibles.

La API de Rappi te permite configurar la disponibilidad mediante:

- **Item SKU**: Este es el SKU que proporcionaste para el artículo a Rappi cuando lo agregaste al menú.
- **Item ID**: Este es el identificador que Rappi le proporcionó al agregarlo al menú.

### Consultar la Disponibilidad por SKU

<a href="/es/api-reference/availability/#post-availability-items-status" target="_blank" class="api">Referencia de API</a>

Utiliza el endpoint <a href="/es/api-reference/availability/#post-availability-items-status" target="_blank">`POST availability/items/status`</a> para consultar la disponibilidad de tus artículos por SKU de artículo.

Para consultar la disponibilidad de tus artículos por SKU de artículo:

Realiza una solicitud `POST` a la siguiente URL y agrega un`JSON` al cuerpo de la solicitud con los siguientes objetos.

**URL**: `https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/availability/items/status`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

Este es un ejemplo del `JSON` en el cuerpo de la solicitud:

```json
{
  "store_id": "900144512",
  "item_ids": ["7713", "2668", "3395", "5685"]
}
```

!!! note
Los valores de este objeto `JSON` no son datos reales. Asegúrate de reemplazarlos con tus propios datos cuando realices solicitudes de API.

Este es un ejemplo `JSON` de la respuesta:

```json
[
  {
    "item_id": 2136411305,
    "item_type": "PRODUCT",
    "stock_out_state": "AVAILABLE"
  },
  {
    "item_id": 2136411307,
    "item_type": "PRODUCT",
    "stock_out_state": "AVAILABLE"
  },
  {
    "item_id": 2136411304,
    "item_type": "PRODUCT",
    "stock_out_state": "AVAILABLE"
  },
  {
    "item_id": 2136411306,
    "item_type": "PRODUCT",
    "stock_out_state": "AVAILABLE"
  }
]
```

### Consultar la Disponibilidad por ID de Rappi

<a href="/es/api-reference/availability/#post-availability-items-rappi-status" target="_blank" class="api">Referencia de API</a>

Utiliza el endpoint <a href="/es/api-reference/availability/#post-availability-items-rappi-status" target="_blank">`POST availability/items/rappi/status`</a> para consultar la disponibilidad de tus artículos por SKU de artículo.

Para consultar la disponibilidad de tus artículos por SKU de artículo:

Realiza una solicitud `POST` a la siguiente URL y agrega un `JSON` al cuerpo de la solicitud con los siguientes objetos.

**URL**: `https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/availability/items/rappi/status`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

Este es un ejemplo del `JSON` en el cuerpo de la solicitud:

```json
{
  "store_id": "900144512",
  "item_ids": ["2136411304"]
}
```

!!! note
Los valores de este objeto `JSON` no son datos reales. Asegúrate de reemplazarlos con tus propios datos cuando realices solicitudes de API.

Este es un ejemplo `JSON` de la respuesta:

```json
[
  {
    "item_id": 2136411304,
    "item_type": "PRODUCT",
    "stock_out_state": "AVAILABLE"
  }
]
```

### Configuración de la Disponibilidad por SKU

<a href="/es/api-reference/availability#put-availability-stores-items" target="_blank" class="api">Referencia de API</a>

Utiliza el endpoint <a href="/es/api-reference/availability#put-availability-stores-items" target="_blank">`PUT availability/stores/items`</a> para configurar la disponibilidad de tus artículos por SKU de artículo.

Para configurar la disponibilidad de tus artículos por SKU de artículo:

Realiza una solicitud `PUT` a la siguiente URL y agrega un`JSON` al cuerpo de la solicitud con los siguientes objetos.

**URL**: `https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/token`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

Este es un ejemplo del `JSON` en el cuerpo de la solicitud:

```json
[
  {
    "store_integration_id": "999",
    "items": {
      "turn_on": ["1111", "2222", "3333"],
      "turn_off": ["5555"]
    }
  }
]
```

!!! note
Los valores de este objeto `JSON` no son datos reales. Asegúrate de reemplazarlos con tus propios datos cuando realices solicitudes de API. Puedes agregar más elementos a los objetos `turn_on` y `turn_off` en el `JSON` separados por una coma. Si solo deseas _activar_ o _desactivar_ elementos en su solicitud, elimina el otro objeto de tu `JSON` en consecuencia.

El sistema regresa una respuesta `JSON` con el mensaje de confirmación _Items successfully updated_.

### Configuración de la Disponibilidad por ID de Rappi

<a href="/es/api-reference/availability#put-availability-stores-items-rappi" target="_blank" class="api">Referencia de API</a>

Utiliza el endpoint <a href="/es/api-reference/availability#put-availability-stores-items-rappi" target="_blank">`PUT availability/stores/items/rappi`</a> para configurar la disponibilidad de sus artículos por ID de artículo.

Para configurar la disponibilidad de tus artículos por ID de artículo:

Realiza una solicitud `PUT` a la siguiente URL y agrega un`JSON` al cuerpo de la solicitud con los siguientes objetos.

**URL**: `https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/availability/stores/items/rappi`

`{COUNTRY_DOMAIN}`: Este es su dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

Este es un ejemplo del `JSON` en el cuerpo de la solicitud:

```json
[
  {
    "store_integration_id": "999",
    "items": {
      "turn_on": [1111, 2222, 3333],
      "turn_off": [5555]
    }
  }
]
```

!!! note
Los valores de este `JSON` no son datos reales. Asegúrate de reemplazarlos con tus datos cuando realices solicitudes de API. Puedes agregar más elementos a los objetos `turn_on` y `turn_off` en el `JSON` separados por una coma. Si solo deseas _activar_ o _desactivar_ elementos en tu solicitud, elimina el otro objeto de tu `JSON` en consecuencia.

El sistema devuelve una respuesta `JSON` con el mensaje de estado de confirmación "_Items successfully updated_".

## Estado de la tienda

<a href="/es/api-reference/availability#post-availability-stores" target="_blank" class="api">Referencia de API</a>

Utiliza el endpoint <a href="/es/api-reference/availability#post-availability-stores" target="_blank">`POST availability/stores`</a> para consultar la disponibilidad de tus tiendas.

Para consultar la disponibilidad de tus tiendas:

Realiza una solicitud `POST` a la siguiente URL y agrega un `JSON` al cuerpo de la solicitud con la siguiente estructura.

**URL**: `https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/availability/stores`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

Este es un ejemplo del `JSON` en el cuerpo de la solicitud:

```json
[900105433]
```

<div class="admonition">
    <p class="admonition-title">Nota</p>
    <ul>
      <li>Los valores de este <code>JSON</code> no son datos reales. Asegúrate de reemplazarlos con tus datos cuando realices solicitudes de API.</li>
      <li>Puedes agregar más tiendas en el <code>JSON</code> separados por una coma.</li>
      <li>Puedes consultar hasta máximo de 100 tiendas en tu <code>JSON</code>.</li>
    </ul>
</div>

Este es un ejemplo `JSON` de la respuesta:

```json
{
  "900105433": false
}
```

### Health Check

Es un proceso que corre cada minuto para validar el estado de cada tienda asociada a un webhook. Cuando una tienda no está disponible se apaga hasta que vuelva a estarlo

!!! Important
Este proceso solo estará disponible para aquellas tiendas que estén utilizando el webhook NEW_ORDER y se suscriban a PING

#### Funcionamiento

Se enviará un `POST` a la url configurada en el webhook con el siguiente formato

```json
{
  "store_id": 999
}
```

Donde **store_id** representa el id de la tienda configurada de su lado (external id)

La respuesta debe tener el siguiente formato

```json
{
  "status": "OK",
  "description": "Tienda prendida"
}
```

- **status**: este campo es requerido, si viene null o con un valor distinto a OK se considerará que la tienda no está disponible
- **description**: este campo es opcional.

#### ¿COMO FUNCIONA PING?

`OBJETIVO` Detectar cuando una tienda pierde conectividad y apagarla al ocurrir un cambio de ping de positivo a negativo, con el fin de prevenir futuras cancelaciones por consecuencia de dicha falta de conectividad en la tienda para aceptar el take. Este Ping debe estar implementado para cada tienda y no en un servidor central como general.

`FUNCION` El monitor recibe una notificación cada vez que una tienda pase de recibir ping positivo a negativo. Al darse esto, inmediatamente se apagará preventivamente la tienda en cuestión.

1. El ping, cuando se tiene configurado un webhook, se envía cada 3 minutos, en caso de no tener webhook y utilizar Pulling de ordenes, se evaluará cada 3 minutos.
2. Dependiendo del numero de ping negativos configurados, se genera un incidente de Ping Negativo.
3. El rango de tiempo configurado para el tiempo de gracia será de 1 minuto.
4. La cantidad máxima de intentos permitidos por falta de respuesta para una tienda actualmente está establecida en 2 para todos los aliados.
5. Solo después de validar el tiempo de intermitencia, se genera el incidente de perdida o recuperación de la conectividad de acuerdo a la definición del mismo.

<div class="admonition whats-new">
    <p class="admonition-title"> <i class="fas fa-exclamation-circle"></i> Importante</p>
    <p>Si no utilizas webhooks, la evaluacion cada 3 minutos se hace sobre la ultima vez que descargaste ordenes, el tiempo de gracia para determinar si es un ping negativo es de 1 minuto </p>
</div>

<div class="admonition whats-new">
    <p class="admonition-title"> <i class="fas fa-exclamation-circle"></i> Importante</p>
    <p>Existen tiendas que tiene horario fraccionado durante el día, por tanto, este horario se debe tener en cuenta para la generación del ping </p>
</div>

<div class="admonition whats-new">
    <p class="admonition-title"> <i class="fas fa-exclamation-circle"></i> Importante</p>
    <p>Es impórtate aclarar que NO aplica para las tiendas que tienen horario de 24 horas </p>
</div>

#### REGLAS PING

Estas son las siguientes reglas que tenemos en cuenta

`PING NEGATIVO` Esta regla crea un incidente de Conectividad Perdida, este incidente esta **Status: Abierto** en espera de un Ping Positivo.

`PING POSITIVO` En esta regla se dispara una alerta que busca el incidente de Conectividad perdida **Status: Abierto** para cambiarlo a **Status: Cerrado**.

## Disponibilidad de la tienda (asincrono)

<a href="/es/api-reference/availability#put-availability-stores" target="_blank" class="api">Referencia de API</a>

Utiliza el endpoint <a href="/es/api-reference/availability#put-availability-stores" target="_blank">`PUT availability/stores`</a> para configurar la disponibilidad de tus tiendas.

<div class="admonition whats-new">
    <p class="admonition-title"> Importante</p>
    <p> Este es un método asincrono por lo tanto el resultado de la operación no vendrá en la respuesta. Usando este enfoque se puede recibir el nuevo estado de la tienda a través del webhoook <b>STORE_CONNECTIVITY</b>.
    Ver <a href="/es/webhook-events#store-connectivity">Store Connectivity</a> </p>
    <p> Si se necesita una respuesta instantanea se debe usar el endpoint sincrono.
    Ver <a href="/es/managing-availability#disponibilidad-de-la-tienda-sincrono"> Disponibilidad de la tienda (sincrono) </a></p>
</div>

Para configurar la disponibilidad de tus tiendas:

Realiza una solicitud `PUT` a la siguiente URL y agrega un `JSON` al cuerpo de la solicitud con los siguientes objetos.

**URL**: `https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/availability/stores`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

Este es un ejemplo del `JSON` en el cuerpo de la solicitud:

```json
{
  "turn_on": ["2222"],
  "turn_off": ["333", "444"]
}
```

<div class="admonition">
    <p class="admonition-title">Nota</p>
    <ul>
      <li>Los valores de este <code>JSON</code> no son datos reales. Asegúrate de reemplazarlos con tus datos cuando realices solicitudes de API.</li>
      <li>Puedes agregar más elementos a los objetos <code>turn_on</code> y <code>turn_off</code> en el <code>JSON</code> separados por una coma.</li>
      <li>Si solo deseas <i>activar</i> o <i>desactivar</i> elementos en tu solicitud, elimina el otro objeto de tu <code>JSON</code> en consecuencia.</li>
    </ul>
</div>

El sistema devuelve una respuesta `JSON` con el mensaje de confirmación "_Stores successfully updated_".

## Disponibilidad de la tienda masivo (asincrono)

<a href="/es/api-reference/availability#put-availability-stores" target="_blank" class="api">Referencia de API</a>

Utiliza el endpoint <a href="/es/api-reference/availability#put-availability-stores-enable-massive" target="_blank">`PUT availability/stores/enable/massive`</a> para configurar la disponibilidad de tus tiendas.

<div class="admonition whats-new">
    <p class="admonition-title"> Importante</p>
    <p> Este es un método asincrono por lo tanto el resultado de la operación no vendrá en la respuesta. Usando este enfoque se puede recibir el nuevo estado de la tienda a través del webhoook <b>STORE_CONNECTIVITY</b>.
    Ver <a href="/es/webhook-events#store-connectivity">Store Connectivity</a> </p>
    <p> Es posible que una tienda no pueda ser encendida o apagada debido a que está suspendida o no publicada en la app de Rappi</p>
</div>

Para configurar la disponibilidad de tus tiendas:

Realiza una solicitud `PUT` a la siguiente URL y agrega un `JSON` al cuerpo de la solicitud con los siguientes objetos.

**URL**: `https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/availability/stores/enable/massive`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

Este es un ejemplo del `JSON` en el cuerpo de la solicitud:

```json
{
  "stores": [
    {
      "store_id": "12312",
      "is_enabled": true
    },
    {
      "store_id": "12312",
      "is_enabled": false
    }
  ]
}
```

## Disponibilidad de la tienda (sincrono)

<a href="/es/api-reference/availability#put-availability-stores" target="_blank" class="api">Referencia de API</a>

Utiliza el endpoint <a href="/es/api-reference/availability#put-availability-stores-enable" target="_blank">`PUT availability/stores/enable`</a> para configurar la disponibilidad de tus tiendas.

<div class="admonition whats-new">
    <p class="admonition-title"> Importante</p>
    <p> Este es un método sincrono por lo tanto el resultado de la operación vendrá directamente en la respuesta </p>
    <p> Tenga en cuenta que se permite un máximo de 300 tiendas por request. Si necesita enviar mas stores utilice el metodo asincrono.
    Ver <a href="/es/managing-availability#disponibilidad-de-la-tienda-asincrono"> Disponibilidad de la tienday (asincrono)</a></p>
    <p> Es posible que una tienda no pueda ser encendida o apagada debido a que está suspendida o no publicada en la app de Rappi</p>
</div>

Para configurar la disponibilidad de tus tiendas:

Realiza una solicitud `PUT` a la siguiente URL y agrega un `JSON` al cuerpo de la solicitud con los siguientes objetos.

**URL**: `https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/availability/stores/enable`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

Este es un ejemplo del `JSON` en el cuerpo de la solicitud:

```json
{
  "stores": [
    {
      "store_id": "12312",
      "is_enabled": true
    },
    {
      "store_id": "12312",
      "is_enabled": false
    }
  ]
}
```

Este es un ejemplo del `JSON` de respuesta:

```json
{
  "results": [
    {
      "store_id": 90774,
      "is_enabled": false,
      "operation_result": false,
      "operation_result_type": "suspended",
      "suspended_reason": "suspended due to cancelled orders",
      "suspended_at": "2022-04-11T20:23:00.00Z",
      "suspended_time": 60
    }
  ]
}
```
