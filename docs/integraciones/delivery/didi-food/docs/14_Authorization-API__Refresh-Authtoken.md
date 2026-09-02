<!-- id=1910 path=Authorization API > Refresh Authtoken -->
## Refresh Authtoken

`GET`  [https://openapi.didi-food.com/v1/auth/authtoken/refresh](https://openapi.didi-food.com/v1/auth/authtoken/refresh)

The **Refresh Authtoken** endpoint will refresh the `auth_token` for the requested store when it has passed the expiration date. After that refreshing it, you will need to get it again using the **Get Authtoken API**.

> **NOTE:**
> The API has a cool-down time of two minutes. It won't generate a new token until two minutes after the first request.

### Request Path Parameters

| **Name** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
| `app_id` | long | Yes | The ID of an app in **our** system. | 9764699999123456789 |
| `app_secret` | string | Yes | The secret key of `app_id`. | b0919c644bddc031c59288884954cf5c |
| `app_shop_id` | string | Yes | The ID of a shop in **your** system. | 342343227 |

### Response Errors (errno) Descriptions

| **Code** | **Description** |
| --- | --- |
| 10002 | Parameter error. |
| 10100 | Get `auth_token` failed. |
| 10101 | This shop does not have `auth_token`. |
| 10102 | `auth_token` has expired. Please refresh it. |
| 14103 | Get app failed. |
| 14105 | `app_id` does not exist. |
| 14106 | `app_secret` is wrong. |

### Response Example

```json
{
    "errno":0,
    "errmsg":"ok",
    "requestId":"228bce6a34f3cf6e",
    "time":1568710550,
    "data":true
}
```