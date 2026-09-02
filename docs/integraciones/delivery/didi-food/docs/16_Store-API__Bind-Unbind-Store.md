<!-- id=1916 path=Store API > Bind/Unbind Store -->
## Bind/Unbind Store

The **Bind a Store** and **Unbind a Store** endpoints give you the ability to bind or unbind a store to your app when needed, without having to ask it for DiDi’s team.

> **IMPORTANT:**
> If you are developing the integration for a POS, you might want to check the **Authorization API > Get Authorization Web Page** documentation. For binding stores in batches, check the steps in **Tools Introduction > Store Management**.


### Bind Store

`POST` [https://openapi.didi-food.com/v3/auth/authorization/shopBind](https://openapi.didi-food.com/v3/auth/authorization/shopBind)
The **Bind Store** endpoint provides the ability to bind 50 stores at the same time.   
**Note:**  
- The endpoint have the limits of authority. If you couldn't invoke it, please concat with us.
- If you want to bind stores to official app, you should get the authorization of shop at first(please refer to the `Tools Introduction` > `Store Management` documentation).
- The official shop can only be bound to official app, and the test shop can only be bound to test shop. 

### Request Body Parameters

| **Name**     | **Type**      | **Description**                                                                                       | **Required** | **Example**                      |
|--------------|---------------|-------------------------------------------------------------------------------------------------------|--------------|----------------------------------|
| `app_id`     | int           | The ID of an app in **our** system.                                                                   | Yes          | 3458764610605350993              |
| `timestamp`  | int           | Timestamp of the request.                                                                             | Yes          | 1600334446                       |
| `sign`       | string        | Signature generated as explained above. Please refer to **`Stroe API` > `List All Stores`** endpoint. | Yes          | 23a3170ae0104c7d1cc3061b29f1138f |
| `shop_infos` | list[struct]  | Shops that you want to bind. **Note:** Supported maximum of `shop_infos` is 50.                       | Yes          |                                  |

### Request Body Parameters - shop_infos

| **Name**      | **Type**      | **Description**                                                                                                                                                                                                                       | **Required** | **Example**         |
|---------------|---------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|---------------------|
| `shop_id`     | int           | ID of the store in **our** system. **Note:** Couldn't be duplicate and blank. And the shop couldn't be bound when you invoke this endpoint. You can get this field in `Get Authorized Stores` endpoint at the bottom of current page. | Yes          | 1152921645439779073 |
| `app_shop_id` | int           | The ID of a shop in **your** system. **Note:** Couldn't be duplicate and blank.                                                                                                                                                       | Yes          | 001                 |

### Response Body Parameters

| **Name**       | **Type**     | **Description**                      | **Example**         |
|----------------|--------------|--------------------------------------|---------------------|
| `failure_list` | list[struct] | ID of the store in **our** system.   | 1152921645439779073 |
| `success_list` | list[struct] | The ID of a shop in **your** system. | 001                 |

### Response Body Parameters - failure_list

| **Name**      | **Type** | **Description**                      | **Example**                        |
|---------------|----------|--------------------------------------|------------------------------------|
| `shop_id`     | int      | ID of the store in **our** system.   | 1152921645439779073                |
| `app_shop_id` | int      | The ID of a shop in **your** system. | 001                                |
| `reason`      | string   | The reason why bind shop failed.     | app_shop_id couldn't be duplicate. |

### Response Body Parameters - failure_list

| **Name**                 | **Type** | **Description**                               | **Example**                                  |
|--------------------------|----------|-----------------------------------------------|----------------------------------------------|
| `shop_id`                | int      | ID of the store in **our** system.            | 1152921645439779073                          |
| `app_shop_id`            | int      | The ID of a shop in **your** system.          | 001                                          |
| `auth_token`             | string   | The auth_token for the shop.                  | ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU= |
| `token_expiration_time`  | int      | Timestamp of the expire time of `auth_token`. | 1648685070                                   |

### Response Example

```json
{
  "failure_list":[
    {
      "app_shop_id":"1234",
      "reason":"app_shop_id couldn't be duplicate",
      "shop_id":1152921673202184100
    },
    {
      "app_shop_id":"1234",
      "reason":"app_shop_id couldn't be duplicate",
      "shop_id":1152921673202184101
    }
  ],
  "success_list":[
    {
      "app_shop_id":"123",
      "auth_token":"NGQyYWVlYmNkZTQ1NGI2Y2YxOTI5OGVkZWJhMGM0ODI=",
      "shop_id":3458764614711902464,
      "token_expiration_time":1648685070
    }
  ]
}
```

### Unbind a Store

`POST` [https://openapi.didi-food.com/v1/shop/shop/unbind](https://openapi.didi-food.com/v1/shop/shop/unbind) 

### Request Body Parameters

| **Name**     | **Type** | **Description**                | **Required** | **Example**                                  |
|--------------|----------|--------------------------------|--------------|----------------------------------------------|
| `auth_token` | string   | The `auth_token` for the shop. | Yes          | ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU= |


### Response Example

```json
{
    "errno":0,
    "errmsg":"ok",
    "requestId":"1fc5ad3e151d3a11",
    "time":1623320367,
    "data":true
}
```

