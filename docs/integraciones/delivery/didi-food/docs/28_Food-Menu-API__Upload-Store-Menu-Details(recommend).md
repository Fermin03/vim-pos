<!-- id=1940 path=Food Menu API > Upload Store Menu Details(recommend) -->
## Upload Store Menu Details - V3 (Recommended)

`POST`  [https://openapi.didi-food.com/v3/item/item/upload](https://openapi.didi-food.com/v3/item/item/upload)

The **Upload Store Menu Details** endpoint uploads or overrides a menu to a store with an async task in the background. You will receive a callback with the details of the task in your webhook with **type uploadMenuTaskStatus** when the task is finished. This endpoint allows Partners to upload a menu directly (recommended) other than doing it manually in B-App. We suggest you upload the menu **first on a test store and check if everything is correct before upload to the production store** since the upload will override the menu already uploaded into the store.

DiDiFood recommends to use this version 3 or any other latest version as all new features will be only updated over the latest version. The previous V1 and V2 will only keep their current functions without any update to avoid any disruptance in the ongoing business, however, if you want to boost capacity, efficiency and new functions, please keep updating as per the latest version.

> **About v3 version:**
> The v3 supports modifier groups that can be used by different items and by now. If you use nested subitems in modifier groups, please contact to DiDiFood API team to put you in a whitelist and can up to six levels of nested `sub_items`.

> **ATTENTION:**
> We will transport `app_item_id`, `app_sub_item_id`, `app_external_id` in order.

### Limits to the Menu

| **Section** | **Maximum** |
|---|---|
| Menu | 1 |
| Categories | 20 |
| Items per category | 300 |
| Items | 4000 |
| Main items | 400 |
| Modifier groups | 500 |

> **More items and category:**
> Only this V3 version can support the increase of categories and items up to 50 categories and 8,000 items. However, you will need to contact DiDiFood API team to be able to increase those categories/items.


### Request Body Parameters - Level 1

This is the first level of the menu configuration for a store.

| **Name** | **Type** | **Description** | **Required** | **Example** |
|---|---|---|---|---|
| `auth_token` | string | The `auth_token` for the shop | Yes | ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU= |
| `menus` | list[struct] | A list of menus. Currently, only one menu is supported. Multiple menus will be mapped to 1 menu. | Yes | [{menu1}] | `categories` | list[struct] | A list of the store’s menu categories. | Yes | [{category1}, {category2}]                   |
| `items` | list[struct] | A list of the store’s items. Each item must belong to one category.  | Yes | [{item1}, {item2}]                           |
| `modifier_groups` | list[struct] | A list of the modifier groups. Each modifier group must have at least one item.  | Yes | [{mg1}, {mg2}] |

### Request Body Parameters - Menus

The identifiers of different menus. Only one menu is currently supported.

| **Name** | **Type** | **Description** | **Required** | **Example** |
|---|---|---|---|---|
| `app_menu_id` | string | ID for the menu, provided by the restaurant or POS. Multiple menus will be mapped to one menu. | Yes | menuID01 |
| `menu_name` | string | Menu name to be displayed. Map directly. Max length: 50 characters.                            | Yes | Main Menu |

### Request Body Parameters - Categories

A grouping that allows related items to be displayed together on a menu. You can create categories for types of dishes, drinks and deserts, for example.

> **Setting Priorities Among Categories**
> To set the priority among categories, please arrange the each category object in accordance to the priority that you would like it to be displayed. DiDiFood will not apply the priority listed under the key `priority`

| **Name** | **Type** | **Description** | **Required** | **Example** |
|---|---|---|---|---|
| `app_category_id` | string | ID for the category, provided by the restaurant or POS. Map directly.                                                                                  | Yes | Hamburguesas01 |
| `category_name` | string | The category name to be displayed. Map directly. Max length: 100 characters.                                                                           | Yes | Hamburguesas |
| `priority` | int | The priority (order) of the category to be displayed in C-App and B-App however DiDiFood is not following this sequence therefore this is just for reference purpose to the integrator to easier your sorting| No | 1 |
| `app_item_ids` | list[string] | All of the IDs for the items provided by the restaurant. The sequence of the items is shown in the same sequence. Each `app_item_id` should be unique. If a category doesn't contain any `app_item_id` it will be displayed as a category without item in DiDiFood APP| Yes | ["Classic Burger01", "BBQ Burger02"] |

### Request Body Parameters - Items

Individual objects that can be ordered and configured to be visible in specific days, times and special dates.

> **Promotion Setting with the Menu**
> 
> Promotions is a very important tool that can help to boost sales and obtain more attention from the users in the APP. With the purpose to provide a more efficient manner to set promotions, DiDiFood is providing a promo setting feature available from Sept. 8th, 2023 for the store to set up promotions directly from the menu by providing a non-mandatory key `activity_price`
> 
> Visual effect:
>
> ![After setting promotion](https://img0.didiglobal.com/static/gstar/img/FChZ1urkwr1724313254813.png)
> 
> **Important**:
> * The structure for activity_price is non-mandatory. However, if you choose not to configure any promotion, please refrain from sending this key or provide it with a value of 'Null' to prevent any misunderstandings. DiDiFood does not recognize '0' as a valid value for this key.
> * In cases where activity_price exceeds the price, DiDiFood will interpret that no promotion is applied to the item.
> * The difference between the price and activity_price must be equal to or greater than 1%.
> * Promotions are **NOT** permitted for items tagged as with Alcohol.
> * Prior to configuring a promotion through this API method, any existing promotions set in B-App or through DiDiFood's internal system must be canceled.
> * In the event that an item with a previous promotion configured in B-App or through DiDiFood's internal system undergoes a change in price, the price will be updated, but the previously configured promotion will continue to be effective for users based on the new price set.
> * To delete or modify a promotion (which was previously set through API), simply adjust the values of price and activity_price, and then submit the updated menu through this API. It is **NOT** possible to delete or modify a promotion of an item which promotion that was set in B-App or through DiDiFood's internal system.
> * All promotions established through this method are fully assumed by the store/brand. Therefore, it is crucial to have the necessary permissions granted in the operational interface. Under no circumstances may the store/brand make claims against DiDiFood for the promotions set using this method.

| **Name** | **Type** | **Description** | **Required** | **Example** |
|---|---|---|---|---|
| `app_item_id` | string | The ID for the item provided by the restaurant. This is the id that can be configured in DiDi Store and DiDiFood backend system. Please use this as the ID for mapping| Yes | Hamburguesas01 |
| `app_external_id` | string/json | Free-form text field reserved for the restaurant's use, e.g. for POS integrations. DiDi Store and DiDiFood backend system can't edit this field | No | {"key":"value"} |
| `item_name`  | string | Item name to be displayed. Max length: 50 characters. If the item name exceeds 50 characters, DidiFood will not block the menu update, however the item name will be cut to 50 characters due to the limitation in the app display space | Yes | Hamburguesas |
| `short_desc` | string | An optional description for the Item. Max length: 400 characters. | No | null |
| `sold_info_intl` | list[struct] | Sales period per day. The continuous time span during which the item is available. Check below for more details. | No | |
| `head_img` | string | The URL for the item’s image. **Requirements:** Hosted on a secure connection (SSL); File size with less than 10MB; Min. width and height: 150px; Max. width and height: 3000px.**Formats supported:** JPEG, PNG or GIF. If there is any error in the image link, format or size, DidiFood will NOT block the menu update, however the image will not be updated. | No | https://imgurl.host/static/rlabtest/ |
| `price`  | int | The price without any discount to be charged to the consumer for ordering the item. Allows overrides from items selected in modifier groups. **Note:** Price is always an integer value (never decimals) because the price is set in the lowest denomination (e.g. cents for MX currency, not Peso).  | Yes | 100 |
| `activity_price`  | int | Is the discounted price that will be charged to the user. **Note:** Price is always an integer value (never decimals) because the price is set in the lowest denomination (e.g. cents for MX currency, not Peso). For more details please see above in promotion setting notes| No| 80 |
| `tax_rate`  | int | The tax rate of item per 1000. **Note:** Only support for **Japan**, and it's required in Japan. | No | 800 |
| `priority` | int | The  priority  (order)  of  the  item  to  be  displayed  in  C-App.  (B-App  will  display  the  same  order  sent  in  the  JSON). | No | 1 | 
| `status` | int | Status of the item to be shown in C-App. 1: Available; 2: Unavailable.                                                                                                                                                                                        | Yes | 1 |
| `is_sold_separately` | bool | true: The item can be sold separately; false: The item can only be sold as part of a modifier group. If this key is not provided, DiDiFood will by default consider that the item can only be sold as part of a modifier group. | Yes | true |
| `has_wine` | int | The indicate whether the item contains alcohol or not: 1 Yes 0 No. This is important because it will trigger ID checking requirements when the consumer places the order.                                                                                                                                                                                      | No | 1 |
| `app_modifier_group_ids` | list[string] | The list of the IDs of modifier groups the item contains.                                                                                                                                                                                                     | No | ["mg1", "mg2"] |
| `size` | int | Provides information about item portion size：1-For 1 person、2-For 2 people、3-For 3 to 4 people、4-For 5 to 8 people、5-For more than 8 people                                                                                                                                                                                                    | No | 1 |
| `tax_info_list ` | list[struct] | Tax information for the item. See TaxInfo structure below for details. | No | [] |


### Request Body Parameters - Modifier Groups

A group of items to be selected as a customization or additional item under a parent item.

| **Name** | **Type** | **Description** | **Required** | **Example** |
|---|---|---|---|---|
| `modifier_group_name` | string| The modifier group name to be displayed. Max length: 100 characters. If the modifier group name exceeds 100 characters, DidiFood will not block the menu update, however the modifier group name will be cut to 100 characters due to the limitation in the app display space                                                                   | Yes| Drinks|
| `app_modifier_group_id` | string | ID for the modifier group provided by the restaurant or POS. Max length: 150 characters. | Yes | 30001_01 |
| `app_external_id` | string/json | Reserved for the restaurant's use, e.g. for POS integrations. Map directly. | No | {"key":"value"} |
| `is_required` | int | Is a selection required? 1: Required; 2: Not required | No  | 1 |
| `quantity_min_permitted` | int | The minimum quantity allowed (inclusive). Map directly. Cannot be negative. | `quantity_max_permitted` | int | The maximum quantity allowed (inclusive). Map directly.  **Note:** `quantity_max_permitted` cannot be less than `quantity_min_permitted`. | No | 5               |
| `buy_mode` | int | 0: Single; 1: Multi (Multi means a customer can pick the same item multiple times).                                                       | Yes | 0  |
| `app_mg_items` | list[struct] | The `app_item_id` of the items in the modifier group. Can also receive the `price` of each item if you want to specify it. | No | 0 |


### Request Body Parameters - App_mg_items

The items to be displayed in the modifier group.

| **Name** | **Type** | **Description** | **Required** | **Example** |
|---|---|---|---|---|
| `app_item_id` | string   | The ID for the item provided by the restaurant. | Yes | Hamburguesas01 |
| `price` | int | Change the price when this item is in this modifier group. **Note:** Price is always an integer value (never decimals) because the price is set in the lowest denomination (e.g. cents for MX currency, not Peso). | No | 100 |
| `purchase_limit` | int | The maximum quantity that the consumer is allowed to purchase a certain subitem from a modifier group | No | 2 |

### Request Body Parameters - Sold_info_intl

The time span information to make an item visible.

| **Name** | **Type** | **Description** | **Required** | **Example** |
|---|---|---|---|---|
| `time`  | list[struct] | Beginning and end times when the item should be made available.  **Time format:** HH:mm. | Yes. Leave empty to specify the whole day. | {"begin":"10:00","end":"12:00"} |
| `day` | int array | Days in which the item is sold.  **Accepted values** from 1 (Monday) to 7 (Sunday).      | Yes. Leave empty if `specialDay` is specified. | [1,2,3,4,5,6,7]                 |
| `specialDay` | string array | Special rules for specific special day(s).  **Date format:** yyyy-MM-dd                  | Yes | ["2020-12-25", "2020-12-26"] |

### Request Body Parameters - tax_info_list

Detailed tax configuration for an item. It is a list of tax objects, each with a tax type and rate.  
**Validation rules**:

- If `type` is not empty, then `rate` is **required**; otherwise the whole item creation will fail with error: 
- `type` is an enum: `1` = IVA, `2` = IEPS.
- `rate` is an integer representing the tax value in basis points (e.g. 16.00% → 1600).
  - If `type = 1` (IVA), `rate` **must be 0 or 1600** (16.00%). Any other value will cause an error.
  - If `type = 2` (IEPS), `rate` **must be between 0 and 10000** (inclusive). Any other value will cause an error.
- If `type` is empty, `rate` is optional and will be ignored.

| **Name** | **Type** | **Description**  | **Required** |  **Example**  |
|---|---|---|---|---|
| `type` | int | Tax type. `1` = IVA, `2` = IEPS. | No. Required if `rate` is provided. | 1 |
| `rate` | int | Tax rate in integer (e.g. 1600 for 16.00%).  If `type=1`, must be `0` or `1600`. If `type=2`, must be between `0` and `10000`. | No. Required if `type` is not empty. |1600 |

### Request Body Parameters - Subitem images

By enabiling this function, it allows you to add images of subitems to an item. This feature enhances the visual appeal of what the consumer is adding into their choosen item by displaying each subitem that can be added, providing consumer a clearer understanding of what they will be receiving. By utilizing this function, you can boost the sales of the Stores and improve the overall user experience on DiDiFood.

To use this function is very easy, the only thing is to add the same `head_img` into each subitem. See below for an example json.

| **Name** | **Type** | **Description** | **Required** | **Example** |
|---|---|---|---|---|
| `head_img` | string | The URL for the item’s image. **Requirements:** Hosted on a secure connection (SSL); File size with less than 10MB; Min. width and height: 150px; Max. width and height: 3000px.**Formats supported:** JPEG, PNG or GIF. If there is any error in the image link, format or size, DidiFood will NOT block the menu update, however the image will not be updated. | No | https://imgurl.host/static/rlabtest/ |

> Visual effect:
>
> ![Item with subitems](https://img0.didiglobal.com/static/gstar/img/RDi6JoB49p1724313341748.jpeg)

#### Sold_info_intl Example

* From 08:00 to 20:00 on Mondays, Tuesdays and Wednesdays.
* The whole day on Saturdays and Sundays.
* From 10:00 to 12:00 and from 14:00 to 16:00 on 2020-12-20.
* The whole day on 2020-12-25.

```json
[
    {
        "time":[
            {
                "begin":"08:00",
                "end":"20:00"
            }
        ],
        "day":[
            1,
            2,
            3
        ],
        "specialDay":[

        ]
    },
    {
        "time":[

        ],
        "day":[
            6,
            7
        ],
        "specialDay":[

        ]
    },
    {
        "time":[
            {
                "begin":"10:00",
                "end":"12:00"
            },
            {
                "begin":"16:00",
                "end":"18:00"
            }
        ],
        "day":[

        ],
        "specialDay":[
            "2020-12-20"
        ]
    },
    {
        "time":[

        ],
        "day":[

        ],
        "specialDay":[
            "2020-12-25"
        ]
    }
]
```
### Request Example (for item with subitem images)
```json
{
    "auth_token":"MWM2ZDI1N2Q2ODRiNDcxZmNlM2IwNDhiMjNmNDkyNDE=",
    "menus":[
        {
            "menu_name":"menu",
            "app_menu_id":"menu",
            "app_category_ids":[
                "1"
				
            ]
        }
    ],
    "categories":[
        {
            "app_category_id":"1",
            "priority":1,
            "category_name":"Tacos",
            "app_item_ids":[
                "item_1",
                "sub_item_1",
                "sub_item_2",
                "sub_item_3",
				"item_in_mg2",
				"item2_in_mg2",
				"item3_in_mg2"
            ]
        }
    ],
    "items":[
        {
            "item_name":"Taco a tu gusto",
            "short_desc":"Delicioso Taco Buenisimo que puedes elegir a tu gusto",
            "price":100000,
            "activity_price":80000,
            "status":1,
            "priority":1,
            "app_item_id":"item_1",
            "is_sold_separately":true,
            "sold_info_intl":[
                {
                    "time":[
                        {
                            "begin":"09:00",
                            "end":"19:00"
                        }
                    ],
                    "day":[
                        1,
                        2,
                        3
                    ]
                },
                {
                    "time":[
                        {
                            "begin":"10:00",
                            "end":"18:00"
                        }
                    ],
                    "day":[
                        4,
                        5,
                        6,
                        7
                    ]
                }
            ],
            "tax_info_list":[
                {
                    "type":1,
                    "rate":1600
                }
            ],
            "app_modifier_group_ids":[
                "mg1",
				"mg2"
            ]
        },
        {
            "item_name":"Carnitas",
            "priority":2,
            "short_desc":"Carne de cerdo",
            "price":500,
            "status":1,
            "app_item_id":"sub_item_1",
            "is_sold_separately":false
        },
        {
            "item_name":"Suadero",
            "priority":3,
            "short_desc":"Carne de Res",
            "price":10000,
            "status":1,
            "app_item_id":"sub_item_2",
            "is_sold_separately":false
        },
        {
            "item_name":"Vegetariano",
            "priority":4,
            "short_desc":"Para los Veggies",
            "price":500000,
            "status":1,
            "app_item_id":"sub_item_3",
            "is_sold_separately":false
        },
        {
            "item_name":"Salsa Picante",
            "priority":5,
            "short_desc":"Hecho de chile que te hace volar",
            "price":3400,
            "status":1,
            "app_item_id":"item_in_mg2",
            "is_sold_separately":false
        },
        {
            "item_name":"Salsa Verde",
            "priority":6,
            "short_desc":"Verde verde para los que no le gustan lo picante",
            "price":3400,
            "status":1,
            "app_item_id":"item2_in_mg2",
            "is_sold_separately":true
        },
        {
            "item_name":"Chimichurri",
            "priority":7,
            "short_desc":"Para que agreques el sazon Argentino",
            "price":0,
            "status":1,
            "app_item_id":"item3_in_mg2",
            "is_sold_separately":true
        }
	],
	"modifier_groups":[
        
        {
            "modifier_group_name":"Elige tu Proteina",
            "app_modifier_group_id":"mg1",
            "is_required":1,
            "quantity_min_permitted":1,
            "quantity_max_permitted":1,
            "buy_mode":0,
            "app_mg_items":[
                {
                    "app_item_id":"sub_item_1",
                    "price":100
                },
				                {
                    "app_item_id":"sub_item_2",
                    "price":200
                },
				                {
                    "app_item_id":"sub_item_3",
                    "price":0
                }
            ]
        },
        {
            "modifier_group_name":"Elige tu Salsa",
            "app_modifier_group_id":"mg2",
            "is_required":1,
            "quantity_min_permitted":1,
            "quantity_max_permitted":3,
            "buy_mode":0,
            "app_mg_items":[
                {
                    "app_item_id":"item_in_mg2",
                    "price":0
                },
				                {
                    "app_item_id":"item2_in_mg2",
                    "price":100
                },
				                {
                    "app_item_id":"item3_in_mg2",
                    "price":200
                }
				
            ]
        }
    ]
}
```
### Request Example (without nested modifiers)

```json
{
    "auth_token":"MWM2ZDI1N2Q2ODRiNDcxZmNlM2IwNDhiMjNmNDkyNDE=",
    "menus":[
        {
            "menu_name":"menu",
            "app_menu_id":"menu",
            "app_category_ids":[
                "1",
                "2",
                "3",
                "4",
                "5"
            ]
        }
    ],
    "categories":[
        {
            "app_category_id":"cate5",
            "priority":5,
            "category_name":"cate5",
            "app_item_ids":[
                "item_1",
                "item_in_mg1"
            ]
        },
        {
            "app_category_id":"cate3",
            "priority":3,
            "category_name":"cate3",
            "app_item_ids":[
                "item_2"
            ]
        },
        {
            "app_category_id":"cate4",
            "priority":4,
            "category_name":"cate4",
            "app_item_ids":[
                "item_3",
                "item_in_mg2"
            ]
        },
        {
            "app_category_id":"cate2",
            "priority":2,
            "category_name":"cate2",
            "app_item_ids":[
                "item_4",
                "item_5",
                "item_6",
                "item_7",
                "item_8",
                "item_9",
                "item_10",
                "item_in_mg3"
            ]
        },
        {
            "app_category_id":"cate1",
            "priority":1,
            "category_name":"cate1",
            "app_item_ids":[
                "item1_has_mg",
                "item2_has_mg",
                "item2_in_mg2",
                "item_in_mg4"
            ]
        }
    ],
    "items":[
        {
            "item_name":"item_1",
            "short_desc":"",
            "price":100000,
            "activity_price":80000,
            "status":1,
            "priority":1,
            "app_item_id":"item_1",
            "is_sold_separately":true,
            "sold_info_intl":[
                {
                    "time":[
                        {
                            "begin":"09:00",
                            "end":"19:00"
                        }
                    ],
                    "day":[
                        1,
                        2,
                        3
                    ]
                },
                {
                    "time":[
                        {
                            "begin":"10:00",
                            "end":"18:00"
                        }
                    ],
                    "day":[
                        4,
                        5,
                        6,
                        7
                    ]
                }
            ],
            "tax_info_list":[
                {
                    "type":1rate,
                    "rate":1600
                }
            ],
            "app_modifier_group_ids":[
                "mg5"
            ]
        },
        {
            "item_name":"item_in_mg1",
            "priority":2,
            "short_desc":"",
            "price":500,
            "status":1,
            "app_item_id":"item_in_mg1",
            "is_sold_separately":false
        },
        {
            "item_name":"item_2",
            "priority":3,
            "short_desc":"",
            "price":10000,
            "status":1,
            "app_item_id":"item_2",
            "is_sold_separately":true
        },
        {
            "item_name":"item_3",
            "priority":4,
            "short_desc":"",
            "price":500000,
            "status":1,
            "app_item_id":"item_3",
            "is_sold_separately":true
        },
        {
            "item_name":"item_in_mg2",
            "priority":5,
            "short_desc":"",
            "price":3400,
            "status":1,
            "app_item_id":"item_in_mg2",
            "is_sold_separately":true
        },
        {
            "item_name":"item2_in_mg2",
            "priority":6,
            "short_desc":"",
            "price":3400,
            "status":2,
            "app_item_id":"item2_in_mg2",
            "is_sold_separately":true
        },
        {
            "item_name":"item_4",
            "priority":7,
            "short_desc":"",
            "price":0,
            "status":1,
            "app_item_id":"item_4",
            "is_sold_separately":true
        },
        {
            "item_name":"item_5",
            "priority":8,
            "short_desc":"",
            "price":0,
            "status":1,
            "app_item_id":"item_5",
            "is_sold_separately":true
        },
        {
            "item_name":"item_6",
            "priority":9,
            "short_desc":"ShortDesc--test",
            "price":400,
            "status":1,
            "head_img":"http://10.90.28.42:8052/static/anything/do1_VUvDUiBSqLlWz62rrTAq",
            "app_item_id":"item_6",
            "is_sold_separately":true
        },
        {
            "item_name":"item_7",
            "priority":10,
            "short_desc":"",
            "price":0,
            "status":1,
            "app_item_id":"item_7",
            "is_sold_separately":true
        },
        {
            "item_name":"item_8",
            "priority":11,
            "short_desc":"ShortDesc--test",
            "price":1200,
            "status":1,
            "head_img":"http://10.90.28.42:8052/static/anything/do1_VUvDUiBSqLlWz62rrTAq",
            "app_item_id":"item_8",
            "is_sold_separately":true,
            "app_modifier_group_ids":[
                "mg1",
                "mg3"
            ]
        },
        {
            "item_name":"item_9",
            "priority":12,
            "short_desc":"",
            "price":0,
            "status":1,
            "app_item_id":"item_9",
            "is_sold_separately":true
        },
        {
            "item_name":"item_10",
            "priority":13,
            "short_desc":"ShortDesc--test",
            "price":1200,
            "status":1,
            "head_img":"http://10.90.28.42:8052/static/anything/do1_VUvDUiBSqLlWz62rrTAq",
            "app_item_id":"item_10",
            "is_sold_separately":true
        },
        {
            "item_name":"item_in_mg3",
            "priority":14,
            "short_desc":"",
            "price":400,
            "status":1,
            "app_item_id":"item_in_mg3",
            "is_sold_separately":true
        },
        {
            "item_name":"item_in_mg4",
            "priority":15,
            "short_desc":"",
            "price":400,
            "status":1,
            "app_item_id":"item_in_mg4",
            "is_sold_separately":true
        },
        {
            "item_name":"item1_has_mg",
            "priority":16,
            "short_desc":"",
            "price":2400,
            "status":1,
            "app_item_id":"item1_has_mg",
            "is_sold_separately":true,
            "app_modifier_group_ids":[
                "mg3"
            ]
        },
        {
            "item_name":"item2_has_mg",
            "short_desc":"23",
            "price":1200,
            "status":1,
            "priority":17,
            "app_item_id":"item2_has_mg",
            "is_sold_separately":true,
            "app_modifier_group_ids":[
                "mg4"
            ]
        }
    ],
    "modifier_groups":[
        {
            "modifier_group_name":"mg2",
            "app_modifier_group_id":"mg2",
            "is_required":2,
            "quantity_min_permitted":0,
            "quantity_max_permitted":1,
            "buy_mode":0,
            "app_mg_items":[
                {
                    "app_item_id":"item_in_mg2",
                    "price":3800
                },
                {
                    "app_item_id":"item2_in_mg2",
                    "price":2000
                }
            ]
        },
        {
            "modifier_group_name":"mg4",
            "app_modifier_group_id":"mg4",
            "is_required":1,
            "quantity_min_permitted":1,
            "quantity_max_permitted":1,
            "buy_mode":0,
            "app_mg_items":[
                {
                    "app_item_id":"item_in_mg4",
                    "price":0
                }
            ]
        },
        {
            "modifier_group_name":"mg3",
            "app_modifier_group_id":"mg3",
            "is_required":1,
            "quantity_min_permitted":1,
            "quantity_max_permitted":1,
            "buy_mode":1,
            "app_mg_items":[
                {
                    "app_item_id":"item_in_mg3",
                    "price":0
                }
            ]
        },
        {
            "modifier_group_name":"mg1",
            "app_modifier_group_id":"mg1",
            "is_required":1,
            "quantity_min_permitted":1,
            "quantity_max_permitted":1,
            "buy_mode":0,
            "app_mg_items":[
                {
                    "app_item_id":"item_in_mg1",
                    "price":100
                }
            ]
        },
        {
            "modifier_group_name":"mg5",
            "app_modifier_group_id":"mg5",
            "is_required":1,
            "quantity_min_permitted":1,
            "quantity_max_permitted":1,
            "buy_mode":0,
            "app_mg_items":[
                {
                    "app_item_id":"item_in_mg1",
                    "price":200
                }
            ]
        }
    ]
}
```
### Request Example (with nested modifiers up to 4 levels)

```json
{
    "auth_token": "MDkzNzQ3ODU1MjlhNDIzNWMxMzUyYjA4YjM1ZjMzZTI=",
	"menus": [
		{
			"menu_name": "menu",
			"app_menu_id": "app_menu_id111"

		}
	],
	"categories": [
		{
			"app_category_id": "app_category_id001",
			"priority":1,
			"category_name": "app_category_id001",
			"app_item_ids": [
                "jay2_main_dish",
                "Big",
                "Small",
                "item1",
                "item2",
                "item3-1",
                "item3-2",
                "item4"
			]
		}
	],
	"items":[
        {
			"item_name": "jay2_main_dish",
			"short_desc": "Testing description",
			"price": 80000,
			"status": 1,
             "head_img":"",
            "priority": 2,
			"app_item_id": "jay2_main_dish",
            "has_wine":1,
			"is_sold_separately": true,
            "sold_info_intl": [
            	{
            		"time": [
            			{
            				"begin": "01:00",
            				"end": "08:00"
            			}
            		],
            		"day": [
            			4,
            			5
            		]
            	}
            ],
            "tax_info_list":[
                {
                    "type":0,
                    "rate":1600
                }
            ],
            "app_modifier_group_ids": [
                "Size",
                "More salt"
            ]
		},
        {
			"item_name": "Big",
			"short_desc": "",
			"price": 500,
			"status": 2,
			"app_item_id": "Big",
            "priority":3,
            "head_img":"https://img0.didiglobal.com/static/soda_public/img_875ba60d0dc3c5a932caeee8c75de74b.jpeg",
			"is_sold_separately": false
		},
		{
			"item_name": "Small",
			"short_desc": "",
			"price": 200,
			"status": 2,
			"app_item_id": "Small",
			"is_sold_separately": false
        },
		{
			"item_name": "item1",
			"short_desc": "",
			"price": 200,
			"status": 2,
			"app_item_id": "item1",
            "is_sold_separately": false,
            "app_modifier_group_ids": [
                "More salt"
            ]
        },
		{
			"item_name": "item2",
			"short_desc": "",
			"price": 200,
			"status": 2,
			"app_item_id": "item2",
            "is_sold_separately": false,
            "app_modifier_group_ids": [
                "2nd level"
            ]
		},
		{
			"item_name": "item3-1",
			"short_desc": "",
			"price": 200,
			"status": 2,
			"app_item_id": "item3-1",
            "is_sold_separately": false,
            "app_modifier_group_ids": [
                "3rd level"
            ]
        },
        {
			"item_name": "item3-2",
			"short_desc": "",
			"price": 200,
			"status": 2,
			"app_item_id": "item3-2",
			"is_sold_separately": false
        },
        {
			"item_name": "item4",
			"short_desc": "",
			"price": 200,
			"status": 2,
			"app_item_id": "item4",
			"is_sold_separately": false
        }
    ],
    "modifier_groups":[
        {
    		"modifier_group_name": "Size",
    		"app_modifier_group_id": "Size",
    		"is_required": 1,
    		"quantity_min_permitted": 1,
    		"quantity_max_permitted": 3,
    		"buy_mode": 1,
            "app_external_id":{
                            "tipo":"content",
                            "multiplicador":1
                        },
    		"app_mg_items": [
    			{
    				"app_item_id": "Big",
    				"price": 100,
                    "purchase_limit":30
    			},
    			{
    				"app_item_id": "Small",
    				"price": 200
    			}
    		]
    	},
        {
    		"modifier_group_name": "More salt",
    		"app_modifier_group_id": "More salt",
    		"is_required": 1,
    		"quantity_min_permitted": 1,
    		"quantity_max_permitted": 3,
    		"buy_mode": 0,
            "app_external_id":{
                            "tipo":"content",
                            "multiplicador":1
                        },
    		"app_mg_items": [
    			{
    				"app_item_id": "item2",
    				"price": 200,
                    "purchase_limit":30
    			}
    		]
    	},
        {
    		"modifier_group_name": "2nd level",
    		"app_modifier_group_id": "2nd level",
    		"is_required": 1,
    		"quantity_min_permitted": 1,
    		"quantity_max_permitted": 3,
    		"buy_mode": 0,
            "app_external_id":{
                            "tipo":"content",
                            "multiplicador":1
                        },
    		"app_mg_items": [
    			{
    				"app_item_id": "item3-1",
    				"price": 300,
                    "purchase_limit":30
                },
                {
    				"app_item_id": "item3-2",
    				"price": 300,
                    "purchase_limit":30
    			}
    		]
    	},
        {
    		"modifier_group_name": "3rd level",
    		"app_modifier_group_id": "3rd level",
    		"is_required": 1,
    		"quantity_min_permitted": 1,
    		"quantity_max_permitted": 3,
    		"buy_mode": 0,
            "app_external_id":{
                            "tipo":"content",
                            "multiplicador":1
                        },
    		"app_mg_items": [
    			{
    				"app_item_id": "item4",
    				"price": 400,
                    "purchase_limit":30
                }
    		]
    	}

    ]
}
```
### Request Example (with nested modifiers up to 6 levels)

```json
{
    "auth_token": "MDkzNzQ3ODU1MjlhNDIzNWMxMzUyYjA4YjM1ZjMzZTI=",
	"menus": [
		{
			"menu_name": "menu",
			"app_menu_id": "app_menu_id111"

		}
	],
	"categories": [
		{
			"app_category_id": "app_category_id001",
			"priority":1,
			"category_name": "app_category_id001",
			"app_item_ids": [
                "jay2_Main_dish1",
                "Big",
                "Small",
                "item1",
                "item2",
                "item3-1",
                "item3-2",
                "item4",
                "item5-1",
                "item5-2",
                "item6"
			]
		}
	],
	"items":[
        {
			"item_name": "jay2_Main_dish1",
			"short_desc": "Testing description",
			"price": 80000,
			"activity_price": 60000,
			"status": 1,
             "head_img":"",
            "priority": 2,
			"app_item_id": "jay2_Main_dish1",
            "has_wine":1,
			"is_sold_separately": true,
            "sold_info_intl": [
            	{
            		"time": [
            			{
            				"begin": "01:00",
            				"end": "08:00"
            			}
            		],
            		"day": [
            			4,
            			5
            		]
            	}
            ],
            "tax_info_list":[
                {
                    "type":1rate,
                    "rate":1600
                }
            ],
            "app_modifier_group_ids": [
                "Size",
                "First level"
            ]
		},
        {
			"item_name": "Big",
			"short_desc": "",
			"price": 500,
			"status": 2,
			"app_item_id": "Big",
            "priority":3,
            "head_img":"https://img0.didiglobal.com/static/soda_public/img_875ba60d0dc3c5a932caeee8c75de74b.jpeg",
			"is_sold_separately": false
		},
		{
			"item_name": "Small",
			"short_desc": "",
			"price": 200,
			"status": 2,
			"app_item_id": "Small",
			"is_sold_separately": false
        },
		{
			"item_name": "item1",
			"short_desc": "",
			"price": 200,
			"status": 2,
			"app_item_id": "item1",
            "is_sold_separately": false,
            "app_modifier_group_ids": [
                "First level"
            ]
        },
		{
			"item_name": "item2",
			"short_desc": "",
			"price": 200,
			"status": 2,
			"app_item_id": "item2",
            "is_sold_separately": false,
            "app_modifier_group_ids": [
                "2nd level"
            ]
		},
		{
			"item_name": "item3-1",
			"short_desc": "",
			"price": 200,
			"status": 2,
			"app_item_id": "item3-1",
            "is_sold_separately": false,
            "app_modifier_group_ids": [
                "3rd level"
            ]
        },
        {
			"item_name": "item3-2",
			"short_desc": "",
			"price": 200,
			"status": 2,
			"app_item_id": "item3-2",
			"is_sold_separately": false
        },
        {
			"item_name": "item4",
			"short_desc": "",
			"price": 200,
			"status": 2,
			"app_item_id": "item4",
            "is_sold_separately": false,
            "app_modifier_group_ids": [
                "4th level"
            ]
        },
        {
			"item_name": "item5-1",
			"short_desc": "",
			"price": 200,
			"status": 2,
			"app_item_id": "item5-1",
            "is_sold_separately": false,
            "app_modifier_group_ids": [
                "5th level"
            ]
        },
        {
			"item_name": "item5-2",
			"short_desc": "",
			"price": 200,
			"status": 2,
			"app_item_id": "item5-2",
			"is_sold_separately": false
        },
        {
			"item_name": "item6",
			"short_desc": "",
			"price": 200,
			"status": 2,
			"app_item_id": "item6",
			"is_sold_separately": false
        }
    ],
    "modifier_groups":[
        {
    		"modifier_group_name": "Size",
    		"app_modifier_group_id": "Size",
    		"is_required": 1,
    		"quantity_min_permitted": 1,
    		"quantity_max_permitted": 3,
    		"buy_mode": 1,
            "app_external_id":{
                            "tipo":"content",
                            "multiplicador":1
                        },
    		"app_mg_items": [
    			{
    				"app_item_id": "Big",
    				"price": 100,
                    "purchase_limit":30
    			},
    			{
    				"app_item_id": "Small",
    				"price": 200
    			}
    		]
    	},
        {
    		"modifier_group_name": "First level",
    		"app_modifier_group_id": "First level",
    		"is_required": 1,
    		"quantity_min_permitted": 1,
    		"quantity_max_permitted": 3,
    		"buy_mode": 0,
            "app_external_id":{
                            "tipo":"content",
                            "multiplicador":1
                        },
    		"app_mg_items": [
    			{
    				"app_item_id": "item2",
    				"price": 200,
                    "purchase_limit":30
    			}
    		]
    	},
        {
    		"modifier_group_name": "2nd level",
    		"app_modifier_group_id": "2nd level",
    		"is_required": 1,
    		"quantity_min_permitted": 1,
    		"quantity_max_permitted": 3,
    		"buy_mode": 0,
            "app_external_id":{
                            "tipo":"content",
                            "multiplicador":1
                        },
    		"app_mg_items": [
    			{
    				"app_item_id": "item3-1",
    				"price": 300,
                    "purchase_limit":30
                },
                {
    				"app_item_id": "item3-2",
    				"price": 300,
                    "purchase_limit":30
    			}
    		]
    	},
        {
    		"modifier_group_name": "3rd level",
    		"app_modifier_group_id": "3rd level",
    		"is_required": 1,
    		"quantity_min_permitted": 1,
    		"quantity_max_permitted": 3,
    		"buy_mode": 0,
            "app_external_id":{
                            "tipo":"content",
                            "multiplicador":1
                        },
    		"app_mg_items": [
    			{
    				"app_item_id": "item4",
    				"price": 400,
                    "purchase_limit":30
                }
    		]
    	},
        {
    		"modifier_group_name": "4th level",
    		"app_modifier_group_id": "4th level",
    		"is_required": 1,
    		"quantity_min_permitted": 1,
    		"quantity_max_permitted": 3,
    		"buy_mode": 0,
            "app_external_id":{
                            "tipo":"content",
                            "multiplicador":1
                        },
    		"app_mg_items": [
    			{
    				"app_item_id": "item5-1",
    				"price": 100,
                    "purchase_limit":30
                },
                {
    				"app_item_id": "item5-2",
    				"price": 100,
                    "purchase_limit":30
                }
    		]
    	},
        {
    		"modifier_group_name": "5th level",
    		"app_modifier_group_id": "5th level",
    		"is_required": 1,
    		"quantity_min_permitted": 1,
    		"quantity_max_permitted": 3,
    		"buy_mode": 0,
            "app_external_id":{
                            "tipo":"content",
                            "multiplicador":1
                        },
    		"app_mg_items": [
    			{
    				"app_item_id": "item6",
    				"price": 100,
                    "purchase_limit":30
                }
    		]
    	}

    ]
}

```


### Response Body Parameters

This endpoint will immediately return a **taskId**, with which you can call the **Get Menu Upload Task Info API** to check the status that will also be updated with the **uploadMenuTaskStatus webhook**.

The task detail contains the success or failed information about the creation of each item/category. 

| **Status (of the task)** | **Description** | **Additional  Info** |
|--------------------------|-----------------|-----------------|
| 0                        | waiting         ||
| 1                        | success         ||
| 2                        | failed          ||
| 3                        | waitRetry       |DiDiFood internal system is processing the tasks, therefore the retry will be performed by DiDiFood. No action is required by external parties. |
| 4                        | running         ||
| 5                        | partial success  |When the menu presents errors that will not affect the process flow of an order execution, however it is suggested to check the details with the purpose to improve the parts with error |


### Response Example if passed the first filter

```json
{
    "errno":0,
    "errmsg":"ok",
    "requestId":"20fbd1a6207a3535",
    "time":1609845642,
    "data":{
        "taskID":3458764739727720400,
        "createTime":1609845642,
        "status":0,
        "message":"waiting"
    }
}
```

### Response Example if didn't passed the first filter

```json
{
    "errno": 10001,
    "errmsg": "item name is empty, related app_item_id is KFC713_P10487",
    "requestId": "0a0f162f64dd8d858fb1d60d21d53902",
    "time": 1692241285,
    "data": {}
}
```
