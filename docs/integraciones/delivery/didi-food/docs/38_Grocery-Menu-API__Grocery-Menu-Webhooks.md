<!-- id=2066 path=Grocery Menu API > Grocery Menu Webhooks -->
## Grocery Menu Webhooks

### uploadGroceryMenuTaskStatus

This webhook is sent to notify you when **Upload Grocery Menu** task has finished. The task detail contains the success or failed information about the creation of **each item/category**.

| **Status (in task)** | **Description** |
| --- | --- |
| 0   | waiting |
| 1   | success |
| 2   | failed |
| 3   | waitRetry |
| 4   | running |


#### Request Body Example

```json
{
    "errno":0,
    "errmsg":"ok",
    "requestId":"0a0f262c600e7ac66111d550283cc902",
    "time":1611561671,
    "data":{
        "taskID":5764609212392804069,
        "createTime":1611217015,
        "status":1,
        "message":"success",
        "appShopID":"001",
        "operationList":[
            {
                "operationType":"imageUrlCheck",
                "successList":[],
                "failedList":[
                    {
                        "operationType":"imageUrlCheck",
                        "status":0,
                        "message":"Head -: unsupported protocol scheme",
                        "createTime":1611217028,
                        "itemID":5764611457673265185,
                        "itemName":"Pan de queso para compartir",
                        "appItemID":"10322_2_7",
                        "itemImageURL":"-"
                    }
                ]
            },
            {
                "operationType":"parameterBuild",
                "successList":[
                     "http://www.abc.com/input_file.json"
                ],
                "failedList":[
                    {
                        "operationType":"ParameterCheck",
                        "message":"buildMenuError:error",
                        "createTime":1611217028
                    }
                ]
            },
            {
                "operationType":"uploadMidGift",
                "successList":[
                     "http://www.abc.com/middle_file.json"
                ],
                "failedList":[
                    {
                        "operationType":"uploadMidGift",
                        "message":"uploadMidGiftError:error",
                        "createTime":1611217028
                    }
                ]
            },
            {
                "operationType":"createUploadTask",
                "successList":[
                ],
                "failedList":[
                    {
                        "operationType":"createUploadTask",
                        "status":0,
                        "message":"createUploadTaskError:error",
                        "createTime":1611217028
                    }
                ]
            },
            {
                "operationType":"uploadTaskDone",
                "successList":[
                ],
                "failedList":[
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
