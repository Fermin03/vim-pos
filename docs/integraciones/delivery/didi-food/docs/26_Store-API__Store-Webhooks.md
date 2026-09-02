<!-- id=2040 path=Store API > Store Webhooks -->
## Store Webhooks

### shopStatus

This webhook is sent to notify you when the `biz_status` of a store has changed. You'll receive the identification of the store and the new status:  1 if the store opens and 2 if it closes.

#### Request Body Example

```json
{
    "app_id":123,
    "app_shop_id":"xxx",
    "type":"shopStatus",
    "timestamp":1592970557,
    "data":{
        "biz_status":1
    }
}
```

### imageAuditStatus

This callback will be triggered when new images are uploaded using the **Update Store Information** endpoint. `shop_logo` and `shop_head_img` are usually audit in 24 hours. And it ussually takes a minute to have `shop_front_photo`, `shop_surrounding_photo` and `building_entrance_photo` audited.

Our image audit process is:
1. Download the image and upload it to our internal image server. If it fails on this step, the status will be **audit auto refused**.

2. Submit the internal image link to our image audit platform. After the audit, the status will be **manually passed or refused**.

3. If the internal image link already exists in our image audit platform, the status will be **auto-passed**.

| **Status** | **Description** |
| --- | --- |
| 0   | auditing |
| 1   | audit auto pass |
| 2   | audit manually pass |
| 3   | audit auto refused |
| 4   | audit manually refused |

| **Refuse Reasons (not all included)** |
| --- |
| Image url is not a valid link |
| Image size is too large, more than 10MB |
| Image can't be downloaded from our server. For example, some image servers will return a 403 error because our server is deployed on AWS Cloud. |
| Other manually audit fail. |

#### Request Body Example

```json
{
    "app_id":5764607549658103825,
    "type":"imageAuditStatus",
    "timestamp":1608191929,
    "data":[
        {
            "head_img":"https://img0.didiglobal.com/static/soda_public/img_2b567e02d0f1da4ab70188c0079ca01a.png",
            "audit_refused_reason":"audit auto refused",
            "app_item_id_list":[
                "023504_item"
            ]
        }
    ]
}
```
### autoOnlineResult

This webhook is used to notify the reasons for the automatic store launch failure and send relevant notifications..

The overall error code is as follows.

| **err_code** | **reason** |
| --- | --- |
| 1000   | Store cannot go online automatically because it hasn’t enabled this feature |
| 1001   | Store cannot go online automatically because it is closed |
| 1002   | Store cannot go online automatically because it is suspended |
| 1003   | Store cannot go online automatically because it was forced offline for two consecutive days due to not accepting orders in time|
| 1004   | Not signed in |
| 1005   | The store opening inspection failed, resulting in the store being unable to go online automatically.|
| 1006   | Store cannot go online automatically because it is outside the store’s business hours|
#### Request Body Example

```json
{
    "app_id": 5764607620143382826,
    "app_shop_id": "5764608211303534219",
    "timestamp": 1744201772,
    "type": "autoOnlineResult",
    "data": {
        "result": 2,
        "err_code": 1001,
        "reason": "Store cannot go online automatically because it has no items available for sale"
    }
}
```