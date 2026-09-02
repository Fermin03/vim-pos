<!-- id=1962 path=Order API > Handle Cancellation Requests -->
## Handle Cancellation Requests

`POST` [https://openapi.didi-food.com/v1/order/apply/cancel](https://openapi.didi-food.com/v1/order/apply/cancel)

The **Handle Cancellation Requests** endpoint lets the store agree or refuse a cancellation request done by the customer through DiDi’s Customer Service channels.

> **NOTE:**
> To use this endpoint, the store needs first to configure if it wants to receive cancellation requests. Read more in **Store API > Set Store Cancellation/Refund**.


### Request Body Parameters

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `auth_token` | string | The `auth_token` for the shop. | Yes | ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU= |
| `order_id` | long | The ID of the order in DiDiFood’s system. | Yes | 2352921557674426622 |
| `apply_id` | integer | The ID of the request sent by the _orderCancelApply_ webhook. | Yes | 1152921654813328202 |
| `agree` | bool | The response for the request. true: agree with the request; false: refuse the request | Yes | true |
| `reason` | string | An optional reason for the response. Pick on the list sent by the _orderCancelApply_ webhook. | No  |     |


### Request Example

```json
{
    "auth_token":"MWM2ZDI1N2Q2ODRiNDcxZmNlM2IwNDhiMjNmNDkyNDE=",
    "order_id":1152921650518360906,
    "apply_id":1152921650610635594,
    "agree":false,
    "reason":"already prepare"
}
```

### Response Example

```json
{
    "errno":0,
    "errmsg":"ok",
    "requestId":"1e11bfda4f8e51d1",
    "time":1628498382,
    "data":{

    }
}
```
