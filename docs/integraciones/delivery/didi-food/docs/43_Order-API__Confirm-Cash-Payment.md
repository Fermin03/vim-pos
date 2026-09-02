<!-- id=2046 path=Order API > Confirm Cash Payment -->
## Confirm Cash Payment (Recommend)

`POST` [https://openapi.didi-food.com/v1/order/order/payConfirm](https://openapi.didi-food.com/v1/order/order/payConfirm)

The **Confirm Cash Collection** endpoint provides the ability to the store to confirm that they have received the cash paid by the courier partner of DiDiFood. This is to ensure that the store duly gets paid. 

> ATTENTION:
>This applies only when the delivery method is done by DiDiFood courier partners, meaning that is not applicable when the delivery method is done by the couriers of the Store/Brand. 
>
>This applies when the stores enables to function to receive cash from couriers, and is a **MUST** function to the process so that the courier can see the address of the consumer.
>
>Since the `auth_token` is a crucial part for confirming the order, we recommend establishing a process for automatically refresh the `auth_token` if necessary, as described in **Get Authtoken**.

### Request Body Parameters

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `auth_token` | string | The `auth_token` for the shop. | Yes | ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU= |
| `order_id` | long | The ID of the order in DiDiFood system. | Yes | 2352921557674426622 |

### Response Body Parameters

| **Name** | **Type** | **Description** | **Example** |
| --- | --- | --- | --- |
| `data` | bool | The result of confirming the order | true



### Response Example

Succesful confirmation:
```json
"ok":

{
    "errno": 0,
    "errmsg": "ok",
    "requestId": "c0a800096220771f00004ca50159c3b5",
    "time": 1646294816,
    "data": true
}
```
Error in the confirmation:

Case 1: Incorrect delivery method
```json
"Action failed. Delivery type must be Platform Delivery."：

{
	"errno": 12013,
    "errmsg": "Action failed. Delivery type must be Platform Delivery.",
    "requestId": "cdfde99e62853cd7",
    "time": 1642422038,
    "msectime": 1642422038457,
    "data": {}
}
```
Case 2: Incorrect order status
```json
"Action failed. Order status must be 200 (Order Accepted)."：

{
	"errno": 12014,
    "errmsg": "Action failed. Order status must be 200 (Order Accepted).",
    "requestId": "cdfde99e62853cd7",
    "time": 1642422038,
    "msectime": 1642422038457,
    "data": {}
}
```
Case 3: Incorrect order payment method
```json

"Action failed. Order must be a cash order."：

{
	"errno": 12015,
    "errmsg": "Action failed. Order must be a cash order.",
    "requestId": "cdfde99e62853cd7",
    "time": 1642422038,
    "msectime": 1642422038457,
    "data": {}
}
```
Case 4: Store must be able to accept cash from DiDiFood courier partner (this is set with your Business Advisor)
```json
"Action failed. Advance payment must be made by the courier.":

{
	"errno": 12016,
    "errmsg": "Action failed. Advance payment must be made by the courier.",
    "requestId": "cdfde99e62853cd7",
    "time": 1642422038,
    "msectime": 1642422038457,
    "data": {}
}
```