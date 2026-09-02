
# Financial

Los recursos de Financial te permiten interactuar con la conciliación de pagos y los datos financieros de tus tiendas.

La siguiente tabla describe los diferentes recursos de la API Financial:

| Recurso                                                   | Descripción                                                                                                                       |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| [`GET stores`](#get-stores-v2)                            | Devuelve la lista de IDs de tiendas asociadas a tus credenciales de la API Financial.                                             |
| [`GET payments`](#get-payments)                           | Devuelve una lista de pagos filtrados por tienda y por período de pago con información del comerciante y detalles de cada pago.   |
| [`GET orders`](#get-orders)                               | Devuelve una lista de pedidos por pago o por tienda y un período de pago.                                                         |
| [`GET order_adjustments`](#get-order-adjustments)           | Devuelve una lista de ajustes de pedidos por pago o por tienda y un período de pago.                                              |
| [`GET charged_cancellations`](#get-charged-cancellations) | Devuelve una lista de cancelaciones (pedidos) y su detalle por pago o por tienda y un periodo de pago.                            |
| [`GET store_adjustments`](#get-store-adjustments)         | Devuelve una lista de ajustes de tienda por pago o por tienda y un período de pago.                                               |
| [`GET loans`](#get-loans)                                 | Devuelve una lista de cuotas de préstamos por pago o por tienda y un período de pago.                                             |
| [`GET debts`](#get-debts)                                 | Devuelve información de deudas pendientes de periodos pasados por pago o por tienda y un periodo de pago.                         |
| [`GET extras`](#get-extras)                               | Devuelve un listado de cargos extras (tarifas, descuentos, otros) por pago o por tienda y un periodo de pago.                     |
| [`GET taxes`](#get-taxes)                                 | Devuelve una lista de impuestos por pago o por tienda y un período de pago.                                                       |
| [`GET compensations`](#get-compensations)                 | Devuelve una lista de compensaciones y su detalle por pago o por tienda y un periodo de pago.                                     |
| [`GET cancellations`](#get-cancellations)                 | Devuelve una lista de cancelaciones (pedidos) por tienda y un período de pago.                                                    |
| [`GET agreements`](#get-agreements)                       | Devuelve información sobre las condiciones del contrato que subyacen a los importes cobrados por cada concepto dentro de un pago. |

---

# Autenticación para la API Financial

Para acceder a los endpoints de la API Financial, primero debe obtener un token de acceso Finance usando sus credenciales.

<aside class="notice">
  <p><b>Requisitos previos</b></p>
  <p>Necesita sus credenciales de la API Financial (<code>client_id</code> y <code>client_secret</code>). Si aún no las tiene, contacte al equipo de integraciones de Rappi.</p>
</aside>

## POST Finance Login

Use este endpoint para generar un token de acceso para la API Financial.

### URL del Endpoint

`https://{COUNTRY_DOMAIN}/restaurants/auth/v1/token/login/finance/`

`{COUNTRY_DOMAIN}`: Este es su Dominio de País de Rappi. <a href="/es/api-reference/content/#new-domains" target="_blank">Ver la lista de Dominios de País.</a>

<aside class="notice">
  <p>NOTA</p>
  <p>Para los ejemplos de solicitudes de API en este sitio, usamos el dominio de Desarrollador: <code>https://api.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso tiene las siguientes propiedades:

|                 |        |
| --------------- | ------ |
| `request body`  | _json_ |
| `response body` | _json_ |

### Parámetros

Este endpoint no permite parámetros adicionales.

### Ejemplo de Solicitud

Este es un ejemplo de una solicitud de API usando este endpoint:

`POST https://api.dev.rappi.com/restaurants/auth/v1/token/login/finance/`

> Este es un ejemplo de la solicitud:

```json
{
  "client_id": "{{your_client_id}}",
  "client_secret": "{{your_client_secret}}"
}
```

Esta tabla describe los atributos que el `JSON` de su solicitud requiere:

| Atributos       |          | Requerido  | Descripción                                            |
| --------------- | -------- | ---------- | ------------------------------------------------------ |
| `client_id`     | _string_ | `required` | Client ID de sus credenciales de la API Financial.     |
| `client_secret` | _string_ | `required` | Client Secret de sus credenciales de la API Financial. |

```curl
curl --location 'https://api.dev.rappi.com/restaurants/auth/v1/token/login/finance/' \
--header 'Content-Type: application/json' \
--data '{
    "client_id": "{{your_client_id}}",
    "client_secret": "{{your_client_secret}}"
}'
```

```java
URL url = new URL("https://api.dev.rappi.com/restaurants/auth/v1/token/login/finance/");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("POST");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setDoOutput(true);

final String jsonInputString = "{\n" +
                "   \"client_id\":\"{{your_client_id}}\",\n" +
                "   \"client_secret\":\"{{your_client_secret}}\"\n" +
                "}";

try (OutputStream os = connection.getOutputStream()) {
   byte[] input = jsonInputString.getBytes(StandardCharsets.UTF_8);
   os.write(input, 0, input.length);
}

try (BufferedReader br = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
   StringBuilder response = new StringBuilder();
   String responseLine;
   while ((responseLine = br.readLine()) != null) {
         response.append(responseLine.trim());
   }
   System.out.println("Response body: " + response.toString());
}
System.out.println("Response Code : " + connection.getResponseCode());
```

```python
import requests

url = "https://api.dev.rappi.com/restaurants/auth/v1/token/login/finance/"

payload = "{ \"client_id\":\"{{your_client_id}}\"," \
         "\"client_secret\":\"{{your_client_secret}}\" }"
headers = { 'Content-Type': 'application/json' }

response = requests.request("POST", url, headers=headers, data=payload)

print(response.text.encode('utf8'))
```

```javascript
var https = require("https");

var options = {
  method: "POST",
  hostname: "api.dev.rappi.com",
  path: "/restaurants/auth/v1/token/login/finance/",
  headers: {
    "Content-Type": "application/json",
  },
};

var req = https.request(options, function (res) {
  var chunks = [];

  res.on("data", function (chunk) {
    chunks.push(chunk);
  });

  res.on("end", function (chunk) {
    var body = Buffer.concat(chunks);
    console.log(body.toString());
  });

  res.on("error", function (error) {
    console.error(error);
  });
});

var postData = JSON.stringify({
  client_id: "{{your_client_id}}",
  client_secret: "{{your_client_secret}}",
});

req.write(postData);

req.end();
```

```go
package main

import (
	"fmt"
	"io/ioutil"
	"net/http"
	"strings"
)

func main() {

	url := "https://api.dev.rappi.com/restaurants/auth/v1/token/login/finance/"
	method := "POST"

	payload := strings.NewReader("{\n   " +
		"\"client_id\":\"{{your_client_id}}\",\n   " +
		"\"client_secret\":\"{{your_client_secret}}\"\n}")

	client := &http.Client{}
	req, err := http.NewRequest(method, url, payload)

	if err != nil {
		fmt.Println(err)
	}
	req.Header.Add("Content-Type", "application/json")

	res, err := client.Do(req)
	defer res.Body.Close()
	body, err := ioutil.ReadAll(res.Body)

	fmt.Println(string(body))
}
```

### Códigos de Estado

Estos son los posibles códigos de estado de la respuesta para este endpoint:

<aside class="ok-response">

`200` Éxito

</aside>
<aside class="error-response">

`400` Cuando algún parámetro tiene un valor inválido, falta, etc

</aside>
<aside class="error-response">

`401` Cuando el token de acceso enviado es inválido o ha expirado

</aside>
<aside class="error-response">

`403` No autorizado

</aside>

### Ejemplo de Respuesta

> Este es un ejemplo de la respuesta:

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpeyJhbGciOiJIUzI1NiIsInR5cCI6IkpeyJhbGciOiJIUzI1NiIsInR5cCI6Ikp",
  "token_type": "Bearer",
  "expires_in": 86400
}
```

Esta tabla describe los objetos contenidos en el ejemplo de respuesta:

| Objeto de Respuesta |           | Descripción del Objeto                                            |
| ------------------- | --------- | ----------------------------------------------------------------- |
| `access_token`      | _string_  | Token de acceso para acceder a los endpoints de la API Financial. |
| `token_type`        | _string_  | Tipo de token.                                                    |
| `expires_in`        | _integer_ | Tiempo de expiración del token en segundos.                       |

### Uso del Token Finance

Incluya el token Finance en el header `x-authorization` de todas las solicitudes a la API Financial:

| Key               | Valor                   |
| ----------------- | ----------------------- |
| `x-authorization` | `Bearer <access_token>` |

---

# Parámetros de Consulta y Paginación

## Filtros de rango de fechas

La mayoría de los endpoints de listado requieren un **rango de fechas** pasado como parámetros de consulta, usando los sufijos `:gte` (mayor-o-igual) y `:lte` (menor-o-igual). Las fechas usan el formato `YYYY-MM-DD`. Si falta un parámetro de fecha requerido, la API responde `400`.

| Endpoint | Parámetros de fecha requeridos | Filtros opcionales |
| --- | --- | --- |
| `payments` | `confirmed_payment_date:gte`, `confirmed_payment_date:lte` | `expected_execution_date:gte`, `expected_execution_date:lte`, `payment_id:eq` |
| `orders` | `order_date:gte`, `order_date:lte` | `order_ids:eq`, `payment_id:eq`, `order_status:eq` |
| `order_adjustments` | `order_date:gte`, `order_date:lte` | `order_ids`, `payment_id:eq`, `order_status:eq` |
| `charged_cancellations` | `order_date:gte`, `order_date:lte` | `order_ids`, `payment_id:eq` |
| `cancellations` | `cancellation_date:gte`, `cancellation_date:lte` | `order_ids` |
| `store_adjustments` | `created_at:gte`, `created_at:lte` | `payment_id:eq` |
| `extras` | `created_at:gte`, `created_at:lte` | `payment_id:eq` |
| `taxes` | `created_at:gte`, `created_at:lte` | `payment_id:eq` |
| `loans` | `created_at:gte`, `created_at:lte` | `payment_id:eq` |
| `debts` | `created_at:gte`, `created_at:lte` | `payment_id:eq` |
| `compensations` | `created_at:gte`, `created_at:lte` | `order_ids` |
| `agreements` | — | `created_at:gte`, `created_at:lte` |

Ejemplo: `GET .../restaurants/finance/v2/stores/{store_id}/orders?order_date:gte=2026-01-01&order_date:lte=2026-01-31`

> Nota: solo el endpoint `orders` usa el sufijo `order_ids:eq`; `order_adjustments`, `charged_cancellations` y `cancellations` usan `order_ids` (sin sufijo).

## Paginación

Todas las respuestas de listado están envueltas en un sobre de paginación:

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `page_number` | integer | Página actual (basada en 1). |
| `page_size` | integer | Número de entradas por página (predeterminado `10`). |
| `total_pages` | integer | Número total de páginas. |
| `total_entries` | integer | Número total de entradas en todas las páginas. |
| `entries` | array | La lista de resultados para la página actual. |

Solicite una página específica con los parámetros de consulta `page_number` y `page_size`, por ejemplo `?page_number=2&page_size=50`.

---

# Descubrimiento de Tiendas

## GET stores (V2)

Devuelve la lista de IDs de tiendas asociadas a tus credenciales de la API Financial. Útil como primera llamada para descubrir a qué tiendas tienes acceso antes de consultar los endpoints por tienda.

### URL del Endpoint

`https://{COUNTRY_DOMAIN}/restaurants/finance/v2/stores`

### Campos de Respuesta

| Campo    | Tipo                | Descripción                                                                        |
| -------- | ------------------- | ---------------------------------------------------------------------------------- |
| `stores` | array de strings    | Lista de IDs de tiendas asociadas a la credencial. Array vacío si no hay ninguna.  |

### Ejemplo de Respuesta

```json
{
  "stores": ["1001", "1002", "1003"]
}
```

---

# Conciliación de Pagos

## GET payments (V2)

El endpoint payments devuelve información sobre los "ids" que tiene el socio en un mes determinado. Estos "ids" son los identificadores que agrupan un conjunto de contabilizaciones que conforman la transferencia del socio y que deben ser utilizados en las peticiones de los otros endpoints para entender qué conjunto de datos impactó en una transferencia determinada.

El valor total será la suma de los valores de todas las API, ya sean valores positivos o negativos. Podemos tener varias transferencias al socio en el mismo día, dependiendo de varios factores durante la facturación.

<aside class="warning">
  <p><b>Importante</b></p>
  <p>El único impuesto a sumar desde el endpoint <code>taxes</code> es el que tiene el atributo <code>reason = IRRF</code> (el resto están dentro del endpoint <code>orders</code> a nivel de orden).</p>
  <p>Los valores entregados en el endpoint <code>compensations</code> no deben ser considerados en el cálculo total de un pago; tienen un propósito completamente informativo. Los valores descontados están dentro del endpoint <code>orders</code> a nivel de orden.</p>
</aside>

Si el socio ha realizado un anticipo de crédito con una entidad financiera y ha otorgado como garantía la cartera de créditos de Rappi, estos pagos pueden verse afectados por el efecto del contrato (registro de créditos). Esta API solo mostrará el pago residual destinado al comercio socio de Rappi si existe, ya que el establecimiento puede comprometer parte o la totalidad de su cartera.

### URL del Endpoint

`https://{COUNTRY_DOMAIN}/restaurants/finance/v2/stores/{store_id}/payments`

### Campos de Respuesta

| Campo                                         | Tipo     | Descripción                              |
| --------------------------------------------- | -------- | ---------------------------------------- |
| `payment_id`                                  | integer  | Identificador único del pago             |
| `status`                                      | string   | Estado del pago                          |
| `period_start_date`                           | datetime | Fecha de inicio del período de pago      |
| `period_end_date`                             | datetime | Fecha de fin del período de pago         |
| `expected_execution_date`                     | datetime | Fecha esperada de ejecución del pago     |
| `confirmed_payment_date`                      | datetime | Fecha confirmada del pago                |
| `total_amount`                                | number   | Monto total del pago                     |
| `payment_reference`                           | string   | Referencia del pago                      |
| `frequency_type`                              | string   | Tipo de frecuencia de pago               |
| `frequency_type_description`                  | string   | Descripción del tipo de frecuencia       |
| `balance_request_id`                          | string   | ID de la solicitud de balance            |
| `bank_account`                                | object   | Información de la cuenta bancaria        |
| `bank_account.bank_name`                      | string   | Nombre del banco                         |
| `bank_account.bank_number`                    | string   | Número de banco                         |
| `bank_account.bank_code`                      | string   | Código del banco                         |
| `bank_account.account_type`                   | string   | Tipo de cuenta                           |
| `bank_account.ispb`                           | string   | Código ISPB (Brasil)                     |
| `bank_account.document.type_identification`   | string   | Tipo de documento de identificación      |
| `bank_account.document.number_identification` | string   | Número de documento                      |
| `bank_account.document.holder_name`           | string   | Nombre del titular                       |
| `stores_consolidated`                         | array    | Lista de tiendas consolidadas en el pago |

### Ejemplo de Respuesta

```json
{
  "page_number": 1,
  "page_size": 10,
  "total_pages": 0,
  "total_entries": 0,
  "entries": [
    {
      "payment_id": 1000,
      "status": "string",
      "period_start_date": "2023-11-07T22:02:47.009Z",
      "period_end_date": "2023-11-07T22:02:47.009Z",
      "expected_execution_date": "2023-11-07T22:02:47.009Z",
      "confirmed_payment_date": "2023-11-07T22:02:47.009Z",
      "total_amount": 0,
      "payment_reference": "string",
      "frequency_type": "string",
      "frequency_type_description": "string",
      "balance_request_id": "string",
      "bank_account": {
        "bank_name": "string",
        "bank_number": "string",
        "bank_code": "string",
        "account_type": "string",
        "ispb": "string",
        "document": {
          "type_identification": "string",
          "number_identification": "string",
          "holder_name": "string"
        }
      },
      "stores_consolidated": [1000]
    }
  ]
}
```

## GET orders (V2)

Cada venta tiene unas características individuales que, junto con las condiciones acordadas en el contrato, Rappi utiliza para facturar y componer el importe a pagar o a cobrar al comercio. El endpoint orders contiene detalles sobre las órdenes como el identificador único de la orden, impuestos, descuentos de venta y comisiones. Son todos los pedidos que han pasado por la app de Rappi, independientemente de la forma de pago utilizada por el consumidor.

<aside class="notice">
  <p><b>Observaciones</b></p>
  <ul>
    <li>El valor total de la venta estará representado por el campo <code>billing.total_order</code>, que proporciona el valor de la venta menos markups y markdowns.</li>
    <li>Una orden puede sufrir cambios durante su ciclo de vida, siempre y cuando haya sido aceptada por el socio. Este endpoint solo mostrará las órdenes que hayan finalizado su ciclo de vida (finalizadas o canceladas).</li>
    <li>Si el paidlot aún no se ha calculado (no ha cerrado el corte de ventas), puede sufrir cambios en la inclusión o eliminación de entradas.</li>
    <li>Si una vez generado el <code>payment_id</code>, algunas órdenes que estaban disponibles como canceladas en el endpoint <code>orders</code> pasarán a ser parte del endpoint de <code>cancellations</code> o <code>charged_cancellations</code> dependiendo si aplica para pago o no.</li>
  </ul>
</aside>

### URL del Endpoint

`https://{COUNTRY_DOMAIN}/restaurants/finance/v2/stores/{store_id}/orders`

### Campos de Respuesta

| Campo                  | Tipo     | Descripción                                                                                                                                                                                                             |
| ---------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `order_id`             | integer  | Identificador único de la orden                                                                                                                                                                                         |
| `payment_id`           | integer  | ID del pago asociado                                                                                                                                                                                                    |
| `order_date`           | datetime | Fecha de la orden                                                                                                                                                                                                       |
| `store_id`             | integer  | ID de la tienda                                                                                                                                                                                                         |
| `store_name`           | string   | Nombre de la tienda                                                                                                                                                                                                     |
| `store_type`           | string   | Tipo de tienda                                                                                                                                                                                                          |
| `order_status`         | string   | Estado de la orden                                                                                                                                                                                                      |
| `payment_method`       | string   | Método de pago utilizado                                                                                                                                                                                                |
| `is_prime`             | string   | Indica si la orden es de un usuario Prime                                                                                                                                                                               |
| `items`                | array    | Lista de productos de la orden                                                                                                                                                                                          |
| `items[].name`         | string   | Nombre del producto                                                                                                                                                                                                     |
| `items[].units`        | string   | Cantidad de unidades                                                                                                                                                                                                    |
| `amount`               | number   | Monto de la orden                                                                                                                                                                                                       |
| `closed_at`            | datetime | Marca de tiempo de cierre de la orden. **Actualmente siempre se devuelve como `null`.**                                                                                                                                |
| `brand`                | string   | Marca de la tienda. **Actualmente siempre se devuelve como `null`.**                                                                                                                                                   |
| `billing`              | object   | Desglose de liquidación como un **mapa dinámico clave/valor** cuyas claves varían por país — ver [El objeto billing](#el-objeto-billing) a continuación.                                                              |

### Ejemplo de Respuesta

```json
{
  "page_number": 1,
  "page_size": 10,
  "total_pages": 0,
  "total_entries": 0,
  "entries": [
    {
      "order_id": 0,
      "payment_id": 0,
      "order_date": "2023-11-07T23:01:44.394Z",
      "store_id": 0,
      "store_name": "string",
      "store_type": "string",
      "order_status": "string",
      "payment_method": "string",
      "is_prime": "string",
      "items": [
        {
          "name": "string",
          "units": "string"
        }
      ],
      "amount": 0,
      "billing": {
        "total_order": 0,
        "commission_product": 0,
        "cofins": 0,
        "pis": 0,
        "iss": 0,
        "income_tax": 0,
        "compensation": 0,
        "discount_by_marketplace_in_cash": 0,
        "total_order_whim": 0,
        "free_shipping": 0,
        "other_discounts": 0,
        "meal_voucher": 0,
        "marketplace_fee_no_cash": 0,
        "global_offer_coupon": 0,
        "paid_by_user": 0,
        "commission_whim": 0,
        "rappi_credits_cashback": 0,
        "service_fee": 0,
        "shipping_partner_no_limit": 0,
        "shipping_partner_limit": 0,
        "marketplace_charge": 0
      }
    }
  ]
}
```

### El objeto billing

El objeto `billing` **no es un esquema fijo**. El backend lo construye como un mapa dinámico clave/valor (`Map<String, BigDecimal>`) cuyas claves provienen de los conceptos de transacción de liquidación (`reasonName`) aplicados a cada orden. **El conjunto de claves varía por país**, porque cada mercado tiene su propio modelo de impuestos y comisiones. Mapee por nombre de clave, y trate cualquier clave no presente en una respuesta dada como no aplicable a esa orden/país.

**Brasil (BR) — claves comunes:**

| Clave | Descripción |
| --- | --- |
| `total_order` | Total de la orden |
| `commission_product` | Comisión de producto |
| `cofins` | Impuesto COFINS |
| `pis` | Impuesto PIS |
| `iss` | Impuesto ISS |
| `income_tax` | Impuesto sobre la renta |
| `compensation` | Compensación aplicada |
| `discount_by_marketplace_in_cash` | Descuento del marketplace en efectivo |
| `total_order_whim` | Total de orden Whim |
| `free_shipping` | Envío gratis aplicado |
| `other_discounts` | Otros descuentos |
| `meal_voucher` | Vale de comida |
| `marketplace_fee_no_cash` | Comisión del marketplace (no efectivo) |
| `global_offer_coupon` | Cupón de oferta global |
| `paid_by_user` | Monto pagado por el usuario |
| `commission_whim` | Comisión Whim |
| `rappi_credits_cashback` | Cashback en créditos Rappi |
| `service_fee` | Tarifa de servicio |
| `shipping_partner_no_limit` | Envío del partner sin límite |
| `shipping_partner_limit` | Envío del partner con límite |
| `marketplace_charge` | Cargo del marketplace |

**Otros países (por ejemplo, Colombia):** el conjunto de claves es distinto al de Brasil — cada mercado tiene sus propios conceptos de impuestos, retenciones y comisiones (en Colombia, por ejemplo, retenciones como *retefuente* y *reteica*, e impuesto a las ventas). Las claves exactas de billing para tu país no son fijas y no se listan aquí; confirmá el conjunto canónico para tu país con tu contacto de settlement/cuenta de Rappi.

> Mapeá siempre billing por nombre de clave; el conjunto exacto de claves para una orden depende de los conceptos de liquidación que le aplicaron.

## GET order_adjustments (V2)

Los ajustes de ventas son descuentos financieros de abono o adeudo que sirven para diversos fines, siempre están relacionados a una orden (`order_id`). Los ejemplos incluyen la cancelación de un artículo después de que el pedido haya sido entregado (completado), el cargo de un saldo pendiente, las disputas aceptadas por Rappi, entre otras opciones.

Cada ajuste manual descontado en el pago contiene una descripción en el campo `descriptionAdjustment` para comprender mejor el motivo de este movimiento.

<aside class="notice">
  <p><b>Observación</b></p>
  <p>El ajuste manual de una orden puede ocurrir en un <code>payment_id</code> diferente al de la venta. En este caso, Rappi cargará este valor para el próximo periodo abierto.</p>
</aside>

### URL del Endpoint

`https://{COUNTRY_DOMAIN}/restaurants/finance/v2/stores/{store_id}/order_adjustments`

### Campos de Respuesta

Mismos campos que GET orders (V2) más:

| Campo                   | Tipo   | Descripción                                |
| ----------------------- | ------ | ------------------------------------------ |
| `descriptionAdjustment` | string | Descripción del ajuste aplicado a la orden |

### Ejemplo de Respuesta

```json
{
  "page_number": 1,
  "page_size": 10,
  "total_pages": 0,
  "total_entries": 0,
  "entries": [
    {
      "order_id": 0,
      "payment_id": 0,
      "order_date": "2023-11-07T23:03:55.722Z",
      "store_id": 0,
      "store_name": "string",
      "store_type": "string",
      "order_status": "string",
      "payment_method": "string",
      "is_prime": "string",
      "items": [
        {
          "name": "string",
          "units": "string"
        }
      ],
      "amount": 0,
      "billing": {
        "total_order": 0,
        "commission_product": 0,
        "cofins": 0,
        "pis": 0,
        "iss": 0,
        "income_tax": 0,
        "compensation": 0,
        "discount_by_marketplace_in_cash": 0,
        "total_order_whim": 0,
        "free_shipping": 0,
        "other_discounts": 0,
        "meal_voucher": 0,
        "marketplace_fee_no_cash": 0,
        "global_offer_coupon": 0,
        "paid_by_user": 0,
        "commission_whim": 0,
        "rappi_credits_cashback": 0,
        "service_fee": 0,
        "shipping_partner_no_limit": 0,
        "shipping_partner_limit": 0,
        "marketplace_charge": 0
      },
      "descriptionAdjustment": "string"
    }
  ]
}
```

## GET charged_cancellations (V2)

El endpoint charged_cancellations devuelve información sobre el importe que Rappi ha descontado al socio, cuando la cancelación de la orden es responsabilidad de Rappi. Por ejemplo, una cancelación causada por un problema con el repartidor independiente. Si el socio utiliza la logística de entrega de Rappi y durante el trayecto hasta el destinatario se produce un problema y el pedido no llega a su destino, se entiende que el socio ha cumplido con su deber de preparar y enviar el pedido, pero éste no ha sido entregado por causas ajenas a su voluntad. En este caso, Rappi realiza un abono al socio, deduciendo los gastos correspondientes definidos en los términos del contrato.

### URL del Endpoint

`https://{COUNTRY_DOMAIN}/restaurants/finance/v2/stores/{store_id}/charged_cancellations`

### Campos de Respuesta

Mismos campos que GET orders (V2) más:

| Campo                      | Tipo   | Descripción                           |
| -------------------------- | ------ | ------------------------------------- |
| `cancellatioPercentage`    | string | Porcentaje de cancelación cobrado     |
| `descriptionCancellation`  | string | Descripción de la cancelación         |
| `cancellation_code`        | string | Código de la cancelación              |
| `cancellation_description` | string | Descripción del código de cancelación |

### Ejemplo de Respuesta

```json
{
  "page_number": 1,
  "page_size": 10,
  "total_pages": 0,
  "total_entries": 0,
  "entries": [
    {
      "order_id": 0,
      "payment_id": 0,
      "order_date": "2023-11-07T23:09:48.153Z",
      "store_id": 0,
      "store_name": "string",
      "store_type": "string",
      "order_status": "string",
      "payment_method": "string",
      "is_prime": "string",
      "items": [
        {
          "name": "string",
          "units": "string"
        }
      ],
      "amount": 0,
      "billing": {
        "total_order": 0,
        "commission_product": 0,
        "cofins": 0,
        "pis": 0,
        "iss": 0,
        "income_tax": 0,
        "compensation": 0,
        "discount_by_marketplace_in_cash": 0,
        "total_order_whim": 0,
        "free_shipping": 0,
        "other_discounts": 0,
        "meal_voucher": 0,
        "marketplace_fee_no_cash": 0,
        "global_offer_coupon": 0,
        "paid_by_user": 0,
        "commission_whim": 0,
        "rappi_credits_cashback": 0,
        "service_fee": 0,
        "shipping_partner_no_limit": 0,
        "shipping_partner_limit": 0,
        "marketplace_charge": 0
      },
      "cancellatioPercentage": "string",
      "descriptionCancellation": "string",
      "cancellation_code": "string",
      "cancellation_description": "string"
    }
  ]
}
```

## GET store_adjustments (V2)

Los ajustes de tienda son descuentos financieros de abono o adeudo que sirven para diversos fines, siempre están relacionados a una tienda (`store_id`). Los ejemplos incluyen correcciones financieras por errores en el cálculo de un pago o rubro financiero, entre otras opciones.

Cada ajuste manual descontado en el pago contiene una descripción en el campo `description_reason` para comprender mejor el motivo de este movimiento.

### URL del Endpoint

`https://{COUNTRY_DOMAIN}/restaurants/finance/v2/stores/{store_id}/store_adjustments`

### Campos de Respuesta

| Campo                | Tipo    | Descripción                    |
| -------------------- | ------- | ------------------------------ |
| `id`                 | integer | Identificador único del ajuste |
| `description`        | string  | Descripción del ajuste         |
| `amount`             | number  | Monto del ajuste               |
| `created_at`         | date    | Fecha de creación              |
| `payment_id`         | integer | ID del pago asociado           |
| `store_id`           | integer | ID de la tienda                |
| `description_reason` | string  | Razón del ajuste               |

### Ejemplo de Respuesta

```json
{
  "page_number": 1,
  "page_size": 10,
  "total_pages": 0,
  "total_entries": 0,
  "entries": [
    {
      "id": 0,
      "description": "string",
      "amount": 0,
      "created_at": "2023-11-07",
      "payment_id": 0,
      "store_id": 0,
      "description_reason": "string"
    }
  ]
}
```

## GET loans (V2)

El endpoint loans entrega información sobre los descuentos realizados por Rappi sobre el valor de un pago a causa del cobro de una cuota de un préstamo y también información general sobre el préstamo relacionado. Los préstamos pueden ser de diferentes tipos y el endpoint solo entrega la información de la cuota cobrada en un pago específico.

### URL del Endpoint

`https://{COUNTRY_DOMAIN}/restaurants/finance/v2/stores/{store_id}/loans`

### Campos de Respuesta

| Campo                                 | Tipo    | Descripción                      |
| ------------------------------------- | ------- | -------------------------------- |
| `id`                                  | integer | Identificador único del préstamo |
| `description_type`                    | string  | Tipo de préstamo                 |
| `balance`                             | number  | Saldo pendiente                  |
| `frequency`                           | integer | Frecuencia de cobro              |
| `created_at`                          | date    | Fecha de creación                |
| `currency`                            | string  | Moneda                           |
| `disbursement_date`                   | date    | Fecha de desembolso              |
| `disbursement_amount`                 | number  | Monto desembolsado               |
| `deadline`                            | date    | Fecha límite de pago             |
| `reason`                              | string  | Razón del préstamo               |
| `stores`                              | array   | Tiendas asociadas al préstamo    |
| `type`                                | string  | Tipo                             |
| `installment_amount`                  | number  | Monto de la cuota                |
| `installment_percentage`              | number  | Porcentaje de la cuota           |
| `lastCollection_date`                 | date    | Fecha del último cobro           |
| `amortization`                        | string  | Tipo de amortización             |
| `installments.installment_amount`     | number  | Monto de cada cuota              |
| `installments.installment_created_at` | date    | Fecha de creación de la cuota    |
| `installments.store_id`               | integer | ID de la tienda de la cuota      |
| `installments.payment_id`             | integer | ID del pago de la cuota          |

### Ejemplo de Respuesta

```json
{
  "page_number": 1,
  "page_size": 10,
  "total_pages": 0,
  "total_entries": 0,
  "entries": [
    {
      "id": 0,
      "description_type": "string",
      "balance": 0,
      "frequency": 0,
      "created_at": "2023-11-07",
      "currency": "string",
      "disbursement_date": "2023-11-07",
      "disbursement_amount": 0,
      "deadline": "2023-11-07",
      "reason": "string",
      "stores": ["string"],
      "type": "string",
      "installment_amount": 0,
      "installment_percentage": 0,
      "lastCollection_date": "2023-11-07",
      "amortization": "string",
      "installments": {
        "installment_amount": 0,
        "installment_created_at": "2023-11-07",
        "store_id": 0,
        "payment_id": 0
      }
    }
  ]
}
```

## GET debts (V2)

El endpoint debts entrega información sobre los descuentos realizados por Rappi sobre el valor de un pago a causa de una deuda pendiente que es originada en un pago previo cuyo balance fue negativo, ya que sus ventas no cubren los descuentos relacionados.

<aside class="notice">
  <p><b>Observación</b></p>
  <p>Para identificar el motivo de una deuda, el endpoint <code>debts</code> entrega el identificador del pago en el que se generó la deuda en el campo <code>payment_debt</code> para que se pueda consultar ese pago en específico y tener la trazabilidad de las transacciones por valores negativos que llevaron el valor total a pagar a negativo.</p>
</aside>

### URL del Endpoint

`https://{COUNTRY_DOMAIN}/restaurants/finance/v2/stores/{store_id}/debts`

### Campos de Respuesta

| Campo          | Tipo    | Descripción                     |
| -------------- | ------- | ------------------------------- |
| `id`           | integer | Identificador único de la deuda |
| `description`  | string  | Descripción de la deuda         |
| `payment_debt` | number  | Monto de la deuda               |
| `payment_paid` | number  | Monto pagado de la deuda        |
| `store_id`     | string  | ID de la tienda                 |
| `amount`       | number  | Monto total                     |
| `created_at`   | date    | Fecha de creación               |

### Ejemplo de Respuesta

```json
{
  "page_number": 1,
  "page_size": 10,
  "total_pages": 0,
  "total_entries": 0,
  "entries": [
    {
      "id": 0,
      "description": "string",
      "payment_debt": 0,
      "payment_paid": 0,
      "store_id": "string",
      "amount": 0,
      "created_at": "2023-11-07"
    }
  ]
}
```

## GET extras (V2)

Son registros detallados de transacciones/operaciones, vinculadas al socio, que tienen fecha, valor y naturaleza de operación, que impactan directa y/o indirectamente en el cálculo financiero del socio. Contiene la información de los valores descontados por diferentes conceptos relacionados a operaciones de marketing como Ads y descuentos.

### URL del Endpoint

`https://{COUNTRY_DOMAIN}/restaurants/finance/v2/stores/{store_id}/extras`

### Campos de Respuesta

| Campo         | Tipo    | Descripción                         |
| ------------- | ------- | ----------------------------------- |
| `id`          | integer | Identificador único del cargo extra |
| `reason`      | string  | Razón del cargo                     |
| `description` | string  | Descripción del cargo               |
| `amount`      | number  | Monto del cargo                     |
| `store_id`    | integer | ID de la tienda                     |
| `payment_id`  | integer | ID del pago asociado                |
| `created_at`  | date    | Fecha de creación                   |

### Ejemplo de Respuesta

```json
{
  "page_number": 1,
  "page_size": 10,
  "total_pages": 0,
  "total_entries": 0,
  "entries": [
    {
      "id": 0,
      "reason": "string",
      "description": "string",
      "amount": 0,
      "store_id": 0,
      "payment_id": 0,
      "created_at": "2023-11-07"
    }
  ]
}
```

## GET taxes (V2)

El endpoint taxes devuelve información sobre los reembolsos efectuados por Rappi al socio, debidos a operaciones en las que se recaudó el impuesto sobre la renta. Este importe se calcula en cada corte de pagos de Rappi. También contiene información de los impuestos a nivel de órdenes.

<aside class="warning">
  <p><b>Importante</b></p>
  <p>El endpoint entrega información de todos los impuestos tanto a nivel de orden como de tienda (IRRF). Para componer el valor de un pago, el valor de los impuestos de órdenes ya es considerado dentro del endpoint de <code>orders</code>, de modo que NO se deben tener en cuenta los valores que entrega este endpoint que sean diferentes al IRRF.</p>
</aside>

### URL del Endpoint

`https://{COUNTRY_DOMAIN}/restaurants/finance/v2/stores/{store_id}/taxes`

### Campos de Respuesta

| Campo         | Tipo    | Descripción                      |
| ------------- | ------- | -------------------------------- |
| `id`          | integer | Identificador único del impuesto |
| `reason`      | string  | Razón del impuesto               |
| `description` | string  | Descripción del impuesto         |
| `amount`      | number  | Monto del impuesto               |
| `store_id`    | integer | ID de la tienda                  |
| `payment_id`  | integer | ID del pago asociado             |
| `created_at`  | date    | Fecha de creación                |
| `flow_name`   | string  | Nombre del flujo/concepto fiscal |

### Ejemplo de Respuesta

```json
{
  "page_number": 1,
  "page_size": 10,
  "total_pages": 0,
  "total_entries": 0,
  "entries": [
    {
      "id": 0,
      "reason": "string",
      "description": "string",
      "amount": 0,
      "store_id": 0,
      "payment_id": 0,
      "created_at": "2023-11-07",
      "flow_name": "string"
    }
  ]
}
```

## GET compensations (V2)

El endpoint compensations devuelve información sobre las retribuciones financieras a usuarios realizados por Rappi a causa de una disputa aceptada atribuible al aliado (producto equivocado, producto faltante, producto en mal estado) que repercuten en la transferencia del socio.

<aside class="notice">
  <p><b>Observación</b></p>
  <p>Es importante categorizar el campo <code>reason</code> para tener una mejor experiencia de comprensión de los casos publicados, dado que Rappi maneja diversos tipos de incidencias.</p>
</aside>

### URL del Endpoint

`https://{COUNTRY_DOMAIN}/restaurants/finance/v2/stores/{store_id}/compensations`

### Campos de Respuesta

| Campo                      | Tipo    | Descripción                            |
| -------------------------- | ------- | -------------------------------------- |
| `id`                       | integer | Identificador único de la compensación |
| `payment_id`               | integer | ID del pago asociado                   |
| `order_date`               | date    | Fecha de la orden                      |
| `store_id`                 | integer | ID de la tienda                        |
| `store_name`               | string  | Nombre de la tienda                    |
| `store_type`               | string  | Tipo de tienda                         |
| `order_status`             | string  | Estado de la orden                     |
| `amount`                   | number  | Monto de la compensación               |
| `comments`                 | string  | Comentarios                            |
| `created_at`               | date    | Fecha de creación                      |
| `order_id`                 | integer | ID de la orden asociada                |
| `product_ids[].product_id` | integer | ID del producto                        |
| `product_ids[].units`      | string  | Unidades del producto                  |
| `reason`                   | string  | Razón de la compensación               |

### Ejemplo de Respuesta

```json
{
  "page_number": 1,
  "page_size": 10,
  "total_pages": 0,
  "total_entries": 0,
  "entries": [
    {
      "id": 0,
      "payment_id": 0,
      "order_date": "2023-11-07",
      "store_id": 0,
      "store_name": "string",
      "store_type": "string",
      "order_status": "string",
      "amount": 0,
      "comments": "string",
      "created_at": "2023-11-07",
      "order_id": 0,
      "product_ids": [
        {
          "product_id": 0,
          "units": "string"
        }
      ],
      "reason": "string"
    }
  ]
}
```

## GET cancellations (V2)

El endpoint cancellations devuelve información sobre las órdenes canceladas que **no serán pagadas** al comercio. Existen diferentes razones por las cuales una cancelación no se pague:

- **Producto no disponible:** La tienda no cuenta con el producto solicitado.
- **Tienda Cerrada:** El restaurante se encontraba cerrado.
- **Problemas técnicos del restaurante:** El restaurante tuvo problemas en la preparación del pedido.
- **Aliado no reconoce orden:** El establecimiento no está operando en la plataforma de Rappi.

<aside class="notice">
  <p><b>Observaciones</b></p>
  <ul>
    <li>En el campo <code>cancellation_description</code> se puede encontrar el motivo de la cancelación.</li>
    <li>Órdenes canceladas con modalidad Marketplace (con repartidor propio de la tienda) no aplican para pago.</li>
  </ul>
</aside>

### URL del Endpoint

`https://{COUNTRY_DOMAIN}/restaurants/finance/v2/stores/{store_id}/cancellations`

### Campos de Respuesta

| Campo                      | Tipo     | Descripción                         |
| -------------------------- | -------- | ----------------------------------- |
| `order_id`                 | integer  | ID de la orden cancelada            |
| `cancellation_date`        | datetime | Fecha de la cancelación             |
| `order_date`               | datetime | Fecha original de la orden          |
| `store_id`                 | integer  | ID de la tienda                     |
| `store_name`               | string   | Nombre de la tienda                 |
| `store_type`               | string   | Tipo de tienda                      |
| `order_status`             | string   | Estado de la orden                  |
| `payment_method`           | string   | Método de pago                      |
| `cancellation_code`        | string   | Código de cancelación               |
| `cancellation_description` | string   | Descripción de la cancelación       |
| `amount`                   | number   | Monto de la cancelación             |
| `is_prime`                 | string   | Si la orden era de un usuario Prime |

### Ejemplo de Respuesta

```json
{
  "page_number": 1,
  "page_size": 10,
  "total_pages": 0,
  "total_entries": 0,
  "entries": [
    {
      "order_id": 0,
      "cancellation_date": "2023-11-07T23:35:38.537Z",
      "order_date": "2023-11-07T23:35:38.537Z",
      "store_id": 0,
      "store_name": "string",
      "store_type": "string",
      "order_status": "string",
      "payment_method": "string",
      "cancellation_code": "string",
      "cancellation_description": "string",
      "amount": 0,
      "is_prime": "string"
    }
  ]
}
```

## GET agreements (V2)

El endpoint agreements devuelve información sobre las condiciones del contrato que subyacen a los importes cobrados por cada concepto dentro de un pago, incluyendo frecuencia de pago, condiciones de comisión y términos del contrato.

### URL del Endpoint

`https://{COUNTRY_DOMAIN}/restaurants/finance/v2/stores/{store_id}/agreements`

### Campos de Respuesta

| Campo                                         | Tipo    | Descripción                  |
| --------------------------------------------- | ------- | ---------------------------- |
| `contracted_plan`                             | string  | Plan contratado              |
| `application_fnfo.name`                       | string  | Nombre del aplicante         |
| `application_fnfo.document_number`            | string  | Número de documento          |
| `application_fnfo.corporate_name`             | string  | Razón social                 |
| `application_fnfo.state_registration`         | string  | Registro estatal             |
| `application_fnfo.municipal_registration`     | string  | Registro municipal           |
| `application_fnfo.address.country`            | string  | País                         |
| `application_fnfo.address.state`              | string  | Estado/Departamento          |
| `application_fnfo.address.city`               | string  | Ciudad                       |
| `application_fnfo.address.district`           | string  | Distrito/Barrio              |
| `application_fnfo.address.street`             | string  | Calle                        |
| `application_fnfo.address.number`             | string  | Número                       |
| `application_fnfo.address.zipCode`            | string  | Código postal                |
| `application_fnfo.address.complement`         | string  | Complemento de dirección     |
| `application_fnfo.address.reference`          | string  | Referencia                   |
| `application_fnfo.contact_fnfo.contact_email` | string  | Email de contacto            |
| `application_fnfo.contact_fnfo.contact_phone` | string  | Teléfono de contacto         |
| `application_fnfo.contact_fnfo.contact_name`  | string  | Nombre de contacto           |
| `store_info.store_id`                         | string  | ID de la tienda              |
| `store_info.type`                             | string  | Tipo de tienda               |
| `store_info.document`                         | string  | Documento de la tienda       |
| `store_info.name`                             | string  | Nombre de la tienda          |
| `store_info.corporate_name`                   | string  | Razón social de la tienda    |
| `store_info.is_marketplace`                   | boolean | Si es marketplace            |
| `store_info.address.city`                     | string  | Ciudad de la tienda          |
| `contract_info.frequency_type`                | string  | Tipo de frecuencia de pago   |
| `contract_info.contract_term.start_date`      | date    | Fecha de inicio del contrato |
| `contract_info.contract_term.end_date`        | date    | Fecha de fin del contrato    |
| `conditions[].name`                           | string  | Nombre de la condición       |
| `conditions[].commision`                      | string  | Porcentaje de comisión       |

### Ejemplo de Respuesta

```json
{
  "page_number": 1,
  "page_size": 10,
  "total_pages": 0,
  "total_entries": 0,
  "entries": [
    {
      "contracted_plan": "string",
      "application_fnfo": {
        "name": "string",
        "document_number": "string",
        "corporate_name": "string",
        "state_registration": "string",
        "municipal_registration": "string",
        "address": {
          "country": "string",
          "state": "string",
          "city": "string",
          "district": "string",
          "street": "string",
          "number": "string",
          "zipCode": "string",
          "complement": "string",
          "reference": "string"
        },
        "contact_fnfo": {
          "contact_email": "user@example.com",
          "contact_phone": "string",
          "contact_name": "string"
        }
      },
      "store_info": {
        "store_id": "string",
        "type": "string",
        "document": "string",
        "name": "string",
        "corporate_name": "string",
        "is_marketplace": true,
        "address": {
          "city": "string"
        }
      },
      "contract_info": {
        "frequency_type": "string",
        "contract_term": {
          "start_date": "2023-11-07",
          "end_date": "2023-11-07"
        }
      },
      "conditions": [
        {
          "name": "string",
          "commision": "string"
        }
      ]
    }
  ]
}
```
