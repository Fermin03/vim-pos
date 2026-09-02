
# Gestionar Menus en Tiendas

<a href="/es/api-reference/menus" target="_blank" class="api">Referencia de API</a>

La API de Rappi te permite administrar los menús de tus tiendas.

Puedes crear y actualizar menús en la plataforma, recuperar los elementos de los menús y revisar el estado de aprobación de tus solicitudes para crear o actualizar menús.

Las principales propiedades de los menús y los elementos creados a través de la API de Rappi consisten en los siguientes elementos:

- `storeId`: El identificador de la tienda
- `items`: Los elementos del menú
  - `category`: La categoría de los elementos del menú
    - `id`: El SKU (Stock-Keeping Unit) que el aliado le otorga a esta categoría
    - `maxQty`: La cantidad máxima de elementos que se pueden pedir en esta categoría
    - `minQty`: La cantidad mínima de elementos que se pueden pedir en esta categoría (En toppings, si es 0 significa que no es obligatorio)
    - `name`: Nombre de la categoría
    - `sortingPosition`: Si es una categoría de producto, es la posición de la categoría en el menu. En caso de ser la categoría de un Topping, es la posición de la categoría dentro del producto
  - `children`: Subelementos anidados en una categoría
  - `name`: El nombre del elemento en el menú
  - `description`: La descripción del elemento en el menú
  - `imageUrl`: La url de la imagen del elemento en el menú
  - `price`: El precio del artículo en el menú
  - `rappiIds`: El identificador que Rappi le da a este artículo
  - `sku`: El SKU (Stock-Keeping Unit) que el aliado le otorga a este artículo
  - `sortingPosition`: La posición del elemento en su categoría
  - `type`: El tipo de artículo
  - `maxLimit`: Indicador máximo del artículo, es requerido solo si el tipo es topping
  - `combo`: Indica si el elemento pertenece a un combo.(si es true significa que pertenece a un combo)

<div class="admonition whats-new">
    <p class="admonition-title"> <i class="fas fa-exclamation-circle"></i> Importante</p>
    <p> En envíos de menus, se deben enviar los precios full en lugar de precios con descuento aplicado </p>
</div>

Algunas de estas propiedades se subdividen en más objetos. Para obtener una vista detallada y una explicación más detallada de estos elementos, consulta el recurso de la API <a href="/es/api-reference/menus" target="_blank">Menus</a> en la <a href="/es/api-reference" target="_blank">Referencia de API </a>.

## Tipos de Mapeo

- **Sin mapeo**: El aliado carga su menu desde portal partners, sin colocar los SKUs de los items del menú. Al recibir una orden, el json de la orden tendrá los ids de rappi de los items pero sus SKUs serán null, por lo que el aliado es el que se encarga de descargar su menu y codificar sus SKUs.
- **Self mapping**: El aliado carga su menu desde portal partners y puede ingresar desde allí el SKU del ítem del menú. Esta información del SKU es tomado para obtener la asociación entre el SKU y el id de rappi del item, para enviarla como parte de la información de la orden al POS del aliado.
- **Mapeo automático**: El aliado debe enviar su menú consumiendo el endpoint POST menu, donde se deben recibir SKUs para cada item que se envie en el menú. El mapeo se genera por medio del envió del json del menú, generando una nueva versión de mapeo que queda disponible de tal manera que al generar una orden, el sistema toma la información registrada en la base de datos del mapeo automatico, y envía la información traducida de la orden al POS del aliado.

## Mejoras con menu automatico

- `Replicaremos el orden de tus productos` en la app de Rappi como lo envías desde el POS.
- `Conservaremos las configuraciones de promociones` cuando actualices los menus desde el POS.
- `La validación del menu será inmediata`, evitando cualquier demora en la carga, y recibirás feedback en el momento (“aceptado“, “rechazado“ o con “error“).
- `Conservaremos el historial de favoritos` de los clientes en la app de Rappi, ya que conservaremos el histórico de tus SKUs.

## Crear un Menú para una Tienda

<a href="/es/api-reference/menus#post-menu" target="_blank" class="api">Referencia de API</a>

Utiliza el endpoint <a href="/es/api-reference/menus#post-menu" target="_blank">POST menu</a> para crear menús a través de la API.

Solo se podrán enviar menús para `tiendas padres`. Si se intenta enviar un menú a una `tienda hija` el endpoint lo va a rechazar.

Para crear un menú:

Realiza una solicitud `POST` a la siguiente URL y agrega un objeto `JSON` al cuerpo de la solicitud con los siguientes objetos.

**URL**: `https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/menu`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

Este es un ejemplo del objeto `JSON` en el cuerpo de la solicitud:

```json
{
  "storeId": "900103361",
  "items": [
    {
      "name": "Grilled Chicken Burger",
      "description": "Grilled chicken burger description",
      "price": 14000,
      "sku": "10",
      "sortingPosition": 0,
      "type": "PRODUCT",
      "category": {
        "id": "2090019638",
        "maxQty": 0,
        "minQty": 0,
        "name": "Burgers",
        "sortingPosition": 0
      },
      "children": [
        {
          "category": {
            "id": "211",
            "maxQty": 1,
            "minQty": 0,
            "name": "Do you want to add?",
            "sortingPosition": 0
          },
          "name": "French Fries",
          "description": "crunchy french fries",
          "price": 5000,
          "sku": "1",
          "maxLimit": 1,
          "sortingPosition": 1,
          "type": "TOPPING"
        },
        {
          "category": {
            "id": "211",
            "maxQty": 1,
            "minQty": 0,
            "name": "Do you want to add?",
            "sortingPosition": 0
          },
          "name": "Potato Wedges",
          "price": 7000,
          "sku": "2",
          "maxLimit": 1,
          "sortingPosition": 1,
          "type": "TOPPING"
        }
      ]
    },
    {
      "name": "Hawaiian Pizza",
      "description": "hawaiian pizza description",
      "price": 18000,
      "sku": "11",
      "sortingPosition": 1,
      "type": "PRODUCT",
      "category": {
        "id": "2090019639",
        "maxQty": 0,
        "minQty": 0,
        "name": "Pizzas",
        "sortingPosition": 1
      },
      "children": []
    }
  ]
}
```

!!! note
Si necesitamos cambiar la disponibilidad de los products, podemos utilizar el módulo de [Gestionar Disponibilidad](/es/managing-availability/)

!!! note
Los valores de este `JSON` no son datos reales. Asegúrate de reemplazarlos con tus datos cuando realices solicitudes de API. Puedes agregar más elementos al menú agregando más objetos en `items`, separados por una coma.

El sistema muestra el mensaje de confirmación _Menu updated and ready to be validated_.

!!! note
No es posible procesar mas de 1 menú al tiempo, por tanto, si ya existe un menú en proceso de aprobación, todos los menus entrantes de la misma tienda serán ignorados

Tu menú está ahora bajo aprobación. Puedes consultar el estado de tu menú haciendo una solicitud `GET` al endpoint `menú`. Para obtener más información, Consulta la sección de [Obtención de Información del Menú](/es/managing-store-menus#obtencion-de-informacion-del-menu) en esta página.

## Validaciones sobre el menu recibido

Cuando Rappi recibe un menú a través del endpoint `POST menu`, el servicio de catálogo ejecuta un conjunto de validaciones antes de aceptarlo. Si alguna falla, el menú se rechaza y la respuesta incluye el detalle de cada error encontrado.

El servicio aplica una serie de validaciones agrupadas en tres familias:

1. **Estructurales**: forma del menú y consistencia entre productos, toppings y corredores.
2. **Contenido**: calidad y formato de textos, imágenes y precios.
3. **Límites**: tamaños máximos configurables.

### Cómo se reportan los errores

Cuando un menú es rechazado, el response es siempre `HTTP 400`. El body tiene una de dos formas, según qué validación falle.

#### Formato simple

Cuando el servicio rechaza tempranamente la forma del request (por ejemplo: el mismo SKU usado con datos distintos, o profundidad excesiva), el body es:

```json
{
  "type": "<error_type>",
  "message": "..."
}
```

Donde `<error_type>` puede ser `item_data_conflict`, `invalid_item_depth`, entre otros.

!!! note
Aunque algunos valores de `type` contengan la palabra "conflict", el HTTP status es siempre `400 Bad Request`, nunca `409`.

#### Formato detallado

Cuando se completó la evaluación de toda la estructura del menú, el body incluye:

- Un booleano por cada validación (`true` si pasó, `false` si falló).
- `item_level_depth`: la profundidad de la ruta validada.
- `path`: la ruta dentro del menú donde se detectó el problema (corredor → producto → topping category → topping…).
- `path_item_details`: lista de detalles con el siguiente formato:

```text
[Error]: <nombre_de_la_validación>, [Details]: <descripción>, [Location]: store_id=…, item_id=…, item_sku=…
```

Ejemplo abreviado:

```json
{
  "duplicated_items_complies": false,
  "item_level_depth": 3,
  "path": [
    { "id": 50, "item_type": "CATEGORY", "sku": "burgers" },
    { "id": 200, "item_type": "ITEM", "sku": "hamburguesa" }
  ],
  "path_item_details": [
    "[Error]: duplicated_items_complies, [Details]: duplicated item in category, [Location]: store_id=123, category_id=50, item_id=200, item_sku=papas-fritas"
  ]
}
```

!!! note
Los nombres entre paréntesis (en `snake_case`) son los identificadores técnicos que aparecen literalmente en `path_item_details`. Los mensajes de error se mantienen en inglés porque así los devuelve el servicio.

### Validaciones estructurales

- **Profundidad máxima del menú** (`invalid_item_depth`): el menú admite hasta **2 niveles** de jerarquía: un producto en el primer nivel y sus toppings dentro de `children`. No se permite anidar más hijos dentro de un topping. El servicio rechaza el request con el formato simple y mensaje: `item with SKU '<sku>' exceeds maximum menu depth of 2 levels in menu integration V1`.
- **Datos consistentes para el mismo SKU** (`item_data_conflict`): si un SKU se repite en distintos contextos del menú, **todos sus atributos deben coincidir** en cada aparición (nombre, descripción, precio, imagen, cantidades, lista de hijos). Si difieren, el menú se rechaza con el formato simple y body de tipo `item_data_conflict`.

    Por ejemplo, si envías el topping con SKU `topping-tomate` con dos precios distintos bajo la misma topping category `211`, recibes:

    ```json
    {
      "type": "item_data_conflict",
      "message": "item with sku 'topping-tomate' has two different price values under topping category '211': $2500 and $3000"
    }
    ```

    Las divergencias detectadas son seis. En todos los mensajes, `<parentType>` es `corridor` (corredor), `product` (producto) o `topping category` —el tipo de contenedor del elemento conflictivo— y `<parentSKU>` es el identificador de ese contenedor:

    - **Título**: `item with sku '<sku>' has two different title values under <parentType> '<parentSKU>': '<t1>' and '<t2>'`.
    - **Descripción**: `item with sku '<sku>' has two different description values under <parentType> '<parentSKU>': '<d1>' and '<d2>'`.
    - **Precio**: `item with sku '<sku>' has two different price values under <parentType> '<parentSKU>': $<p1> and $<p2>`.
    - **Imagen**: `item with sku '<sku>' has two different image values under <parentType> '<parentSKU>': '<url1>' and '<url2>'`.
    - **Cantidad** (aplica a topping categories — `maxQty`, `minQty`, tipo de modifier): `item with sku '<sku>' has two different quantity values under <parentType> '<parentSKU>': min <m1>, max <M1>, type <t1> and min <m2>, max <M2>, type <t2>`.
    - **Hijos (children)**: `item with sku '<sku>' has conflicting child items under <parentType> '<parentSKU>'`.

    !!! note
    Si tu menú proviene de un POS donde un mismo producto o topping aparece en varios contextos (por ejemplo, el mismo topping "Tomate" se ofrece en varias hamburguesas), asegúrate de que el SKU sea idéntico y que todos los atributos coincidan en cada aparición. Si necesitas que una variación tenga atributos distintos (por ejemplo, "Tomate" con un precio diferente en otra hamburguesa), **asígnale un SKU propio**: cada variación del producto debe tener su propio SKU.

- **Corredores no duplicados** (`duplicated_categories_complies`): dentro de un mismo menú no pueden existir dos corredores con el mismo `id` o el mismo SKU. Mensaje: `[Error]: duplicated_categories_complies, [Details]: duplicated category in menu, [Location]: …`.
- **Productos y toppings no duplicados** (`duplicated_items_complies`): dentro de un corredor no puede haber dos productos con el mismo `id` o SKU. Lo mismo aplica dentro de una topping category respecto a sus toppings. Mensaje: `[Error]: duplicated_items_complies, [Details]: duplicated item in category, [Location]: …`.
- **Relación válida producto ↔ topping category** (`item_relation_complies`): en cualquier ruta del menú, no se permiten dos nodos consecutivos del mismo tipo. Un producto debe contener topping categories, y una topping category debe contener toppings; nunca producto → producto ni topping category → topping category. Mensaje: `[Error]: item_relation_complies, [Details]: invalid relation between items and modifier groups found in path, [Location]: …`.
- **Sin ciclos** (`item_relation_without_cyclic_complies`): el mismo **SKU** no puede aparecer dos veces en una misma ruta del menú, sin importar el tipo de elemento. Por ejemplo, si un producto tiene SKU `abc-123` y dentro de su árbol de toppings aparece otro elemento con el mismo SKU `abc-123` (otro producto, un topping o una topping category), la validación falla. Mensaje: `[Error]: item_relation_without_cyclic_complies, [Details]: cyclic relation between items found in path, [Location]: item with id <n> and sku <sku> is duplicated in path`.
- **Inicio y fin con producto/topping** (`start_and_ends_with_item`): toda ruta del menú empieza y termina en un producto o topping, nunca en una topping category. Mensaje: `[Error]: start_and_ends_with_item, [Details]: path does not start and end with item, [Location]: …`.
- **Mínimo de corredores** (`minimum_categories_complies`): la tienda debe enviar al menos un corredor. Mensaje: `[Error]: minimum_categories_complies, [Details]: no categories found in store menu, [Location]: store_id=…`.
- **Mínimo de productos** (`minimum_items_complies`): la tienda debe enviar al menos un producto. Mensaje: `[Error]: minimum_items_complies, [Details]: no items found in store menu, [Location]: store_id=…`.

### Validaciones de contenido

- **URL de imagen válida** (`image_url_complies`): cada URL de imagen debe ser absoluta (comenzar con `http://` o `https://`), no contener espacios y ser parseable. Se valida con la expresión `^https?://[^\s]+(\?[^\s]*)?$`. Mensaje: `[Error]: image_url_complies, [Details]: Invalid image URL <url>, Error: invalid image url format, [Location]: …`.
- **Formato de texto** (`text_format_complies`): los textos visibles al cliente (nombre, descripción, atributos, paths de imagen) no pueden contener emojis ni palabras prohibidas. El SKU se valida solo contra emojis; las palabras prohibidas dentro del SKU producen un *warning no bloqueante* (no rechazan el menú). La lista de palabras prohibidas depende del país (ver más abajo). Mensajes posibles:
    - `[Error]: text_format_complies, [Details]: item title contains emoji characters: <texto>, [Location]: …`
    - `[Error]: text_format_complies, [Details]: item title '<texto>' contains blacklisted words: '<palabra>', [Location]: …`
- **Longitudes de texto** (`text_fields_length_complies`): longitudes permitidas:

    | Campo | Mínimo | Máximo |
    | --- | --- | --- |
    | SKU del producto / topping | 1 | 500 |
    | Nombre del producto / topping | 1 | 1000 |
    | Descripción del producto / topping | 0 | 2000 |
    | SKU del corredor / topping category | 0 | 500 |
    | Nombre del corredor / topping category | 0 | 1000 |
    | Descripción del corredor / topping category | 0 | 2000 |

    Mensaje: `[Error]: text_fields_length_complies, [Details]: item title length out of bounds: <n> not between [<min> and <max>], [Location]: …`.

- **Tipos de override válidos** (`override_type_complies`): un override solo puede aplicarse en ciertos niveles según el campo que sobrescribe:

    | Override | Niveles permitidos |
    | --- | --- |
    | Title | STORE, ITEM |
    | Description | STORE, ITEM |
    | Price | STORE, ITEM |
    | Items | STORE, ITEM |
    | Quantity | STORE, ITEM |
    | Schedules | STORE, ITEM, CATEGORY |
    | Suspension | STORE |
    | Images | STORE, ITEM |

    Mensaje: `[Error]: override_type_complies, [Details]: item <field> override has unsupported type: <type>, [Location]: …`.

    Si envías un override con un nivel no permitido, el servicio puede rechazarlo tempranamente con el formato simple (`type: "item_data_conflict"`) y uno de estos mensajes:

    - `item with SKU '<sku>' and title '<t>' and type '<type>' is not permitted for an override`
    - `item with SKU '<sku>' and description '<d>' and type '<type>' is not permitted for an override`
    - `item with SKU '<sku>' and price '<p>' and type '<type>' is not permitted for an override`
    - `item with SKU '<sku>' and image '<img>' and type 'CATEGORY' is not permitted for an override`
    - `item with SKU '<sku>' and quantity is not permitted in override of type <type>`

- **Números positivos** (`positive_numbers_complies`): los precios no pueden ser negativos; `min_permitted` y `max_permitted` no pueden ser negativos; en una topping category `max_permitted` debe ser mayor que 0. Mensajes:
    - `[Error]: positive_numbers_complies, [Details]: item has negative price: <p>, [Location]: …`
    - `[Error]: positive_numbers_complies, [Details]: modifier_group item has zero max_permitted: 0, [Location]: …`
- **Precios cero** (`zero_price_complies`): un producto sin toppings debe tener precio mayor que 0. Un producto con toppings puede tener precio 0 siempre que al menos uno de sus toppings tenga precio mayor que 0. Mensaje: `Product price must be greater than 0 if the product doesn't have any children. Otherwise at least one of its children must have price.`.
- **min_permitted válido** (`min_permitted_complies`): en productos estándar, `min_permitted` no puede ser mayor que 0. Esta restricción aplica al campo en el producto y a cualquier override. Mensaje: `[Error]: min_permitted_complies, [Details]: item min_permitted greater than 0: <n>, [Location]: …`.

### Validaciones de límites

- **Máx hijos por producto / topping category** (`max_item_childs_complies`): máximo **50**. Mensaje: `item with too many childs: <n> > 50`.
- **Máx imágenes por producto** (`max_item_images_complies`): máximo **3**. Mensaje: `item with too many images: <n> > 3`.
- **Máx productos por corredor** (`max_items_category_complies`): máximo **50**. Mensaje: `category with too many items: <n> > 50`.
- **Máx periodos de tiempo por schedule** (`max_time_periods_complies`): máximo **6**. Mensaje: `schedule <id> with too many time periods: <n> > 6`.
- **max_permitted dentro de los límites del padre** (`max_permitted_in_items_complies`): el `max_permitted` de un topping debe respetar el `max_permitted` (o `maxQty`) de su topping category contenedora, y el `max_permitted` de una topping category no puede exceder el del producto padre. Mensaje: `[Error]: max_permitted_in_items_complies, [Details]: max_permitted exceeds parent max_permitted, [Location]: …`.

!!! note
Los límites numéricos son configurables y pueden cambiar en el tiempo. Los valores listados aquí son los vigentes al momento de publicar esta página.

### Reglas adicionales

Además de las validaciones anteriores, se aplican estas reglas a nivel del request:

- **Lista de productos vacía**: el body debe traer al menos un producto. Error: `Items is required`.
- **Tipos válidos**: el primer nivel debe ser `PRODUCT` y los hijos `TOPPING`. Error: `All parent items must be product type and children must be topping type`.
- **Formato de los archivos de imagen**: los archivos referenciados deben ser PNG, JPEG, JFIF, JPG, WEBP, TIFF o BMP, y pesar hasta 1 MB.

### Palabras prohibidas por país

La validación `text_format_complies` rechaza textos que contengan palabras de la lista de bloqueo del país de la tienda. **La lista varía por país** (AR, BR, CL, CO, CR, EC, MX, PE, UY tienen listas propias). Las palabras se agrupan en tres categorías:

1. **Plataformas competidoras**. Marcas de delivery y comercio cuyos nombres no pueden aparecer en el contenido del menú. Algunas son comunes a varios países (por ejemplo `uber`, `uber eats`, `ubereats`, `ifood`, `glovo`, `didi`, `pedidos ya`, `domicilios.com`) y otras son específicas del país (BR: `99 food`, `aiqfome`, `alfred delivery`, `delivery much`, `delivery center`, `james delivery`, `ze delivery`, `cornershop`; CO/AR/CR: `merqueo`; y otras).
2. **Lenguaje ofensivo o vulgar**. Insultos, groserías, lenguaje discriminatorio y expresiones soeces. El contenido específico varía por modismo regional.
3. **Referencias políticas o de actualidad local**. Nombres de figuras políticas, partidos y movimientos del país (varía por jurisdicción), así como términos relacionados como `huelga`, `protestar`, `corrupto`, `fraude`, `manifestación` y similares.

!!! note
La lista completa por país (palabra a palabra) cambia con frecuencia y se mantiene del lado de Rappi. Si tu pipeline necesita la lista vigente para filtrar contenido antes de enviar el menú, contacta al equipo de soporte que está apoyando tu integración.

**Recomendación**: sanitiza el contenido visible al cliente (nombre y descripción de productos, toppings y corredores; nombres de atributos) antes de enviarlo. Si el contenido viene del POS del aliado o de un equipo de marketing, evita incluir referencias a competidores, lenguaje ofensivo y temas políticos del país de la tienda.

!!! note
Menú automático no soporta la reutilización de skus (ids) cuando se desea crear nuevos productos, topping categories y toppings.

## Obtención de Información del Menú

<a href="/es/api-reference/menus#get-menu" target="_blank" class="api">Referencia de API</a>

Una vez que Rappi aprueba el contenido del menú, puedes traer el contenido de los menús de tu tienda utilizando el endpoint <a href="/es/api-reference/menus#get-menu" target="_blank">`GET menu`</a>.

Para traer el contenido de los menús de tu tienda:

Realiza una solicitud `GET` a la siguiente URL.

**URL**: `https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/menu`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

El sistema devuelve una respuesta con un objeto `JSON` con la información de los menús de la tienda.

## Consultar el Estado de Aprobación de tus Menús

<a href="/es/api-reference/menus#get-menu-approved-store-id" target="_blank" class="api">Referencia de API</a>

Después de crear un menú usando nuestra API, el equipo de Rappi valida la estructura y el contenido de tu menú.

Puedes utilizar el endpoint <a href="/es/api-reference/menus#get-menu-approved-store-id" target="_blank">`GET menu/approved/{storeId}`</a> para consultar el estado de aprobación de tus menús.

Para consultar el estado de tus menús:

Realiza una solicitud `GET` a la siguiente URL.

**URL**: `https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/menu/approved/{storeId}`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

El sistema devuelve una respuesta con un objeto `JSON` con el estado de aprobación de los menús de la tienda.

!!! note
Si el tiempo de espera para aprobación de un menú supera el SLA acordado, se debe contactar con el equipo de soporte para validar el estado del menú.

## Recuperar tu Ultimo Menú Creado

<a href="/es/api-reference/menus#get-menu-rappi-store-id" target="_blank" class="api">Referencia de API</a>

Utiliza el endpoint <a href="/es/api-reference/menus#get-menu-rappi-store-id" target="_blank">`GET menu/rappi/{storeId}`</a> para recuperar la información del último menú creado para una tienda específica.

Para obtener el último menú creado:

Realiza una solicitud `GET` a la siguiente URL:

**URL**: `https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/menu/rappi/{storeId}`

- `{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

- `{storeId}`: Este es el identificador de la integración de tu tienda.

El sistema devuelve una respuesta `JSON` con la información del último menú creado para tu tienda.
