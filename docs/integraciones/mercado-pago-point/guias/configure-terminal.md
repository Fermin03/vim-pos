<!-- fuente: https://www.mercadopago.com.mx/developers/es/docs/mp-point/configure-terminal · capturado 2026-10-08 -->

# Configurar terminal

Para continuar con la integración de Mercado Pago Point a tu sistema, luego de [haber creado tu aplicación](https://www.mercadopago.com.mx/developers/es/docs/mp-point/create-application) y obtenido las credenciales adecuadas, es necesario que configures tu terminal Point para operar en modo integrado.

Es esta configuración la que garantiza que los pagos realizados en las terminals puedan ser gestionados desde tu sistema, optimizando la eficiencia en la conciliación y en la gestión de tareas.

Para realizar la configuración de tu terminal Point en modo integrado, primero deberás **crear y configurar una sucursal y una caja**, y luego **asociar esa terminal a la sucursal y caja creadas**. Esto permite que cada lector esté vinculado no solo a una cuenta de Mercado Pago, sino también a un punto de venta físico identificado en nuestro sistema.

Por último, con tu terminal ya vinculada, deberás **activar su modo de operación como Punto de Venta (PDV)**. Sigue las instrucciones a continuación para realizar correctamente cada paso.

## 11Crear y configurar sucursal y caja

La creación de sucursales y cajas en Mercado Pago es necesaria para poder operar en tiendas físicas con terminals Point y así poder mantener la conciliación entre tu punto de venta y Mercado Pago.

Una **sucursal** representa a una tienda física dentro de Mercado Pago, que puede tener una o más cajas vinculadas. Sin embargo, **cada caja solo permite una terminal asociada en modo PDV**. Esto quiere decir que, si estás queriendo integrar más de una terminal, deberás crear la misma cantidad de cajas y realizar su asociación de manera individual.

La creación y posterior configuración de sucursales y cajas pueden realizarse por dos vías: mediante panel de Mercado Pago, o vía API. Esta última opción es útil para sistemas que requieran operar con varios puntos de venta, ya que permite asociar varias sucursales desde el sistema integrador.

Elige la vía que mejor se adecúe a tus necesidades y sigue los pasos detallados según corresponda.

Es posible crear sucursales y cajas desde tu sistema a través de nuestras APIs para pagos presenciales. Para eso, sigue los pasos a continuación.

### Crear sucursal

Para crear una sucursal vía API, envía una solicitud con tu Access Token de prueba al endpoint [/users/{user\_id}/storesPOST](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/stores/create-store/post). Deberás agregar el `user_id` de la cuenta de prueba en el _path_ de tu solicitud y completar los parámetros requeridos con los detalles del negocio según se indican a continuación.

Es fundamental completar correctamente toda la información de ubicación de la sucursal (`city_name`, `state_name`, `latitude` y `longitude`). Los datos incorrectos pueden causar errores en los cálculos de impuestos, impactando directamente la facturación y la regularización fiscal de tu empresa.

```
curl -X POST \
    'https://api.mercadopago.com/users/{{USER_ID}}/stores'\
    -H 'Content-Type: application/json' \
       -H 'Authorization: Bearer {{YOUR_ACCESS_TOKEN}}' \
    -d '{
  "name": "Sucursal Instore",
  "business_hours": {
    "monday": [
      {
        "open": "08:00",
        "close": "12:00"
      }
    ],
    "tuesday": [
      {
        "open": "09:00",
        "close": "18:00"
      }
    ]
  },
  "external_id": "SUC001",
  "location": {
    "street_number": "0123",
    "street_name": "Example Street Name.",
    "city_name": "City name.",
    "state_name": "State name.",
    "latitude": 27.175193925922862,
    "longitude": 78.04213533235064,
    "reference": "Near to Mercado Pago"
  }
}'
```

| Parámetro | Obligatoriedad | Descripción y ejemplos |
| --- | --- | --- |
| `user_id` | Obligatorio | Identificador de la cuenta de Mercado Pago que recibe el dinero por las ventas realizadas en la sucursal.  
  
Durante el desarrollo, utiliza el `user_id` de la cuenta de prueba, disponible en **Tus integraciones > Datos de integración > Credenciales de prueba > Datos de las credenciales de prueba**.  
  
Al salir a producción, reemplázalo por el `user_id` de la cuenta real que recibirá los pagos: Si estás realizando una integración propia, encontrarás este valor en los [Datos de integración](https://www.mercadopago.com.mx/developers/es/docs/mp-point/resources/application-details). Si, en cambio, estás realizando una integración para terceros, obtendrás el valor en la respuesta a la vinculación por medio de OAuth. |
| `name` | Obligatorio | Nombre de la sucursal creada. |
| `external_id` | Opcional | Identificador externo de la tienda para el sistema del integrador. Puede contener cualquier valor alfanumérico de hasta 60 caracteres, y debe ser único para cada sucursal. Por ejemplo, `SUCMercadoPago`. |
| `location` | Obligatorio | Este objeto debe contener todos los datos relativos a la ubicación de la sucursal. Debes prestar particular atención a completarlos correctamente con el estándar decimal simple, en especial los parámetros `latitude` y `longitude`, con los datos reales de la ubicación física. Por ejemplo, `"latitude": 27.175193925922862`, y `"longitude": 78.04213533235064` corresponden a la ubicación exacta del Taj Mahal, en India. |

Si la solicitud fue enviada correctamente, la respuesta se verá como el ejemplo a continuación.

```
{
  "id": 1234567,
  "name": "Sucursal Instore",
  "date_created": "2019-08-08T19:29:45.019Z",
  "business_hours": {
    "monday": [
      {
        "open": "08:00",
        "close": "12:00"
      }
    ],
    "tuesday": [
      {
        "open": "09:00",
        "close": "18:00"
      }
    ]
  },
  "location": {
    "address_line": "Example Street Name, 0123, City name, State name.",
    "latitude": 27.175193925922862,
    "longitude": 78.04213533235064,
    "reference": "Near to Mercado Pago"
  },
  "external_id": "SUC001"
}
```

Además de los datos enviados en la solicitud, devolverá el identificador asignado a esa sucursal por Mercado Pago bajo el parámetro `id`.

### Crear caja

Para poder realizar ventas con Mercado Pago, cada sucursal creada deberá contener por lo menos una caja asociada. Es posible crear una caja y asociarla a la sucursal previamente creada enviando una solicitud con el Access Token de prueba al endpoint [/v2/posPOST](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/pos/create-pos/post) como se muestra a continuación.

```
curl -X POST \
    'https://api.mercadopago.com/v2/pos'\
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer {{YOUR_ACCESS_TOKEN}}' \
    -H 'X-Idempotency-Key: {{SOME_UNIQUE_VALUE}}' \
    -d '{
  "name": "POS-001",
  "store_id": "1234567",
  "external_id": "SUC001POS001"
}'
```

| Parámetro | Obligat. | Descripción y ejemplos |
| --- | --- | --- |
| `name` | Opcional | Nombre de la caja creada. |
| `store_id` | Condicional | Identificador de la sucursal a la que pertenece la caja, asignado a esa sucursal por Mercado Pago. Es devuelto en la respuesta a la creación de la sucursal bajo el parámetro `id`. Obligatorio si `external_store_id` no es enviado. Si se envían ambos, deben corresponder a la misma sucursal. |
| `external_store_id` | Condicional | Identificador externo de la sucursal, que le fue asignado por el sistema del integrador al momento de su creación bajo el parámetro `external_id`. Obligatorio si `store_id` no es enviado. Si se envían ambos, deben corresponder a la misma sucursal. |
| `external_id` | Opcional | Identificador externo de la caja, definido para el sistema integrador. Debe ser un valor único para cada caja y tiene un límite de 40 caracteres. |

Si la solicitud fue enviada correctamente, la respuesta se verá como el ejemplo a continuación.

```
{
  "id": 1234567,
  "name": "POS-001",
  "status": "active",
  "date_created": "2024-01-15T10:30:00Z",
  "date_last_updated": "2024-01-15T10:30:00Z",
  "user_id": 123456,
  "store_id": "1234567",
  "external_store_id": "SUC001",
  "external_id": "SUC001POS001",
  "qr_response": {
    "uuid": "0977011a027c4b4387e52069da4264deae2946af4dcc44ee98a8f1dbb376c8a1",
    "image": "https://www.mercadopago.com/instore/merchant/qr/1234567/abc123.png",
    "template_document": "https://www.mercadopago.com/instore/merchant/qr/1234567/template_abc123.pdf",
    "template_image": "https://www.mercadopago.com/instore/merchant/qr/1234567/template_abc123.png",
    "qr_code": "00020101021226940014BR.GOV.BCB.PIX2572pix-qr-h.mercadopago.com/instore/h/p/v2/abc123"
  }
}
```

Puedes ver en la tabla debajo la descripción de algunos de los parámetros devueltos que pueden serte útil para continuar con tu integración más adelante.

| Parámetro | Descripción |
| --- | --- |
| `id` | Identificador asignado a la caja por Mercado Pago. |
| `status` | Estado en el que se encuentra la creación del punto de venta. |
| `user_id` | Identificador de la cuenta de Mercado Pago que recibe el dinero por las ventas realizadas en la caja. |
| `name` | Nombre asignado a la caja al momento de su creación. |
| `store_id` | Identificador de la sucursal a la que pertenece la caja, asignado a esa sucursal por Mercado Pago. Es devuelto en la respuesta a la creación de la sucursal bajo el parámetro `id`. |
| `external_store_id` | Identificador externo de la sucursal, que le fue asignado por el sistema del integrador al momento de su creación bajo el parámetro `external_id`. |
| `external_id` | Identificador externo de la caja, definido para el sistema integrador al momento de su creación. |
| `qr_response` | Objeto que contendrá un asociado a la caja creada. Solo podrá ser utilizado en caso de tener integrada la solución de pago [](https://www.mercadopago.com.mx/developers/es/docs/qr-code/overview). |

Recuerda que solo es posible configurar una terminal en modo PDV por caja. Si deseas integrar varias terminals, deberás crear una caja para cada una de ellas.

Si ambas solicitudes fueron exitosas, habrás creado y configurado la sucursal y la caja necesarias para continuar con la configuración de tu terminal en modo PDV.

## 22Asociar terminal

La asociación de la terminal Point a la cuenta de Mercado Pago y la sucursal y caja creadas debe ser realizada desde la aplicación de Mercado Pago en el **dispositivo móvil de la cuenta recaudadora o de aquella indicada como colaboradora**. Esta aplicación está disponible para dispositivos Android o iOS.

Comienza por encender la terminal Point. Verás en la pantalla el mensaje “**Inicia sesión en este dispositivo con tu cuenta de Mercado Pago**”. Allí deberás elegir entre las opciones a continuación.

-   **Soy responsable del negocio**: selecciona esta opción si eres el dueño de la tienda física.
-   **Soy un colaborador**: elige esta opción si tu cuenta fue señalada como cuenta de colaborador por el propietario de la tienda.

Una vez seleccionada la opción que corresponda, aparecerá un código QR en la pantalla de la terminal, que deberás escanear con la aplicación móvil de Mercado Pago.

Para eso, accede a la aplicación e inicia sesión con la cuenta de prueba vendedor, cuyo usuario y contraseña están disponibles en **Tus integraciones > Datos de integración > Credenciales de prueba > Datos de las credenciales de prueba**. Luego, oprime el **ícono QR** en el margen inferior y escanea el código presentado por la terminal.

En la etapa [Salir a producción](https://www.mercadopago.com.mx/developers/es/docs/mp-point/go-to-production), deberás repetir este proceso de asociación utilizando la cuenta recaudadora o aquella señalada como cuenta de colaborador, según corresponda.

Después de algunos segundos, la terminal Point podrá solicitar algunas configuraciones adicionales para la tienda. Sigue las instrucciones exhibidas en la pantalla para concluir todas las etapas.

La terminal te solicitará seleccionar la sucursal y la caja a la que quieres asociar la terminal, y confirmar la dirección de la sucursal previamente creada con tu cuenta de Mercado Pago. Al finalizar, presiona el botón **Confirmar**.

Si, por alguna razón, tienes más de una sucursal creada, cuida de estar seleccionando correctamente aquella que quieres integrar a tu terminal Point.

Por último, la terminal te solicitará que ingreses una contraseña que garantizará su uso seguro.

Una vez finalizado este proceso, la pantalla exhibirá el mensaje “¡Listo! Ya puedes cobrar con tu Point”, y habrás finalizado la asociación de tu terminal a la cuenta de Mercado Pago deseada, y a la sucursal y caja creada.

## 33Activar el modo PDV en la terminal

Como último paso de la configuración de terminals, y para que estas puedan estar integradas con nuestra API, es necesario activar el modo operativo Punto de Venta (PDV).

Para activar el modo PDV vía API por primera vez, es necesario consultar las terminals disponibles activas en tu cuenta. Para eso, envía una solicitud al endpoint [/terminals/v1/listGET](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/terminals/get-terminals/get), utilizando el Access Token de prueba. Recomendamos el uso opcional de los parámetros `store_id` y `pos_id` para filtrar los resultados; estos identificadores se devuelven al crear la sucursal y la caja, respectivamente.

```
curl -X GET \
    'https://api.mercadopago.com/terminals/v1/list?limit=50&offset=0&store_id={{STORE_ID}}&pos_id={{POS_ID}}'\
    -H 'Content-Type: application/json' \
       -H 'Authorization: Bearer {{YOUR_ACCESS_TOKEN}}'
```

Este llamado devolverá un listado de terminals vinculadas a la cuenta de Mercado Pago, junto con su respectiva caja y sucursal asociadas, y su modo de operación.

```
{
  "data": {
    "terminals": [
      {
        "id": "NEWLAND_N950__N950NCB801293324",
        "pos_id": "23545678",
        "store_id": "12354567",
        "external_pos_id": "SUC0101POS",
        "operating_mode": "PDV | STANDALONE | UNDEFINED"
      }
    ]
  },
  "paging": {
    "total": 1,
    "offset": 0,
    "limit": 50
  }
}
```

| Parámetro | Descripción |
| --- | --- |
| terminals.id | Identificador único de la terminal. El formato en el que es devuelto este campo es **"tipo de terminal + “\_\_” + serial de la terminal"**. Por ejemplo, "NEWLAND\_N950\_\_N950NCB801293324". Podrás identificar el Point que deseas por medio de los últimos caracteres de este campo, que deberán coincidir con el serial que aparece en la etiqueta trasera de la terminal física. |
| terminals.pos\_id | Identificador de la caja a la que está asociada la terminal Point. |
| terminals.store\_id | Identificador de la sucursal a la que está asociada la terminal Point. |
| terminals.operating\_mode | Modo de operación en el que está funcionando la terminal al momento de la consulta. Puede ser:  
  
\- **PDV**: modo operativo Punto de Venta (PDV). Es el modo en el que opera la terminal cuando está integrada vía API y solo podrás recibir pagos con tarjetas.  
\- **STANDALONE**: configuración de la terminal por defecto. Es el modo en el que opera cuando **no** está integrada vía API.  
\- **UNDEFINED**: la configuración que tiene la terminal no es reconocida. |

Como el único modo operativo que permite integrar las terminals vía API es el PDV, una vez que hayas localizado la terminal Point deseada, deberás activarlo. Para eso, envía una solicitud con el Access Token de prueba al endpoint [/terminals/v1/setupPATCH](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/terminals/update-operation-mode/patch), tal como se muestra a continuación.

Si en la respuesta a la consulta encuentras que la terminal con la que estás queriendo procesar pagos integrados ya está con el modo PDV activado, no necesitar realizar esta solicitud y puedes continuar con el [Procesamiento de pagos](https://www.mercadopago.com.mx/developers/es/docs/mp-point/payment-processing). Adicionalmente, si ya realizaste la activación vía API del modo PDV en una terminal, y por algún motivo necesitas volver a configurarlo, puedes hacerlo directamente desde el lector, dirigiéndote a **Más opciones > Ajustes > Modo de vinculación**.

```
curl -X PATCH \
    'https://api.mercadopago.com/terminals/v1/setup'\
    -H 'Content-Type: application/json' \
       -H 'Authorization: Bearer {{YOUR_ACCESS_TOKEN}}' \
    -d '{
  "terminals": [
    {
      "id": "NEWLAND_N950__N950NCB801293324",
      "operating_mode": "PDV"
    }
  ]
}'
```

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `terminals.id` | _String_ | Identificador único de la terminal cuyo modo de operación se quiere modificar, obtenido en la solicitud para consultar las terminals disponibles. Debes enviarlo siguiendo el formato **"tipo de terminal + “\_\_” + serial de la terminal"**, como en el siguiente ejemplo: "NEWLAND\_N950\_\_N950NCB801293324". |
| `terminals.operating_mode` | _String_ | Modo operativo en el que quieres configurar la terminal. Para integrar tu terminal vía API, el valor debe ser `PDV`, que corresponde al modo operativo Punto de Venta. |

Si la solicitud fue exitosa, la respuesta deberá devolver el parámetro `operating_mode=PDV`.

```
{
  "terminals": [
    {
      "id": "NEWLAND_N950__N950NCB801293324",
      "operating_mode": "PDV"
    }
  ]
}
```

Recuerda que solo es posible configurar una terminal en modo PDV por caja. Si deseas integrar varias terminals, deberás crear una caja para cada una de ellas.

Para finalizar la configuración de tu terminal, deberás reiniciarla y, luego, verificar que este se haya aplicado dirigiéndote a **Más opciones > Ajustes > Modo de vinculación**. Si encuentras que el modo de vinculación es **Punto de Venta (PDV)**, el cambio en el modo de operación fue efectivo y podrás continuar integrando el procesamiento de pagos.
