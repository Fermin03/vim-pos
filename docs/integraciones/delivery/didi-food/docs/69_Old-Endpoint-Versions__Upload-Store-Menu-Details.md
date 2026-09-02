<!-- id=2006 path=Old Endpoint Versions > Upload Store Menu Details -->
## Upload Store Menu Details

> **NOTE:**
> This an old endpoint and a newer version of it exists. Please upgrade to the version under **Menu API**.
> 
> With this endpoint, it is **NOT** possible to expand the number of categories or items that you can display to the consumer. If you want to upload more categories or items, please refer to the V3.

`POST`  [https://openapi.didi-food.com/v1/item/item/uploadv2](https://openapi.didi-food.com/v1/item/item/uploadv2)

The **Upload Store Menu Details** endpoint uploads or overrides a menu to a store with an async task in the background. You will receive a callback with the details of the task in your webhook with **type uploadMenuTaskStatus** when the task is finished. This endpoint allows Partners to upload a menu directly (recommended) other than doing it manually in B-App. You can later verify the result with the **Get Store Menu Details API**. We suggest you upload the menu **first on a test store and check if everything is correct before upload to the production store** since the upload will override the menu already uploaded into the store.

> **About V2 version:**
> The V2 supports promotion better. Read more in **Promotion Support**. This API will only delete and recreate the menu that was not created by Upload V2, and then it will do an update internally.

> **IMPORTANT:**
> It supports up to six levels of nested `sub_items`.

> **ATTENTION:**
> We will transport `app_item_id`, `app_sub_item_id`, `app_external_id` in order.


### Request Body Parameters - Level 1

This is the first level of the menu configuration for a store.

> **NOTE:**
> If your menu is already with the structure **item-content-subitem** (that we call three levels), there is no limit to using this API. If your menu contains nested sub-items like **item-content-subitem-content-subitem**, the content and subitem beyond level 3 will not be displayed in B-App, but will be displayed in C-App and can be retrieved using the **Get Store Menu Details API**.

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `auth_token` | string | The `auth_token` for the shop | Yes | ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU= |
| `menus` | list[struct] | A list of menus. Currently, only one menu is supported. Multiple menus will be mapped to 1 menu. | Yes | [{menu1}] |
| `categories` | list[struct] | A list of the store’s menu categories. Max. of 20 categories. | Yes | [{category1}, {category2}] |
| `items` | list[struct] | List of the store’s items. Each item must belong to one category. Max. of 500 items. | Yes | [{item1}, {item2}] |

### Request Body Parameters - Menus

The identifiers of different menus.

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `app_menu_id` | string | ID for the menu, provided by the restaurant or POS. Multiple menus will be mapped to one menu. | Yes | menuID01 |
| `menu_name` | string | Menu name to be displayed. Map directly. Max length: 50 characters. | Yes | Main Menu |

### Request Body Parameters - Categories

A grouping that allows related items to be displayed together on a menu. You can create categories for types of dishes, drinks and deserts, for example.


| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `app_category_id` | string | ID for the category, provided by the restaurant or POS. Map directly. | Yes | Hamburguesas01 |
| `category_name` | string | The category name to be displayed. Map directly. Max length: 100 characters. | Yes | Hamburguesas |
| `app_item_ids` | list[string] | All of the IDs for the items provided by the restaurant. The sequence of the items is shown in the same sequence. Each `app_item_id` should be unique. | Yes | ["Classic Burger01", "BBQ Burger02"] |
| `priority` | int | The priority (order) of the category to be displayed. | No  | 1   |

### Request Body Parameters - Items

Individual objects that can be ordered and configured to be visible in specific days, times and special dates.

> **Promotion Setting with the Menu**
> 
> Promotions is a very important tool that can help to boost sales and obtain more attention from the users in the APP. With the purpose to provide a more efficient manner to set promotions, DiDiFood is providing a promo setting feature available from Sept. 8th, 2023 for the store to set up promotions directly from the menu by providing a non-mandatory key `activity_price`
> 
> 
> Visual effect:
> ![After setting promotion](https://img-hxy021.didistatic.com/static/starimg/img/HReTst0xGt1696850758430.png)
> 
> **Important**:
> * The structure for activity_price is non-mandatory. However, if you choose not to configure any promotion, please refrain from sending this key or provide it with a value of 'Null' to prevent any misunderstandings. DiDiFood does not recognize '0' as a valid value for this key.
> * In cases where activity_price exceeds the price, DiDiFood will interpret that no promotion is applied to the item.
> * The difference between the price and activity_price must be equal to or greater than 1%.
> * Promotions are not permitted for items marked as Alcohol.
> * Prior to configuring a promotion through this API method, any existing promotions set in B-App or through DiDiFood's internal system must be canceled.
> * In the event that an item with a previous promotion configured in B-App or through DiDiFood's internal system undergoes a change in price, the price will be updated, but the previously configured promotion will continue to be effective for users based on the new price set.
> * To delete or modify a promotion (which was previously set through API), simply adjust the values of price and activity_price, and then submit the updated menu through this API. It is **NOT** possible to delete or modify a promotion of an item which promotion that was set in B-App or through DiDiFood's internal system.
> * All promotions established through this method are fully assumed by the store/brand. Therefore, it is crucial to have the necessary permissions granted in the operational interface. Under no circumstances may the store/brand make claims against DiDiFood for the promotions set using this method.

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `app_item_id` | string | All of the IDs for the items provided by the restaurant. Each `app_item_id` should be unique. | Yes | Hamburguesas01 |
| `app_external_id` | string/json | Free-form text field reserved for the restaurant's use, e.g. for POS integrations. | No  | {"key":"value"} |
| `item_name` | string | Item name to be displayed. Max length: 50 characters. | Yes | Hamburguesas |
| `short_desc` | string | An optional description for the Item. Max length: 300 characters. | No  | null |
| `sold_info_intl` | list[struct] | Sales period per day. The continuous time span during which the item is available. Check below for more details. | No  |     |
| `stock` | int | The inventory. The amount of the item available | No  | 0   |
| `head_img` | string | The URL for the item’s image.<br> **Requirements:** Hosted on a secure connection (SSL); File size with less than 10MB; Min. width and height: 320px; Max. width and height: 1144px.<br> **Formats supported:** JPEG, PNG or GIF. | No  | https://imgurl.host/static/rlabtest/ |
| `price` | int | The price to charge for ordering the item. <br> **Note:** Price is always an integer value (never decimals) because the price is set in the lowest denomination (e.g. cents for MX currency, not Peso). | Yes | 100 |
| `activity_price`  | int | Is the discounted price that will be charged to the user. **Note:** Price is always an integer value (never decimals) because the price is set in the lowest denomination (e.g. cents for MX currency, not Peso). For more details please see above in promotion setting notes| No| 80 |
| `priority` | int | The priority (order) of the item to be displayed. | No  | 1   |
| `content_with_sub_item` | list[struct] | All of the IDs for the menu categories made available. | No  | [{Extras01}, {Drinks02}] |


> **NOTE:**
> The **status of the item** is not supported in the Upload Store Menu Details endpoint. Use the Update Item Status API to set an item online/offline.


### Request Body Parameters - Content_with_sub_item

The root-level to specify subitems that can be associated with an item.

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `content` | struct | The content structure. | No  | {content1} |
| `sub_item_list` | list[struct] | The sub_item list. | No  | [{obj1},{obj2}] |


### Request Body Parameters - Content_with_sub_item - Content

Specifies content of the subitems associated with a specific item.

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `content_name` | string | The content name to be displayed. Max length: 50 characters. | Yes | Drinks |
| `app_content_id` | string | ID for the content, provided by the restaurant or POS. Each `app_content_id` in the same item should be unique. | Yes. Cannot be _null_. | 30001_01 |
| `app_external_id` | string/json | Reserved for the restaurant's use, e.g. for POS integrations. Map directly. | No  | {"key":"value"} |
| `is_required` | int | Is a selection required?<br> 1: Required;<br> 2: Not required | No  | 1   |
| `quantity_min_permitted` | int | The minimum quantity allowed (inclusive). Map directly. Cannot be negative. | No  | 0   |
| `quantity_max_permitted` | int | The maximum quantity allowed (inclusive). Map directly.<br> **Note:** `quantity_max_permitted` cannot be less than `quantity_min_permitted`. | No  | 5   |
| `buy_mode` | int | 0: Single,<br> 1: Multi (Multi means a customer can pick the same item multiple times. **Only allowed on leaf nodes**). | Yes | 0   |

### Request Body Parameters - Content_with_sub_item - Sub_item_list

The items to be displayed in the sub-items group.

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `sub_item_name` | string | Sub-item name to be displayed. Max length: 50 characters. | Yes | milk |
| `app_external_id` | string/json | Free-form text field reserved for the restaurant's use, e.g. for POS integrations. | No  | {"key":"value"} |
| `app_sub_item_id` | string | ID for the subItem, provided by the restaurant or POS. Each `app_sub_item_id` in the same content should be unique. | Yes | 020723 |
| `price` | int | The price to charge for ordering the item.<br> **Note:** Price is always an integer value (never decimals) because the price is set in the lowest denomination (e.g. cents for MX currency, not Peso). | Yes | 100 |

### Request Body Parameters - Sold_info_intl

The time span information to make an item visible.

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `time` | list[struct] | Beginning and end times when the item should be made available.<br> **Time format:** HH:mm. | Yes. Leave empty to specify the whole day. | {"begin":"10:00","end":"12:00"} |
| `day` | int array | Days in which the item is sold.<br> **Accepted values** from 1 (Monday) to 7 (Sunday). | Yes. Leave empty if `specialDay` is specified. | [1,2,3,4,5,6,7] |
| `specialDay` | string array | Special rules for specific special day(s). <br> **Date format:** yyyy-MM-dd | Yes | ["2020-12-25", "2020-12-26"] |

#### Sold_info_intl Example

* From 08:00 to 20:00 on Mondays, Tuesdays and Wednesdays.
* The whole day on Saturdays and Sundays.
* From 10:00 to 12:00 and from 14:00 to 16:00 on 2020-12-20.
* The whole day on 2020-12-25.

```json
[
  {
    "time": [
      {
        "begin": "08:00",
        "end": "20:00"
      }
    ],
    "day": [
      1,
      2,
      3
    ],
    "specialDay": []
  },
  {
    "time": [],
    "day": [
      6,
      7
    ],
    "specialDay": []
  },
  {
    "time": [
      {
        "begin": "10:00",
        "end": "12:00"
      },
      {
        "begin": "16:00",
        "end": "18:00"
      }
    ],
    "day": [],
    "specialDay": [
      "2020-12-20"
    ]
  },
  {
    "time": [],
    "day": [],
    "specialDay": [
      "2020-12-25"
    ]
  }
]
```

### Request Example

```json
{
  "auth_token": "MWM2ZDI1N2Q2ODRiNDcxZmNlM2IwNDhiMjNmNDkyNDE=",
  "menus": [
    {
      "menu_name": "Menu",
      "app_menu_id": "1",
      "app_category_ids": [
        "1",
        "2"
      ]
    }
  ],
  "categories": [
    {
      "app_category_id": "1",
      "category_name": "Combos",
      "priority": 1,
      "app_item_ids": [
        "100026_2_1"
      ]
    },
    {
      "app_category_id": "2",
      "category_name": "Familiares",
      "priority": 2,
      "app_item_ids": [
        "10342_2_7"
      ]
    }
  ],
  "items": [
    {
      "app_item_id": "100026_2_1",
      "app_external_id": {
        "key": "value"
      },
      "priority": 1,
      "item_name": "Combo Long Rodeo",
      "short_desc": "Hamburguesa con 2 carne de res a la parrilla, 2 rebanadas de queso americano, deliciosos aros de cebolla, salsa BBQ sobre pan suave con ajonjolí, acompañada de papas regulares (95 gr) y refresco pet (400 ml)",
      "head_img": "https://img-hxy021.didistatic.com/static/iportal/do1_Y5xqZADPF1ruZRkT29j6",
      "sold_info_intl": [
        {
          "time": [
            {
              "begin": "00:00",
              "end": "20:00"
            }
          ],
          "day": [
            1,
            2,
            3
          ],
          "specialDay": []
        },
        {
          "time": [],
          "day": [
            6,
            7
          ],
          "specialDay": []
        },
        {
          "time": [
            {
              "begin": "10:00",
              "end": "12:00"
            },
            {
              "begin": "16:00",
              "end": "18:00"
            }
          ],
          "day": [],
          "specialDay": [
            "2020-12-20"
          ]
        },
        {
          "time": [],
          "day": [],
          "specialDay": [
            "2020-12-25"
          ]
        }
      ],
      "price": 7500,
      "activity_price": 6500,
      "content_with_sub_item": [
        {
          "content": {
            "app_content_id": "100026_0",
            "content_name": "Hamburguesa",
            "is_required": 1,
            "quantity_min_permitted": 1,
            "quantity_max_permitted": 1,
            "buy_mode": 0,
            "app_external_id": {
              "tipo": "content",
              "multiplicador": 1
            }
          },
          "sub_item_list": [
            {
              "app_sub_item_id": "100007_1",
              "sub_item_name": "Long Rodeo",
              "price": 0,
              "app_external_id": {
                "tipo": "subitem",
                "multiplicador": 1
              }
            }
          ]
        },
        {
          "content": {
            "app_content_id": "100026_1",
            "content_name": "Complementos",
            "is_required": 1,
            "quantity_min_permitted": 1,
            "quantity_max_permitted": 1,
            "buy_mode": 1
          },
          "sub_item_list": [
            {
              "app_sub_item_id": "100120_3",
              "sub_item_name": "Papas Medianas",
              "price": 2000,
              "app_external_id": "sucursal=493&tipo=producto&id=16236&cod=1885&precio=15&precio_didi=20&multiplicador=1"
            },
            {
              "app_sub_item_id": "100121_4",
              "sub_item_name": "Papas Grandes",
              "price": 2500
            },
            {
              "app_sub_item_id": "100135_2",
              "sub_item_name": "Papas Supremas Queso",
              "price": 2500
            },
            {
              "app_sub_item_id": "100026_2",
              "sub_item_name": "Papas Chicas",
              "price": 0
            },
            {
              "app_sub_item_id": "100027_2",
              "sub_item_name": "Aros De Cebolla Chicos",
              "price": 0
            },
            {
              "app_sub_item_id": "100003_2",
              "sub_item_name": "Papas Supremas Chipotle",
              "price": 2500
            },
            {
              "app_sub_item_id": "100005_2",
              "sub_item_name": "Papas Supremas BBQ",
              "price": 2500
            }
          ]
        },
        {
          "content": {
            "app_content_id": "100026_2",
            "content_name": "Bebidas",
            "is_required": 1,
            "quantity_min_permitted": 1,
            "quantity_max_permitted": 1,
            "buy_mode": 1
          },
          "sub_item_list": [
            {
              "app_sub_item_id": "100025_2",
              "sub_item_name": "Agua Pet 600 ml",
              "price": 0
            },
            {
              "app_sub_item_id": "100026_2",
              "sub_item_name": "Jugo de Naranja",
              "price": 0
            },
            {
              "app_sub_item_id": "100028_2",
              "sub_item_name": "Pepsi Black",
              "price": 0
            },
            {
              "app_sub_item_id": "100034_2",
              "sub_item_name": "Pepsi Light",
              "price": 0
            },
            {
              "app_sub_item_id": "100035_2",
              "sub_item_name": "Mirinda",
              "price": 0
            },
            {
              "app_sub_item_id": "100036_2",
              "sub_item_name": "7 Up",
              "price": 0
            },
            {
              "app_sub_item_id": "100037_2",
              "sub_item_name": "Manzanita Sol",
              "price": 0
            },
            {
              "app_sub_item_id": "100038_2",
              "sub_item_name": "Pepsi",
              "price": 0
            }
          ]
        }
      ]
    },
    {
      "app_item_id": "10342_2_7",
      "item_name": "2x1 en Espresso",
      "short_desc": "Compra una bebida de la barra de Espresso y te obsequiamos la segunda ",
      "head_img": "-",
      "priority": 2,
      "price": 7800,
      "content_with_sub_item": [
        {
          "content": {
            "content_name": "Tamaño",
            "app_content_id": "1001",
            "is_required": 2,
            "quantity_min_permitted": 1,
            "quantity_max_permitted": 1,
            "buy_mode": 0
          },
          "sub_item_list": [
            {
              "app_sub_item_id": "7",
              "sub_item_name": "Grande (16oz - 437ml)",
              "price": 0,
              "content_with_sub_item": []
            },
            {
              "app_sub_item_id": "8",
              "sub_item_name": "Venti (20oz - 606ml)",
              "price": 700,
              "content_with_sub_item": []
            }
          ]
        },
        {
          "content": {
            "content_name": "2x1 Espresso",
            "app_content_id": "10342_0",
            "is_required": 2,
            "quantity_min_permitted": 1,
            "quantity_max_permitted": 1,
            "buy_mode": 0
          },
          "sub_item_list": [
            {
              "app_sub_item_id": "20003_7_main",
              "sub_item_name": "Caramel Macchiato",
              "price": 0,
              "content_with_sub_item": [
                {
                  "content": {
                    "content_name": "Shot Extra",
                    "app_content_id": "20003_13_I",
                    "is_required": 2,
                    "quantity_min_permitted": 0,
                    "quantity_max_permitted": 99,
                    "buy_mode": 0
                  },
                  "sub_item_list": [
                    {
                      "app_sub_item_id": "24102_7_side",
                      "sub_item_name": "Espresso",
                      "price": 1200,
                      "content_with_sub_item": []
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "content": {
            "content_name": "2x1 Espresso",
            "app_content_id": "10342_1",
            "is_required": 2,
            "quantity_min_permitted": 1,
            "quantity_max_permitted": 1,
            "buy_mode": 0
          },
          "sub_item_list": [
            {
              "app_sub_item_id": "20003_7_side",
              "sub_item_name": "Caramel Macchiato",
              "price": 0,
              "app_external_data": {
                "priceLevelId": "7",
                "menuType": "side"
              },
              "content_with_sub_item": [
                {
                  "content": {
                    "content_name": "Shot Extra",
                    "app_content_id": "20003_13_I",
                    "is_required": 2,
                    "quantity_min_permitted": 0,
                    "quantity_max_permitted": 99,
                    "buy_mode": 0
                  },
                  "sub_item_list": [
                    {
                      "app_sub_item_id": "24102_7_side",
                      "sub_item_name": "Espresso",
                      "price": 1200,
                      "content_with_sub_item": []
                    }
                  ]
                },
                {
                  "content": {
                    "content_name": "Salsas",
                    "app_content_id": "20003_1_H",
                    "is_required": 2,
                    "quantity_min_permitted": 0,
                    "quantity_max_permitted": 3,
                    "buy_mode": 0
                  },
                  "sub_item_list": [
                    {
                      "app_sub_item_id": "24010_7_side",
                      "sub_item_name": "Mocha",
                      "price": 1100,
                      "content_with_sub_item": []
                    },
                    {
                      "app_sub_item_id": "24012_7_side",
                      "sub_item_name": "Mocha Blanco",
                      "price": 1100,
                      "content_with_sub_item": []
                    },
                    {
                      "app_sub_item_id": "24015_7_side",
                      "sub_item_name": "Chai",
                      "price": 1100,
                      "content_with_sub_item": []
                    },
                    {
                      "app_sub_item_id": "24108_7_side",
                      "sub_item_name": "Fresa",
                      "price": 1100,
                      "content_with_sub_item": []
                    },
                    {
                      "app_sub_item_id": "24110_7_side",
                      "sub_item_name": "Cajeta",
                      "price": 1100,
                      "content_with_sub_item": []
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

### Response Body Parameters

This endpoint will immediately return a **taskId**, with which you can call the **Get Menu Upload Task Info API** to check the status that will also be updated with the **uploadMenuTaskStatus webhook**.

The task detail contains the success or failed information about the creation of each item/category. 

| **Status (of the task)** | **Description** |
| --- | --- |
| 0   | waiting |
| 1   | success |
| 2   | failed |
| 3   | waitRetry |
| 4   | running |

### Response Example

```json
{
  "errno": 0,
  "errmsg": "ok",
  "requestId": "20fbd1a6207a3535",
  "time": 1609845642,
  "data": {
    "taskID": 3458764739727720400,
    "createTime": 1609845642,
    "status": 0,
    "message": "waiting"
  }
}
```
<!--stackedit_data:
eyJoaXN0b3J5IjpbLTEzODE2MTA3NTksNTI1NDYwNDM4LC01OD
U0MTYyODEsLTYyMjA3MjcyNSwtMzUwMTU4NzgxXX0=
-->