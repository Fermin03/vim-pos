
# Rest API - Menu

<aside class="notice">
  <p><b>Programa de acceso limitado</b></p>
  <p>El acceso a la API REST de Menú está disponible únicamente a través de un programa de acceso limitado por invitación. Si te interesa participar, por favor completa el formulario de interés.</p>
  <p><a href="https://forms.gle/sLvLsKkHqYyf1qbM7" target="_blank">Solicitar acceso anticipado</a></p>
</aside>

El recurso Menús permite interactuar con los menús y productos de un restaurante.

El resource permite gestionar de forma unificada todos los componentes del menú de una tienda —menús, categorías e ítems— utilizando el identificador de tienda (storeId). Esta estructura simplifica la integración al centralizar la información y operación sobre el menú completo desde un solo recurso.

El catálogo de la tienda se compone de ítems de dos tipos: `ITEM`, que representa productos o modificadores individuales, y `MODIFIER_GROUP`, que agrupa modificadores. Las categorías contienen solo ítems de tipo `ITEM`, y las relaciones entre ítems están limitadas a combinaciones entre tipos distintos, como `ITEM` → `MODIFIER_GROUP` y `MODIFIER_GROUP` → `ITEM`.

La siguiente tabla describe los diferentes contenidos del recurso Menú:

| Recurso                                                                                        | Descripción                                                                                                               |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [`GET /v1/stores/{storeId}/store-menu`](#get-menu-de-tienda-por-id-de-tienda)                  | Recupera el menú completo de la tienda, incluidos los artículos, categorías y tipos de menú, mediante el ID de la tienda. |
| [`POST /v1/stores/{storeId}/store-menu`](#post-subir-menu-de-tienda)                           | Carga el menú completo de la tienda en un bucket de S3.                                                                   |
| [`GET /v1/stores/{storeId}/menu`](#get-menus-por-id-de-tienda)                                 | Recupera los menús de una tienda por ID de tienda.                                                                        |
| [`POST /v1/stores/{storeId}/menu`](#post-insertar-menu-por-id-de-tienda)                       | Crea o actualiza los menús por ID de tienda.                                                                              |
| [`DELETE /v1/stores/{storeId}/menu`](#delete-menu-por-id-de-tienda)                            | Elimina los menús especificados por ID de tienda.                                                                         |
| [`GET /v1/stores/{storeId}/menu/{menuId}`](#get-menu-por-id-de-tienda)                         | Recupera el menú especificado con todas las relaciones de información por ID de tienda.                                   |
| [`GET /v1/stores/{storeId}/categories`](#get-categorias-por-id-de-tienda)                      | Recupera las categorías de una tienda por su ID.                                                                          |
| [`POST /v1/stores/{storeId}/categories`](#post-crear-o-actualizar-categorias-por-id-de-tienda) | Crea o actualiza las categorías por ID de tienda.                                                                         |
| [`DELETE /v1/stores/{storeId}/categories`](#delete-eliminar-categorias-por-id-de-tienda)       | Elimina las categorías por ID de tienda.                                                                                  |
| [`GET /v1/stores/{storeId}/categories/{categoryId}`](#get-categoria-por-id-de-tienda)          | Recupera la categoría especificada con todas sus relaciones de información.                                               |
| [`GET /v1/stores/{storeId}/items`](#get-items-por-id-de-tienda)                                | Recupera los artículos de una tienda por ID de tienda.                                                                    |
| [`POST /v1/stores/{storeId}/items`](#post-insertar-item-por-id-de-tienda)                      | Crea o actualiza los artículos por ID de tienda..                                                                         |
| [`DELETE /v1/stores/{storeId}/items`](#delete-items-por-id-de-tienda)                          | Elimina los artículos específicos por ID de tienda.                                                                       |
| [`GET /v1/stores/{storeId}/items/{itemId}`](#get-item-por-id-de-tienda)                        | RRecupera el artículo específico con todas las relaciones de información por ID de tienda.                                |

## GET Menú de tienda por ID de tienda

Utiliza este endpoint para recuperar el menú de la tienda (los menús completos con artículos, categorías y tipos de menú) por storeId.

### URL del Endpoint

Utiliza esta URL para realizar una solicitud con este endpoint:

`https://{NEW_DOMAIN}/restaurants/menu/v1/stores/{storeId}/store-menu`

`{NEW_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="http://dev-portal.dev.rappi.com/es/api-reference/content/#nuevos-dominios" target="_blank">Mira la lista de Dominios por país.</a>

<aside class="notice">
  <p>NOTA</p>
  <p>Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollador: <code>https://api.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso tienes las siguiente propiedades:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Parámetros

Este endpoint tiene los siguientes parámetros:

| Parámetro | Tipo   | Requerido | Descripción                                                        |
| --------- | ------ | --------- | ------------------------------------------------------------------ |
| `storeId` | uint64 | Sí        | El identificador único de la tienda cuyo menú se está solicitando. |

This parameter is used to specify which store's menu should be retrieved. The storeId should be a valid integer representing a store registered in the system.

### Códigos de Respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200` Éxito

</aside>

<aside class="error-response">

`400` Solicitud incorrecta

</aside>

<aside class="error-response">

`401` Credenciales inválidas

</aside>

<aside class="error-response">

`404` No encontrado

</aside>

<aside class="error-response">

`500` Error inesperado.

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`GET https://api.dev.rappi.com/restaurants/menu/v1/stores/{storeId}/store-menu`

> Este es un ejemplo de la llamada:

```curl
curl --location 'https://api.dev.rappi.com/restaurants/menu/v1/stores/232/store-menu' \
--header 'x-authorization: Bearer eyJhbGciOiJIUzI1NiIsI'
```

```java
String storeId = "232";
String urlString = "https://api.dev.rappi.com/restaurants/menu/v1/stores/"+storeId+"/store-menu";
URL url = new URL(urlString);
HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("GET");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");

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

```javascript
const https = require("https");

const storeId = "232";
const options = {
  method: "GET",
  hostname: "api.dev.rappi.com",
  path: `/restaurants/menu/v1/stores/${storeId}/store-menu`,
  headers: {
    "Content-Type": "application/json",
    "x-authorization": "Bearer YOUR_TOKEN",
  },
};

const req = https.request(options, function (res) {
  let chunks = [];

  res.on("data", function (chunk) {
    chunks.push(chunk);
  });

  res.on("end", function () {
    const body = Buffer.concat(chunks);
    console.log("Response body:", body.toString());
  });

  res.on("error", function (error) {
    console.error(error);
  });
});

req.end();
```

```python
import requests

storeId = "232"
url = "https://api.dev.rappi.com/restaurants/menu/v1/stores/{storeId}/store-menu"

headers = {
    "Content-Type": "application/json",
    "x-authorization": "Bearer YOUR_TOKEN"
}

response = requests.get(url, headers=headers)

print("Response Code:", response.status_code)
print("Response Body:", response.text)
```

```go
package main

import (
	"fmt"
	"io"
	"net/http"
)

func main() {
	storeID := "232"
	url := "https://api.dev.rappi.com/restaurants/menu/v1/stores/" + storeID + "/store-menu"

	client := &http.Client{}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		fmt.Println(err)
		return
	}
	req.Header.Add("Content-Type", "application/json")
	req.Header.Add("x-authorization", "Bearer YOUR_TOKEN")

	res, err := client.Do(req)
	if err != nil {
		fmt.Println(err)
		return
	}
	defer res.Body.Close()

	body, err := io.ReadAll(res.Body)
	if err != nil {
		fmt.Println(err)
		return
	}

	fmt.Println("Response Code:", res.StatusCode)
	fmt.Println("Response Body:", string(body))
}
```

### Ejemplo de Respuesta

> Este es un ejemplo de la respuesta:

```json
{
  "storeId": 232,
  "menus": [
    {
      "id": 9,
      "storeId": 232,
      "super_store_id": 232,
      "menu_type": "DEFAULT",
      "categories": [
        {
          "id": 107,
          "sku": "ADSA-UY-UNICO MONTEVIDEO-800018",
          "index": 8,
          "is_category_active": true,
          "storeId": 232
        }
      ]
    }
  ],
  "categories": [
    {
      "id": 107,
      "sku": "ADSA-UY-UNICO MONTEVIDEO-800018",
      "storeId": 232,
      "title": "Mccafé",
      "last_updated": "2025-03-14T14:24:11.345803Z",
      "items": [
        {
          "id": 9335,
          "sku": "49155",
          "index": 1,
          "menuId": 9,
          "menu_type": "DEFAULT",
          "storeId": 232
        }
      ],
      "menus": [
        {
          "id": 9,
          "index": 8,
          "is_category_active": true,
          "menu_type": "DEFAULT",
          "storeId": 232
        }
      ],
      "schedules": []
    }
  ],
  "items": [
    {
      "id": 9335,
      "sku": "49155",
      "storeId": 232,
      "last_updated": "2025-03-14T14:23:58.338248Z",
      "item_type": "ITEM",
      "title_info": {
        "title": "Cappuccino Regular + Croissant Con Lomito Y Queso",
        "overrides": []
      },
      "description_info": {
        "description": "Promo \"cappuccino regular + croissant con lomito y queso\"",
        "overrides": []
      },
      "images_info": {
        "images": [
          {
            "id": 279,
            "path": "my/path/to/my/image.jpg",
            "index": 1,
            "host": "https://my.cdn.com"
          }
        ],
        "overrides": []
      },
      "items_info": {
        "items": [
          {
            "id": 11797,
            "sku": "1248188076",
            "index": 1
          },
          {
            "id": 12001,
            "sku": "1248188077",
            "index": 2
          },
          {
            "id": 11949,
            "sku": "1248188078",
            "index": 3
          },
          {
            "id": 11772,
            "sku": "1248188079",
            "index": 4
          }
        ],
        "overrides": []
      },
      "price_info": {
        "price": 199,
        "overrides": []
      },
      "quantity_info": {
        "min_permitted": null,
        "max_permitted": null,
        "modifiers_type": null,
        "overrides": []
      },
      "suspension_info": {
        "suspend_until": null,
        "suspend_reason": null,
        "overrides": [],
        "is_available": true
      },
      "schedules_info": {
        "schedules": [],
        "overrides": []
      }
    },
    {
      "id": 11797,
      "sku": "1248188076",
      "storeId": 232,
      "last_updated": "2025-03-14T14:23:58.979715Z",
      "item_type": "MODIFIER_GROUP",
      "title_info": {
        "title": "Extra grand croissant relleno de lomito y queso",
        "overrides": []
      },
      "description_info": {
        "description": "Extra grand croissant relleno de lomito y queso",
        "overrides": []
      },
      "images_info": {
        "images": [],
        "overrides": []
      },
      "items_info": {
        "items": [],
        "overrides": []
      },
      "price_info": {
        "price": 0,
        "overrides": []
      },
      "quantity_info": {
        "min_permitted": 0,
        "max_permitted": 2,
        "modifiers_type": "inclusive",
        "overrides": []
      },
      "suspension_info": {
        "suspend_until": null,
        "suspend_reason": null,
        "overrides": [],
        "is_available": true
      },
      "schedules_info": {
        "schedules": [],
        "overrides": []
      }
    },
    {
      "id": 12001,
      "sku": "1248188077",
      "storeId": 232,
      "last_updated": "2025-03-14T14:23:58.85638Z",
      "item_type": "MODIFIER_GROUP",
      "title_info": {
        "title": "Extra cappuccino regular",
        "overrides": []
      },
      "description_info": {
        "description": "Extra cappuccino regular",
        "overrides": []
      },
      "images_info": {
        "images": [],
        "overrides": []
      },
      "items_info": {
        "items": [],
        "overrides": []
      },
      "price_info": {
        "price": 0,
        "overrides": []
      },
      "quantity_info": {
        "min_permitted": 0,
        "max_permitted": 8,
        "modifiers_type": "inclusive",
        "overrides": []
      },
      "suspension_info": {
        "suspend_until": null,
        "suspend_reason": null,
        "overrides": [],
        "is_available": true
      },
      "schedules_info": {
        "schedules": [],
        "overrides": []
      }
    },
    {
      "id": 11949,
      "sku": "1248188078",
      "storeId": 232,
      "last_updated": "2025-03-14T14:23:58.829912Z",
      "item_type": "MODIFIER_GROUP",
      "title_info": {
        "title": "Personalizar grand croissant relleno de lomito y queso",
        "overrides": []
      },
      "description_info": {
        "description": "Personalizar grand croissant relleno de lomito y queso",
        "overrides": []
      },
      "images_info": {
        "images": [],
        "overrides": []
      },
      "items_info": {
        "items": [],
        "overrides": []
      },
      "price_info": {
        "price": 0,
        "overrides": []
      },
      "quantity_info": {
        "min_permitted": 0,
        "max_permitted": 1,
        "modifiers_type": "exclusive",
        "overrides": []
      },
      "suspension_info": {
        "suspend_until": null,
        "suspend_reason": null,
        "overrides": [],
        "is_available": true
      },
      "schedules_info": {
        "schedules": [],
        "overrides": []
      }
    },
    {
      "id": 11772,
      "sku": "1248188079",
      "storeId": 232,
      "last_updated": "2025-03-14T14:23:58.342775Z",
      "item_type": "MODIFIER_GROUP",
      "title_info": {
        "title": "Personalizar cappuccino regular",
        "overrides": []
      },
      "description_info": {
        "description": "Personalizar cappuccino regular",
        "overrides": []
      },
      "images_info": {
        "images": [],
        "overrides": []
      },
      "items_info": {
        "items": [],
        "overrides": []
      },
      "price_info": {
        "price": 0,
        "overrides": []
      },
      "quantity_info": {
        "min_permitted": 0,
        "max_permitted": 2,
        "modifiers_type": "inclusive",
        "overrides": []
      },
      "suspension_info": {
        "suspend_until": null,
        "suspend_reason": null,
        "overrides": [],
        "is_available": true
      },
      "schedules_info": {
        "schedules": [],
        "overrides": []
      }
    }
  ]
}
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Objeto                                              | Descripción                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------- |
| `storeId`<br/>_uint64_                              | Identificador de la tienda en la aplicación Rappi.                        |
| `menus`<br/>_[]Menu_                                | Lista de menús disponibles en la tienda. Cada menú contiene categorías.   |
| `menus[].id`<br/>_uint64_                           | Identificador único del menú.                                             |
| `menus[].storeId`<br/>_uint64_                      | ID de la tienda asociada al menú.                                         |
| `menus[].super_store_id`<br/>_uint64_               | ID de la super tienda vinculada al menú.                                  |
| `menus[].menu_type`<br/>_string_                    | Tipo de menú (por ejemplo, "DEFAULT").                                    |
| `menus[].categories`<br/>_[]Category_               | Categorías contenidas dentro del menú.                                    |
| `categories`<br/>_[]Category_                       | Lista de categorías disponibles en la tienda.                             |
| `categories[].id`<br/>_uint64_                      | Identificador único de la categoría.                                      |
| `categories[].sku`<br/>_string_                     | Código SKU (Stock Keeping Unit) de la categoría.                          |
| `categories[].storeId`<br/>_uint64_                 | ID de la tienda asociada a la categoría.                                  |
| `categories[].title`<br/>_string_                   | Nombre de la categoría.                                                   |
| `categories[].last_updated`<br/>_string (ISO 8601)_ | Marca de tiempo de la última actualización de la categoría.               |
| `categories[].items`<br/>_[]Item_                   | Lista de artículos dentro de la categoría.                                |
| `categories[].menus`<br/>_[]Menu_                   | Lista de menús asociados a la categoría.                                  |
| `items`<br/>_[]Item_                                | Lista de artículos disponibles en la tienda.                              |
| `items[].id`<br/>_uint64_                           | Identificador único del artículo.                                         |
| `items[].sku`<br/>_string_                          | Código SKU del artículo.                                                  |
| `items[].storeId`<br/>_uint64_                      | ID de la tienda asociada al artículo.                                     |
| `items[].last_updated`<br/>_string (ISO 8601)_      | Marca de tiempo de la última actualización del artículo.                  |
| `items[].item_type`<br/>_string_                    | Tipo de artículo (por ejemplo, "ITEM", "MODIFIER_GROUP").                 |
| `items[].title_info.title`<br/>_string_             | Nombre o título del artículo.                                             |
| `items[].description_info.description`<br/>_string_ | Descripción del artículo.                                                 |
| `items[].images_info.images`<br/>_[]Image_          | Lista de imágenes asociadas al artículo.                                  |
| `items[].price_info.price`<br/>_float_              | Precio del artículo.                                                      |
| `items[].quantity_info.min_permitted`<br/>_int_     | Cantidad mínima permitida para la compra.                                 |
| `items[].quantity_info.max_permitted`<br/>_int_     | Cantidad máxima permitida para la compra.                                 |
| `items[].quantity_info.modifiers_type`<br/>_string_ | Tipo de modificadores permitidos (por ejemplo, "inclusive", "exclusive"). |
| `items[].suspension_info.is_available`<br/>_bool_   | Indica si el artículo está disponible.                                    |

## POST Subir menú de tienda

Usa este endpoint para cargar el menú completo de la tienda, incluidos los artículos, categorías y tipos de menú, en un bucket de S3 y procesarlo para guardarlo o actualizarlo.

### URL del Endpoint

Utiliza esta URL para realizar una solicitud con este endpoint:

`https://{NEW_DOMAIN}/restaurants/menu/v1/stores/{storeId}/store-menu`

`{NEW_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="http://dev-portal.dev.rappi.com/es/api-reference/content/#nuevos-dominios" target="_blank">Mira la lista de Dominios por país.</a>

<aside class="notice">
  <p>NOTA</p>
  <p>Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollador: <code>https://api.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso tienes las siguiente propiedades:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Parámetros

Este endpoint tiene los siguientes parámetros:

| Parámetro | Tipo   | Requerido | Descripción                                                        |
| --------- | ------ | --------- | ------------------------------------------------------------------ |
| `storeId` | uint64 | Sí        | El identificador único de la tienda cuyo menú se está solicitando. |

### Códigos de Respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200` Éxito

</aside>

<aside class="error-response">

`400` Solicitud incorrecta

</aside>

<aside class="error-response">

`401` Credenciales inválidas

</aside>

<aside class="error-response">

`500` Error inesperado.

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`POST https://api.dev.rappi.com/restaurants/menu/v1/stores/232/store-menu`

> Este es un ejemplo de la llamada:

```curl
curl --location 'https://api.dev.rappi.com/restaurants/menu/v1/stores/232/store-menu' \
--header 'x-authorization: Bearer eyJhbGciOiJIUzI1NiIsI'
--header 'Content-Type: application/json' \
--data '{
    "storeId": 232,
    "menus": [
        {
            "id": 62,
            "storeId": 232,
            "super_store_id": 232,
            "menu_type": "DEFAULT",
            "categories": []
        }
    ],
    "categories": [
        {
            "sku": "JSDJJ90",
            "storeId": 232,
            "title": "Bebidas",
            "description": "Bebidas",
            "last_updated": "2025-02-24T18:06:19.65862Z",
            "items": [],
            "menus": [],
            "schedules": [
                {
                    "days_of_week": "fri, sat",
                    "time_periods": [
                        {
                            "start_time": "12:00",
                            "end_time": "23:59"
                        }
                    ]
                },
                {
                    "days_of_week": "mon",
                    "time_periods": [
                        {
                            "start_time": "12:00",
                            "end_time": "21:59"
                        }
                    ]
                }
            ]
        }
    ],
    "items": [
        {
            "sku": "13ML",
            "storeId": 232,
            "last_updated": "2025-02-24T18:06:19.532278Z",
            "item_type": "ITEM",
            "title_info": {
                "title": "Hamburguesa de pollo con salsas",
                "overrides": []
            },
            "description_info": {
                "description": "Hamburguesa de pollo",
                "overrides": []
            },
            "images_info": {
                "images": [],
                "overrides": []
            },
            "items_info": {
                "items": [
                    {
                        "sku": "SALSA-16",
                        "index": 0
                    }
                ],
                "overrides": []
            },
            "price_info": {
                "price": 6000,
                "overrides": []
            },
            "quantity_info": {
                "min_permitted": null,
                "max_permitted": null,
                "overrides": []
            },
            "suspension_info": {
                "suspend_until": null,
                "suspend_reason": null,
                "overrides": []
            },
            "schedules_info": {
                "schedules": [],
                "overrides": []
            }
        },
        {
            "sku": "SALSA-16",
            "storeId": 232,
            "last_updated": "2025-02-24T18:06:19.535201Z",
            "item_type": "MODIFIER_GROUP",
            "title_info": {
                "title": "Salsas adicionales",
                "overrides": []
            },
            "description_info": {
                "description": "Salsas adicionales",
                "overrides": []
            },
            "images_info": {
                "images": [],
                "overrides": []
            },
            "items_info": {
                "items": [
                    {
                        "sku": "TOMATE-455",
                        "index": 0
                    },
                    {
                        "sku": "Mayo466",
                        "index": 0
                    }
                ],
                "overrides": []
            },
            "price_info": {
                "price": 25,
                "overrides": []
            },
            "quantity_info": {
                "min_permitted": 0,
                "max_permitted": 0,
                "overrides": []
            },
            "suspension_info": {
                "suspend_until": null,
                "suspend_reason": null,
                "overrides": []
            },
            "schedules_info": {
                "schedules": [],
                "overrides": []
            }
        },
        {
            "sku": "TOMATE-455",
            "storeId": 232,
            "last_updated": "2025-02-24T18:06:19.536526Z",
            "item_type": "ITEM",
            "title_info": {
                "title": "Salsas de tomate",
                "overrides": []
            },
            "description_info": {
                "description": "Salsa de tomate",
                "overrides": []
            },
            "images_info": {
                "images": [],
                "overrides": []
            },
            "items_info": {
                "items": [],
                "overrides": []
            },
            "price_info": {
                "price": 25,
                "overrides": []
            },
            "quantity_info": {
                "min_permitted": 0,
                "max_permitted": 0,
                "overrides": []
            },
            "suspension_info": {
                "suspend_until": null,
                "suspend_reason": null,
                "overrides": []
            },
            "schedules_info": {
                "schedules": [],
                "overrides": []
            }
        },
        {
            "sku": "Mayo466",
            "storeId": 232,
            "last_updated": "2025-02-24T18:06:19.537743Z",
            "item_type": "ITEM",
            "title_info": {
                "title": "Mayonesa",
                "overrides": []
            },
            "description_info": {
                "description": "Mayonesa",
                "overrides": []
            },
            "images_info": {
                "images": [],
                "overrides": []
            },
            "items_info": {
                "items": [],
                "overrides": []
            },
            "price_info": {
                "price": 25,
                "overrides": []
            },
            "quantity_info": {
                "min_permitted": 0,
                "max_permitted": 0,
                "overrides": []
            },
            "suspension_info": {
                "suspend_until": null,
                "suspend_reason": null,
                "overrides": []
            },
            "schedules_info": {
                "schedules": [],
                "overrides": []
            }
        }
    ]
}'
```

```java
String urlString = "https://api.dev.rappi.com/restaurants/menu/v1/stores/232/store-menu";
String jsonInputString = "{ \"storeId\": 232, \"menus\": [{ \"id\": 62, \"storeId\": 232, \"super_store_id\": 232, \"menu_type\": \"DEFAULT\", \"categories\": [] }], \"categories\": [], \"items\": [] }";

URL url = new URL(urlString);
HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("POST");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");
connection.setDoOutput(true);

try (OutputStream os = connection.getOutputStream()) {
byte[] input = jsonInputString.getBytes(StandardCharsets.UTF_8);
  os.write(input, 0, input.length);
}

int responseCode = connection.getResponseCode();
System.out.println("Response Code: " + responseCode);
```

```javascript
const https = require("https");

const data = JSON.stringify({
  storeId: 232,
  menus: [
    {
      id: 62,
      storeId: 232,
      super_store_id: 232,
      menu_type: "DEFAULT",
      categories: [],
    },
  ],
  categories: [],
  items: [],
});

const options = {
  hostname: "api.dev.rappi.com",
  path: "/restaurants/menu/v1/stores/232/store-menu",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-authorization": "Bearer YOUR_TOKEN",
    "Content-Length": data.length,
  },
};

const req = https.request(options, (res) => {
  let response = "";

  res.on("data", (chunk) => {
    response += chunk;
  });

  res.on("end", () => {
    console.log("Response:", response);
  });
});

req.on("error", (error) => {
  console.error(error);
});

req.write(data);
req.end();
```

```python
import requests

url = "https://api.dev.rappi.com/restaurants/menu/v1/stores/232/store-menu"

payload = {
    "storeId": 232,
    "menus": [{"id": 62, "storeId": 232, "super_store_id": 232, "menu_type": "DEFAULT", "categories": []}],
    "categories": [],
    "items": []
}

headers = {
  "Content-Type": "application/json",
  "x-authorization": "Bearer YOUR_TOKEN"
}

response = requests.post(url, json=payload, headers=headers)

print("Response Code:", response.status_code)
print("Response Body:", response.text)
```

```go
package main

import (
	"bytes"
	"fmt"
	"net/http"
	"io/ioutil"
)

func main() {
	url := "https://api.dev.rappi.com/restaurants/menu/v1/stores/232/store-menu"
	jsonPayload := `{
		"storeId": 232,
		"menus": [{
			"id": 62,
			"storeId": 232,
			"super_store_id": 232,
			"menu_type": "DEFAULT",
			"categories": []
		}],
		"categories": [],
		"items": []
	}`

	req, err := http.NewRequest("POST", url, bytes.NewBuffer([]byte(jsonPayload)))
	if err != nil {
		fmt.Println("Error creating request:", err)
		return
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Add("x-authorization", "Bearer YOUR_TOKEN")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Println("Error sending request:", err)
		return
	}
	defer resp.Body.Close()

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		fmt.Println("Error reading response:", err)
		return
	}

	fmt.Println("Response Code:", resp.StatusCode)
	fmt.Println("Response Body:", string(body))
}
```

## GET Menús por ID de tienda

Use este endpoint para recuperar los menús de una tienda por ID de tienda.

### URL del Endpoint

Usa esta URL para realizar una solicitud con este endpoint:

`https://{NEW_DOMAIN}/restaurants/menu/v1/stores/{storeId}/menu`

`{NEW_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="http://dev-portal.dev.rappi.com/es/api-reference/content/#nuevos-dominios" target="_blank">Mira la lista de Dominios por país.</a>

<aside class="notice">
  <p>NOTA</p>
  <p>Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollador: <code>https://api.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso tienes las siguiente propiedades:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Parámetros

Este endpoint tiene los siguientes parámetros:

| Parámetro | Tipo   | Requerido | Descripción                                                        |
| --------- | ------ | --------- | ------------------------------------------------------------------ |
| `storeId` | uint64 | Sí        | El identificador único de la tienda cuyo menú se está solicitando. |

This parameter is used to specify which store's menu should be retrieved. The storeId should be a valid integer representing a store registered in the system.

### Códigos de Respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200` Éxito

</aside>

<aside class="error-response">

`400` Solicitud incorrecta

</aside>

<aside class="error-response">

`401` Credenciales inválidas

</aside>

<aside class="error-response">

`404` No encontrado

</aside>

<aside class="error-response">

`500` Error inesperado.

</aside>

### Ejemplo de Solicitud

Este es un ejemplo de una llamada API usando este endpoint:

`GET https://api.dev.rappi.com/restaurants/menu/v1/stores/{storeId}/menu`

> Este es un ejemplo de la llamada:

```curl
curl --location 'https://api.dev.rappi.com/restaurants/menu/v1/stores/232/menu' \
--header 'x-authorization: Bearer eyJhbGciOiJIUzI1NiIsI'
```

```java

String storeId = "232";
String urlString = "https://api.dev.rappi.com/restaurants/menu/v1/stores/" + storeId + "/menu";
URL url = new URL(urlString);
HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("GET");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");

int responseCode = connection.getResponseCode();
System.out.println("Response Code: " + responseCode);
try (BufferedReader br = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
  StringBuilder response = new StringBuilder();
  String responseLine;
  while ((responseLine = br.readLine()) != null) {
    response.append(responseLine.trim());
  }
  System.out.println("Response body: " + response.toString());
}
```

```javascript
const https = require("https");

const storeId = "232";
const options = {
  method: "GET",
  hostname: "api.dev.rappi.com",
  path: `/restaurants/menu/v1/stores/${storeId}/menu`,
  headers: {
    "Content-Type": "application/json",
    "x-authorization": "Bearer YOUR_TOKEN",
  },
};

const req = https.request(options, function (res) {
  let chunks = [];

  res.on("data", function (chunk) {
    chunks.push(chunk);
  });

  res.on("end", function () {
    const body = Buffer.concat(chunks);
    console.log("Response body:", body.toString());
  });

  res.on("error", function (error) {
    console.error(error);
  });
});

req.end();
```

```python
import requests

storeId = "232"
url = "https://api.dev.rappi.com/restaurants/menu/v1/stores/{storeId}/menu"

headers = {
    "Content-Type": "application/json",
    "x-authorization": "Bearer YOUR_TOKEN"
}

response = requests.get(url, headers=headers)

print("Response Code:", response.status_code)
print("Response Body:", response.text)
```

```go
package main

import (
	"fmt"
	"io"
	"net/http"
)

func main() {
	storeID := "232"
	url := "https://api.dev.rappi.com/restaurants/menu/v1/stores/" + storeID + "/menu"

	client := &http.Client{}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		fmt.Println(err)
		return
	}
	req.Header.Add("Content-Type", "application/json")
	req.Header.Add("x-authorization", "Bearer YOUR_TOKEN")

	res, err := client.Do(req)
	if err != nil {
		fmt.Println(err)
		return
	}
	defer res.Body.Close()

	body, err := io.ReadAll(res.Body)
	if err != nil {
		fmt.Println(err)
		return
	}

	fmt.Println("Response Code:", res.StatusCode)
	fmt.Println("Response Body:", string(body))
}
```

### Ejemplo de Respuesta

> Este es un ejemplo de la respuesta:

```json
[
  {
    "id": 9,
    "storeId": 232,
    "super_store_id": 232,
    "menu_type": "DEFAULT",
    "categories": [
      {
        "id": 625,
        "sku": "abc",
        "index": 0,
        "is_category_active": true
      },
      {
        "id": 637,
        "sku": "def",
        "index": 0,
        "is_category_active": true
      }
    ]
  }
]
```

## POST Insertar menú por ID de tienda

Usa este endpoint para crear o actualizar el menú de la tienda.

### URL del Endpoint

Usa esta URL para realizar una solicitud con este endpoint.

`https://{NEW_DOMAIN}/restaurants/menu/v1/stores/{storeId}/menu`

`{NEW_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="http://dev-portal.dev.rappi.com/es/api-reference/content/#nuevos-dominios" target="_blank">Mira la lista de Dominios por país.</a>

<aside class="notice">
  <p>NOTA</p>
  <p>Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollador: <code>https://api.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso tienes las siguiente propiedades:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Parámetros

Este endpoint tiene los siguientes parámetros:

| Parámetro | Tipo   | Requerido | Descripción                                                        |
| --------- | ------ | --------- | ------------------------------------------------------------------ |
| `storeId` | uint64 | Sí        | El identificador único de la tienda cuyo menú se está solicitando. |

This parameter is used to specify which store's menu should be retrieved. The storeId should be a valid integer representing a store registered in the system.

### Notas Importantes

<aside class="notice">
  <p>FORMATO DE LA SOLICITUD</p>
  <p>Este endpoint espera recibir un array de menus en el cuerpo de la solicitud. Cada elemento del array debe seguir la estructura de campos definida a continuación.</p>
  <p>Ejemplo de estructura:</p>
  <pre><code>[
    {
      "id": 99,
      ...
    },
    {
      "id": 100,
      ...
    }
 ]</code></pre>
</aside>

### Descripción de los Campos de Solicitud

| Campo                             | Tipo      | Descripción                                                                  |
| --------------------------------- | --------- | ---------------------------------------------------------------------------- |
| `id`                              | _int_     | Identificador único del menú de la tienda.                                   |
| `menu_type`                       | _string_  | Tipo de menú (por ejemplo, "DEFAULT"), que indica la clasificación del menú. |
| `categories`                      | _array_   | Lista de categorías incluidas en el menú de la tienda.                       |
| `categories[].id`                 | _int_     | Identificador único de la categoría.                                         |
| `categories[].sku`                | _string_  | Stock Keeping Unit (SKU) asociado con la categoría.                          |
| `categories[].index`              | _int_     | Posición de la categoría dentro del menú.                                    |
| `categories[].is_category_active` | _boolean_ | Indica si la categoría está activa (`true`) o inactiva (`false`).            |

### Códigos de Respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200` Éxito

</aside>

<aside class="error-response">

`400` Solicitud incorrecta

</aside>

<aside class="error-response">

`401` Credenciales inválidas

</aside>

<aside class="error-response">

`500` Error inesperado.

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`POST https://api.dev.rappi.com/restaurants/menu/v1/stores/900159641/menu`

> Este es un ejemplo de la llamada:

```curl
curl --location 'https://api.dev.rappi.com/restaurants/menu/v1/stores/232/menu' \
--header 'x-authorization: Bearer eyJhbGciOiJIUzI1NiIsI'
--header 'Content-Type: application/json' \
--data '[
    {
        "id": 90,
        "menu_type": "DEFAULT",
        "categories": [
            {
                "sku": "675c5492fcb6b014d592fbad",
                "index": 1,
                "is_category_active": false
            }
        ]
    }
]'
```

```java
import okhttp3.*;

public class Main {
    public static void main(String[] args) throws Exception {
        OkHttpClient client = new OkHttpClient();

        String json = "[{\"id\": 9, \"menu_type\": \"DEFAULT\", \"categories\": [{\"id\": 625, \"sku\": \"abc\", \"index\": 0, \"is_category_active\": false }]}]";

        RequestBody body = RequestBody.create(json, MediaType.get("application/json"));
        Request request = new Request.Builder()
                .url("https://api.dev.rappi.com/restaurants/menu/v1/stores/232/menu")
                .addHeader("Content-Type", "application/json")
                .addHeader("x-authorization", "Bearer YOUR_TOKEN")
                .addHeader"x-authorization", "Bearer YOUR_TOKEN")
                .post(body)
                .build();

        try (Response response = client.newCall(request).execute()) {
            System.out.println(response.body().string());
        }
    }
}
```

```javascript
import axios from "axios";

const url = "https://api.dev.rappi.com/restaurants/menu/v1/stores/232/menu";

const data = [
  {
    id: 90,
    menu_type: "DEFAULT",
    categories: [
      {
        sku: "675c5492fcb6b014d592fbad",
        index: 1,
        is_category_active: false,
      },
    ],
  },
];

axios
  .post(url, data, {
    headers: {
      "Content-Type": "application/json",
      "x-authorization": "Bearer YOUR_TOKEN",
    },
  })
  .then((response) => {
    console.log(response.data);
  })
  .catch((error) => {
    console.error(error);
  });
```

```python
import requests

url = "https://api.dev.rappi.com/restaurants/menu/v1/stores/232/menu"

headers = {
    "Content-Type": "application/json",
    "x-authorization": "Bearer YOUR_TOKEN"
}

data = [
  {
    "id": 90,
    "menu_type": "DEFAULT",
    "categories": [
      {
        "sku": "675c5492fcb6b014d592fbad",
        "index": 31,
        "is_category_active": false
      }
    ]
  }
]

response = requests.post(url, json=data, headers=headers)

print(response.text)
```

```go
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"io/ioutil"
)

func main() {
	url := "https://api.dev.rappi.com/restaurants/menu/v1/stores/232/menu"

	data := []map[string]interface{}{
		{
			"id":            9,
			"menu_type":     "DEFAULT",
			"categories": []map[string]interface{}{
				{
					"id":                625,
					"sku":               "abc",
					"index":             0,
					"is_category_active": false,
				},
			},
		},
	}

	jsonData, err := json.Marshal(data)
	if err != nil {
		fmt.Println("Error encoding JSON:", err)
		return
	}

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		fmt.Println("Error creating request:", err)
		return
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Add("x-authorization", "Bearer YOUR_TOKEN")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Println("Error sending request:", err)
		return
	}
	defer resp.Body.Close()

	body, _ := ioutil.ReadAll(resp.Body)
	fmt.Println(string(body))
}
```

### Respuesta de Ejemplo "Éxito 200"

> Este es un ejemplo de la respuesta "Éxito 200":

```json
{
  "message": "Your request has been accepted."
}
```

## DELETE Menú por ID de tienda

Usar este endpoint permite la eliminación de una lista específica de menús de una tienda dentro.

### URL del Endpoint

Usa esta URL para realizar una solicitud con este endpoint:

`https://{NEW_DOMAIN}/restaurants/menu/v1/stores/{storeId}/menu`

`{NEW_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="http://dev-portal.dev.rappi.com/es/api-reference/content/#nuevos-dominios" target="_blank">Mira la lista de Dominios por país.</a>

<aside class="notice">
  <p>NOTA</p>
  <p>Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollador: <code>https://api.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso tienes las siguiente propiedades:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Parámetros

Este endpoint tiene los siguientes parámetros:

| Parámetro | Tipo | Requerido | Descripción                                                       |
| --------- | ---- | --------- | ----------------------------------------------------------------- |
| `storeId` | int  | Yes       | El identificador único de la tienda cuyo menú se está solicitando |

### Códigos de Respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200` Éxito

</aside>

<aside class="error-response">

`400` Solicitud incorrecta

</aside>

<aside class="error-response">

`401` Credenciales inválidas

</aside>

<aside class="error-response">

`404` No encontrado

</aside>

<aside class="error-response">

`500` Error inesperado.

</aside>

### Códigos de Respuesta

La solicitud debe enviarse en formato JSON con un array de IDs de menús a eliminar. Este es un ejemplo de una solicitud a la API utilizando este endpoint:

`DELETE https://api.dev.rappi.com/restaurants/menu/v1/stores/900152558/menu`

> Este es un ejemplo de la llamada:

```curl
curl --location --request DELETE 'https://api.dev.rappi.com/restaurants/menu/v1/stores/232/menu' \
--header 'x-authorization: Bearer eyJhbGciOiJIUzI1NiIsI'
--header 'Content-Type: application/json' \
--data '[1,2]'
```

```java
import okhttp3.*;

public class Main {
    public static void main(String[] args) throws Exception {
        OkHttpClient client = new OkHttpClient();

        String json = "[1,2]";

        RequestBody body = RequestBody.create(json, MediaType.get("application/json"));
        Request request = new Request.Builder()
                .url("https://api.dev.rappi.com/restaurants/menu/v1/stores/232/menu")
                .delete(body)
                .addHeader("Content-Type", "application/json")
                .addHeader("x-authorization", "Bearer YOUR_TOKEN")
                .addHeader("x-authorization", "Bearer YOUR_TOKEN")
                .build();

        try (Response response = client.newCall(request).execute()) {
            System.out.println(response.body().string());
        }
    }
}

```

```javascript
import axios from "axios";

const url = "https://api.dev.rappi.com/restaurants/menu/v1/stores/232/menu";

const data = [1, 2];

axios
  .delete(url, {
    data: data,
    headers: {
      "Content-Type": "application/json",
      "x-authorization": "Bearer YOUR_TOKEN",
    },
  })
  .then((response) => {
    console.log(response.data);
  })
  .catch((error) => {
    console.error(error);
  });
```

```python
import requests

url = "https://api.dev.rappi.com/restaurants/menu/v1/stores/232/menu"

headers = {
    "Content-Type": "application/json"
    "x-authorization": "Bearer YOUR_TOKEN"
}

data = [1, 2]

response = requests.delete(url, json=data, headers=headers)

print(response.text)
```

```go
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"io/ioutil"
)

func main() {
	url := "https://api.dev.rappi.com/restaurants/menu/v1/stores/232/menu"

	data := []int{1, 2}
	jsonData, err := json.Marshal(data)
	if err != nil {
		fmt.Println("Error encoding JSON:", err)
		return
	}

	req, err := http.NewRequest("DELETE", url, bytes.NewBuffer(jsonData))
	if err != nil {
		fmt.Println("Error creating request:", err)
		return
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Add("x-authorization", "Bearer YOUR_TOKEN")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Println("Error sending request:", err)
		return
	}
	defer resp.Body.Close()

	body, _ := ioutil.ReadAll(resp.Body)
	fmt.Println(string(body))
}
```

### Respuesta de Ejemplo "Éxito 200"

> Este es un ejemplo de la respuesta "Éxito 200":

```json
{
  "message": "Your request has been accepted."
}
```

## GET Menú por ID de tienda

Usa este endpoint para obtener los detalles de un menú específico de una tienda dentro.

### URL del Endpoint

Usa esta URL para realizar una solicitud con este endpoint:

`https://{NEW_DOMAIN}/restaurants/menu/v1/stores/{storeId}/menu/{menuId}`

`{NEW_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="http://dev-portal.dev.rappi.com/es/api-reference/content/#nuevos-dominios" target="_blank">Mira la lista de Dominios por país.</a>

<aside class="notice">
  <p>NOTA</p>
  <p>Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollador: <code>https://api.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso tienes las siguiente propiedades:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Parámetros

Este endpoint tiene los siguientes parámetros:

| Parámetro | Tipo   | Requerido | Descripción                                                        |
| --------- | ------ | --------- | ------------------------------------------------------------------ |
| `storeId` | uint64 | Sí        | El identificador único de la tienda cuyo menú se está solicitando. |
| `menuId`  | uint64 | Sí        | El identificador único de un menú.                                 |

Este parámetro se utiliza para especificar qué menú de tienda debe recuperarse. El `storeId` debe ser un número entero válido que represente una tienda registrada en el sistema.

### Códigos de Respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200` Éxito

</aside>

<aside class="error-response">

`400` Solicitud incorrecta

</aside>

<aside class="error-response">

`401` Credenciales inválidas

</aside>

<aside class="error-response">

`404` No encontrado

</aside>

<aside class="error-response">

`500` Error inesperado.

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`GET https://api.dev.rappi.com/restaurants/menu/v1/stores/{storeId}/menu/{menuId}`

> Este es un ejemplo de la llamada:

```curl
curl --location 'https://api.dev.rappi.com/restaurants/menu/v1/stores/232/menu/{menuId}' \
--header 'x-authorization: Bearer eyJhbGciOiJIUzI1NiIsI'
```

```java

String storeId = "232";
String menuId = "9";
String urlString = "https://api.dev.rappi.com/restaurants/menu/v1/stores/" + storeId + "/menu/" + menuId;
URL url = new URL(urlString);
HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("GET");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");

int responseCode = connection.getResponseCode();
System.out.println("Response Code: " + responseCode);
try (BufferedReader br = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
  StringBuilder response = new StringBuilder();
  String responseLine;
  while ((responseLine = br.readLine()) != null) {
    response.append(responseLine.trim());
  }
  System.out.println("Response body: " + response.toString());
}
```

```javascript
const https = require("https");

const storeId = "232";
const menuId = "9";
const options = {
  method: "GET",
  hostname: "api.dev.rappi.com",
  path: `/restaurants/menu/v1/stores/${storeId}/menu/${menuId}`,
  headers: {
    "Content-Type": "application/json",
    "x-authorization": "Bearer YOUR_TOKEN",
  },
};

const req = https.request(options, function (res) {
  let chunks = [];

  res.on("data", function (chunk) {
    chunks.push(chunk);
  });

  res.on("end", function () {
    const body = Buffer.concat(chunks);
    console.log("Response body:", body.toString());
  });

  res.on("error", function (error) {
    console.error(error);
  });
});

req.end();
```

```python
import requests

storeId = "232"
menuId = "9"
url = "https://api.dev.rappi.com/restaurants/menu/v1/stores/{storeId}/menu/{menuId}"

headers = {
    "Content-Type": "application/json",
    "x-authorization": "Bearer YOUR_TOKEN"
}

response = requests.get(url, headers=headers)

print("Response Code:", response.status_code)
print("Response Body:", response.text)
```

```go
package main

import (
	"fmt"
	"io"
	"net/http"
)

func main() {
	storeID := "232"
	menuID := "9"
	url := "https://api.dev.rappi.com/restaurants/menu/v1/stores/" + storeID + "/menu/" + menuID

	client := &http.Client{}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		fmt.Println(err)
		return
	}
	req.Header.Add("Content-Type", "application/json")
	req.Header.Add("x-authorization", "Bearer YOUR_TOKEN")

	res, err := client.Do(req)
	if err != nil {
		fmt.Println(err)
		return
	}
	defer res.Body.Close()

	body, err := io.ReadAll(res.Body)
	if err != nil {
		fmt.Println(err)
		return
	}

	fmt.Println("Response Code:", res.StatusCode)
	fmt.Println("Response Body:", string(body))
}
```

### Ejemplo de Respuesta

> Este es un ejemplo de la respuesta:

```json
{
  "id": 9,
  "storeId": 232,
  "super_store_id": 232,
  "menu_type": "DEFAULT",
  "categories": [
    {
      "id": 625,
      "sku": "abc",
      "index": 0,
      "is_category_active": true
    }
  ]
}
```

Esta tabla describe los objetos contenidos en el ejemplo de respuesta:

| Campo                             | Tipo      | Descripción                                                                  |
| --------------------------------- | --------- | ---------------------------------------------------------------------------- |
| `id`                              | _int_     | Identificador único del menú de la tienda.                                   |
| `menu_type`                       | _string_  | Tipo de menú (por ejemplo, "DEFAULT"), que indica la clasificación del menú. |
| `storeId`                         | _int_     | Identificador único de la tienda dentro de la aplicación de Rappi.           |
| `super_store_id`                  | _int_     | Identificador único de la super tienda dentro de la aplicación de Rappi.     |
| `categories`                      | _array_   | Lista de categorías incluidas en el menú de la tienda.                       |
| `categories[].id`                 | _int_     | Identificador único de la categoría.                                         |
| `categories[].sku`                | _string_  | Stock Keeping Unit (SKU) asociado con la categoría.                          |
| `categories[].index`              | _int_     | Posición de la categoría dentro del menú.                                    |
| `categories[].is_category_active` | _boolean_ | Indica si la categoría está activa (`true`) o inactiva (`false`).            |

## GET Categorías por ID de Tienda

Este endpoint recupera la lista de categorías disponibles en una tienda específica.

### URL del Endpoint

Utiliza esta URL para hacer una solicitud con este endpoint:

`https://{NEW_DOMAIN}/restaurants/menu/v1/stores/{storeId}/categories`

`{NEW_DOMAIN}`: Este es el dominio de tu país en Rappi. <a href="http://dev-portal.dev.rappi.com/es/api-reference/content/#nuevos-dominios" target="_blank">Consulta la lista de dominios por país.</a>

<aside class="notice">
  <p>NOTA</p>
  <p>Para los ejemplos de solicitudes de API en este sitio, usamos el dominio de desarrollo: <code>https://api.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso tiene las siguientes propiedades:

|                             |        |
| --------------------------- | ------ |
| Formatos de respuesta       | `JSON` |
| Requisitos de autenticación | Token  |

### Parámetros

Este endpoint tiene los siguientes parámetros

| Parámetro | Tipo | Requerido | Descripción                                                     |
| --------- | ---- | --------- | --------------------------------------------------------------- |
| `storeId` | int  | Sí        | Identificador único de la tienda cuyo menú se está solicitando. |

Este parámetro se usa para especificar de qué tienda se debe recuperar el menú. El `storeId` debe ser un número entero válido que represente una tienda registrada en el sistema.

### Códigos de Estado

Estos son los posibles códigos de estado de la respuesta para este endpoint:

<aside class="ok-response">

`200` Éxito

</aside>

<aside class="error-response">

`400` Solicitud incorrecta

</aside>

<aside class="error-response">

`401` Credenciales inválidas

</aside>

<aside class="error-response">

`404` No encontrado

</aside>

<aside class="error-response">

`500` Error inesperado

</aside>

### Ejemplo de Solicitud

Este es un ejemplo de una solicitud de API utilizando este endpoint:

`GET https://api.dev.rappi.com/restaurants/menu/v1/stores/{storeId}/categories`

> Este es un ejemplo de la solicitud:

```curl
curl --location 'https://api.dev.rappi.com/restaurants/menu/v1/stores/232/categories' \
--header 'x-authorization: Bearer eyJhbGciOiJIUzI1NiIsI'
```

```java

String storeId = "232";
String urlString = "hhttps://api.dev.rappi.com/restaurants/menu/v1/stores/" + storeId + "/categories";
URL url = new URL(urlString);
HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("GET");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");

int responseCode = connection.getResponseCode();
System.out.println("Response Code: " + responseCode);
try (BufferedReader br = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
  StringBuilder response = new StringBuilder();
  String responseLine;
  while ((responseLine = br.readLine()) != null) {
    response.append(responseLine.trim());
  }
  System.out.println("Response body: " + response.toString());
}
```

```javascript
const https = require("https");

const storeId = "232";
const options = {
  method: "GET",
  hostname: "api.dev.rappi.com",
  path: `/restaurants/menu/v1/stores/${storeId}/categories`,
  headers: {
    "Content-Type": "application/json",
    "x-authorization": "Bearer YOUR_TOKEN",
  },
};

const req = https.request(options, function (res) {
  let chunks = [];

  res.on("data", function (chunk) {
    chunks.push(chunk);
  });

  res.on("end", function () {
    const body = Buffer.concat(chunks);
    console.log("Response body:", body.toString());
  });

  res.on("error", function (error) {
    console.error(error);
  });
});

req.end();
```

```python
import requests

storeId = "232"
url = "https://api.dev.rappi.com/restaurants/menu/v1/stores/{storeId}/categories"

headers = {
    "Content-Type": "application/json",
    "x-authorization": "Bearer YOUR_TOKEN"
}

response = requests.get(url, headers=headers)

print("Response Code:", response.status_code)
print("Response Body:", response.text)
```

```go
package main

import (
	"fmt"
	"io"
	"net/http"
)

func main() {
	storeID := "232"
	url := "https://api.dev.rappi.com/restaurants/menu/v1/stores/" + storeID + "/categories"

	client := &http.Client{}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		fmt.Println(err)
		return
	}
	req.Header.Add("Content-Type", "application/json")
	req.Header.Add("x-authorization", "Bearer YOUR_TOKEN")

	res, err := client.Do(req)
	if err != nil {
		fmt.Println(err)
		return
	}
	defer res.Body.Close()

	body, err := io.ReadAll(res.Body)
	if err != nil {
		fmt.Println(err)
		return
	}

	fmt.Println("Response Code:", res.StatusCode)
	fmt.Println("Response Body:", string(body))
}
```

### Respuesta de Ejemplo "Éxito 200"

> Este es un ejemplo de la respuesta "Éxito 200":

```json
{
    "id": 9,
    "sku": "abc",
    "storeId": 232,
    "title": "Bebidas",
    "last_updated": "2025-02-19T17:19:50.78726Z",
    "items": [],
    "menus": [],
    "schedules": [
      {
        "days_of_week": "fri",
        "time_periods": [
          {
            "start_time": "12:00",
            "end_time": "10:00"
          }
        ]
      }
```

## POST Crear o Actualizar Categorías por ID de Tienda

Este endpoint permite crear o actualizar categorías en una tienda específica.

### URL del Endpoint

Utiliza esta URL para hacer una solicitud con este endpoint:

`https://{NEW_DOMAIN}/restaurants/menu/v1/stores/{storeId}/categories`

`{NEW_DOMAIN}`: Este es el dominio de tu país en Rappi. <a href="http://dev-portal.dev.rappi.com/es/api-reference/content/#nuevos-dominios" target="_blank">Consulta la lista de dominios por país.</a>

<aside class="notice">
  <p>NOTA</p>
  <p>Para ejemplos de solicitudes de API en este sitio, usamos el dominio de desarrollo: <code>https://api.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso tiene las siguientes propiedades:

|                             |        |
| --------------------------- | ------ |
| Formatos de respuesta       | `JSON` |
| Requisitos de autenticación | Token  |

### Parámetros

Este endpoint tiene los siguientes parámetros:

| Parámetro | Tipo | Obligatorio | Descripción                                                        |
| --------- | ---- | ----------- | ------------------------------------------------------------------ |
| `storeId` | int  | Sí          | El identificador único de la tienda cuyo menú se está modificando. |

### Notas Importantes

<aside class="notice">
  <p>FORMATO DE LA SOLICITUD</p>
  <p>Este endpoint espera recibir un array de categorías en el cuerpo de la solicitud. Cada elemento del array debe seguir la estructura de campos definida a continuación.</p>
  <p>Ejemplo de estructura:</p>
  <pre><code>[
    {
      "id": 99,
      "sku": "abc",
      ...
    },
    {
      "id": 100,
      "sku": "def",
      ...
    }
  ]</code></pre>
</aside>

<aside class="notice">
  <p>IDENTIFICADORES</p>
  <p>Los campos `id` y `sku` son identificadores de una entidad con la siguiente lógica de precedencia:</p>
  <ul>
    <li>Si se envía solo el `id`, se buscará por ID</li>
    <li>Si se envía solo el `sku`, se buscará por SKU</li>
    <li>Si se envían ambos, se dará prioridad al `id` y se ignorará el `sku`</li>
  </ul>
</aside>

### Descripción de los Campos de Solicitud

| Campo                                   | Tipo      | Obligatorio | Descripción                                                             |
| --------------------------------------- | --------- | ----------- | ----------------------------------------------------------------------- |
| `id`                                    | _int_     | Sí          | Identificador de la categoría en el menú de la tienda.                  |
| `sku`                                   | _string_  | No          | Identificador SKU (Stock Keeping Unit) de la categoría.                 |
| `storeId`                               | _int_     | Sí          | Identificador de la tienda en la aplicación de Rappi.                   |
| `title`                                 | _string_  | Sí          | Nombre o título de la categoría.                                        |
| `items`                                 | _array_   | No          | Lista de elementos dentro de esta categoría                             |
| `items[].id`                            | _int_     | Si          | ID del elemento en la categoría                                         |
| `items[].sku`                           | _string_  | No          | SKU del elemento en la categoría                                        |
| `items[].index`                         | _int_     | Si          | Posición del elemento en la categoría                                   |
| `items[].menu_type`                     | _string_  | Sí          | Tipo de menú al que pertenece el elemento                               |
| `menus`                                 | _array_   | No          | Lista de menús asociados                                                |
| `menus[].id`                            | _int_     | Si          | Id del menu                                                             |
| `menus[].menu_type`                     | _string_  | Sí          | Tipo de menú (ej. "DEFAULT")                                            |
| `menus[].index`                         | _int_     | Si          | Posición del menú                                                       |
| `menus[].is_category_active`            | _boolean_ | Sí          | Indica si la categoría está activa en este menú                         |
| `schedules`                             | _array_   | No          | Lista de horarios que definen la disponibilidad de la categoría.        |
| `schedules[].days_of_week`              | _string_  | Sí          | Días de la semana en que el horario está activo (por ejemplo, `"fri"`). |
| `schedules[].time_periods`              | _array_   | Sí          | Lista de periodos de tiempo dentro del horario.                         |
| `schedules[].time_periods[].start_time` | _string_  | Sí          | Hora de inicio del horario en formato `HH:MM`.                          |
| `schedules[].time_periods[].end_time`   | _string_  | Sí          | Hora de finalización del horario en formato `HH:MM`.                    |

### Códigos de Estado

Estos son los posibles códigos de estado de la respuesta para este endpoint:

<aside class="ok-response">

`200` Éxito

</aside>

<aside class="error-response">

`400` Solicitud incorrecta

</aside>

<aside class="error-response">

`401` Credenciales inválidas

</aside>

<aside class="error-response">

`500` Error inesperado.

</aside>

### Ejemplo de Solicitud

Este es un ejemplo de una solicitud de API utilizando este endpoint:

`POST https://api.dev.rappi.com/restaurants/menu/v1/stores/900159641/categories`

> Este es un ejemplo de la solicitud:

```curl
curl --location 'https://api.dev.rappi.com/restaurants/menu/v1/stores/232/categories' \
--header 'x-authorization: Bearer eyJhbGciOiJIUzI1NiIsI'
--header 'Content-Type: application/json' \
--data '[
    {
        "id": 99,
        "sku": "abc",
        "storeId": 232,
        "title": "Bebidas22",
        "items": [
          {
              "sku": "simple-sku",
              "index": 1,
              "menu_type": "DEFAULT"
          }
        ],
        "menus": [
          {
              "menu_type": "DEFAULT",
              "index": 1,
              "is_category_active": true
          }
        ],
        "schedules": [
            {
                "days_of_week": "fri",
                "time_periods": [
                    {
                        "start_time": "12:00",
                        "end_time": "10:00"
                    }
                ]
            }
        ]
    }
]'
```

```java
import okhttp3.*;

public class Main {
    public static void main(String[] args) throws Exception {
        OkHttpClient client = new OkHttpClient();

        String json = "[{\"id\": 99, \"sku\": \"abc\", \"storeId\": 232, \"title\": \"Bebidas22\", \"last_updated\": \"2025-02-19T17:19:50.78726Z\", \"items\": [], \"menus\": [], \"schedules\": [{\"id\": 182, \"days_of_week\": \"fri\", \"time_periods\": [{\"id\": 378, \"start_time\": \"12:00\", \"end_time\": \"10:00\"}]}]}]";

        RequestBody body = RequestBody.create(json, MediaType.get("application/json"));
        Request request = new Request.Builder()
                .url("https://api.dev.rappi.com/restaurants/menu/v1/stores/232/categories")
                .addHeader("Content-Type", "application/json")
                .addHeader("x-authorization", "Bearer YOUR_TOKEN")
                .post(body)
                .build();

        try (Response response = client.newCall(request).execute()) {
            System.out.println(response.body().string());
        }
    }
}
```

```javascript
import axios from "axios";

const url =
  "https://api.dev.rappi.com/restaurants/menu/v1/stores/232/categories";

const data = [
  {
    id: 99,
    sku: "abcabc",
    storeId: 232,
    title: "Bebidas22",
    last_updated: "2025-02-19T17:19:50.78726Z",
    items: [],
    menus: [],
    schedules: [
      {
        id: 182,
        days_of_week: "fri",
        time_periods: [
          {
            id: 378,
            start_time: "12:00",
            end_time: "10:00",
          },
        ],
      },
    ],
  },
];

axios
  .post(url, data, {
    headers: {
      "Content-Type": "application/json",
      "x-authorization": "Bearer YOUR_TOKEN",
    },
  })
  .then((response) => {
    console.log(response.data);
  })
  .catch((error) => {
    console.error(error);
  });
```

```python
import requests

url = "https://api.dev.rappi.com/restaurants/menu/v1/stores/232/categories"

headers = {
    "Content-Type": "application/json",
    "x-authorization": "Bearer YOUR_TOKEN"
}

data = [
    {
        "id": 99,
        "sku": "abc",
        "storeId": 232,
        "title": "Bebidas22",
        "last_updated": "2025-02-19T17:19:50.78726Z",
        "items": [],
        "menus": [],
        "schedules": [
            {
                "days_of_week": "fri",
                "time_periods": [
                    {
                        "start_time": "12:00",
                        "end_time": "10:00"
                    }
                ]
            }
        ]
    }
]

response = requests.post(url, json=data, headers=headers)

print(response.text)
```

```go
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"io/ioutil"
)

func main() {
	url := "https://api.dev.rappi.com/restaurants/menu/v1/stores/232/categories"

	data := []map[string]interface{}{
		{
			"id":           99,
			"sku":          "abc",
			"storeId":     232,
			"title":        "Bebidas22",
			"last_updated": "2025-02-19T17:19:50.78726Z",
			"items":        []interface{}{},
			"menus":        []interface{}{},
			"schedules": []map[string]interface{}{
				{
					"id":           182,
					"days_of_week": "fri",
					"time_periods": []map[string]interface{}{
						{
							"id":         378,
							"start_time": "12:00",
							"end_time":   "10:00",
						},
					},
				},
			},
		},
	}

	jsonData, err := json.Marshal(data)
	if err != nil {
		fmt.Println("Error encoding JSON:", err)
		return
	}

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		fmt.Println("Error creating request:", err)
		return
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Add("x-authorization", "Bearer YOUR_TOKEN")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Println("Error sending request:", err)
		return
	}
	defer resp.Body.Close()

	body, _ := ioutil.ReadAll(resp.Body)
	fmt.Println(string(body))
}
```

### Respuesta de Ejemplo "Éxito 200"

> Este es un ejemplo de la respuesta "Éxito 200":

```json
{
  "message": "Your request has been accepted."
}
```

## DELETE Eliminar Categorías por ID de Tienda

Este endpoint permite eliminar múltiples categorías de una tienda proporcionando sus identificadores.

### URL del Endpoint

Utiliza esta URL para hacer una solicitud con este endpoint:

`https://{NEW_DOMAIN}/restaurants/menu/v1/stores/{storeId}/categories`

`{NEW_DOMAIN}`: Este es el dominio de tu país en Rappi. <a href="http://dev-portal.dev.rappi.com/es/api-reference/content/#nuevos-dominios" target="_blank">Consulta la lista de dominios por país.</a>

<aside class="notice">
  <p>NOTA</p>
  <p>Para ejemplos de solicitudes de API en este sitio, usamos el dominio de desarrollo: <code>https://api.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso tiene las siguientes propiedades:

|                             |        |
| --------------------------- | ------ |
| Formatos de respuesta       | `JSON` |
| Requisitos de autenticación | Token  |

### Parámetros

Este endpoint tiene los siguientes parámetros:

| Parámetro | Tipo | Obligatorio | Descripción                                                           |
| --------- | ---- | ----------- | --------------------------------------------------------------------- |
| `storeId` | int  | Sí          | El identificador único de la tienda cuyo menú está siendo modificado. |

### Códigos de Estado

Estos son los posibles códigos de estado de la respuesta para este endpoint:

<aside class="ok-response">

`200` Éxito

</aside>

<aside class="error-response">

`400` Solicitud incorrecta

</aside>

<aside class="error-response">

`401` Credenciales inválidas

</aside>

<aside class="error-response">

`404` No encontrado

</aside>

<aside class="error-response">

`500` Error inesperado.

</aside>

### Ejemplo de Solicitud

La solicitud debe enviarse en formato JSON con un array de IDs de categorías a eliminar. Este es un ejemplo de una solicitud de API utilizando este endpoint:

`DELETE https://api.dev.rappi.com/restaurants/menu/v1/stores/900152558/categories`

> Este es un ejemplo de la solicitud:

```curl
curl --location --request DELETE 'https://api.dev.rappi.com/restaurants/menu/v1/stores/232/categories' \
--header 'x-authorization: Bearer eyJhbGciOiJIUzI1NiIsI'
--header 'Content-Type: application/json' \
--data '{
  "ids": [1,2,22]
}'
```

```java
import okhttp3.*;

public class Main {
    public static void main(String[] args) throws Exception {
        OkHttpClient client = new OkHttpClient();

        String json = "{\"ids\": [1, 2, 22]}";

        RequestBody body = RequestBody.create(json, MediaType.get("application/json"));
        Request request = new Request.Builder()
                .url("https://api.dev.rappi.com/restaurants/menu/v1/stores/232/categories")
                .delete(body)
                .addHeader("Content-Type", "application/json")
                .addHeader("x-authorization", "Bearer YOUR_TOKEN")
                .build();

        try (Response response = client.newCall(request).execute()) {
            System.out.println(response.body().string());
        }
    }
}

```

```javascript
import axios from "axios";

const url =
  "https://api.dev.rappi.com/restaurants/menu/v1/stores/232/categories";

const data = {
  ids: [1, 2, 22],
};

axios
  .delete(url, {
    data: data,
    headers: {
      "Content-Type": "application/json",
      "x-authorization": "Bearer YOUR_TOKEN",
    },
  })
  .then((response) => {
    console.log(response.data);
  })
  .catch((error) => {
    console.error(error);
  });
```

```python
import requests

url = "https://api.dev.rappi.com/restaurants/menu/v1/stores/232/categories"

headers = {
    "Content-Type": "application/json",
    "x-authorization": "Bearer YOUR_TOKEN"
}

data = {
  "ids": [1,2,22]
}

response = requests.delete(url, json=data, headers=headers)

print(response.text)
```

```go
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"io/ioutil"
)

func main() {
	url := "https://api.dev.rappi.com/restaurants/menu/v1/stores/232/categories"

	data := map[string]interface{}{
		"ids": []int{1, 2, 22},
	}

	jsonData, err := json.Marshal(data)
	if err != nil {
		fmt.Println("Error encoding JSON:", err)
		return
	}

	req, err := http.NewRequest("DELETE", url, bytes.NewBuffer(jsonData))
	if err != nil {
		fmt.Println("Error creating request:", err)
		return
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Add("x-authorization", "Bearer YOUR_TOKEN")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Println("Error sending request:", err)
		return
	}
	defer resp.Body.Close()

	body, _ := ioutil.ReadAll(resp.Body)
	fmt.Println(string(body))
}
```

## GET Categoría por ID de Tienda

Este endpoint se utiliza para recuperar los detalles de una categoría específica de una tienda.

### URL del Endpoint

Utiliza esta URL para hacer una solicitud con este endpoint:

`https://{NEW_DOMAIN}/restaurants/menu/v1/stores/{storeId}/categories/{categoryId}`

`{NEW_DOMAIN}`: Este es el dominio de tu país en Rappi. <a href="http://dev-portal.dev.rappi.com/es/api-reference/content/#nuevos-dominios" target="_blank">Consulta la lista de dominios por país.</a>

<aside class="notice">
  <p>NOTA</p>
  <p>Para ejemplos de solicitudes de API en este sitio, usamos el dominio de desarrollo: <code>https://api.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso tiene las siguientes propiedades:

|                             |        |
| --------------------------- | ------ |
| Formatos de respuesta       | `JSON` |
| Requisitos de autenticación | Token  |

### Parámetros:

Este endpoint tiene los siguientes parámetros

| Parámetro    | Tipo | Obligatorio | Descripción                                                           |
| ------------ | ---- | ----------- | --------------------------------------------------------------------- |
| `storeId`    | int  | Sí          | El identificador único de la tienda cuyo menú está siendo consultado. |
| `categoryId` | int  | Sí          | El identificador único de la categoría solicitada.                    |

Este parámetro se utiliza para especificar el menú de qué tienda debe recuperarse. El `storeId` debe ser un número entero válido que represente una tienda registrada en el sistema.

### Códigos de Estado

Estos son los posibles códigos de estado de la respuesta para este endpoint:

<aside class="ok-response">

`200` Éxito

</aside>

<aside class="error-response">

`400` Solicitud incorrecta

</aside>

<aside class="error-response">

`401` Credenciales inválidas

</aside>

<aside class="error-response">

`404` No encontrado

</aside>

<aside class="error-response">

`500` Error inesperado.

</aside>

### Ejemplo de Solicitud

Este es un ejemplo de una solicitud de API utilizando este endpoint:

`GET https://api.dev.rappi.com/restaurants/menu/v1/stores/{storeId}/categories/{categoryId}`

> Este es un ejemplo de la solicitud:

```curl
curl --location 'https://api.dev.rappi.com/restaurants/menu/v1/stores/232/categories/{categoryId}' \
--header 'x-authorization: Bearer eyJhbGciOiJIUzI1NiIsI'
```

```java

String storeId = "232";
String categoryId = "10"
String urlString = "https://api.dev.rappi.com/restaurants/menu/v1/stores/" + storeId + "/categories/" + categoryId};
URL url = new URL(urlString);
HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("GET");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");

int responseCode = connection.getResponseCode();
System.out.println("Response Code: " + responseCode);
try (BufferedReader br = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
  StringBuilder response = new StringBuilder();
  String responseLine;
  while ((responseLine = br.readLine()) != null) {
    response.append(responseLine.trim());
  }
  System.out.println("Response body: " + response.toString());
}
```

```javascript
const https = require("https");

const storeId = "232";
const categoryId = "10";
const options = {
  method: "GET",
  hostname: "api.dev.rappi.com",
  path: `/restaurants/menu/v1/stores/${storeId}/categories/${categoryId}`,
  headers: {
    "Content-Type": "application/json",
    "x-authorization": "Bearer YOUR_TOKEN",
  },
};

const req = https.request(options, function (res) {
  let chunks = [];

  res.on("data", function (chunk) {
    chunks.push(chunk);
  });

  res.on("end", function () {
    const body = Buffer.concat(chunks);
    console.log("Response body:", body.toString());
  });

  res.on("error", function (error) {
    console.error(error);
  });
});

req.end();
```

```python
import requests

storeId = "232"
categoryId = "10"
url = "https://api.dev.rappi.com/restaurants/menu/v1/stores/{storeId}/categories/{categoryId}"

headers = {
    "Content-Type": "application/json",
    "x-authorization": "Bearer YOUR_TOKEN"
}

response = requests.get(url, headers=headers)

print("Response Code:", response.status_code)
print("Response Body:", response.text)
```

```go
package main

import (
	"fmt"
	"io"
	"net/http"
)

func main() {
	storeID := "232"
	categoryID:= "10"
	url := "https://api.dev.rappi.com/restaurants/menu/v1/stores/" + storeID + "/categories/categoryID"

	client := &http.Client{}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		fmt.Println(err)
		return
	}
	req.Header.Add("Content-Type", "application/json")
	req.Header.Add("x-authorization", "Bearer YOUR_TOKEN")

	res, err := client.Do(req)
	if err != nil {
		fmt.Println(err)
		return
	}
	defer res.Body.Close()

	body, err := io.ReadAll(res.Body)
	if err != nil {
		fmt.Println(err)
		return
	}

	fmt.Println("Response Code:", res.StatusCode)
	fmt.Println("Response Body:", string(body))
}
```

### Respuesta de Ejemplo "Éxito 200"

> Este es un ejemplo de la respuesta "Éxito 200":

```json
{
  "id": 10,
  "sku": "abc",
  "storeId": 232,
  "title": "Platos Fuertes",
  "last_updated": "2025-01-10T15:40:31.464312Z",
  "items": [],
  "menus": [],
  "schedules": [
    {
      "days_of_week": "mon,tue,wed,thu,fri,sat,sun,hol",
      "time_periods": [
        {
          "start_time": "18:08",
          "end_time": "22:39"
        }
      ]
    }
  ]
}
```

Esta tabla describe los objetos contenidos en el ejemplo de respuesta:

| Objeto                                  | Tipo     | Descripción                                                               |
| --------------------------------------- | -------- | ------------------------------------------------------------------------- |
| `id`                                    | _int_    | Identificador único de la categoría                                       |
| `sku`                                   | _string_ | SKU (Stock Keeping Unit) de la categoría                                  |
| `storeId`                               | _int_    | Identificador de la tienda en la aplicación de Rappi                      |
| `title`                                 | _string_ | Nombre de la categoría                                                    |
| `last_updated`                          | _string_ | Marca de tiempo de la última actualización (formato ISO 8601)             |
| `items`                                 | _array_  | Lista de productos dentro de esta categoría (actualmente vacía)           |
| `menus`                                 | _array_  | Lista de menús asociados a esta categoría (actualmente vacía)             |
| `schedules`                             | _array_  | Lista de horarios en los que esta categoría está disponible               |
| `schedules[].days_of_week`              | _string_ | Días de la semana en los que el horario está activo (ej. lun, mar, mié)   |
| `schedules[].time_periods`              | _array_  | Lista de períodos de tiempo que definen la disponibilidad de la categoría |
| `schedules[].time_periods[].start_time` | _string_ | Hora de inicio del período de tiempo (formato HH:mm)                      |
| `schedules[].time_periods[].end_time`   | _string_ | Hora de finalización del período de tiempo (formato HH:mm)                |

## GET Items por ID de tienda

Este endpoint recupera la lista de artículos disponibles en una tienda específica.

### URL del Endpoint

Utiliza esta URL para realizar una solicitud con este endpoint:

`https://{NEW_DOMAIN}/restaurants/menu/v1/stores/{storeId}/items`

`{NEW_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="http://dev-portal.dev.rappi.com/es/api-reference/content/#nuevos-dominios" target="_blank">Mira la lista de Dominios por país.</a>

<aside class="notice">
  <p>NOTA</p>
  <p>Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollador: <code>https://api.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso tienes las siguiente propiedades:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Parámetros

Este endpoint tiene los siguientes parámetros:

| Parámetro | Tipo   | Requerido | Descripción                                                        |
| --------- | ------ | --------- | ------------------------------------------------------------------ |
| `storeId` | uint64 | Sí        | El identificador único de la tienda cuyo menú se está solicitando. |

This parameter is used to specify which store's menu should be retrieved. The storeId should be a valid integer representing a store registered in the system.

### Códigos de Respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200` Éxito

</aside>

<aside class="error-response">

`400` Solicitud incorrecta

</aside>

<aside class="error-response">

`401` Credenciales inválidas

</aside>

<aside class="error-response">

`404` No encontrado

</aside>

<aside class="error-response">

`500` Error inesperado.

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`GET https://api.dev.rappi.com/restaurants/menu/v1/stores/{storeId}/items`

> Este es un ejemplo de la llamada:

```curl
curl --location 'https://api.dev.rappi.com/restaurants/menu/v1/stores/232/items' \
--header 'x-authorization: Bearer eyJhbGciOiJIUzI1NiIsI'
```

```java

String storeId = "232";
String urlString = "https://api.dev.rappi.com/restaurants/menu/v1/stores/" + storeId + "/items";
URL url = new URL(urlString);
HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("GET");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");

int responseCode = connection.getResponseCode();
System.out.println("Response Code: " + responseCode);
try (BufferedReader br = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
  StringBuilder response = new StringBuilder();
  String responseLine;
  while ((responseLine = br.readLine()) != null) {
    response.append(responseLine.trim());
  }
  System.out.println("Response body: " + response.toString());
}
```

```javascript
const https = require("https");

const storeId = "232";
const options = {
  method: "GET",
  hostname: "api.dev.rappi.com",
  path: `/restaurants/menu/v1/stores/${storeId}/items`,
  headers: {
    "Content-Type": "application/json",
    "x-authorization": "Bearer YOUR_TOKEN",
  },
};

const req = https.request(options, function (res) {
  let chunks = [];

  res.on("data", function (chunk) {
    chunks.push(chunk);
  });

  res.on("end", function () {
    const body = Buffer.concat(chunks);
    console.log("Response body:", body.toString());
  });

  res.on("error", function (error) {
    console.error(error);
  });
});

req.end();
```

```python
import requests

storeId = "232"
url = "https://api.dev.rappi.com/restaurants/menu/v1/stores/{storeId}/items"

headers = {
    "Content-Type": "application/json",
    "x-authorization": "Bearer YOUR_TOKEN"
}

response = requests.get(url, headers=headers)

print("Response Code:", response.status_code)
print("Response Body:", response.text)
```

```go
package main

import (
	"fmt"
	"io"
	"net/http"
)

func main() {
	storeID := "232"
	url := "https://api.dev.rappi.com/restaurants/menu/v1/stores/" + storeID + "/items"

	client := &http.Client{}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		fmt.Println(err)
		return
	}
	req.Header.Add("Content-Type", "application/json")
	req.Header.Add("x-authorization", "Bearer YOUR_TOKEN")

	res, err := client.Do(req)
	if err != nil {
		fmt.Println(err)
		return
	}
	defer res.Body.Close()

	body, err := io.ReadAll(res.Body)
	if err != nil {
		fmt.Println(err)
		return
	}

	fmt.Println("Response Code:", res.StatusCode)
	fmt.Println("Response Body:", string(body))
}
```

### Sample Response "Success 200"

> Este es un ejemplo de una respuesta "200 Exitoso":

```json
[
  {
    "id": 100,
    "sku": "pastel_de_fresa",
    "storeId": 232,
    "last_updated": "2025-03-27T22:01:41.647471Z",
    "item_type": "ITEM",
    "title_info": {
      "title": "Pastel de fresa",
      "overrides": [
        {
          "override_id": 641,
          "override_sku": "",
          "override_type": "STORE",
          "title": "Pastel de fresa deluxe"
        },
        {
          "override_id": 714,
          "override_sku": "1248187953",
          "override_type": "ITEM",
          "title": "Acompañamiento: Pastel de fresa"
        }
      ]
    },
    "description_info": {
      "description": "Delicioso pastel de fresa",
      "overrides": [
        {
          "override_id": 641,
          "override_type": "STORE",
          "description": "Delicioso pastel de fresa deluxe",
          "override_sku": ""
        },
        {
          "override_id": 714,
          "override_type": "ITEM",
          "description": "Delicioso acompañamiento: Pastel de fresa",
          "override_sku": "1248187953"
        }
      ]
    },
    "images_info": {
      "images": [
        {
          "id": 34,
          "path": "my/path/to/my/image.jpg",
          "index": 1,
          "host": "https://my.cdn.com"
        }
      ],
      "overrides": [
        {
          "override_id": 641,
          "override_type": "STORE",
          "images": [
            {
              "id": 43,
              "path": "my/path/to/my/image.jpg",
              "index": 1,
              "host": "https://my.cdn.com"
            }
          ],
          "override_sku": ""
        },
        {
          "override_id": 714,
          "override_type": "ITEM",
          "images": [
            {
              "id": 43544,
              "path": "my/path/to/my/image.jpg",
              "index": 1,
              "host": "https://my.cdn.com"
            }
          ],
          "override_sku": "1248187953"
        }
      ]
    },
    "items_info": {
      "items": [
        {
          "id": 11743,
          "sku": "1248187964",
          "index": 1
        }
      ],
      "overrides": [
        {
          "override_id": 714,
          "override_type": "ITEM",
          "items": [
            {
              "id": 11720,
              "sku": "1248187730",
              "index": 1
            }
          ],
          "override_sku": "1248187953"
        },
        {
          "override_id": 641,
          "override_type": "STORE",
          "items": [
            {
              "id": 11716,
              "sku": "1248187776",
              "index": 1
            }
          ],
          "override_sku": ""
        }
      ]
    },
    "price_info": {
      "price": 179,
      "overrides": [
        {
          "override_id": 641,
          "override_type": "STORE",
          "price": 200,
          "override_sku": ""
        },
        {
          "override_id": 714,
          "override_type": "ITEM",
          "price": 0,
          "override_sku": "1248187953"
        }
      ]
    },
    "quantity_info": {
      "min_permitted": 0,
      "max_permitted": 5,
      "modifiers_type": null,
      "overrides": [
        {
          "override_id": 641,
          "override_type": "STORE",
          "min_permitted": 0,
          "max_permitted": 2,
          "modifiers_type": null,
          "override_sku": ""
        },
        {
          "override_id": 714,
          "override_type": "ITEM",
          "min_permitted": 0,
          "max_permitted": 1,
          "modifiers_type": null,
          "override_sku": "1248187953"
        }
      ]
    },
    "suspension_info": {
      "suspend_until": null,
      "suspend_reason": null,
      "overrides": [
        {
          "override_id": 641,
          "override_type": "STORE",
          "suspend_until": "2025-03-30T00:00:00Z",
          "suspend_reason": "Is stocked out",
          "created_at": "2025-03-27T22:01:41.647376Z",
          "override_sku": ""
        },
        {
          "override_id": 714,
          "override_type": "ITEM",
          "suspend_until": "2025-03-30T00:00:00Z",
          "suspend_reason": "Is stocked out",
          "created_at": "2025-03-27T22:01:41.647376Z",
          "override_sku": "1248187953"
        }
      ],
      "is_available": true
    },
    "schedules_info": {
      "schedules": [
        {
          "days_of_week": "mon,tue,wed,thu,fri",
          "time_periods": [
            {
              "start_time": "16:00",
              "end_time": "22:00"
            }
          ]
        }
      ],
      "overrides": [
        {
          "id": 26,
          "override_id": 641,
          "override_sku": "",
          "override_type": "STORE",
          "schedules": [
            {
              "days_of_week": "mon,tue,wed,thu,fri",
              "time_periods": [
                {
                  "start_time": "16:00",
                  "end_time": "23:00"
                }
              ]
            }
          ]
        },
        {
          "id": 27,
          "override_id": 714,
          "override_sku": "1248187953",
          "override_type": "ITEM",
          "schedules": [
            {
              "days_of_week": "mon,tue,wed,thu,fri",
              "time_periods": [
                {
                  "start_time": "16:00",
                  "end_time": "20:00"
                }
              ]
            }
          ]
        }
      ]
    }
  },
  {
    "id": 11,
    "sku": "1abc",
    "storeId": 232,
    "last_updated": "2024-12-18T14:58:24.552489Z",
    "item_type": "MODIFIER_GROUP",
    "title_info": {
      "title": "Eleccion cubiertos",
      "overrides": []
    },
    "description_info": {
      "description": "Eleccion cubiertos",
      "overrides": []
    },
    "images_info": {
      "images": [],
      "overrides": []
    },
    "items_info": {
      "items": [],
      "overrides": []
    },
    "price_info": {
      "price": 0,
      "overrides": []
    },
    "quantity_info": {
      "min_permitted": 0,
      "max_permitted": 1,
      "modifiers_type": "exclusive",
      "overrides": []
    },
    "suspension_info": {
      "suspend_until": null,
      "suspend_reason": null,
      "overrides": [],
      "is_available": true
    },
    "schedules_info": {
      "schedules": [],
      "overrides": []
    }
  }
]
```

## POST Insertar item por ID de tienda

Este endpoint permite crear o actualizar artículos en una tienda específica.

### URL del Endpoint

Usa esta URL para realizar una solicitud con este endpoint:

`https://{NEW_DOMAIN}/restaurants/menu/v1/stores/{storeId}/items`

`{NEW_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="http://dev-portal.dev.rappi.com/es/api-reference/content/#nuevos-dominios" target="_blank">Mira la lista de Dominios por país.</a>

<aside class="notice">
  <p>NOTA</p>
  <p>Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollador: <code>https://api.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso tienes las siguiente propiedades:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Parámetros

Este endpoint tiene los siguientes parámetros:

| Parámetro | Tipo   | Requerido | Descripción                                                        |
| --------- | ------ | --------- | ------------------------------------------------------------------ |
| `storeId` | uint64 | Sí        | El identificador único de la tienda cuyo menú se está solicitando. |

This parameter is used to specify which store's menu should be retrieved. The storeId should be a valid integer representing a store registered in the system.

### Notas Importantes

<aside class="notice">
  <p>FORMATO DE LA SOLICITUD</p>
  <p>Este endpoint espera recibir un array de items en el cuerpo de la solicitud. Cada elemento del array debe seguir la estructura de campos definida a continuación.</p>
  <p>Ejemplo de estructura:</p>
  <pre><code>[
    {
      "id": 99,
      ...
    },
    {
      "id": 100,
      ...
    }
 ]</code></pre>
</aside>

### Descripción de los Campos de Solicitud

| Campo                                                  | Tipo     | Descripción                                                                                                                                                                                                  |
| ------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                                                   | _int_    | Identificador del artículo.                                                                                                                                                                                  |
| `sku`                                                  | _string_ | Identificador de la unidad de mantenimiento de stock (SKU) del artículo. Es obligatorio a menos que se envíe el ID.                                                                                          |
| `storeId`                                              | _int_    | Identificador de la tienda en la aplicación.                                                                                                                                                                 |
| `item_type`                                            | _string_ | Tipo de artículo (`ITEM` o `MODIFIER_GROUP`).                                                                                                                                                                |
| `title_info.title`                                     | _string_ | Título del artículo.                                                                                                                                                                                         |
| `title_info.overrides`                                 | _array_  | Lista de modificaciones del título para condiciones específicas.                                                                                                                                             |
| `title_info.overrides[].override_id`                   | _int_    | Identificador de la modificación del título.                                                                                                                                                                 |
| `title_info.overrides[].override_sku`                  | _string_ | El SKU de la entidad modificada, es obligatorio a menos que se envíe el override_id.                                                                                                                         |
| `title_info.overrides[].override_type`                 | _string_ | Tipo de modificación (`STORE` o `ITEM`).                                                                                                                                                                     |
| `title_info.overrides[].title`                         | _string_ | Título modificado.                                                                                                                                                                                           |
| `description_info.description`                         | _string_ | Descripción del artículo.                                                                                                                                                                                    |
| `description_info.overrides`                           | _array_  | Lista de modificaciones de la descripción para condiciones específicas.                                                                                                                                      |
| `description_info.overrides[].override_id`             | _int_    | Identificador de la modificación de la descripción.                                                                                                                                                          |
| `description_info.overrides[].override_type`           | _string_ | Tipo de modificación (`STORE` o `ITEM`).                                                                                                                                                                     |
| `description_info.overrides[].description`             | _string_ | Descripción modificada.                                                                                                                                                                                      |
| `description_info.overrides[].override_sku`            | _string_ | El SKU de la entidad modificada, es obligatorio a menos que se envíe el override_id.                                                                                                                         |
| `images_info.images`                                   | _array_  | Lista de imágenes asociadas con el artículo.                                                                                                                                                                 |
| `images_info.images[].id`                              | _int_    | Identificador de la imagen.                                                                                                                                                                                  |
| `images_info.images[].path`                            | _string_ | Ruta donde se encuentra la imagen en el CDN.                                                                                                                                                                 |
| `images_info.images[].index`                           | _int_    | Posición en la que debe mostrarse la imagen.                                                                                                                                                                 |
| `images_info.images[].host`                            | _string_ | Servidor CDN de la imagen.                                                                                                                                                                                   |
| `images_info.overrides`                                | _array_  | Lista de modificaciones de imágenes para condiciones específicas.                                                                                                                                            |
| `images_info.overrides[].override_id`                  | _int_    | Identificador de la modificación de la imagen.                                                                                                                                                               |
| `images_info.overrides[].override_type`                | _string_ | Tipo de modificación (`STORE` o `ITEM`).                                                                                                                                                                     |
| `images_info.overrides[].images`                       | _array_  | Lista de imágenes modificadas.                                                                                                                                                                               |
| `images_info.overrides[].override_sku`                 | _string_ | El SKU de la entidad modificada, es obligatorio a menos que se envíe el override_id.                                                                                                                         |
| `items_info.items`                                     | _array_  | Lista de artículos relacionados.                                                                                                                                                                             |
| `items_info.items[].id`                                | _int_    | Identificador del artículo relacionado.                                                                                                                                                                      |
| `items_info.items[].sku`                               | _string_ | SKU del artículo relacionado. Es obligatorio a menos que se envíe el ID.                                                                                                                                     |
| `items_info.items[].index`                             | _int_    | Índice de orden del artículo relacionado.                                                                                                                                                                    |
| `items_info.overrides`                                 | _array_  | Lista de modificaciones de artículos para condiciones específicas.                                                                                                                                           |
| `items_info.overrides[].override_id`                   | _int_    | Identificador de la modificación del artículo.                                                                                                                                                               |
| `items_info.overrides[].override_type`                 | _string_ | Tipo de modificación (`STORE` o `ITEM`).                                                                                                                                                                     |
| `items_info.overrides[].items`                         | _array_  | Lista de artículos modificados.                                                                                                                                                                              |
| `items_info.overrides[].override_sku`                  | _string_ | El SKU de la entidad modificada, es obligatorio a menos que se envíe el override_id.                                                                                                                         |
| `price_info.price`                                     | _float_  | Precio del artículo.                                                                                                                                                                                         |
| `price_info.overrides`                                 | _array_  | Lista de modificaciones de precios para condiciones específicas.                                                                                                                                             |
| `price_info.overrides[].override_id`                   | _int_    | Identificador de la modificación del precio.                                                                                                                                                                 |
| `price_info.overrides[].override_type`                 | _string_ | Tipo de modificación (`STORE` o `ITEM`).                                                                                                                                                                     |
| `price_info.overrides[].price`                         | _float_  | El precio que debe aplicarse cuando se cumple la modificación.                                                                                                                                               |
| `price_info.overrides[].override_sku`                  | _string_ | El SKU de la entidad modificada, es obligatorio a menos que se envíe el override_id.                                                                                                                         |
| `quantity_info.min_permitted`                          | _int_    | Cantidad mínima permitida del artículo o de los elementos dentro del grupo modificador. Obligatorio si el artículo es de tipo `MODIFIER_GROUP`.                                                              |
| `quantity_info.max_permitted`                          | _int_    | Cantidad máxima permitida del artículo o de los elementos dentro del grupo modificador. Obligatorio si el artículo es de tipo `MODIFIER_GROUP`.                                                              |
| `quantity_info.modifiers_type`                         | _string_ | Tipo de modificador (puede ser nulo).                                                                                                                                                                        |
| `quantity_info.overrides`                              | _array_  | Lista de modificaciones de cantidad para condiciones específicas.                                                                                                                                            |
| `quantity_info.overrides[].override_id`                | _int_    | Identificador de la modificación de cantidad.                                                                                                                                                                |
| `quantity_info.overrides[].override_type`              | _string_ | Tipo de modificación (`STORE` o `ITEM`).                                                                                                                                                                     |
| `quantity_info.overrides[].min_permitted`              | _int_    | Cantidad mínima permitida del artículo cuando es de tipo `ITEM`, o la cantidad mínima permitida dentro del grupo cuando es de tipo `MODIFIER_GROUP`. Obligatorio si el artículo es de tipo `MODIFIER_GROUP`. |
| `quantity_info.overrides[].max_permitted`              | _int_    | Cantidad máxima permitida del artículo cuando es de tipo `ITEM`, o la cantidad máxima permitida dentro del grupo cuando es de tipo `MODIFIER_GROUP`. Obligatorio si el artículo es de tipo `MODIFIER_GROUP`. |
| `quantity_info.overrides[].modifiers_type`             | _string_ | Tipo de modificador sobrescrito (puede ser nulo).                                                                                                                                                            |
| `quantity_info.overrides[].override_sku`               | _string_ | El SKU de la entidad modificada, es obligatorio a menos que se envíe el `override_id`.                                                                                                                       |
| `suspension_info.suspend_until`                        | _string_ | Fecha en la que el artículo debe activarse. Si es `null`, entonces está suspendido permanentemente.                                                                                                          |
| `suspension_info.suspend_reason`                       | _string_ | Razón por la cual el artículo está suspendido.                                                                                                                                                               |
| `suspension_info.is_available`                         | _bool_   | Estado de disponibilidad del artículo.                                                                                                                                                                       |
| `suspension_info.overrides`                            | _array_  | Lista de modificaciones de suspensión para condiciones específicas.                                                                                                                                          |
| `schedules_info.schedules`                             | _array_  | Lista de horarios que definen la disponibilidad.                                                                                                                                                             |
| `schedules_info.schedules[].days_of_week`              | _string_ | Días de la semana en los que el horario está activo.                                                                                                                                                         |
| `schedules_info.schedules[].time_periods`              | _array_  | Períodos de tiempo dentro del horario.                                                                                                                                                                       |
| `schedules_info.schedules[].time_periods[].start_time` | _string_ | Hora de inicio en formato `HH:MM`.                                                                                                                                                                           |
| `schedules_info.schedules[].time_periods[].end_time`   | _string_ | Hora de finalización en formato `HH:MM`.                                                                                                                                                                     |
| `schedules_info.overrides`                             | _array_  | Lista de modificaciones de horarios para condiciones específicas.                                                                                                                                            |
| `schedules_info.overrides[].override_id`               | _int_    | Identificador de la modificación del horario.                                                                                                                                                                |
| `schedules_info.overrides[].override_type`             | _string_ | Tipo de modificación (`STORE`, `CATEGORY` o `ITEM`).                                                                                                                                                         |
| `schedules_info.overrides[].schedules`                 | _array_  | Lista de horarios modificados.                                                                                                                                                                               |
| `schedules_info.overrides[].override_sku`              | _string_ | El SKU de la entidad modificada, es obligatorio a menos que se envíe el override_id.                                                                                                                         |

### Códigos de Respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200` Éxito

</aside>

<aside class="error-response">

`400` Solicitud incorrecta

</aside>

<aside class="error-response">

`401` Credenciales inválidas

</aside>

<aside class="error-response">

`500` Error inesperado.

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`POST https://api.dev.rappi.com/restaurants/menu/v1/stores/900159641/items`

> Este es un ejemplo de la llamada:

```curl
curl --location 'https://api.dev.rappi.com/restaurants/menu/v1/stores/232/items' \
--header 'x-authorization: Bearer eyJhbGciOiJIUzI1NiIsI'
--header 'Content-Type: application/json' \
--data '[
    {
    "id": 100,
    "sku": "pastel_de_fresa",
    "storeId": 232,
    "item_type": "ITEM",
    "title_info": {
        "title": "Pastel de fresa",
        "overrides": [
            {
                "override_id": 641,
                "override_sku": "",
                "override_type": "STORE",
                "title": "Pastel de fresa deluxe"
            },
            {
                "override_id": 714,
                "override_sku": "1248187953",
                "override_type": "ITEM",
                "title": "Acompañamiento: Pastel de fresa"
            }
        ]
    },
    "description_info": {
        "description": "Delicioso pastel de fresa",
        "overrides": [
            {
                "override_id": 641,
                "override_type": "STORE",
                "description": "Delicioso pastel de fresa deluxe",
                "override_sku": ""
            },
            {
                "override_id": 714,
                "override_type": "ITEM",
                "description": "Delicioso acompañamiento: Pastel de fresa",
                "override_sku": "1248187953"
            }
        ]
    },
    "images_info": {
        "images": [
            {
                "id": 34,
                "path": "my/path/to/my/image.jpg",
                "index": 1,
                "host": "https://my.cdn.com"
            }
        ],
        "overrides": [
            {
                "override_id": 641,
                "override_type": "STORE",
                "images": [
                    {
                        "id": 43,
                        "path": "my/path/to/my/image.jpg",
                        "index": 1,
                        "host": "https://my.cdn.com"
                    }
                ],
                "override_sku": ""
            },
            {
                "override_id": 714,
                "override_type": "ITEM",
                "images": [
                    {
                        "id": 43544,
                        "path": "my/path/to/my/image.jpg",
                        "index": 1,
                        "host": "https://my.cdn.com"
                    }
                ],
                "override_sku": "1248187953"
            }
        ]
    },
    "items_info": {
        "items": [
            {
                "id": 11743,
                "sku": "1248187964",
                "index": 1
            }
        ],
        "overrides": [
            {
                "override_id": 714,
                "override_type": "ITEM",
                "items": [
                    {
                        "id": 11720,
                        "sku": "1248187730",
                        "index": 1
                    }
                ],
                "override_sku": "1248187953"
            },
            {
                "override_id": 641,
                "override_type": "STORE",
                "items": [
                    {
                        "id": 11716,
                        "sku": "1248187776",
                        "index": 1
                    }
                ],
                "override_sku": ""
            }
        ]
    },
    "price_info": {
        "price": 179,
        "overrides": [
            {
                "override_id": 641,
                "override_type": "STORE",
                "price": 200,
                "override_sku": ""
            },
            {
                "override_id": 714,
                "override_type": "ITEM",
                "price": 0,
                "override_sku": "1248187953"
            }
        ]
    },
    "quantity_info": {
        "min_permitted": 0,
        "max_permitted": 5,
        "overrides": [
            {
                "override_id": 641,
                "override_type": "STORE",
                "min_permitted": 0,
                "max_permitted": 2,
                "override_sku": ""
            },
            {
                "override_id": 714,
                "override_type": "ITEM",
                "min_permitted": 0,
                "max_permitted": 1,
                "override_sku": "1248187953"
            }
        ]
    },
    "suspension_info": {
        "suspend_until": null,
        "suspend_reason": null,
        "overrides": [
            {
                "override_id": 641,
                "override_type": "STORE",
                "suspend_until": "2025-03-30T00:00:00Z",
                "suspend_reason": "Is stocked out",
                "created_at": "2025-03-27T22:01:41.647376Z",
                "override_sku": ""
            },
            {
                "override_id": 714,
                "override_type": "ITEM",
                "suspend_until": "2025-03-30T00:00:00Z",
                "suspend_reason": "Is stocked out",
                "created_at": "2025-03-27T22:01:41.647376Z",
                "override_sku": "1248187953"
            }
        ]
    },
    "schedules_info": {
        "schedules": [
            {
                "days_of_week": "mon,tue,wed,thu,fri",
                "time_periods": [
                    {
                        "start_time": "16:00",
                        "end_time": "22:00"
                    }
                ]
            }
        ],
        "overrides": [
            {
                "id": 26,
                "override_id": 641,
                "override_sku": "",
                "override_type": "STORE",
                "schedules": [
                    {
                        "days_of_week": "mon,tue,wed,thu,fri",
                        "time_periods": [
                            {
                                "start_time": "16:00",
                                "end_time": "23:00"
                            }
                        ]
                    }
                ]
            },
            {
                "id": 27,
                "override_id": 714,
                "override_sku": "1248187953",
                "override_type": "ITEM",
                "schedules": [
                    {
                        "days_of_week": "mon,tue,wed,thu,fri",
                        "time_periods": [
                            {
                                "start_time": "16:00",
                                "end_time": "20:00"
                            }
                        ]
                    }
                ]
            }
        ]
    }
}
]'
```

```java
import okhttp3.*;

public class Main {
    public static void main(String[] args) throws Exception {
        OkHttpClient client = new OkHttpClient();

        String json = """
        {
            "id": 100,
            "sku": "pastel_de_fresa",
            "storeId": 232,
            "item_type": "ITEM",
            "title_info": {
                "title": "Pastel de fresa",
                "overrides": [
                    {"override_id": 641, "override_sku": "", "override_type": "STORE", "title": "Pastel de fresa deluxe"},
                    {"override_id": 714, "override_sku": "1248187953", "override_type": "ITEM", "title": "Acompañamiento: Pastel de fresa"}
                ]
            },
            "description_info": {
                "description": "Delicioso pastel de fresa",
                "overrides": [
                    {"override_id": 641, "override_type": "STORE", "description": "Delicioso pastel de fresa deluxe", "override_sku": ""},
                    {"override_id": 714, "override_type": "ITEM", "description": "Delicioso acompañamiento: Pastel de fresa", "override_sku": "1248187953"}
                ]
            },
            "images_info": {
                "images": [
                    {"id": 34, "path": "my/path/to/my/image.jpg", "index": 1, "host": "https://my.cdn.com"}
                ],
                "overrides": [
                    {"override_id": 641, "override_type": "STORE", "images": [{"id": 43, "path": "my/path/to/my/image.jpg", "index": 1, "host": "https://my.cdn.com"}], "override_sku": ""},
                    {"override_id": 714, "override_type": "ITEM", "images": [{"id": 43544, "path": "my/path/to/my/image.jpg", "index": 1, "host": "https://my.cdn.com"}], "override_sku": "1248187953"}
                ]
            },
            "items_info": {
                "items": [{"id": 11743, "sku": "1248187964", "index": 1}],
                "overrides": [
                    {"override_id": 714, "override_type": "ITEM", "items": [{"id": 11720, "sku": "1248187730", "index": 1}], "override_sku": "1248187953"},
                    {"override_id": 641, "override_type": "STORE", "items": [{"id": 11716, "sku": "1248187776", "index": 1}], "override_sku": ""}
                ]
            },
            "price_info": {
                "price": 179,
                "overrides": [
                    {"override_id": 641, "override_type": "STORE", "price": 200, "override_sku": ""},
                    {"override_id": 714, "override_type": "ITEM", "price": 0, "override_sku": "1248187953"}
                ]
            },
            "quantity_info": {
                "min_permitted": 0,
                "max_permitted": 5,
                "overrides": [
                    {"override_id": 641, "override_type": "STORE", "min_permitted": 0, "max_permitted": 2, "override_sku": ""},
                    {"override_id": 714, "override_type": "ITEM", "min_permitted": 0, "max_permitted": 1, "override_sku": "1248187953"}
                ]
            },
            "suspension_info": {
                "suspend_until": null,
                "suspend_reason": null,
                "overrides": [
                    {"override_id": 641, "override_type": "STORE", "suspend_until": "2025-03-30T00:00:00Z", "suspend_reason": "Is stocked out", "created_at": "2025-03-27T22:01:41.647376Z", "override_sku": ""},
                    {"override_id": 714, "override_type": "ITEM", "suspend_until": "2025-03-30T00:00:00Z", "suspend_reason": "Is stocked out", "created_at": "2025-03-27T22:01:41.647376Z", "override_sku": "1248187953"}
                ]
            },
            "schedules_info": {
                "schedules": [
                    {"days_of_week": "mon,tue,wed,thu,fri", "time_periods": [{"start_time": "16:00", "end_time": "22:00"}]}
                ],
                "overrides": [
                    {"id": 26, "override_id": 641, "override_sku": "", "override_type": "STORE", "schedules": [{"days_of_week": "mon,tue,wed,thu,fri", "time_periods": [{"start_time": "16:00", "end_time": "23:00"}]}]},
                    {"id": 27, "override_id": 714, "override_sku": "1248187953", "override_type": "ITEM", "schedules": [{"days_of_week": "mon,tue,wed,thu,fri", "time_periods": [{"start_time": "16:00", "end_time": "20:00"}]}]}
                ]
            }
        }
        """;

        RequestBody body = RequestBody.create(json, MediaType.get("application/json"));
        Request request = new Request.Builder()
                .url("https://api.dev.rappi.com/restaurants/menu/v1/stores/232/items")
                .addHeader("Content-Type", "application/json")
                .addHeader("x-authorization", "Bearer YOUR_TOKEN")
                .post(body)
                .build();

        try (Response response = client.newCall(request).execute()) {
            System.out.println(response.body().string());
        }
    }
}
```

```javascript
import axios from "axios";

const url = "https://api.dev.rappi.com/restaurants/menu/v1/stores/232/items";

const data = [
  {
    id: 100,
    sku: "pastel_de_fresa",
    storeId: 232,
    item_type: "ITEM",
    title_info: {
      title: "Pastel de fresa",
      overrides: [
        {
          override_id: 641,
          override_sku: "",
          override_type: "STORE",
          title: "Pastel de fresa deluxe",
        },
        {
          override_id: 714,
          override_sku: "1248187953",
          override_type: "ITEM",
          title: "Acompañamiento: Pastel de fresa",
        },
      ],
    },
    description_info: {
      description: "Delicioso pastel de fresa",
      overrides: [
        {
          override_id: 641,
          override_type: "STORE",
          description: "Delicioso pastel de fresa deluxe",
          override_sku: "",
        },
        {
          override_id: 714,
          override_type: "ITEM",
          description: "Delicioso acompañamiento: Pastel de fresa",
          override_sku: "1248187953",
        },
      ],
    },
    images_info: {
      images: [
        {
          id: 34,
          path: "my/path/to/my/image.jpg",
          index: 1,
          host: "https://my.cdn.com",
        },
      ],
      overrides: [
        {
          override_id: 641,
          override_type: "STORE",
          images: [
            {
              id: 43,
              path: "my/path/to/my/image.jpg",
              index: 1,
              host: "https://my.cdn.com",
            },
          ],
          override_sku: "",
        },
        {
          override_id: 714,
          override_type: "ITEM",
          images: [
            {
              id: 43544,
              path: "my/path/to/my/image.jpg",
              index: 1,
              host: "https://my.cdn.com",
            },
          ],
          override_sku: "1248187953",
        },
      ],
    },
    items_info: {
      items: [
        {
          id: 11743,
          sku: "1248187964",
          index: 1,
        },
      ],
      overrides: [
        {
          override_id: 714,
          override_type: "ITEM",
          items: [
            {
              id: 11720,
              sku: "1248187730",
              index: 1,
            },
          ],
          override_sku: "1248187953",
        },
        {
          override_id: 641,
          override_type: "STORE",
          items: [
            {
              id: 11716,
              sku: "1248187776",
              index: 1,
            },
          ],
          override_sku: "",
        },
      ],
    },
    price_info: {
      price: 179,
      overrides: [
        {
          override_id: 641,
          override_type: "STORE",
          price: 200,
          override_sku: "",
        },
        {
          override_id: 714,
          override_type: "ITEM",
          price: 0,
          override_sku: "1248187953",
        },
      ],
    },
    quantity_info: {
      min_permitted: 0,
      max_permitted: 5,
      overrides: [
        {
          override_id: 641,
          override_type: "STORE",
          min_permitted: 0,
          max_permitted: 2,
          override_sku: "",
        },
        {
          override_id: 714,
          override_type: "ITEM",
          min_permitted: 0,
          max_permitted: 1,
          override_sku: "1248187953",
        },
      ],
    },
    suspension_info: {
      suspend_until: null,
      suspend_reason: null,
      overrides: [
        {
          override_id: 641,
          override_type: "STORE",
          suspend_until: "2025-03-30T00:00:00Z",
          suspend_reason: "Is stocked out",
          created_at: "2025-03-27T22:01:41.647376Z",
          override_sku: "",
        },
        {
          override_id: 714,
          override_type: "ITEM",
          suspend_until: "2025-03-30T00:00:00Z",
          suspend_reason: "Is stocked out",
          created_at: "2025-03-27T22:01:41.647376Z",
          override_sku: "1248187953",
        },
      ],
    },
    schedules_info: {
      schedules: [
        {
          days_of_week: "mon,tue,wed,thu,fri",
          time_periods: [
            {
              start_time: "16:00",
              end_time: "22:00",
            },
          ],
        },
      ],
      overrides: [
        {
          id: 26,
          override_id: 641,
          override_sku: "",
          override_type: "STORE",
          schedules: [
            {
              days_of_week: "mon,tue,wed,thu,fri",
              time_periods: [
                {
                  start_time: "16:00",
                  end_time: "23:00",
                },
              ],
            },
          ],
        },
        {
          id: 27,
          override_id: 714,
          override_sku: "1248187953",
          override_type: "ITEM",
          schedules: [
            {
              days_of_week: "mon,tue,wed,thu,fri",
              time_periods: [
                {
                  start_time: "16:00",
                  end_time: "20:00",
                },
              ],
            },
          ],
        },
      ],
    },
  },
];

axios
  .post(url, data, {
    headers: {
      "Content-Type": "application/json",
      "x-authorization": "Bearer YOUR_TOKEN",
    },
  })
  .then((response) => {
    console.log(response.data);
  })
  .catch((error) => {
    console.error(error);
  });
```

```python
import requests

url = "https://api.dev.rappi.com/restaurants/menu/v1/stores/232/items"

headers = {
    "Content-Type": "application/json",
    "x-authorization": "Bearer YOUR_TOKEN"
}

data = [
   {
      "id": 100,
      "sku": "pastel_de_fresa",
      "storeId": 232,
      "item_type": "ITEM",
      "title_info": {
          "title": "Pastel de fresa",
          "overrides": [
              {
                  "override_id": 641,
                  "override_sku": "",
                  "override_type": "STORE",
                  "title": "Pastel de fresa deluxe"
              },
              {
                  "override_id": 714,
                  "override_sku": "1248187953",
                  "override_type": "ITEM",
                  "title": "Acompañamiento: Pastel de fresa"
              }
          ]
      },
      "description_info": {
          "description": "Delicioso pastel de fresa",
          "overrides": [
              {
                  "override_id": 641,
                  "override_type": "STORE",
                  "description": "Delicioso pastel de fresa deluxe",
                  "override_sku": ""
              },
              {
                  "override_id": 714,
                  "override_type": "ITEM",
                  "description": "Delicioso acompañamiento: Pastel de fresa",
                  "override_sku": "1248187953"
              }
          ]
      },
      "images_info": {
          "images": [
              {
                  "id": 34,
                  "path": "my/path/to/my/image.jpg",
                  "index": 1,
                  "host": "https://my.cdn.com"
              }
          ],
          "overrides": [
              {
                  "override_id": 641,
                  "override_type": "STORE",
                  "images": [
                      {
                          "id": 43,
                          "path": "my/path/to/my/image.jpg",
                          "index": 1,
                          "host": "https://my.cdn.com"
                      }
                  ],
                  "override_sku": ""
              },
              {
                  "override_id": 714,
                  "override_type": "ITEM",
                  "images": [
                      {
                          "id": 43544,
                          "path": "my/path/to/my/image.jpg",
                          "index": 1,
                          "host": "https://my.cdn.com"
                      }
                  ],
                  "override_sku": "1248187953"
              }
          ]
      },
      "items_info": {
          "items": [
              {
                  "id": 11743,
                  "sku": "1248187964",
                  "index": 1
              }
          ],
          "overrides": [
              {
                  "override_id": 714,
                  "override_type": "ITEM",
                  "items": [
                      {
                          "id": 11720,
                          "sku": "1248187730",
                          "index": 1
                      }
                  ],
                  "override_sku": "1248187953"
              },
              {
                  "override_id": 641,
                  "override_type": "STORE",
                  "items": [
                      {
                          "id": 11716,
                          "sku": "1248187776",
                          "index": 1
                      }
                  ],
                  "override_sku": ""
              }
          ]
      },
      "price_info": {
          "price": 179,
          "overrides": [
              {
                  "override_id": 641,
                  "override_type": "STORE",
                  "price": 200,
                  "override_sku": ""
              },
              {
                  "override_id": 714,
                  "override_type": "ITEM",
                  "price": 0,
                  "override_sku": "1248187953"
              }
          ]
      },
      "quantity_info": {
          "min_permitted": 0,
          "max_permitted": 5,
          "overrides": [
              {
                  "override_id": 641,
                  "override_type": "STORE",
                  "min_permitted": 0,
                  "max_permitted": 2,
                  "override_sku": ""
              },
              {
                  "override_id": 714,
                  "override_type": "ITEM",
                  "min_permitted": 0,
                  "max_permitted": 1,
                  "override_sku": "1248187953"
              }
          ]
      },
      "suspension_info": {
          "suspend_until": null,
          "suspend_reason": null,
          "overrides": [
              {
                  "override_id": 641,
                  "override_type": "STORE",
                  "suspend_until": "2025-03-30T00:00:00Z",
                  "suspend_reason": "Is stocked out",
                  "created_at": "2025-03-27T22:01:41.647376Z",
                  "override_sku": ""
              },
              {
                  "override_id": 714,
                  "override_type": "ITEM",
                  "suspend_until": "2025-03-30T00:00:00Z",
                  "suspend_reason": "Is stocked out",
                  "created_at": "2025-03-27T22:01:41.647376Z",
                  "override_sku": "1248187953"
              }
          ]
      },
      "schedules_info": {
          "schedules": [
              {
                  "days_of_week": "mon,tue,wed,thu,fri",
                  "time_periods": [
                      {
                          "start_time": "16:00",
                          "end_time": "22:00"
                      }
                  ]
              }
          ],
          "overrides": [
              {
                  "id": 26,
                  "override_id": 641,
                  "override_sku": "",
                  "override_type": "STORE",
                  "schedules": [
                      {
                          "days_of_week": "mon,tue,wed,thu,fri",
                          "time_periods": [
                              {
                                  "start_time": "16:00",
                                  "end_time": "23:00"
                              }
                          ]
                      }
                  ]
              },
              {
                  "id": 27,
                  "override_id": 714,
                  "override_sku": "1248187953",
                  "override_type": "ITEM",
                  "schedules": [
                      {
                          "days_of_week": "mon,tue,wed,thu,fri",
                          "time_periods": [
                              {
                                  "start_time": "16:00",
                                  "end_time": "20:00"
                              }
                          ]
                      }
                  ]
              }
          ]
      }
   }
]

response = requests.post(url, json=data, headers=headers)

print(response.text)

```

```go
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"io/ioutil"
)

func main() {
	url := "https://api.dev.rappi.com/restaurants/menu/v1/stores/232/items"

	data := []map[string]interface{}{
    {
        "id": 100,
        "sku": "pastel_de_fresa",
        "storeId": 232,
        "item_type": "ITEM",
        "title_info": {
            "title": "Pastel de fresa",
            "overrides": [
                {
                    "override_id": 641,
                    "override_sku": "",
                    "override_type": "STORE",
                    "title": "Pastel de fresa deluxe"
                },
                {
                    "override_id": 714,
                    "override_sku": "1248187953",
                    "override_type": "ITEM",
                    "title": "Acompañamiento: Pastel de fresa"
                }
            ]
        },
        "description_info": {
            "description": "Delicioso pastel de fresa",
            "overrides": [
                {
                    "override_id": 641,
                    "override_type": "STORE",
                    "description": "Delicioso pastel de fresa deluxe",
                    "override_sku": ""
                },
                {
                    "override_id": 714,
                    "override_type": "ITEM",
                    "description": "Delicioso acompañamiento: Pastel de fresa",
                    "override_sku": "1248187953"
                }
            ]
        },
        "images_info": {
            "images": [
                {
                    "id": 34,
                    "path": "my/path/to/my/image.jpg",
                    "index": 1,
                    "host": "https://my.cdn.com"
                }
            ],
            "overrides": [
                {
                    "override_id": 641,
                    "override_type": "STORE",
                    "images": [
                        {
                            "id": 43,
                            "path": "my/path/to/my/image.jpg",
                            "index": 1,
                            "host": "https://my.cdn.com"
                        }
                    ],
                    "override_sku": ""
                },
                {
                    "override_id": 714,
                    "override_type": "ITEM",
                    "images": [
                        {
                            "id": 43544,
                            "path": "my/path/to/my/image.jpg",
                            "index": 1,
                            "host": "https://my.cdn.com"
                        }
                    ],
                    "override_sku": "1248187953"
                }
            ]
        },
        "items_info": {
            "items": [
                {
                    "id": 11743,
                    "sku": "1248187964",
                    "index": 1
                }
            ],
            "overrides": [
                {
                    "override_id": 714,
                    "override_type": "ITEM",
                    "items": [
                        {
                            "id": 11720,
                            "sku": "1248187730",
                            "index": 1
                        }
                    ],
                    "override_sku": "1248187953"
                },
                {
                    "override_id": 641,
                    "override_type": "STORE",
                    "items": [
                        {
                            "id": 11716,
                            "sku": "1248187776",
                            "index": 1
                        }
                    ],
                    "override_sku": ""
                }
            ]
        },
        "price_info": {
            "price": 179,
            "overrides": [
                {
                    "override_id": 641,
                    "override_type": "STORE",
                    "price": 200,
                    "override_sku": ""
                },
                {
                    "override_id": 714,
                    "override_type": "ITEM",
                    "price": 0,
                    "override_sku": "1248187953"
                }
            ]
        },
        "quantity_info": {
            "min_permitted": 0,
            "max_permitted": 5,
            "overrides": [
                {
                    "override_id": 641,
                    "override_type": "STORE",
                    "min_permitted": 0,
                    "max_permitted": 2,
                    "override_sku": ""
                },
                {
                    "override_id": 714,
                    "override_type": "ITEM",
                    "min_permitted": 0,
                    "max_permitted": 1,
                    "override_sku": "1248187953"
                }
            ]
        },
        "suspension_info": {
            "suspend_until": null,
            "suspend_reason": null,
            "overrides": [
                {
                    "override_id": 641,
                    "override_type": "STORE",
                    "suspend_until": "2025-03-30T00:00:00Z",
                    "suspend_reason": "Is stocked out",
                    "created_at": "2025-03-27T22:01:41.647376Z",
                    "override_sku": ""
                },
                {
                    "override_id": 714,
                    "override_type": "ITEM",
                    "suspend_until": "2025-03-30T00:00:00Z",
                    "suspend_reason": "Is stocked out",
                    "created_at": "2025-03-27T22:01:41.647376Z",
                    "override_sku": "1248187953"
                }
            ]
        },
        "schedules_info": {
            "schedules": [
                {
                    "days_of_week": "mon,tue,wed,thu,fri",
                    "time_periods": [
                        {
                            "start_time": "16:00",
                            "end_time": "22:00"
                        }
                    ]
                }
            ],
            "overrides": [
                {
                    "id": 26,
                    "override_id": 641,
                    "override_sku": "",
                    "override_type": "STORE",
                    "schedules": [
                        {
                            "days_of_week": "mon,tue,wed,thu,fri",
                            "time_periods": [
                                {
                                    "start_time": "16:00",
                                    "end_time": "23:00"
                                }
                            ]
                        }
                    ]
                },
                {
                    "id": 27,
                    "override_id": 714,
                    "override_sku": "1248187953",
                    "override_type": "ITEM",
                    "schedules": [
                        {
                            "days_of_week": "mon,tue,wed,thu,fri",
                            "time_periods": [
                                {
                                    "start_time": "16:00",
                                    "end_time": "20:00"
                                }
                            ]
                        }
                    ]
                }
            ]
        }
    }
	}

	jsonData, err := json.Marshal(data)
	if err != nil {
		fmt.Println("Error encoding JSON:", err)
		return
	}

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		fmt.Println("Error creating request:", err)
		return
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Add("x-authorization", "Bearer YOUR_TOKEN")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Println("Error sending request:", err)
		return
	}
	defer resp.Body.Close()

	body, _ := ioutil.ReadAll(resp.Body)
	fmt.Println(string(body))
}

```

### Respuesta de Ejemplo "Éxito 200"

> Este es un ejemplo de la respuesta "Éxito 200":

```json
{
  "message": "Your request has been accepted."
}
```

## DELETE Items por ID de tienda

Usa este endpoint para eliminar múltiples items de una tienda proporcionando sus IDs.

### URL del Endpoint

Usa esta URL para realizar una solicitud con este endpoint:

`https://{NEW_DOMAIN}/restaurants/menu/v1/stores/{storeId}/items`

`{NEW_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="http://dev-portal.dev.rappi.com/es/api-reference/content/#nuevos-dominios" target="_blank">Mira la lista de Dominios por país.</a>

<aside class="notice">
  <p>NOTA</p>
  <p>Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollador: <code>https://api.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso tienes las siguiente propiedades:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Parámetros

Este endpoint tiene los siguientes parámetros:

| Parámetro | Tipo | Requerido | Descripción                                                        |
| --------- | ---- | --------- | ------------------------------------------------------------------ |
| `storeId` | int  | Sí        | Identificador único de la tienda cuyo menú está siendo solicitado. |

### Códigos de Respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200` Éxito

</aside>

<aside class="error-response">

`400` Solicitud incorrecta

</aside>

<aside class="error-response">

`401` Credenciales inválidas

</aside>

<aside class="error-response">

`404` No encontrado

</aside>

<aside class="error-response">

`500` Error inesperado.

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`DELETE https://api.dev.rappi.com/restaurants/menu/v1/stores/900152558/items`

> Este es un ejemplo de la llamada:

```curl
curl --location --request DELETE 'https://api.dev.rappi.com/restaurants/menu/v1/stores/232/items' \
--header 'x-authorization: Bearer eyJhbGciOiJIUzI1NiIsI'
--header 'Content-Type: application/json' \
--data '[
    148477
]'
```

```java
import okhttp3.*;

public class Main {
    public static void main(String[] args) throws Exception {
        OkHttpClient client = new OkHttpClient();

        String json = "[1,2]";

        RequestBody body = RequestBody.create(json, MediaType.get("application/json"));
        Request request = new Request.Builder()
                .url("https://api.dev.rappi.com/restaurants/menu/v1/stores/232/items")
                .delete(body)
                .addHeader("Content-Type", "application/json")
                .addHeader("x-authorization", "Bearer YOUR_TOKEN")
                .build();

        try (Response response = client.newCall(request).execute()) {
            System.out.println(response.body().string());
        }
    }
}

```

```javascript
import axios from "axios";

const url = "https://api.dev.rappi.com/restaurants/menu/v1/stores/232/items";

const data = [1, 2, 22];

axios
  .delete(url, {
    data: data,
    headers: {
      "Content-Type": "application/json",
      "x-authorization": "Bearer YOUR_TOKEN",
    },
  })
  .then((response) => {
    console.log(response.data);
  })
  .catch((error) => {
    console.error(error);
  });
```

```python
import requests

url = "https://api.dev.rappi.com/restaurants/menu/v1/stores/232/items"

headers = {
    "Content-Type": "application/json",
    "x-authorization": "Bearer YOUR_TOKEN"
}

data = [1,2,22]

response = requests.delete(url, json=data, headers=headers)

print(response.text)
```

```go
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"io/ioutil"
)

func main() {
	url := "https://api.dev.rappi.com/restaurants/menu/v1/stores/232/items"

	data := []int{1, 2, 22},

	jsonData, err := json.Marshal(data)
	if err != nil {
		fmt.Println("Error encoding JSON:", err)
		return
	}

	req, err := http.NewRequest("DELETE", url, bytes.NewBuffer(jsonData))
	if err != nil {
		fmt.Println("Error creating request:", err)
		return
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Add("x-authorization", "Bearer YOUR_TOKEN")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Println("Error sending request:", err)
		return
	}
	defer resp.Body.Close()

	body, _ := ioutil.ReadAll(resp.Body)
	fmt.Println(string(body))
}
```

### Sample Response 'Success 200'

> This is an example of the response "Success 200":

```json
{
  "message": "Your request has been accepted."
}
```

## GET Item por ID de tienda

Usa este endpoint para obtener los detalles de un artículo específico de una tienda.

### URL del Endpoint

Usa esta URL para realizar una solicitud con este endpoint:

`https://{NEW_DOMAIN}/restaurants/menu/v1/stores/{storeId}/items/{itemId}`

`{NEW_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="http://dev-portal.dev.rappi.com/es/api-reference/content/#nuevos-dominios" target="_blank">Mira la lista de Dominios por país.</a>

<aside class="notice">
  <p>NOTA</p>
  <p>Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollador: <code>https://api.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso tienes las siguiente propiedades:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Parámetros

Este endpoint tiene los siguientes parámetros:

| Parámetro | Tipo   | Requerido | Descripción                                                        |
| --------- | ------ | --------- | ------------------------------------------------------------------ |
| `storeId` | uint64 | Sí        | El identificador único de la tienda cuyo menú se está solicitando. |
| `itemId`  | uint64 | Sí        | El identificador único del item que se está solicitando.           |

This parameter is used to specify which store's menu should be retrieved. The storeId should be a valid integer representing a store registered in the system.

### Códigos de Respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200` Éxito

</aside>

<aside class="error-response">

`400` Solicitud incorrecta

</aside>

<aside class="error-response">

`401` Credenciales inválidas

</aside>

<aside class="error-response">

`404` No encontrado

</aside>

<aside class="error-response">

`500` Error inesperado.

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`GET https://api.dev.rappi.com/restaurants/menu/v1/stores/{storeId}/items/{itemId}`

> Este es un ejemplo de la llamada:

```curl
curl --location 'https://api.dev.rappi.com/restaurants/menu/v1/stores/232/items/14' \
--header 'x-authorization: Bearer eyJhbGciOiJIUzI1NiIsI'
```

```java

String storeId = "232";
String ItemId = "10"
String urlString = "https://api.dev.rappi.com/restaurants/menu/v1/stores/" + storeId + "/items/" + ItemId};
URL url = new URL(urlString);
HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("GET");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");

int responseCode = connection.getResponseCode();
System.out.println("Response Code: " + responseCode);
try (BufferedReader br = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
  StringBuilder response = new StringBuilder();
  String responseLine;
  while ((responseLine = br.readLine()) != null) {
    response.append(responseLine.trim());
  }
  System.out.println("Response body: " + response.toString());
}
```

```javascript
const https = require("https");

const storeId = "232";
const itemId = "10";
const options = {
  method: "GET",
  hostname: "api.dev.rappi.com",
  path: `/restaurants/menu/v1/stores/${storeId}/items/${itemId}`,
  headers: {
    "Content-Type": "application/json",
    "x-authorization": "Bearer YOUR_TOKEN",
  },
};

const req = https.request(options, function (res) {
  let chunks = [];

  res.on("data", function (chunk) {
    chunks.push(chunk);
  });

  res.on("end", function () {
    const body = Buffer.concat(chunks);
    console.log("Response body:", body.toString());
  });

  res.on("error", function (error) {
    console.error(error);
  });
});

req.end();
```

```python
import requests

storeId = "232"
itemId = "10"
url = "https://api.dev.rappi.com/restaurants/menu/v1/stores/{storeId}/items/{itemId}"

headers = {
    "Content-Type": "application/json",
    "x-authorization": "Bearer YOUR_TOKEN"
}

response = requests.get(url, headers=headers)

print("Response Code:", response.status_code)
print("Response Body:", response.text)
```

```go
package main

import (
	"fmt"
	"io"
	"net/http"
)

func main() {
	storeID := "232"
	itemID:= "10"
	url := "https://api.dev.rappi.com/restaurants/menu/v1/stores/" + storeID + "/items/" + itemID

	client := &http.Client{}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		fmt.Println(err)
		return
	}
	req.Header.Add("Content-Type", "application/json")
	req.Header.Add("x-authorization", "Bearer YOUR_TOKEN")

	res, err := client.Do(req)
	if err != nil {
		fmt.Println(err)
		return
	}
	defer res.Body.Close()

	body, err := io.ReadAll(res.Body)
	if err != nil {
		fmt.Println(err)
		return
	}

	fmt.Println("Response Code:", res.StatusCode)
	fmt.Println("Response Body:", string(body))
}
```

### Respuesta de Ejemplo "Éxito 200"

> Este es un ejemplo de la respuesta "Éxito 200":

```json
{
  "id": 100,
  "sku": "pastel_de_fresa",
  "storeId": 232,
  "last_updated": "2025-03-27T22:01:41.647471Z",
  "item_type": "ITEM",
  "title_info": {
    "title": "Pastel de fresa",
    "overrides": [
      {
        "override_id": 641,
        "override_sku": "",
        "override_type": "STORE",
        "title": "Pastel de fresa deluxe"
      },
      {
        "override_id": 714,
        "override_sku": "1248187953",
        "override_type": "ITEM",
        "title": "Acompañamiento: Pastel de fresa"
      }
    ]
  },
  "description_info": {
    "description": "Delicioso pastel de fresa",
    "overrides": [
      {
        "override_id": 641,
        "override_type": "STORE",
        "description": "Delicioso pastel de fresa deluxe",
        "override_sku": ""
      },
      {
        "override_id": 714,
        "override_type": "ITEM",
        "description": "Delicioso acompañamiento: Pastel de fresa",
        "override_sku": "1248187953"
      }
    ]
  },
  "images_info": {
    "images": [
      {
        "id": 34,
        "path": "my/path/to/my/image.jpg",
        "index": 1,
        "host": "https://my.cdn.com"
      }
    ],
    "overrides": [
      {
        "override_id": 641,
        "override_type": "STORE",
        "images": [
          {
            "id": 43,
            "path": "my/path/to/my/image.jpg",
            "index": 1,
            "host": "https://my.cdn.com"
          }
        ],
        "override_sku": ""
      },
      {
        "override_id": 714,
        "override_type": "ITEM",
        "images": [
          {
            "id": 43544,
            "path": "my/path/to/my/image.jpg",
            "index": 1,
            "host": "https://my.cdn.com"
          }
        ],
        "override_sku": "1248187953"
      }
    ]
  },
  "items_info": {
    "items": [
      {
        "id": 11743,
        "sku": "1248187964",
        "index": 1
      }
    ],
    "overrides": [
      {
        "override_id": 714,
        "override_type": "ITEM",
        "items": [
          {
            "id": 11720,
            "sku": "1248187730",
            "index": 1
          }
        ],
        "override_sku": "1248187953"
      },
      {
        "override_id": 641,
        "override_type": "STORE",
        "items": [
          {
            "id": 11716,
            "sku": "1248187776",
            "index": 1
          }
        ],
        "override_sku": ""
      }
    ]
  },
  "price_info": {
    "price": 179,
    "overrides": [
      {
        "override_id": 641,
        "override_type": "STORE",
        "price": 200,
        "override_sku": ""
      },
      {
        "override_id": 714,
        "override_type": "ITEM",
        "price": 0,
        "override_sku": "1248187953"
      }
    ]
  },
  "quantity_info": {
    "min_permitted": 0,
    "max_permitted": 5,
    "modifiers_type": null,
    "overrides": [
      {
        "override_id": 641,
        "override_type": "STORE",
        "min_permitted": 0,
        "max_permitted": 2,
        "modifiers_type": null,
        "override_sku": ""
      },
      {
        "override_id": 714,
        "override_type": "ITEM",
        "min_permitted": 0,
        "max_permitted": 1,
        "modifiers_type": null,
        "override_sku": "1248187953"
      }
    ]
  },
  "suspension_info": {
    "suspend_until": null,
    "suspend_reason": null,
    "overrides": [
      {
        "override_id": 641,
        "override_type": "STORE",
        "suspend_until": "2025-03-30T00:00:00Z",
        "suspend_reason": "Is stocked out",
        "created_at": "2025-03-27T22:01:41.647376Z",
        "override_sku": ""
      },
      {
        "override_id": 714,
        "override_type": "ITEM",
        "suspend_until": "2025-03-30T00:00:00Z",
        "suspend_reason": "Is stocked out",
        "created_at": "2025-03-27T22:01:41.647376Z",
        "override_sku": "1248187953"
      }
    ],
    "is_available": true
  },
  "schedules_info": {
    "schedules": [
      {
        "days_of_week": "mon,tue,wed,thu,fri",
        "time_periods": [
          {
            "start_time": "16:00",
            "end_time": "22:00"
          }
        ]
      }
    ],
    "overrides": [
      {
        "id": 26,
        "override_id": 641,
        "override_sku": "",
        "override_type": "STORE",
        "schedules": [
          {
            "days_of_week": "mon,tue,wed,thu,fri",
            "time_periods": [
              {
                "start_time": "16:00",
                "end_time": "23:00"
              }
            ]
          }
        ]
      },
      {
        "id": 27,
        "override_id": 714,
        "override_sku": "1248187953",
        "override_type": "ITEM",
        "schedules": [
          {
            "days_of_week": "mon,tue,wed,thu,fri",
            "time_periods": [
              {
                "start_time": "16:00",
                "end_time": "20:00"
              }
            ]
          }
        ]
      }
    ]
  }
}
```

### Descripción de los campos de respuesta

Esta tabla describe los objetos contenidos en el ejemplo de respuesta:

| Campo                                                  | Tipo     | Descripción                                                                                                                                                                                                  |
| ------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                                                   | _int_    | Identificador del artículo.                                                                                                                                                                                  |
| `sku`                                                  | _string_ | Identificador de la unidad de mantenimiento de stock (SKU) del artículo. Es obligatorio a menos que se envíe el ID.                                                                                          |
| `storeId`                                              | _int_    | Identificador de la tienda en la aplicación.                                                                                                                                                                 |
| `last_updated`                                         | _string_ | Marca de tiempo de la última actualización en formato ISO 8601 (YYYY-MM-DDTHH:MM:SSZ).                                                                                                                       |
| `item_type`                                            | _string_ | Tipo de artículo (`ITEM` o `MODIFIER_GROUP`).                                                                                                                                                                |
| `title_info.title`                                     | _string_ | Título del artículo.                                                                                                                                                                                         |
| `title_info.overrides`                                 | _array_  | Lista de modificaciones del título para condiciones específicas.                                                                                                                                             |
| `title_info.overrides[].override_id`                   | _int_    | Identificador de la modificación del título.                                                                                                                                                                 |
| `title_info.overrides[].override_sku`                  | _string_ | El SKU de la entidad modificada, es obligatorio a menos que se envíe el override_id.                                                                                                                         |
| `title_info.overrides[].override_type`                 | _string_ | Tipo de modificación (`STORE` o `ITEM`).                                                                                                                                                                     |
| `title_info.overrides[].title`                         | _string_ | Título modificado.                                                                                                                                                                                           |
| `description_info.description`                         | _string_ | Descripción del artículo.                                                                                                                                                                                    |
| `description_info.overrides`                           | _array_  | Lista de modificaciones de la descripción para condiciones específicas.                                                                                                                                      |
| `description_info.overrides[].override_id`             | _int_    | Identificador de la modificación de la descripción.                                                                                                                                                          |
| `description_info.overrides[].override_type`           | _string_ | Tipo de modificación (`STORE` o `ITEM`).                                                                                                                                                                     |
| `description_info.overrides[].description`             | _string_ | Descripción modificada.                                                                                                                                                                                      |
| `description_info.overrides[].override_sku`            | _string_ | El SKU de la entidad modificada, es obligatorio a menos que se envíe el override_id.                                                                                                                         |
| `images_info.images`                                   | _array_  | Lista de imágenes asociadas con el artículo.                                                                                                                                                                 |
| `images_info.images[].id`                              | _int_    | Identificador de la imagen.                                                                                                                                                                                  |
| `images_info.images[].path`                            | _string_ | Ruta donde se encuentra la imagen en el CDN.                                                                                                                                                                 |
| `images_info.images[].index`                           | _int_    | Posición en la que debe mostrarse la imagen.                                                                                                                                                                 |
| `images_info.images[].host`                            | _string_ | Servidor CDN de la imagen.                                                                                                                                                                                   |
| `images_info.overrides`                                | _array_  | Lista de modificaciones de imágenes para condiciones específicas.                                                                                                                                            |
| `images_info.overrides[].override_id`                  | _int_    | Identificador de la modificación de la imagen.                                                                                                                                                               |
| `images_info.overrides[].override_type`                | _string_ | Tipo de modificación (`STORE` o `ITEM`).                                                                                                                                                                     |
| `images_info.overrides[].images`                       | _array_  | Lista de imágenes modificadas.                                                                                                                                                                               |
| `images_info.overrides[].override_sku`                 | _string_ | El SKU de la entidad modificada, es obligatorio a menos que se envíe el override_id.                                                                                                                         |
| `items_info.items`                                     | _array_  | Lista de artículos relacionados.                                                                                                                                                                             |
| `items_info.items[].id`                                | _int_    | Identificador del artículo relacionado.                                                                                                                                                                      |
| `items_info.items[].sku`                               | _string_ | SKU del artículo relacionado. Es obligatorio a menos que se envíe el ID.                                                                                                                                     |
| `items_info.items[].index`                             | _int_    | Índice de orden del artículo relacionado.                                                                                                                                                                    |
| `items_info.overrides`                                 | _array_  | Lista de modificaciones de artículos para condiciones específicas.                                                                                                                                           |
| `items_info.overrides[].override_id`                   | _int_    | Identificador de la modificación del artículo.                                                                                                                                                               |
| `items_info.overrides[].override_type`                 | _string_ | Tipo de modificación (`STORE` o `ITEM`).                                                                                                                                                                     |
| `items_info.overrides[].items`                         | _array_  | Lista de artículos modificados.                                                                                                                                                                              |
| `items_info.overrides[].override_sku`                  | _string_ | El SKU de la entidad modificada, es obligatorio a menos que se envíe el override_id.                                                                                                                         |
| `price_info.price`                                     | _float_  | Precio del artículo.                                                                                                                                                                                         |
| `price_info.overrides`                                 | _array_  | Lista de modificaciones de precios para condiciones específicas.                                                                                                                                             |
| `price_info.overrides[].override_id`                   | _int_    | Identificador de la modificación del precio.                                                                                                                                                                 |
| `price_info.overrides[].override_type`                 | _string_ | Tipo de modificación (`STORE` o `ITEM`).                                                                                                                                                                     |
| `price_info.overrides[].price`                         | _float_  | El precio que debe aplicarse cuando se cumple la modificación.                                                                                                                                               |
| `price_info.overrides[].override_sku`                  | _string_ | El SKU de la entidad modificada, es obligatorio a menos que se envíe el override_id.                                                                                                                         |
| `quantity_info.min_permitted`                          | _int_    | Cantidad mínima permitida del artículo o de los elementos dentro del grupo modificador. Obligatorio si el artículo es de tipo `MODIFIER_GROUP`.                                                              |
| `quantity_info.max_permitted`                          | _int_    | Cantidad máxima permitida del artículo o de los elementos dentro del grupo modificador. Obligatorio si el artículo es de tipo `MODIFIER_GROUP`.                                                              |
| `quantity_info.modifiers_type`                         | _string_ | Tipo de modificador (puede ser nulo).                                                                                                                                                                        |
| `quantity_info.overrides`                              | _array_  | Lista de modificaciones de cantidad para condiciones específicas.                                                                                                                                            |
| `quantity_info.overrides[].override_id`                | _int_    | Identificador de la modificación de cantidad.                                                                                                                                                                |
| `quantity_info.overrides[].override_type`              | _string_ | Tipo de modificación (`STORE` o `ITEM`).                                                                                                                                                                     |
| `quantity_info.overrides[].min_permitted`              | _int_    | Cantidad mínima permitida del artículo cuando es de tipo `ITEM`, o la cantidad mínima permitida dentro del grupo cuando es de tipo `MODIFIER_GROUP`. Obligatorio si el artículo es de tipo `MODIFIER_GROUP`. |
| `quantity_info.overrides[].max_permitted`              | _int_    | Cantidad máxima permitida del artículo cuando es de tipo `ITEM`, o la cantidad máxima permitida dentro del grupo cuando es de tipo `MODIFIER_GROUP`. Obligatorio si el artículo es de tipo `MODIFIER_GROUP`. |
| `quantity_info.overrides[].modifiers_type`             | _string_ | Tipo de modificador sobrescrito (puede ser nulo).                                                                                                                                                            |
| `quantity_info.overrides[].override_sku`               | _string_ | El SKU de la entidad modificada, es obligatorio a menos que se envíe el `override_id`.                                                                                                                       |
| `suspension_info.suspend_until`                        | _string_ | Fecha en la que el artículo debe activarse. Si es `null`, entonces está suspendido permanentemente.                                                                                                          |
| `suspension_info.suspend_reason`                       | _string_ | Razón por la cual el artículo está suspendido.                                                                                                                                                               |
| `suspension_info.is_available`                         | _bool_   | Estado de disponibilidad del artículo.                                                                                                                                                                       |
| `suspension_info.overrides`                            | _array_  | Lista de modificaciones de suspensión para condiciones específicas.                                                                                                                                          |
| `schedules_info.schedules`                             | _array_  | Lista de horarios que definen la disponibilidad.                                                                                                                                                             |
| `schedules_info.schedules[].days_of_week`              | _string_ | Días de la semana en los que el horario está activo.                                                                                                                                                         |
| `schedules_info.schedules[].time_periods`              | _array_  | Períodos de tiempo dentro del horario.                                                                                                                                                                       |
| `schedules_info.schedules[].time_periods[].start_time` | _string_ | Hora de inicio en formato `HH:MM`.                                                                                                                                                                           |
| `schedules_info.schedules[].time_periods[].end_time`   | _string_ | Hora de finalización en formato `HH:MM`.                                                                                                                                                                     |
| `schedules_info.overrides`                             | _array_  | Lista de modificaciones de horarios para condiciones específicas.                                                                                                                                            |
| `schedules_info.overrides[].override_id`               | _int_    | Identificador de la modificación del horario.                                                                                                                                                                |
| `schedules_info.overrides[].override_type`             | _string_ | Tipo de modificación (`STORE`, `CATEGORY` o `ITEM`).                                                                                                                                                         |
| `schedules_info.overrides[].schedules`                 | _array_  | Lista de horarios modificados.                                                                                                                                                                               |
| `schedules_info.overrides[].override_sku`              | _string_ | El SKU de la entidad modificada, es obligatorio a menos que se envíe el override_id.                                                                                                                         |
