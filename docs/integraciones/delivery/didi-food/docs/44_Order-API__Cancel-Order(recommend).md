<!-- id=1958 path=Order API > Cancel Order(recommend) -->
## Cancel Order(recommend)

`POST` [https://openapi.didi-food.com/v1/order/order/cancel](https://openapi.didi-food.com/v1/order/order/cancel)

The **Cancel Order** endpoint allows a developer to cancel an order.

### Request Body Parameters

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `auth_token` | string | The `auth_token` for the shop. | Yes | ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU= |
| `order_id` | long | The ID of the order in DiDiFood’s system. | Yes | 2352921557674426622 |
| `reason_id` | int | The ID of the reason for canceling the order. **Allowed values to be chosen from:** Please see below -- reason_id params list for reference | Yes | 1030 |
| `reason` | string | An optional field to add more details of the cancellation. | No  |     |

#### reason_id List ####
| reason_id | Description |
|--|--|
|1010|Item sold out|
|1020|Store closed|
|1030|The shop is too busy to prepare a meal|
|1040|Unable to prepare a meal due to water or power outages|
|1050|Cancellation due to/asked by customer|
|1060|No rider for delivery. Only self-delivery store can select [No rider for delivery]|
|1080|Other reason|

### Response Body Parameters

| **Name** | **Type** | **Description** | **Example** |
| --- | --- | --- | --- |
| `data` | bool | The result of canceling the order | true |

### Response Example

```json
{
    "errno":0,
    "errmsg":"ok",
    "requestId":"22871b9405a415c6",
    "time":1568713144,
    "data":true
}
```
