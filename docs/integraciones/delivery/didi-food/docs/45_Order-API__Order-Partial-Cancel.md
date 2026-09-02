<!-- id=2073 path=Order API > Order Partial Cancel -->
## Order Partial Cancel

the merchant should use this endpoint  to cancel the order partially


### Basic Information

| **Name** | **Description** |
| --- | --- |
| `URL` | [https://openapi.didi-food.com/v3/order/operate/partialCancel](https://openapi.didi-food.com/v3/order/operate/partialCancel) |
| `Method` | POST |
| `Permission` | Available |


### Request Body Parameters

| **Name** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
 | `Name`  | Type  | Required  | Description  | Example  |
 | `auth_token`  | string  | Yes  | The auth_token for the shop.  | ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU=  |
 | `order_id`  | long  | Yes  | The ID of the order in 99Food’s system.  | 2352921557674420000  |
 | `is_sold_out`  | int  | No  | 1 for Set the current day's inventory to 0,2 for Permanently set the inventory to.0.Both app_item_ids and is_sold_out must either have values simultaneously or be empty simultaneously.  | 1  |
 | `app_item_ids`  | string  | No  | The IDs of the removed dishes, connected by English commas (,). Both app_item_ids and is_sold_out must either have values simultaneously or be empty simultaneously.  | 5764697963075145211_2_1,5764698081866223085_2_1  |
 | `item`  | string  | Yes  | A JSON-encoded string of the item array that needs to be canceled  | [{\"app_item_id\":\"5764697963075145211_2_1\",\"mdu_id\":\"C310C46C39CF525E4660C86099898A83\",\"cancel_amount\":1},{\"app_item_id\":\"5764698203995966961_2_1\",\"mdu_id\":\"591BE745984EB7BFAE1E8D348E43DB08\",\"cancel_amount\":1}]  |


### Request Body Parameters - item structure
| **Name** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
 | `app_item_id`  | string  | Yes  | the app item id  | 5764697963075145211_2_1  |
 | `mdu_id`  | string  | Yes  | the mdu_id in the order to identify the item  | C310C46C39CF525E4660C86099898A83  |
 | `cancel_amount`  | int  | Yes  | the amount to cancel  | 1  |

### Response Body Parameters

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| `data` | object | The result of confirming the order.|


### Request Example
```json
{
    "auth_token": "MWM2ZDI1N2Q2ODRiNDcxZmNlM2IwNDhiMjNmNDkyNDE=",
    "items": "[{\"app_item_id\":\"5764697963075145211_2_1\",\"mdu_id\":\"C310C46C39CF525E4660C86099898A83\",\"cancel_amount\":1},{\"app_item_id\":\"5764698203995966961_2_1\",\"mdu_id\":\"591BE745984EB7BFAE1E8D348E43DB08\",\"cancel_amount\":1}]",
    "order_id": 5764633853838820000,
    "app_item_ids": "5764697963075145211_2_1,5764698081866223085_2_1",
    "is_sold_out": 1
}
```


### Response Example - successful
```json
{
    "errno":0,
    "errmsg":"ok",
    "requestId":"1e11bfda4f8e51d1",
    "time":1628498382,
    "data":{}
}
```


### Response Example - failed
```json
{
    "errno": 12021,
    "errmsg": "FoodB_202406_yjHn_DMSa",
    "requestId": "s29080b766b0cd929ef4084d6425fa02",
    "time": 1722862995,
    "data": {}
}
```
