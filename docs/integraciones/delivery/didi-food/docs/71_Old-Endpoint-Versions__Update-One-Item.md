<!-- id=2010 path=Old Endpoint Versions > Update One Item -->
## Update One Item

> **NOTE:**
> This an old endpoint and a newer version of it exists. Please upgrade to the version under **Food Menu API**.
> 
> It is **NOT** possible to update a promotion set with the menu with this endpoint. If you want to update a certain item promotion, please resubmit the whole menu through the corresponding 

`POST` [https://openapi.didi-food.com/v1/item/item/update](https://openapi.didi-food.com/v1/item/item/update)

The **Update One Item** endpoint gives you the ability to update one item already uploaded to a menu.

### Request Path Parameters

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `auth_token` | string | The `auth_token` for the shop. | Yes | ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU= |

### Request Body Parameters - Items

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `app_item_id` | string | All of the IDs for the items provided by the restaurant. Each `app_item_id` should be unique. | Yes | Hamburguesas01 |
| `app_external_id` | string/json | Free-form text field reserved for the restaurant's use, e.g. for POS integrations. | No  | {"key":"value"} |
| `item_name` | string | Item name to be displayed. Max length: 50 characters. | Yes | Hamburguesas |
| `short_desc` | string | An optional description for the Item. Max length: 300 characters. | No  | null |
| `sold_info_intl` | list[struct] | Sales period per day. The continuous time span during which the item is available. | No  |     |
| `additional_type` | int | 0: item;<br>1: combo. | Yes | 0 |
| `stock` | int | The inventory. The amount of the item available. | No  | 0   |
| `head_img` | string | The URL for the item’s image.<br> **Requirements:** Hosted on a secure connection (SSL); File size with less than 10MB; Min. width and height: 320px; Max. width and height: 1144px.<br> **Formats supported:** JPEG, PNG or GIF. | No  | https://imgurl.host/static/rlabtest/ |
| `price` | int | The price to charge for ordering the item. <br> **Note:** Price is always an integer value (never decimals) because the price is set in the lowest denomination (e.g. cents for MX currency, not Peso). | Yes | 100 |
| `content_with_sub_item` | list[struct] | All of the IDs for the menu categories made available. | No  | [{Extras01}, {Drinks02}] |

### Request Body Parameters - Content_with_sub_item

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `content` | struct | The content structure. | No  | {content1} |
| `sub_item_list` | list[struct] | The sub_item list. | No  | [{obj1},{obj2}] |

### Request Body Parameters - Content_with_sub_item - Content

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `content_name` | string | The content name to be displayed. Max length: 50 characters. | Yes | Drinks |
| `app_content_id` | string | ID for the content, provided by the restaurant or POS. Each `app_content_id` in the same item should be unique. | Yes. Cannot be _null_. | 30001_01 |
| `is_required` | int | Is a selection required?<br> 1: Required;<br> 2: Not required | No  | 1   |
| `quantity_min_permitted` | int | The minimum quantity allowed (inclusive). Map directly. Cannot be negative. | No  | 0   |
| `quantity_max_permitted` | int | The maximum quantity allowed (inclusive). Map directly.<br> **Note:** `quantity_max_permitted` cannot be less than `quantity_min_permitted`. | No  | 5   |
| `buy_mode` | int | 0: Single,<br> 1: Multi (Multi means a customer can pick the same item multiple times. **Only allowed on leaf nodes**). | Yes | 0   |

### Request Body Parameters - Content_with_sub_item - Sub_item_list

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `sub_item_name` | string | Sub-item name to be displayed. Max length: 50 characters. | Yes | milk |
| `app_sub_item_id` | string | ID for the subItem, provided by the restaurant or POS. Each `app_sub_item_id` in the same content should be unique. | Yes | 020723 |
| `status` | int | Status of the item:<br>1: Available;<br>2: Unavailable. | Yes | 1   |
| `price` | int | The price to charge for ordering the item.<br> **Note:** Price is always an integer value (never decimals) because the price is set in the lowest denomination (e.g. cents for MX currency, not Peso). | Yes | 100 |

### Request Example

```json
{
    "auth_token": "ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU=",
    "app_item_id": 2,
    "item_name": "Torta Ahogada",
    "additionalType": 0,
    "sold_Info_intl": {
        "time": [
            {
                "begin": "01:00",
                "end": "01:10"
            },
            {
                "begin": "10:00",
                "end": "20:00"
            },
            {
                "begin": "22:00",
                "end": "00:30"
            }
        ]
    },
    "price": 110,
    "content_with_sub_item": [
        {
            "content": {
                "app_content_id": "0",
                "content_name": "Tipo de Carne",
                "is_required": 2,
                "quantity_min_permitted": 1,
                "quantity_max_permitted": 1
            },
            "sub_item_list": [
                {
                    "app_sub_item_id": "",
                    "sub_item_name": "Tripa",
                    "status": 1,
                    "price": 10
                },
                {
                    "app_sub_item_id": "",
                    "sub_item_name": "Carnitas",
                    "status": 1,
                    "price": 10
                }
            ]
        }
    ]
}
```