<!-- id=2036 path=Food Menu API > Menu Webhooks -->
## Menu Webhooks

### uploadMenuTaskStatus

This webhook is sent to notify you when **uploading the menu** with our V2 or V3 API task has finished. The task detail contains the success or failed information about the creation of **each item/category**.

| **Status (in task)** | **Description** |
| --- | --- |
| 0   | waiting |
| 1   | success |
| 2   | failed |
| 3   | waitRetry |
| 4   | running |


| **Status (in operation)** | **Description** |
| --- | --- |
| 0   | failed |
| 1   | success |


#### Request Body Example

```json
{
    "app_id":5764607549658103825,
    "app_shop_id":"7093",
    "type":"uploadMenuTaskStatus",
    "timestamp":1608191929,
    "data":{
        "taskID":3458764561058758717,
        "createTime":1608191921,
        "status":4,
        "message":"running",
        "appShopID":"7093",
        "operationList":[
            {
                "operationType":"cateUpdate",
                "successList":[
                    "1",
                    "9"
                ],
                "failedList":[
                    {
                        "operationType":"cateUpdate",
                        "status":0,
                        "message":"update err",
                        "createTime":1608191928,
                        "cateID":3458764663272178920,
                        "cateName":"Familiar",
                        "appCateID":"3"
                    }
                ]
            },
            {
                "operationType":"itemUpdate",
                "successList":[
                    "110564_7",
                    "110964_2",
                    "110564_9",
                    "110564_2",
                    "110564_5",
                    "110564_4",
                    "110964_7"
                ],
                "failedList":[
                    {
                        "operationType":"itemUpdate",
                        "status":0,
                        "message":"update err",
                        "createTime":1608191928,
                        "itemID":3458764663272178920,
                        "itemName":"sandwich",
                        "appItemID":"110564_5"
                    }
                ]
            },
            {
                "operationType":"imageUrlCheck",
                "failedList":[
                    {
                        "operationType":"imageUrlCheck",
                        "status":0,
                        "message":"403 Forbidden",
                        "createTime":1608191928,
                        "itemID":3458764663272178920,
                        "itemName":"sandwich",
                        "appItemID":"110564_5",
                        "itemImageURL":"https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Ruben_sandwich.jpg/600px-Ruben_sandwich.jpg"
                    }
                ]
            },
            {
                "operationType":"menuUpdate",
                "successList":[
                    "8"
                ],
                "failedList":[
                    {
                        "operationType":"menuUpdate",
                        "status":0,
                        "message":"err",
                        "createTime":1608191928,
                        "menuID":3458764663272178920,
                        "menuName":"menu1",
                        "appMenuID":"1"
                    }
                ]
            },
            {
                "operationType": "uploadTaskDone",
                "failedList": [
                    {
                        "operationType": "uploadTaskDone",
                        "status": 0,
                        "message":"[{\"errno\":10037,\"name\":\"Just Wings \& Boneless\",\"id\":\"item-ij-w-and-bbw-ba0a\",\"val\":\"\",\"limit\":\"\"},{\"errno\":10037,\"name\":\"Just 6 Wings\",\"id\":\"item-6-just-wings-c918\",\"val\":\"\",\"limit\":\"\"},{\"errno\":10037,\"name\":\"Coca Cola Original 355ml\",\"id\":\"item-coca-cola-original-9ad0\",\"val\":\"\",\"limit\":\"\"}]",
                        "createTime": 1686557798,
                        "failInfoUrl": "http://img0.didiglobal.com/static/soda_public/5764607627603216456_5764694681380392308_1686557798447492869.json"
                    }
                ]
            }
        ]
    }
}
```

### imageAuditStatus

This callback will be triggered when there is any **new menu uploaded** in 48 hours at 9:30 AM by the timezone of your country. You'll receive the status and reason for each of the images uploaded.

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

;

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
