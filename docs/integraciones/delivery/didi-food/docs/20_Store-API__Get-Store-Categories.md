<!-- id=1924 path=Store API > Get Store Categories -->
## Get Store Categories

`POST` [https://openapi.didi-food.com/v1/shop/shop/validCategories](https://openapi.didi-food.com/v1/shop/shop/validCategories)

The **Get Shop Categories** endpoint brings all valid categories a developer can use when updating a store basic information.

### Request Body Parameters

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `auth_token` | string | The `auth_token` for the shop. | Yes | ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU= |

### Response Example

```json
{
    "errno":0,
    "errmsg":"ok",
    "requestId":"ccda771f25ad9a84",
    "time":1623996528,
    "data":{
        "categories":[
            {
                "id":"200001545088714",
                "name":"Alcohol"
            },
            {
                "id":"20000897046510",
                "name":"Alitas & Pollo"
            }
        ]
    }
}
```
