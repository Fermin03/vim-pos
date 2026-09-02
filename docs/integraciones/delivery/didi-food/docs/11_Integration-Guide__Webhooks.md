<!-- id=1902 path=Integration Guide > Webhooks -->
## Webhooks

We use webhooks to notify our partners about orders, delivery status and menu changes. The event will be sent to the URL supply to us when the app was created. Read more about creating an app in our **Tools Introduction > Application Management** section. You can check the complete documentation for our webhooks under each module's menu.

> **ATTENTION:**
> We use long (64-bit integer) as IDs for app, orders and stores. So please pay attention when parsing those numbers. For example, in Node.js our orderId (5764607801871631353) will be parsed as 5764607801871631000 with lib "body-parser" or "JSON.parse()". Please use json-bigint to parse it: `var jsonBig = require('json-bigint'); jsonBig.parse(data)`.

### Security

A signature is added in the requests header so that you can add a verification to check if the sender is really DiDi.

**didi-header-sign:** 202cb962ac59075b964b07152d234b70

#### Signature Verification Example

```javascript
//{POST BODY Raw} Get from HTTP request
//{APP SECRET} Get from the email when you receive your credentials or in Application Management. Read more in the Tools Introduction section.
//signStr is spliced by {POST BODY Raw} and {APP SECRET}

//php
signStr = {POST BODY Raw} . {APP SECRET}
//js、golang、python、 java
signStr = {POST BODY Raw} + {APP SECRET}
checkSign = MD5(signStr);
if (checkSign == {header-sign}){
    return true;
} else {
    return false;
}
```

### Our Events Body Structure

| **Name** | **Type** | **Description** |
| --- | --- |--- |
| `app_id` | long | The ID for an app in **our** system.|
| `app_shop_id` | string | The ID of a shop in **your** system. |
| `type` | string | The type/description of the event. Pay attention to this field as new event types may be added in the future. |
| `timestamp` | int | When the event was sent. |
| `data` | json or string | Depends on the `type`  |


### Limits

We have a timeout limit of 6 second for each callback. If you need more time to handle our callback, please contact us.

### Webhook Responses

We expect a json **response to all our webhooks** with errno 0 otherwise will keep sending it for several times.

#### Response Example

```json
{
    "errno": 0,
    "errmsg": "ok"
}
```

#### Response With Error Example

```json
{
    "errno" : 1,
    "errmsg": "err text"
}
```