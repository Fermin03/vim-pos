<!-- id=2026 path=Order API > Order Ready -->
## Order Ready

`POST`| `GET`  [https://openapi.didi-food.com/v1/order/order/ready](https://openapi.didi-food.com/v1/order/order/ready)

The **Order Ready** endpoint allows the developer to indicate that the meal is prepared. This endpoint can help us to get the real time of preparing the meal, which will be used to optimize our delivery scheme.

### Request Body Parameters

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `auth_token` | string | The `auth_token` for the shop. | Yes | ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU= |
| `order_id` | long | The ID of the order in DiDiFood’s system. | Yes | 2352921557674426622 |

### Response Example

```json
{
    "errno":0,
    "errmsg":"ok",
    "requestId":"22871b9405a415c6",
    "time":1568713144,
    "data":{

    }
}
```
