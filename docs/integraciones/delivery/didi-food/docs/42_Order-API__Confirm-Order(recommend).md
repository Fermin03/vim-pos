<!-- id=1956 path=Order API > Confirm Order(recommend) -->
## Confirm Order(recommend)

`POST` [https://openapi.didi-food.com/v1/order/order/confirm](https://openapi.didi-food.com/v1/order/order/confirm)  

The **Confirm Order** endpoint allows a developer to confirm the order.  

> ATTENTION:
> We require that the order is confirmed in 5 minutes after sending the *orderNew* webhook or the order will be canceled automatically by the system. The confirmation can be done either by this endpoint or by B-App, depending on the configuration set to the store. For more details, check **Set Shop Order Confirmation Method**.

Since the `auth_token` is a crucial part for confirming the order, we recommend establishing a process for automatically refresh the `auth_token` if necessary, as described in **Get Authtoken**.

### Request Body Parameters
 
| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `auth_token` | string | The `auth_token` for the shop. | Yes | ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU= |
| `order_id` | long | The ID of the order in DiDiFood’s system. | Yes | 2352921557674426622 |

### Response Body Parameters

| **Name** | **Type** | **Description** | **Example** |
| --- | --- | --- | --- |
| `data` | bool | The result of confirming the order | true

  

### Response Example

```json
{
"errno": 0,
"errmsg": "ok",
"requestId": "22871b9405a415c6",
"time": 1568713144,
"data": true
}
```
