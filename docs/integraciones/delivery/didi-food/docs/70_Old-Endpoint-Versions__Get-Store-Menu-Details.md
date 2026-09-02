<!-- id=2008 path=Old Endpoint Versions > Get Store Menu Details -->
## Get Store Menu Details

> **NOTE:**
> This an old endpoint and a newer version of it exists. Please upgrade to the version under **Menu API**.

`GET` [https://openapi.didi-food.com/v1/item/item/list](https://openapi.didi-food.com/v1/item/item/list)

The **Get Store Menu Details** endpoint provides the ability to fetch all menu items of a store.

### Request Path Parameters

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `auth_token` | string | The `auth_token` for the shop | Yes | ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU= |

### Response Body Parameters - Structure - Level 1

This is the first level of the menu configuration for a store.

| **Name** | **Type** | **Description** | **Example** |
| --- | --- | --- | --- |
| `menus` | list[struct] | List of menus. Currently, only one menu is supported. | [{menu1}] |
| `categories` | list[struct] | List of the store’s menu categories. | [{category1}, {category2}] |
| `items` | list[struct] | List of the store’s items. | [{item1}, {item2}] |


### Response Body Parameters - Menus

The identifiers of different menus.

| **Name** | **Type** | **Description** | **Example** |
| --- | --- | --- | --- |
| `app_menu_id` | string | ID for the menu, provided by the restaurant or POS. Multiple menus shall be mapped to 1 menu. | menuID01 |
| `menu_name` | string | Menu name displayed. | Main Menu |
| `app_category_ids` | list[string] | All of the IDs for the menu categories available while this menu is active. | ["Hamburguesas01","Pollo02"] |


### Response Body Parameters - Categories

A grouping that allows related items to be displayed together on a menu. 

| **Name** | **Type** | **Description** | **Example** |
| --- | --- | --- | --- |
| `app_category_id` | string | ID for the category, provided by the restaurant or POS. Map directly. | Hamburguesas01 |
| `category_name` | string | The category name displayed. Map directly. | Hamburguesas |
| `app_item_ids` | list[string] | All of the IDs for the items provided by the restaurant. The sequence of the items is shown in the same sequence. | ["Classic Burger01", "BBQ Burger02"] |


### Response Body Parameters - Items

Individual objects that can be ordered and configured to be visible in specific days, times and special dates.

> **Promotion Setting with the Menu**
> 
> Promotions is a very important tool that can help to boost sales and obtain more attention from the users in the APP. With the purpose to provide a more efficient manner to set promotions, DiDiFood is providing a promo setting feature available from Sept. 8th, 2023 for the store to set up promotions directly from the menu by providing a non-mandatory key `activity_price`

> 
> Visual effect:
> ![After setting promotion](https://drive.google.com/file/d/1WK2TQgsI3BLBKS72JR9PAULnUgaLIgdM/view?usp=drive_link)
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

| **Name** | **Type** | **Description** | **Example** |
| --- | --- | --- | --- |
| `app_item_id` | string | ID for the item, provided by the restaurant or POS. Map directly. | Hamburguesas01 |
| `app_external_id` | string/json | Free-form text field reserved for the restaurant's use, e.g. for POS integrations. | Hamburguesas |
| `item_name` | string | Item name displayed. | Hamburguesas |
| `short_desc` | string | An optional description for the Item. | null |
| `head_img` | string | The URL of the Items’ image. | https://imgurl.host/static/rlabtest/ |
| `item_type` | int | The type of entity is specified.<br>0: item;<br>1: sub_item. | 0   |
| `additional_type` | int | 0: item;<br>1: combo. |     |
| `sold_info` **(Deprecated)** | string | Sales time period per day. The continuous-time spans during which the item is available. |     |
| `sold_info_intl` | list[struct] | Sales period per day. The continuous time span during which the item is available. |     |
| `status` | int | Status of the item: 1: Available; 2: Unavailable. | 1   |
| `currency` | string | Dishes sales currency. Depends on the shop currency. | MXN |
| `price` | int | The price charged for ordering the item.<br>**Note:** Price is always an integer value (never decimals) because the price is set in the lowest denomination (e.g. cents for MX currency, not Peso). | 100 |
| `activity_price`  | int | Is the discounted price that will be charged to the user. **Note:** Price is always an integer value (never decimals) because the price is set in the lowest denomination (e.g. cents for MX currency, not Peso). For more details please see above in promotion setting notes| No| 80 |
| `content_with_sub_item` | list[struct] | All of the IDs for the menu categories made available. | [{Extras01}, {Drinks02}] |


### Response Body Parameters - Content_with_sub_item - Content

Specifies content of the subitems associated with a specific item.

| **Name** | **Type** | **Description** | **Example** |
| --- | --- | --- | --- |
| `app_content_id` | string | ID for the item, provided by the restaurant or POS. | Drinks02 |
| `content_name` | string | The category name displayed. | Drinks |
| `is_required` | int | Is a selection required?<br>1: Required;<br>2: Not required | 1   |
| `quantity_min_permitted` | int | The minimum quantity allowed (inclusive). Map directly. | 0   |
| `quantity_max_permitted` | int | The maximum quantity allowed (inclusive). | 5   |
| `buy_mode` | int | 0: Single,<br>1: Multi (Multi means a customer can pick the same item multiple times. Only allowed on leaf nodes). | 0   |


### Response Body Parameters - Content_with_sub_item - Sub_item_list

The items displayed in the sub-items group.

| **Name** | **Type** | **Description** | **Example** |
| --- | --- | --- | --- |
| `app_sub_item_id` | string | Free-form text field reserved for the restaurant's use, e.g. for POS integrations. | 020723 |
| `sub_item_name` | string | Sub-item name displayed. | Hamburguesas |
| `short_desc` | string | An optional description for the sub-item. | null |
| `head_img` | string | The URL of the sub-items’ image. | https://imgurl.host/static/rlabtest/ |
| `item_type` | int | The type of entity is specified.<br>0: item;<br>1: sub_item. | 0   |
| `additional_type` | int | 0: item;<br>1: combo. | 0   |
| `sold_info` **(Deprecated)** | string | Sales time period per day. The continuous-time spans during which the item is available. |     |
| `sold_info_intl` | list[struct] | Sales period per day. The continuous time span during which the item is available. |     |
| `status` | int | Status of the item:<br>1: Available;<br>2: Unavailable. | 1   |
| `currency` | string | Dishes sales currency. Depends on the shop currency. | MXN |
| `price` | int | The price charged for ordering the item.<br>**Note:** Price is always an integer value (never decimals) because the price is set in the lowest denomination (e.g. cents for MX currency, not Peso). | 100 |

### Response Example

```json
{
    "errno": 0,
    "errmsg": "ok",
    "requestId": "20f92bf5665aa27a",
    "time": 1609390677,
    "data": {
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
                "app_item_ids": [
                    "100026_2_1"
                ]
            },
            {
                "app_category_id": "2",
                "category_name": "Familiares",
                "app_item_ids": [
                    "10000_2_1"
                ]
            }
        ],
        "items": [
            {
                "app_item_id": "100026_2_1",
                "app_external_id": "",
                "item_name": "Combo Long Rodeo",
                "short_desc": "Hamburguesa con 2 carne de res a la parrilla, 2 rebanadas de queso americano, deliciosos aros de cebolla, salsa BBQ sobre pan suave con ajonjolí, acompañada de papas regulares (95 gr) y refresco pet (400 ml)",
                "head_img": "https://img-hxy021.didistatic.com/static/iportal/do1_Y5xqZADPF1ruZRkT29j6",
                "item_type": 0,
                "additional_type": 0,
                "sold_info": "",
                "sold_info_intl": "[{\"time\":[{\"begin\":\"08:00\",\"end\":\"20:00\"}],\"day\":[1,2,3],\"specialDay\":[]},{\"time\":[],\"day\":[6,7],\"specialDay\":[]},{\"time\":[{\"begin\":\"10:00\",\"end\":\"12:00\"},{\"begin\":\"16:00\",\"end\":\"18:00\"}],\"day\":[],\"specialDay\":[\"2020-12-20\"]},{\"time\":[],\"day\":[],\"specialDay\":[\"2020-12-25\"]}]",
                "currency": "BRL",
                "status": 1,
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
                            "buy_mode": 0
                        },
                        "sub_item_list": [
                            {
                                "app_sub_item_id": "100007_1",
                                "sub_item_name": "Long Rodeo",
                                "short_desc": "",
                                "head_img": "",
                                "item_type": 1,
                                "additional_type": 0,
                                "sold_info": "",
                                "status": 1,
                                "currency": "BRL",
                                "price": 0
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
                                "short_desc": "",
                                "head_img": "",
                                "item_type": 1,
                                "additional_type": 0,
                                "sold_info": "",
                                "status": 1,
                                "currency": "BRL",
                                "price": 2000
                            },
                            {
                                "app_sub_item_id": "100121_4",
                                "sub_item_name": "Papas Grandes",
                                "short_desc": "",
                                "head_img": "",
                                "item_type": 1,
                                "additional_type": 0,
                                "sold_info": "",
                                "status": 1,
                                "currency": "BRL",
                                "price": 2500
                            },
                            {

                                "app_sub_item_id": "100135_2",
                                "sub_item_name": "Papas Supremas Queso",
                                "short_desc": "",
                                "head_img": "",
                                "item_type": 1,
                                "additional_type": 0,
                                "sold_info": "",
                                "status": 1,
                                "currency": "BRL",
                                "price": 2500
                            },
                            {
                                "app_sub_item_id": "100026_2",
                                "sub_item_name": "Papas Chicas",
                                "short_desc": "",
                                "head_img": "",
                                "item_type": 1,
                                "additional_type": 0,
                                "sold_info": "",
                                "status": 1,
                                "currency": "BRL",
                                "price": 0
                            },
                            {
                                "app_sub_item_id": "100027_2",
                                "sub_item_name": "Aros De Cebolla Chicos",
                                "short_desc": "",
                                "head_img": "",
                                "item_type": 1,
                                "additional_type": 0,
                                "sold_info": "",
                                "status": 1,
                                "currency": "BRL",
                                "price": 0
                            },
                            {
                                "app_sub_item_id": "100003_2",
                                "sub_item_name": "Papas Supremas Chipotle",
                                "short_desc": "",
                                "head_img": "",
                                "item_type": 1,
                                "additional_type": 0,
                                "sold_info": "",
                                "status": 1,
                                "currency": "BRL",
                                "price": 2500
                            },
                            {
                                "app_sub_item_id": "100005_2",
                                "sub_item_name": "Papas Supremas BBQ",
                                "short_desc": "",
                                "head_img": "",
                                "item_type": 1,
                                "additional_type": 0,
                                "sold_info": "",
                                "status": 1,
                                "currency": "BRL",
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
                                "short_desc": "",
                                "head_img": "",
                                "item_type": 1,
                                "additional_type": 0,
                                "sold_info": "",
                                "status": 1,
                                "currency": "BRL",
                                "price": 0
                            },
                            {
                                "app_sub_item_id": "100026_2",
                                "sub_item_name": "Jugo de Naranja",
                                "short_desc": "",
                                "head_img": "",
                                "item_type": 1,
                                "additional_type": 0,
                                "sold_info": "",
                                "status": 1,
                                "currency": "BRL",
                                "price": 0
                            },
                            {
                                "app_sub_item_id": "100028_2",
                                "sub_item_name": "Pepsi Black",
                                "short_desc": "",
                                "head_img": "",
                                "item_type": 1,
                                "additional_type": 0,
                                "sold_info": "",
                                "status": 1,
                                "currency": "BRL",
                                "price": 0
                            },
                            {
                                "app_sub_item_id": "100034_2",
                                "sub_item_name": "Pepsi Light",
                                "short_desc": "",
                                "head_img": "",
                                "item_type": 1,
                                "additional_type": 0,
                                "sold_info": "",
                                "status": 1,
                                "currency": "BRL",
                                "price": 0
                            },
                            {
                                "app_sub_item_id": "100035_2",
                                "sub_item_name": "Mirinda",
                                "short_desc": "",
                                "head_img": "",
                                "item_type": 1,
                                "additional_type": 0,
                                "sold_info": "",
                                "status": 1,
                                "currency": "BRL",
                                "price": 0
                            },
                            {
                                "app_sub_item_id": "100036_2",
                                "sub_item_name": "7 Up",
                                "short_desc": "",
                                "head_img": "",
                                "item_type": 1,
                                "additional_type": 0,
                                "sold_info": "",
                                "status": 1,
                                "currency": "BRL",
                                "price": 0
                            },
                            {
                                "app_sub_item_id": "100037_2",
                                "sub_item_name": "Manzanita Sol",
                                "short_desc": "",
                                "head_img": "",
                                "item_type": 1,
                                "additional_type": 0,
                                "sold_info": "",
                                "status": 1,
                                "currency": "BRL",
                                "price": 0
                            },
                            {
                                "app_sub_item_id": "100038_2",
                                "sub_item_name": "Pepsi",
                                "short_desc": "",
                                "head_img": "",
                                "item_type": 1,
                                "additional_type": 0,
                                "sold_info": "",
                                "status": 1,
                                "currency": "BRL",
                                "price": 0
                            }
                        ]
                    }
                ]
            },
            {
                "app_item_id": "10000_2_1",
                "app_external_id": "",
                "item_name": "Family King Antojo",
                "short_desc": "Para compartir, 1 Whopper sin queso + 1 King de pollo + 1 Whopper Jr., 6 nuggets y 4 papas Kids",
                "head_img": "https://img-hxy021.didistatic.com/static/iportal/do1_Y5xqZADPF1ruZRkT29j6",
                "item_type": 0,
                "additional_type": 0,
                "sold_info": "{\"time\":[{\"begin\":\"07:00\",\"end\":\"23:00\"}],\"day\":[1,1,1,1,1,1,1]}",
                "sold_info_intl": "[{\"time\":[{\"begin\":\"07:00\",\"end\":\"23:00\"}],\"day\":[1,2,3,4,5,6,7]}]",
                "currency": "BRL",
                "status": 1,
                "price": 17900,
                "content_with_sub_item": [
                    {
                        "content": {
                            "app_content_id": "10000_0",
                            "content_name": "Whopper",
                            "is_required": 1,
                            "quantity_min_permitted": 1,
                            "quantity_max_permitted": 1,
                            "buy_mode": 0
                        },
                        "sub_item_list": [
                            {
                                "app_sub_item_id": "100174_1_main",
                                "sub_item_name": "Whopper",
                                "short_desc": "",
                                "head_img": "",
                                "item_type": 1,
                                "additional_type": 0,
                                "sold_info": "",
                                "status": 1,
                                "currency": "BRL",
                                "price": 0
                            }
                        ]
                    },
                    {
                        "content": {
                            "app_content_id": "10000_1",
                            "content_name": "King de Pollo",
                            "is_required": 1,
                            "quantity_min_permitted": 1,
                            "quantity_max_permitted": 1,
                            "buy_mode": 0
                        },
                        "sub_item_list": [
                            {
                                "app_sub_item_id": "100002_2",
                                "sub_item_name": "King de Pollo",
                                "short_desc": "",
                                "head_img": "",
                                "item_type": 1,
                                "additional_type": 0,
                                "sold_info": "",
                                "status": 1,
                                "currency": "BRL",
                                "price": 0
                            }
                        ]
                    },
                    {
                        "content": {
                            "app_content_id": "10000_2",
                            "content_name": "Whopper Jr",
                            "is_required": 1,
                            "quantity_min_permitted": 1,
                            "quantity_max_permitted": 1,
                            "buy_mode": 0
                        },
                        "sub_item_list": [
                            {
                                "app_sub_item_id": "100002_2",
                                "sub_item_name": "Whopper Jr",
                                "short_desc": "",
                                "head_img": "",
                                "item_type": 1,
                                "additional_type": 0,
                                "sold_info": "",
                                "status": 1,
                                "currency": "BRL",
                                "price": 0
                            }
                        ]
                    },
                    {
                        "content": {
                            "app_content_id": "10000_3",
                            "content_name": "Nuggets de Pollo",
                            "is_required": 1,
                            "quantity_min_permitted": 1,
                            "quantity_max_permitted": 1,
                            "buy_mode": 0
                        },
                        "sub_item_list": [
                            {
                                "app_sub_item_id": "100180_2",
                                "sub_item_name": "6 Nuggets de Pollo",
                                "short_desc": "",
                                "head_img": "",
                                "item_type": 1,
                                "additional_type": 0,
                                "sold_info": "",
                                "status": 1,
                                "currency": "BRL",
                                "price": 0
                            }
                        ]
                    },
                    {
                        "content": {
                            "app_content_id": "10000_4",
                            "content_name": "Papas Chicas",
                            "is_required": 1,
                            "quantity_min_permitted": 1,
                            "quantity_max_permitted": 1,
                            "buy_mode": 0
                        },
                        "sub_item_list": [
                            {
                                "app_sub_item_id": "1000100_2",
                                "sub_item_name": "Papas Chicas",
                                "short_desc": "",
                                "head_img": "",
                                "item_type": 1,
                                "additional_type": 0,
                                "sold_info": "",
                                "status": 1,
                                "currency": "BRL",
                                "price": 0
                            }
                        ]
                    },
                    {
                        "content": {
                            "app_content_id": "10000_5",
                            "content_name": "Papas Chicas",
                            "is_required": 1,
                            "quantity_min_permitted": 1,
                            "quantity_max_permitted": 1,
                            "buy_mode": 0
                        },
                        "sub_item_list": [
                            {
                                "app_sub_item_id": "1000100_2",
                                "sub_item_name": "Papas Chicas",
                                "short_desc": "",
                                "head_img": "",
                                "item_type": 1,
                                "additional_type": 0,
                                "sold_info": "",
                                "status": 1,
                                "currency": "BRL",
                                "price": 0
                            }
                        ]
                    },
                    {
                        "content": {
                            "app_content_id": "10000_6",
                            "content_name": "Papas Chicas",
                            "is_required": 1,
                            "quantity_min_permitted": 1,
                            "quantity_max_permitted": 1,
                            "buy_mode": 0
                        },
                        "sub_item_list": [
                            {
                                "app_sub_item_id": "1000100_2",
                                "sub_item_name": "Papas Chicas",
                                "short_desc": "",
                                "head_img": "",
                                "item_type": 1,
                                "additional_type": 0,
                                "sold_info": "",
                                "status": 1,
                                "currency": "BRL",
                                "price": 0
                            }
                        ]
                    },
                    {
                        "content": {
                            "app_content_id": "10000_7",
                            "content_name": "Papas Chicas",
                            "is_required": 1,
                            "quantity_min_permitted": 1,
                            "quantity_max_permitted": 1,
                            "buy_mode": 0
                        },
                        "sub_item_list": [
                            {
                                "app_sub_item_id": "1000100_2",
                                "sub_item_name": "Papas Chicas",
                                "short_desc": "",
                                "head_img": "",
                                "item_type": 1,
                                "additional_type": 0,
                                "sold_info": "",
                                "status": 1,
                                "currency": "BRL",
                                "price": 0
                            }
                        ]
                    }
                ]
            }
        ]
    }
}
```