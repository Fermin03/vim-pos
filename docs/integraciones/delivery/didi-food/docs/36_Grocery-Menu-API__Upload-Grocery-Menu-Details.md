<!-- id=2056 path=Grocery Menu API > Upload Grocery Menu Details -->
## Grocery Menu API

`POST` [https://openapi.didi-food.com/v3/item/item/uploadGrocery](https://openapi.didi-food.com/v3/item/item/uploadGrocery )

The **Upload Grocery Menu Details** endpoint updates, merges or overwrites an existing catalogue/menu with an async task in the background.

> **IMPORTANT:**  This system allows for two levels of nested categories. If a category already contains subcategories (level 2), the top-level category (level 1) cannot have items directly within it. In other words, on the same level within a category, you can either have subcategories or items, but not both.

> **ATTENTION:**  We will transport **ONLY** `app_item_id`,  `app_external_id`  to an order.

### Request Body Parameters - Level 1

This is the first level of the menu configuration for a grocery.

|Name|Type|Description|Required|Example|
|---|---|---|---|---|
|`auth_token`|string|The auth_token for the shop|Yes|ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU=|
|`menus`|list[struct]|A list of catalogue/menu. Currently, only one catalogue/menu is supported. Multiple catalogue/menu will be mapped to 1 |Yes|[{menu1}]|
|`categories`|list[struct]|A list of the Grocery’s catalogue/menu categories Maximum of categories is 30. Maximum of items per category is 100. Supports up to 2 levels of classification|Yes|[{"app_category_id":"cate1","category_name":"cate1","app_item_ids":[],"sub_category_ids":["cate2"]},{"app_category_id":"cate2","category_name":"cate2","app_item_ids":["item_1"],"sub_category_ids":[]}]|
|`items`|list[struct]|List of the grocery’s items. Each item must belong to one category. Maximum of items is 3000.|Yes|[{item1}, {item2}]|
|`merge_policy`|int|Merge content to existing catalogue/menu: 0; Overwrite current catalogue/menu: 1|No|1|

### Request Body Parameters - Menus

The identifiers of different catalogue/menus.

|Name|Type|Description|Required|Example|
|---|---|---|---|---|
|`app_menu_id`|string|ID for the catalogue/menu, provided by the Store or POS. currently only one catalogue/menu supported.|Yes|menuID01|
|`menu_name`|string|catalogue/menu name to be displayed. Map directly. Max length: 100 characters|Yes|Main catalogue/menu|

### Request Body Parameters - Categories

You can create categories for types of dishes, drinks and deserts, for example.

|Name|Type|Description|Required|Example|
|---|---|---|---|---|
|`app_category_id`|string|ID for the category, provided by the Grocery. Map directly.|Yes|Hamburguesas01|
|`category_name`|string|The category name to be displayed. Map directly. Max length: 28 characters. exceeding the limit may result in an incomplete display.|Yes|Hamburguesas|
|`app_item_ids`|list[string]|All of the IDs for the items provided by the Grocery. The sequence of the items is shown in the same sequence. Each app_item_id should be unique.|No|["cola01", "wine02"]|
|`sub_category_ids`|list[string]|The list of categories that are subsidiary to this category .|No|["cate2","cate3"]|

> **ATTENTION:**  Subcategories and items which are directly bound to the parent-category cannot exist at the same time. In other words, items cannot be directly bound to a category when the category has its subcategory.

### Request Body Parameters - Items

Individual objects that can be ordered and configured to be visible in specific days, times and special dates.

> **Promotion Setting with the Catalogue/Menu  Upload**
> 
> Promotions is a very important tool that can help to boost sales and obtain more attention from the users in the APP. With the purpose to provide a more efficient manner to set promotions, DiDiFood is providing a promo setting feature available from Sept. 8th, 2023 for the store to set up promotions directly from the catalogue/menu by providing a non-mandatory key `activity_price`
> 
> Visual effect:
>
> ![After setting promotion](https://img0.didiglobal.com/static/gstar/img/FChZ1urkwr1724313254813.png)
> 
> **Important**:
> * The structure for activity_price is non-mandatory. However, if you choose not to configure any promotion, please refrain from sending this key or provide it with a value of 'Null' to prevent any misunderstandings. DiDiFood does not recognize '0' as a valid value for this key.
> * In cases where activity_price exceeds the price, DiDiFood will interpret that no promotion is applied to the item.
> * The difference between the price and activity_price must be equal to or greater than 1%.
> * Promotions are **NOT** permitted for items tagged as with Tabacco.
> * Prior to configuring a promotion through this API method, any existing promotions set in B-App or through DiDiFood's internal system must be canceled.
> * In the event that an item with a previous promotion configured in B-App or through DiDiFood's internal system undergoes a change in price, the price will be updated, but the previously configured promotion will continue to be effective for users based on the new price set.
> * To delete or modify a promotion (which was previously set through API), simply adjust the values of price and activity_price, and then submit the updated catalogue/menu through this API. It is **NOT** possible to delete or modify a promotion of an item which promotion that was set in B-App or through DiDiFood's internal system.
> * All promotions established through this method are fully assumed by the store/brand. Therefore, it is crucial to have the necessary permissions granted in the operational interface. Under no circumstances may the store/brand make claims against DiDiFood for the promotions set using this method.

|Name|Type|Description|Required|Example|
|---|---|---|---|---|
|`app_item_id`|string|All of the IDs for the items provided by the Store. Each app_item_id should be unique for each item |Yes|Hamburguesas01|
|`upc`|string|The barcode or UPC of the item. This field is extremely important as DiDiFood uses it to map the corresponding items in our item database. Max 14 digits|Yes|Hamburguesas01|
|`app_external_id`|string/json|Free-form text field reserved for the Grocery's use, e.g. for Grocery integrations Info|No|{"key":"value"}|
|`item_name`|string|Item name to be displayed. Max length: 50 characters.|Yes|Hamburguesas|
|`short_desc`|string|An optional description for the Item. Max length: 400 characters.|No|null|
|`sold_info_intl`|list[struct]|Sales period per day. The continuous time span during which the item is available. Check below for more details.|No||
|`head_img`|string|The URL for the item’s image. Requirements: Hosted on a secure connection (SSL); File size with less than 10MB; Min. width and height: 150px; Max. width and height: 3000px. Formats supported: JPEG, PNG|No|https://imgurl.host/static/rlabtest/|
|`price`|int|The price to charge for ordering the item. Note: Price is always an integer value (never decimals) because the price is set in the lowest denomination (e.g. cents for MX currency, not Peso).|Yes|100|
| `activity_price`  | int | Is the discounted price that will be charged to the user. **Note:** Price is always an integer value (never decimals) because the price is set in the lowest denomination (e.g. cents for MX currency, not Peso). For more details please see above in promotion setting notes| No| 80 |
|`item_tags`|list[int]|The tags of the item. 1 TOBACCO 2 WINE 4 SEX PRODUCT (e.g. "1", "2","4")|No|[1]|
|`status`|int|Status of the item to be shown in C-App. 1: Available; 2: Unavailable|Yes|1|
| `tax_info_list` | list[struct] | Tax information for the item. See TaxInfo structure below for details. | No | [] |

### Request Body Parameters - Sold_info_intl

The time span information to make an item visible.

| **Name** | **Type** | **Description** | **Required** | **Example** |
|---|---|---|---|---|
| `time`  | array | Beginning and end times when the item should be made available.  **Time format:** HH:mm. | Yes. Leave empty to specify the whole day. | {"begin":"10:00","end":"12:00"} |
| `day` | array | Days in which the item is sold.  **Accepted values** from 1 (Monday) to 7 (Sunday).      | Yes. Leave empty if `specialDay` is specified. | [1,2,3,4,5,6,7]                 |
| `specialDay` | array | Special rules for specific special day(s).  **Date format:** yyyy-MM-dd                  | No | ["2020-12-25", "2020-12-26"] |

### Request Body Parameters - tax_info_list

Detailed tax configuration for an item. It is a list of tax objects, each with a tax type and rate.  
**Validation rules**:

- If `taxType` is not empty, then `taxRate` is **required**; otherwise the whole item creation will fail with error: 
- `taxType` is an enum: `1` = IVA, `2` = IEPS.
- `taxRate` is an integer representing the tax value in basis points (e.g. 16.00% → 1600).
  - If `taxType = 1` (IVA), `taxRate` **must be 0 or 1600** (16.00%). Any other value will cause an error.
  - If `taxType = 2` (IEPS), `taxRate` **must be between 0 and 10000** (inclusive). Any other value will cause an error.
- If `taxType` is empty, `taxRate` is optional and will be ignored.

| **Name** | **Type** | **Description**  | **Required** |  **Example**  |
|---|---|---|---|---|
| `type` | int | Tax type. `1` = IVA, `2` = IEPS. | No. Required if `taxRate` is provided. | 1 |
| `rate` | int | Tax rate in integer (e.g. 1600 for 16.00%).  If `taxType=1`, must be `0` or `1600`. If `taxType=2`, must be between `0` and `10000`. | No. Required if `taxType` is not empty. |1600 |

#### Sold_info_intl Example

-   From 08:00 to 20:00 on Mondays, Tuesdays and Wednesdays.
-   The whole day on Saturdays and Sundays.
-   From 10:00 to 12:00 and from 14:00 to 16:00 on 2020-12-20.
-   The whole day on 2020-12-25.

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
### Complete Request Example
```json
{
  "auth_token": "Y2MyMzNhOThhNzYyMGQ3M2M1NTM0ZDlhY2RmYzM3NGE=",
  "menus": [
    {
      "menu_name": "Grocery_sample_1",
      "app_menu_id": "Grocery DiDiFood Sample",
      "app_category_ids": [
        "Cate_Grocery_1",
        "Cate_Grocery_2"]
    }
  ],
  "categories": [
    {
      "app_category_id": "Cate_Grocery_1",
      "category_name": "Bebidas",
      "app_item_ids": [
        "sample_item_1",
        "sample_item_2",
        "sample_item_3"
      ]
    },
    {
      "app_category_id": "Cate_Grocery_2",
      "category_name": "Comida Refrigerada",
      "app_item_ids": [
        "sample_item_4",
        "sample_item_5",
        "sample_item_6"
      ]
    }
  ],
  "items": [
    {
      "item_name": "Coca Cola 355ml",
      "upc": "12345",
      "short_desc": "Sweet black coca drink in can of 355ml",
      "price": 1000,
      "activity_price": 800,
      "status": 1,
      "head_img": "http://10.14.128.20:8002/static/soda_public/img_20d753636d0a36364e6b43507389b58c.jpg",
      "app_item_id": "sample_item_1",
      "sold_info_intl": [
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
      "item_tags": [],
	  "tax_info_list":[
			{
				"type":1,
				"rate":1600
			}
		]
    },
    {
      "item_name": "Sprite 355ml",
      "upc": "23456",
      "short_desc": "Sweet white lemon flavored drink in can of 355ml",
      "price": 2000,
      "activity_price": 1900,
      "status": 2,
      "app_item_id": "sample_item_2",
      "head_img": "http://10.14.128.20:8002/static/soda_public/img_20d753636d0a36364e6b43507389b58c.jpg",
      "sold_info_intl": [],
      "item_tags": []
    },
    {
      "item_name": "Corona 355ml",
      "upc": "34567",
      "short_desc": "Corona branded beer in can 355ml",
      "price": 4000,
      "status": 1,
      "app_item_id": "sample_item_3",
      "head_img": "http://10.14.128.20:8002/static/soda_public/img_20d753636d0a36364e6b43507389b58c.jpg",
      "sold_info_intl": [],
      "item_tags": [1]
    },
    {
      "item_name": "Rib Eye",
      "upc": "45678",
      "short_desc": "1 Pc Fresh Rib Eye",
      "price": 10000,
      "status": 1,
      "head_img": "http://10.14.128.20:8002/static/soda_public/img_20d753636d0a36364e6b43507389b58c.jpg",
      "app_item_id": "sample_item_4",
      "sold_info_intl": [],
      "item_tags": []
    },
    {
      "item_name": "T-bone",
      "upc": "56789",
      "short_desc": "2 Pc Fresh T-bone",
      "price": 35000,
      "status": 1,
      "head_img": "http://10.14.128.20:8002/static/soda_public/img_20d753636d0a36364e6b43507389b58c.jpg",
      "app_item_id": "sample_item_5",
      "sold_info_intl": [],
      "item_tags": []
    },
    {
      "item_name": "Cowboy",
      "upc": "78901",
      "short_desc": "3 Pc Fresh Cowboy",
      "price": 60000,
      "status": 1,
      "head_img": "http://10.14.128.20:8002/static/soda_public/img_20d753636d0a36364e6b43507389b58c.jpg",
      "app_item_id": "sample_item_6",
      "sold_info_intl": [],
      "item_tags": []
    }
  ],
  "merge_policy": 1
}
```
### Response Body Parameters

This endpoint will immediately return a **taskId**, with which you can call the **Get Grocery Menu Upload Task Info(recommend)** to check the status that will also be updated with the **uploadGroceryMenuTaskStatus**.

The task detail contains the success or failed information about the creation of each item/category. 

| **Status (of the task)** | **Description** | **Additional  Info** |
|--------------------------|-----------------|-----------------|
| 0                        | waiting         ||
| 1                        | success         ||
| 2                        | failed          ||
| 3                        | waitRetry       |DiDiFood internal system is processing the tasks, therefore the retry will be performed by DiDiFood. No action is required by external parties. |
| 4                        | running         ||
| 5                        | partial success  |When the catalogue/menu presents errors that will not affect the process flow of an order execution, however it is suggested to check the details with the purpose to improve the parts with error |

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
