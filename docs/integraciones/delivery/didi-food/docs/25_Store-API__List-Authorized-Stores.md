<!-- id=1934 path=Store API > List Authorized Stores -->
## List Authorized Stores

`POST` [https://openapi.didi-food.com/v3/auth/authorization/getAuthorizedShops](https://openapi.didi-food.com/v3/auth/authorization/getAuthorizedShops)
The **Get Authorized Stores** endpoint provides the ability to get the authorized stores under the app in page.
**Note:**
- The endpoint have the limits of authority. If you couldn't invoke it, please concat with us.

### Request Body Parameters

| **Name**    | **Type** | **Description**                                                                                                 | **Required** | **Example**                      |
|-------------|----------|-----------------------------------------------------------------------------------------------------------------|--------------|----------------------------------|
| `app_id`    | int      | The ID of an app in **our** system.                                                                             | Yes          | 3458764610605350993              |
| `timestamp` | int      | Timestamp of the request.                                                                                       | Yes          | 1600334446                       |
| `sign`      | string   | Signature generated as explained above. Please refer to **`Stroe API` > `List All Stores`** endpoint.           | Yes          | 23a3170ae0104c7d1cc3061b29f1138f |
| `page_no`   | int      | The page number which you want to get. **Note:** Default value is 1.                                            | No           | 1                                |
| `page_size` | int      | The number of record which you want to get in every page. **Note:** Default value is 20, and the maximum is 50. | No           | 20                               |

### Response Body Parameters

| **Name**     | **Type**     | **Description**                                      | **Example** |
|--------------|--------------|------------------------------------------------------|-------------|
| `total_cnt`  | int          | The total number of shops be bound to the app.       | 35          |
| `total_page` | int          | The number of page.                                  | 4           |
| `page_no`    | int          | The page number which you want to get.               | 1           |
| `page_size`  | int          | The number of record which you want to get per page. | 10          |
| `shops`      | list[struct] | The ID of a shop in your system.                     |             |

### Response Body Parameters - shops

| **Name**      | **Type**     | **Description**                         | **Example**         |
|---------------|--------------|-----------------------------------------|---------------------|
| `shop_id`     | int          | ID of the store in **our** system.      | 1152921645439779073 |
| `shop_name`   | int          | The name of the store.                  | test_store          |
| `app_shop_id` | int          | ID of the store in **your** system.     | 1234                |
| `bound_flag`  | int          | The store has been bound(1) or not(0) . | 0                   |
| `shop_phone`  | list[struct] | Phones of the store.                    |                     |

### Response Body Parameters - shop_phone

| **Name**                | **Type** | **Description**                | **Example** |
|-------------------------|----------|--------------------------------|-------------|
| `phone`                 | string   | The phone number.              |             |
| `callingCode`           | string   | The calling code of the phone. |             |

### Response Example

```json
{
    "errno":0,
    "errmsg":"ok",
    "requestId":"2281991a24d4db23",
    "time":1649230331,
    "data":{
        "page_no":1,
        "page_size":20,
        "total_page":1,
        "total_cnt":2,
        "shops":[
            {
                "shop_id":1152921673202184100,
                "app_shop_id":"1234",
                "shop_name":"test_shop",
                "bound_flag":1,
                "shop_phone":[
                    {
                        "type":1,
                        "phone":"07012345678",
                        "callingCode":"+506"
                    }
                ]
            },
            {
                "shop_id":3458764614711902464,
                "app_shop_id":"123",
                "shop_name":"test_shop1",
                "bound_flag":0,
                "shop_phone":[
                    {
                        "type":0,
                        "phone":"07012345678",
                        "callingCode":"+52"
                    }
                ]
            }
        ]
    }
}
```
