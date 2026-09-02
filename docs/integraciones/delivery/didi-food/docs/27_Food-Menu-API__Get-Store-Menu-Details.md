<!-- id=1938 path=Food Menu API > Get Store Menu Details -->
## Get Store Menu Details

`GET` [https://openapi.didi-food.com/v3/item/item/list](https://openapi.didi-food.com/v3/item/item/list)

The **Get Store Menu Details** endpoint provides the ability to fetch all menu items of a store. 

> **Important**
> This endpoint provides you a reference of all the menu items however it is **NOT** possible for you to use the structure directly to re-submitt the menu through the **Upload Store Menu Details - V3** as it will report errors that need to be fixed one by one before being successfully sent. It is only recommended to be used to get the `app_item_id` and `item_name` relation only.

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
| `modifier_groups` | list[struct] | List of the store’s modifier groups. | [{mg1}, {mg2}] |


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
| `priority` | int | The priority (order) of the category displayed in C-App. |  1   |


### Response Body Parameters - Items

Individual objects that can be ordered and configured to be visible in specific days, times and special dates.

| **Name** | **Type** | **Description** | **Example** |
| --- | --- | --- | --- |
| `app_item_id` | string | The ID for the item provided by the restaurant. This is the id that can be configured in DiDi Store and DiDiFood backend system. Please use this as the ID for mapping. | Hamburguesas01 |
| `app_external_id` | string/json | Free-form text field reserved for the restaurant's use, e.g. for POS integrations. DiDi Store and DiDiFood backend system can't edit this field.| Hamburguesas |
| `item_name` | string | Item name displayed. | Hamburguesas |
| `short_desc` | string | An optional description for the Item. | null |
| `head_img` | string | The URL of the Items’ image. | https://imgurl.host/static/rlabtest/ |
| `sold_info_intl` | list[struct] | Sales period per day. The continuous time span during which the item is available. |     |
| `price` | int | The price to charge for ordering the item. Allows overrides from items selected in modifier groups.<br>**Note:** Price is always an integer value (never decimals) because the price is set in the lowest denomination (e.g. cents for MX currency, not Peso). | 100 |
| `activity_price`  | int | Is the discounted price that will be charged to the user. **Note:** Price is always an integer value (never decimals) because the price is set in the lowest denomination (e.g. cents for MX currency, not Peso). For more details please see above in promotion setting notes| 80 |
| `priority` | int | The priority (order) of the item inside the category. | 1   |
| `status` | int | Status of the item shown in C-App:<br>1: Available;<br>2: Unavailable. | 1   |
| `is_sold_separately` | bool | true: The item can be sold separately. <br>false: The item can only be sold as part of a modifier group. |  true  |
| `app_modifier_group_ids` | list[string] | The list of the IDs of modifier groups the item contains. | ["mg1", "mg2"] |
| `tax_info_list` | list[struct] | Tax information for the item. See TaxInfo structure below for details. | [] |

### Response Body Parameters - sold_info_intl

The time span information to make an item visible.

| **Name** | **Type** | **Description** | **Required** | **Example** |
|---|---|---|---|---|
| `time`  | array | Beginning and end times when the item should be made available.  **Time format:** HH:mm. | Yes. Leave empty to specify the whole day. | {"begin":"10:00","end":"12:00"} |
| `day` | array | Days in which the item is sold.  **Accepted values** from 1 (Monday) to 7 (Sunday).      | Yes. Leave empty if `specialDay` is specified. | [1,2,3,4,5,6,7]                 |
| `specialDay` | array | Special rules for specific special day(s).  **Date format:** yyyy-MM-dd                  | No | ["2020-12-25", "2020-12-26"] |

### Response Body Parameters - tax_info_list

Detailed tax configuration for an item. It is a list of tax objects, each with a tax type and rate.
**Rules**:
- `type` is an enum: `1` = IVA, `2` = IEPS.
- `rate` is an integer representing the tax value in basis points (e.g. 16.00% → 1600).
  - If `type = 1` (IVA), `rate` ** will be 0 or 1600** (16.00%).
  - If `type = 2` (IEPS), `rate` ** will be between 0 and 10000** (inclusive). 

| **Name** | **Type**  | **Description** | **Example** |
|---|---|---|---|
| `type` | int | Tax type. `1` = IVA, `2` = IEPS.  | 1 |
| `rate` | int | Tax rate in integer (e.g. 1600 for 16.00%).  | 1600 |

### Request Body Parameters - Modifier Groups

A group of items to be selected as a customization or additional item under a parent item.

| **Name**                 | **Type**     | **Description**                                                                                                          | **Example**         |
|--------------------------|--------------|--------------------------------------------------------------------------------------------------------------------------|---------------------|
| `modifier_group_name`    | string       | The modifier group name displayed in C-App.                                                                              | Drinks              |
| `app_modifier_group_id`  | string       | ID for the modifier group in **your** system provided by the restaurant or POS.                                          | 30001_01            |
| `app_external_id`        | string/json  | Reserved for the restaurant's use, e.g. for POS integrations.                                                            | {"key":"value"}     |
| `is_required`            | int          | Is a selection required? 1: Required; 2: Not required                                                                    | 1                   |
| `quantity_min_permitted` | int          | The minimum quantity allowed (inclusive).                                                                                | 0                   |
| `quantity_max_permitted` | int          | The maximum quantity allowed (inclusive).                                                                                | 5                   |
| `buy_mode`               | int          | 0: Single; 1: Multi (Multi means a customer can pick the same item multiple times).                                      | 0                   |
| `app_mg_items`           | list[struct] | The `app_item_id` and `price` of the items in the modifier group.                                                        | 0                   |

### Request Body Parameters - App_mg_items

The items to be displayed in the modifier group.

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `app_item_id` | string | The ID for the item provided by the restaurant. | Yes | Hamburguesas01 |
| `price` | int | Change the price when this item is in this modifier group. <br> **Note:** Price is always an integer value (never decimals) because the price is set in the lowest denomination (e.g. cents for MX currency, not Peso). | Yes | 100 |



### Response Example

```json
{
    "errno": 0,
    "errmsg": "ok",
    "requestId": "1e0f220f079eb02e",
    "time": 1627542552,
    "data": {
        "menus": [
            {
                "menu_name": "menu",
                "app_menu_id": "menu",
                "app_category_ids": [
                    "cate1",
                    "cate2",
                    "cate3",
                    "cate4",
                    "cate5"
                ]
            }
        ],
        "categories": [
            {
                "app_category_id": "cate1",
                "category_name": "cate1",
                "app_item_ids": [
                    "item2_has_mg",
                    "item1_has_mg",
                    "item_in_mg4",
                    "item2_in_mg2"
                ],
                "priority": 1
            },
            {
                "app_category_id": "cate2",
                "category_name": "cate2",
                "app_item_ids": [
                    "item_in_mg3",
                    "item_10",
                    "item_9",
                    "item_8",
                    "item_7",
                    "item_6",
                    "item_5",
                    "item_4"
                ],
                "priority": 2
            },
            {
                "app_category_id": "cate3",
                "category_name": "cate3",
                "app_item_ids": [
                    "item_2"
                ],
                "priority": 3
            },
            {
                "app_category_id": "cate4",
                "category_name": "cate4",
                "app_item_ids": [
                    "item_in_mg2",
                    "item_3"
                ],
                "priority": 4
            },
            {
                "app_category_id": "cate5",
                "category_name": "cate5",
                "app_item_ids": [
                    "item_in_mg1",
                    "item_1"
                ],
                "priority": 5
            }
        ],
        "items": [
            {
                "app_item_id": "item2_has_mg",
                "item_name": "item2_has_mg",
                "short_desc": "23",
                "price": 1200,
                "priority": 17,
                "status": 1,
                "is_sold_separately": true,
		"tax_info_list":[
			{
				"type":1,
				"rate":1600
			}
		],
                "app_modifier_group_ids": [
                    "mg4"
                ]
            },
            {
                "app_item_id": "item1_has_mg",
                "item_name": "item1_has_mg",
                "price": 2400,
                "priority": 16,
                "status": 1,
                "is_sold_separately": true,
                "app_modifier_group_ids": [
                    "mg3"
                ]
            },
            {
                "app_item_id": "item_in_mg4",
                "item_name": "item_in_mg4",
                "price": 400,
                "priority": 15,
                "status": 1,
                "is_sold_separately": true
            },
            {
                "app_item_id": "item2_in_mg2",
                "item_name": "item2_in_mg2",
                "price": 3400,
                "priority": 6,
                "status": 1,
                "is_sold_separately": true
            },
            {
                "app_item_id": "item_in_mg3",
                "item_name": "item_in_mg3",
                "price": 400,
                "priority": 14,
                "status": 1,
                "is_sold_separately": true
            },
            {
                "app_item_id": "item_10",
                "item_name": "item_10",
                "short_desc": "ShortDesc--test",
                "price": 1200,
                "priority": 13,
                "status": 1,
                "head_img": "http://10.90.28.42:8052/static/anything/do1_VUvDUiBSqLlWz62rrTAq",
                "is_sold_separately": true
            },
            {
                "app_item_id": "item_9",
                "item_name": "item_9",
                "price": 0,
                "priority": 12,
                "status": 1,
                "is_sold_separately": true
            },
            {
                "app_item_id": "item_8",
                "item_name": "item_8",
                "short_desc": "ShortDesc--test",
                "price": 1200,
                "priority": 11,
                "status": 1,
                "head_img": "http://10.90.28.42:8052/static/anything/do1_VUvDUiBSqLlWz62rrTAq",
                "is_sold_separately": true,
                "app_modifier_group_ids": [
                    "mg1",
                    "mg3"
                ]
            },
            {
                "app_item_id": "item_7",
                "item_name": "item_7",
                "price": 0,
                "priority": 10,
                "status": 1,
                "is_sold_separately": true
            },
            {
                "app_item_id": "item_6",
                "item_name": "item_6",
                "short_desc": "ShortDesc--test",
                "price": 400,
                "priority": 9,
                "status": 1,
                "head_img": "http://10.90.28.42:8052/static/anything/do1_VUvDUiBSqLlWz62rrTAq",
                "is_sold_separately": true
            },
            {
                "app_item_id": "item_5",
                "item_name": "item_5",
                "price": 0,
                "priority": 8,
                "status": 1,
                "is_sold_separately": true
            },
            {
                "app_item_id": "item_4",
                "item_name": "item_4",
                "price": 0,
                "priority": 7,
                "status": 1,
                "is_sold_separately": true
            },
            {
                "app_item_id": "item_2",
                "item_name": "item_2",
                "price": 10000,
                "priority": 3,
                "status": 1,
                "is_sold_separately": true
            },
            {
                "app_item_id": "item_in_mg2",
                "item_name": "item_in_mg2",
                "price": 3400,
                "priority": 5,
                "status": 1,
                "is_sold_separately": true
            },
            {
                "app_item_id": "item_3",
                "item_name": "item_3",
                "price": 500000,
                "priority": 4,
                "status": 1,
                "is_sold_separately": true
            },
            {
                "app_item_id": "item_in_mg1",
                "item_name": "item_in_mg1",
                "price": 500,
                "priority": 2,
                "status": 1,
                "is_sold_separately": false
            },
            {
                "app_item_id": "item_1",
                "item_name": "item_1",
                "price": 100000,
                "priority": 1,
                "status": 1,
                "sold_info_intl": [
                    {
                        "time": [
                            {
                                "begin": "01:00",
                                "end": "08:00"
                            }
                        ],
                        "day": [
                            2,
                            3
                        ]
                    }
                ],
                "is_sold_separately": true,
                "app_modifier_group_ids": [
                    "mg5"
                ]
            }
        ],
        "modifier_groups": [
            {
                "app_modifier_group_id": "mg2",
                "modifier_group_name": "mg2",
                "is_required": 2,
                "quantity_min_permitted": 0,
                "quantity_max_permitted": 1,
                "buy_mode": 0,
                "app_mg_items": [
                    {
                        "app_item_id": "item_in_mg2",
                        "price": 3800
                    },
                    {
                        "app_item_id": "item2_in_mg2",
                        "price": 2000
                    }
                ]
            },
            {
                "app_modifier_group_id": "mg4",
                "modifier_group_name": "mg4",
                "is_required": 1,
                "quantity_min_permitted": 1,
                "quantity_max_permitted": 1,
                "buy_mode": 0,
                "app_mg_items": [
                    {
                        "app_item_id": "item_in_mg4",
                        "price": 0
                    }
                ]
            },
            {
                "app_modifier_group_id": "mg3",
                "modifier_group_name": "mg3",
                "is_required": 1,
                "quantity_min_permitted": 1,
                "quantity_max_permitted": 1,
                "buy_mode": 1,
                "app_mg_items": [
                    {
                        "app_item_id": "item_in_mg3",
                        "price": 0
                    }
                ]
            },
            {
                "app_modifier_group_id": "mg1",
                "modifier_group_name": "mg1",
                "is_required": 1,
                "quantity_min_permitted": 1,
                "quantity_max_permitted": 1,
                "buy_mode": 0,
                "app_mg_items": [
                    {
                        "app_item_id": "item_in_mg1",
                        "price": 100
                    }
                ]
            },
            {
                "app_modifier_group_id": "mg5",
                "modifier_group_name": "mg5",
                "is_required": 1,
                "quantity_min_permitted": 1,
                "quantity_max_permitted": 1,
                "buy_mode": 0,
                "app_mg_items": [
                    {
                        "app_item_id": "item_in_mg1",
                        "price": 200
                    }
                ]
            }
        ]
    }
}
```