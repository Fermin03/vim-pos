<!-- id=2050 path=Stock API > Update One Store Stock -->
## Stock API

> **ATTENTION:** 
> * This is function is **only available for Grocery Stores** (such as convenience stores, supermarket, etc) and **NOT** available for restaurants. If you are using this Stock API, please communicate with DiDiFood OpenAPI team.
> * The **Stock API** endpoint gives you the ability to update the stock available for a certain item in a certain store. By using this function, DiDiFood will set the maximum purchase quantity within the available stock of a certain item in the store, reducing the amount of order cancellations from the store due to unavailable stock.
> * For a more clear explanation: Store stock for Coke -- 10 items Consumer can only order <= 10 Cokes in DiDiFood.
> * **Endpoint limitations: Once per store every 1 minutes.


### Basic Information

| **Name** | **Description** |
| --- | --- |
| `URL` | [https://openapi.didi-food.com/v1/item/item/setstockSync](https://openapi.didi-food.com/v1/item/item/setstockSync) |
| `Method` | POST |
| `Permission` | Available |


### Request Path Parameters

| **Name** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
 | `auth_token`  | string  | Yes  | The auth_token for the shop.  | ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU=  |
 | `stock_list`  | list[struct]  | Yes  | The item stock list.  | [{"app_item_id":"Hamburguesas01","stock":10}]  |

### Request Body Parameters - Stock List

| **Name** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
 | `app_item_id`  | string  | Yes  | he unique ID for a certain item in the integrator/store system  | Hamburguesas01  |
 | `stock`  | int  | Yes  | The item stock  | 10  |



### Response Body Parameters - taskID

| **Name** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
 | `success`  | list  | No  | List of successful item IDs. | "success":["item_1"] |
 | `failed`  | list  | No  | List of failed item IDs and failed reasons . | "failed":[{"item_2":"failed Reason"}] |



### Request Example
```json
{
    "auth_token":"MWM2ZDI1N2Q2ODRiNDcxZmNlM2IwNDhiMjNmNDkyNDE=",
    "stock_list":[
        {
            "app_item_id":"Hamburguesas01",
            "stock":10
        },
        {
            "app_item_id":"Hamburguesas02",
            "stock":20
        }
    ]
}
```

### Response Example

```json
Succesful setstockSync:
{
    "errno":0,
    "errmsg":"ok",
    "requestId":"cd0514a30d721dd2",
    "time":1627612911,
    "data":{
        "success":[
            "item_1"
        ],
        "failed":[
            {"item_2":"failed Reason"}
        ]
    }
}

Error in the setstockSync:
Case 1:Request parameters are not valid If this error is returned, it is recommended to check whether the parameter is json

{
    "errno": 10001,
    "errmsg": "Internal System Error",
    "requestId": null,
    "time": 1664367657,
    "data": {}
}
{
    "errno": 10002,
    "errmsg": "Request parameters are not valid",
    "requestId": "0a0f12116333f32c7892d6da380e3e02",
    "time": 1664348972,
    "data": {}
}
Case 2: The stock List does not exist
{
    "errno": 13408,
    "errmsg": "The stock List does not exist",
    "requestId": "0a0f12116333f32c7892d6da380e3e02",
    "time": 1664348972,
    "data": {}
}
Case 3: The app_item_id does not exist
{
    "errno": 13409,
    "errmsg": "The app_item_id does not exist",
    "requestId": "0a0f12116333f32c7892d6da380e3e02",
    "time": 1664348972,
    "data": {}
}
Case 4: The stock  does not exist
{
    "errno": 13410,
    "errmsg": "The stock  does not exist",
    "requestId": "0a0f12116333f32c7892d6da380e3e02",
    "time": 1664348972,
    "data": {}
}
Case 5: The stock field type must be int
{
    "errno": 13411,
    "errmsg": "The stock field type must be int",
    "requestId": "0a0f12116333f32c7892d6da380e3e02",
    "time": 1664348972,
    "data": {}
}
Case 6: There are no dishes to update in the store
{
    "errno":10001,
    "errmsg":" No need to update",
    "requestId":"0a0f130d633237297ebb73b41f9f9702",
    "time":1664235305,
    "data":{}
}
Case 7:The maximum length of the stock_list cannot exceed 2000
{
    "errno":13414,
    "errmsg":"The maximum length of the stock_list cannot exceed 2000",
    "requestId":"0a0f130d633237297ebb73b41f9f9702",
    "time":1664235305,
    "data":{}
}
```