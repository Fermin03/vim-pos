<!-- id=2012 path=Old Endpoint Versions > Update Item Status -->
## Update Item Status

> **NOTE:**
> This an old endpoint and a newer version of it exists. Please upgrade to the version under **Menu API**.

`POST` [https://openapi.didi-food.com/v1/item/item/updateItemStatus](https://openapi.didi-food.com/v1/item/item/updateItemStatus)

The **Update Item Status** endpoint provides the ability to update item status, making them available or unavailable in the menu.


### Request Path Parameters

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `auth_token` | string | The `auth_token` for the shop. | Yes | ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU= |


### Request Body Parameters

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `app_item_id` | string | ID for the item, provided by the restaurant or POS. Map directly. | Yes | Hamburguesas01 |
| `status` | int | Status of the item. 1: Available; 2: Unavailable. | Yes | 1   |

### Request Body Example

```json
{
    "app_item_id":"1001_001",
    "status":1
}
```

### Response Example

```json
{
    "errno":0,
    "errmsg":"ok",
    "requestId":"0a0f262b611d80b0ad29eb901dcd1702",
    "time":1629323441,
    "data":true
}
```
