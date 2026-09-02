<!-- id=1948 path=Food Menu API > Update Modifier Group -->
## Update Modifier Group

`POST`  [https://openapi.didi-food.com/v3/item/item/updateModifierGroup](https://openapi.didi-food.com/v3/item/item/updateModifierGroup)

The **Update Modifier Group** endpoint provides the a way to update a modifier group and its items.


### Request Body Parameters 

The root-level to specify modifiers that can be associated to an item.

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `auth_token` | string | The `auth_token` for the shop | Yes | ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU= |
| `modifier_group_name` | string | The modifier group name to be displayed. Max length: 100 characters. | Yes | Drinks |
| `app_modifier_group_id` | string | ID for the modifier group provided by the restaurant or POS. Max length: 150 characters. | Yes | 30001_01 |
| `app_external_id` | string/json | Reserved for the restaurant's use, e.g. for POS integrations. Map directly. | No  | {"key":"value"} |
| `is_required` | int | Is a selection required? 1: Required; 2: Not required | No  | 1   |
| `quantity_min_permitted` | int | The minimum quantity allowed (inclusive). Map directly. Cannot be negative. | No  | 0   |
| `quantity_max_permitted` | int | The maximum quantity allowed (inclusive). Map directly.  **Note:** `quantity_max_permitted` cannot be less than `quantity_min_permitted`. | No  | 5   |
| `buy_mode` | int | 0: Single; 1: Multi (Multi means a customer can pick the same item multiple times). | Yes | 0   |
| `app_mg_items` | list[struct] | The `app_item_id` of the items in the modifier group. Can also receive the `price` of each item if you want to specify it. | No | 0 |


### Request Body Parameters - App_mg_items

The items to be displayed in the modifier group.

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `app_item_id` | string | The ID for the item provided by the restaurant. | Yes | Hamburguesas01 |
| `price` | int | Change the price when this item is in this modifier group.  **Note:** Price is always an integer value (never decimals) because the price is set in the lowest denomination (e.g. cents for MX currency, not Peso). | No | 100 |

### Request Example

```json
{
    "auth_token":"MWM2ZDI1N2Q2ODRiNDcxZmNlM2IwNDhiMjNmNDkyNDE=",
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
}
```

### Response Example

```json
{
    "errno":0,
    "errmsg":"ok",
    "requestId":"1e0767f77b1219cd",
    "time":1627543538,
    "data":{

    }
}
```