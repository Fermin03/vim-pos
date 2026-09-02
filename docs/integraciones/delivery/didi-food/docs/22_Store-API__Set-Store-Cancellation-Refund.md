<!-- id=1928 path=Store API > Set Store Cancellation/Refund -->
## Set Store Cancellation/Refund

`POST` [https://openapi.didi-food.com/v1/shop/apply/set](https://openapi.didi-food.com/v1/shop/apply/set)

The **Set Store Cancellation/Refund** endpoint configures if a store accepts cancellations and refunds **requested by customers** through DiDi’s Customer Service channels.

> **IMPORTANT:**
> If configured to accept cancellations and refunds from customers, we’ll send a callback of the application for the store to accept or refuse it. Read in **Handle Cancellation Requests** and **Handle Refund Requests** under Order API how to complete the settings. Check below the full flow of Cancellations and Refunds.

![Cancellation and Refund flowchart](https://pt-starimg.didistatic.com/static/starimg/img/Dh3dz5EGFg1637302845287.png)


### Request Body Parameters

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `auth_token` | string | The `auth_token`for the shop. | Yes | ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU= |
| `receive_cancel_apply` | integer | 0: Not support cancellation; 1: Support cancellation; **Note:** When set to support, we will send a callback in webhook with type _orderCancelApply_ for the store to accept it or not. We will refuse the request by default after 10 min if you do not handle it. | Yes | 0   |
| `receive_refund_apply` | integer | 0: Not support refund; 1: Support refund; **Note:** When set to support, we will send a callback in webhook with type _orderRefundApply_ for the store to accept it or not. When set to support, we will agree to refund after 24 hour if you do not handle it. | Yes | 0   |

### Request Example

```json
{
    "auth_token":"MWM2ZDI1N2Q2ODRiNDcxZmNlM2IwNDhiMjNmNDkyNDE=",
    "receive_cancel_apply":1,
    "receive_refund_apply":1
}
```

### Response Example

```json
{
    "errno":0,
    "errmsg":"ok",
    "requestId":"cd3fc0e32fba3c55",
    "time":1629446984,
    "data":{

    }
}
```
