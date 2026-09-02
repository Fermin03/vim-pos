<!-- id=1908 path=Authorization API > Get Authtoken -->
## Get Authtoken

`GET`  [https://openapi.didi-food.com/v1/auth/authtoken/get](https://openapi.didi-food.com/v1/auth/authtoken/get)

The **Get Authtoken** endpoint will return the `auth_token` for the requested store.

The `auth_token` is generated with a random expiration date, so we suggest a constant check to see if the refresh process is necessary.

![auth_token refresh process](https://pt-starimg.didistatic.com/static/starimg/img/1Yz59RuJDT1625873949766.png)


### Request Path Parameters

| **Name** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
| `app_id` | long | Yes | The ID of an app in **our** system. | 1152921557674426642 |
| `app_secret` | string | Yes | The secret key of `app_id`. | b0919c644bddc031c59288884954cf5c |
| `app_shop_id` | string | Yes | The ID of a shop in **your** system. | 3423432 |


### Response Body Parameters

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| `app_id` | long | The ID for an app in **our** system.|
| `app_shop_id` | string | The ID of a shop in **your** system.|
| `auth_token` | string |The `auth_token` for the shop.|
| `token_expiration_time` | int | The `auth_token` expiration datetime. If the `auth_token` expires, you can create another with the **Refresh Authtoken API**. |

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
    "requestId":"228b4ae26f25664a",
    "time":1568710223,
    "data":{
        "app_id":1152921557674426642,
        "app_shop_id":"3423432127",
        "auth_token":"ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU=",
        "token_expiration_time":1570092313
    }
}
```