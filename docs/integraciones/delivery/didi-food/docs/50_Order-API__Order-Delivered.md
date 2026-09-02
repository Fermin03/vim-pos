<!-- id=2028 path=Order API > Order Delivered -->
## Order Delivered

`POST`| `GET`  [https://openapi.didi-food.com/v1/order/order/delivered](https://openapi.didi-food.com/v1/order/order/delivered)

The **Order Delivered** endpoint allows the developer to indicate that the delivery has been completed. **Only used for self-delivery orders**.

### Request Body Parameters

| **Name**     | **Type** | **Description**                           | **Required** | **Example**                                  |
| ------------ | -------- | ----------------------------------------- | ------------ | -------------------------------------------- |
| `auth_token` | string   | The `auth_token` for the shop.            | Yes          | ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU= |
| `order_id`   | long     | The ID of the order in DiDiFood’s system. | Yes          | 2352921557674426622                          |

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
