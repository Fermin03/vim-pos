<!-- id=1918 path=Store API > Set Store Order Confirmation Method -->
## Set Store Order Confirmation Method

`POST` [https://openapi.didi-food.com/v1/shop/shop/setconfirmmethod](https://openapi.didi-food.com/v1/shop/shop/setconfirmmethod)

This API allows the developer to set **how the store will send confirmation** of an order.

If set to **OpenAPI**, the acceptance or cancelation of an order will be done with the **system integrated**. To do so, check the **Confirm Order** and **Cancel Order** endpoints.

When set to **B-App**, orders can be accepted or canceled using **DiDiFood Store app or the system integrated**. But note that, in order to accept with your system in this case, our app needs to be open/online.

When a store is unbound, we **automatically set the confirmation method to B-App**.


### Request Body Parameters

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `auth_token` | string | The `auth_token` for the shop. | Yes | ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU= |
| `order_confirm_method` | int | 1: B-App;  2: OpenAPI | Yes | 1   |

### Response Body Parameters

| **Name** | **Type** | **Description** | **Example** |
| --- | --- | --- | --- |
| `order_confirm_method` | bool | The result of setting the `order_confirm_method`. | true |

### Request Example

```json
{
    "auth_token":"ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU=",
    "order_confirm_method":1
}
```

### Response Example

```json
{
    "errno":0,
    "errmsg":"ok",
    "requestId":"2281991a24d4db7d",
    "time":1568711984,
    "data":{
        "order_confirm_method":true
    }
}
```