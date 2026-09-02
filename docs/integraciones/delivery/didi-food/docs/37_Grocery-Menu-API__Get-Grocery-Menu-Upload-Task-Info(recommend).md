<!-- id=2064 path=Grocery Menu API > Get Grocery Menu Upload Task Info(recommend) -->
## Get Grocery Menu Upload Task Info(recommend)

`POST` [https://openapi.didi-food.com/v3/item/item/getGroceryMenuTaskInfo](https://openapi.didi-food.com/v3/item/item/getGroceryMenuTaskInfo)

The **Get Menu Upload Task Info** endpoint will return a detailed error info for **Upload Grocery Menu Details API**. To get the entire menu, you need to use the **Get Store Menu Details** **API**. Errors will be sent by the Event **uploadGroceryMenuTaskStatus**.

### Request Path Parameters

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `auth_token` | string | The `auth_token` for the shop. | Yes | ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU= |
| `task_id` | long | ID of the task returned in the upload response | Yes | 3458764763916271683 |


### Response Body Parameters - Status for the Task

| **Status (of the task)** | **Description** |
| --- | --- |
| 0   | waiting |
| 1   | success |
| 2   | failed |
| 3   | waitRetry |
| 4   | running |


### Response Body Parameters - Operation Type

| **Operation Type** | **Description** | **Annotation** |
| --- | --- | --- |
| parameterBuild| check upload parameters | DIDI not pass the parameter check
| uploadMidGift| upload middle file | If it fails, it will prompt
| createUploadTask| create upload menu task | failed to call the underlying item interface
| uploadTaskDone| upload menu has been finished | Key points for judging the completion of the entire upload menu
| imageUpdate |  start updating images | download images and checking
| imageUrlCheck| Check head_img for item   | The head_img has errors or doesn’t satisfy the requirements.

### Response Body Parameters - UploadTaskDone Error
| **Errno** | **Reason** | **Desc** |
| --- | --- | --- |
| 80001 | ERRNO_TASK_SYS_ERR| The system has errors|
| 80104 | ERRNO_DATA_LINK_IS_EMPTY| The source_link is empty|
| 80102 | ERRNO_EXT_MENU_ID_IS_EMPTY| The app_menu_id of this menu is empty |
| 80103 | ERRNO_EXT_CATE_ID_IS_EMPTY| The app_category_id of this category is empty |
| 80105 | ERRNO_EXT_ITEM_ID_IS_EMPTY| The app_item_id of this item is empty |
| 80106 | ERRNO_EXT_MODIFIER_GROUP_ID_IS_EMPTY| The app_modifier_group_id of this modifier group is empty |
| 80107 | ERRNO_CATE_NAME_HAS_SENSITIVE_WORD| The name of this category has sensitive words |
| 80108 | ERRNO_CATE_EXT_ID_COUNT| The app_category_id is over the length limit |
| 80109 | ERRNO_ITEM_NAME_HAS_SENSITIVE_WORD| The name of this item has sensitive words |
| 80110 | ERRNO_ITEM_DESC_HAS_SENSITIVE_WORD| The description of this item has sensitive words |
| 80111 | ERRNO_ITEM_PRICE_MODIFY_VERIFICATION_FAILED| The price of this item didn't pass the modifying verification |
| 80112 | ERRNO_ILLEGAL_PURCHASE_LIMIT| The purchase limit doesn't meet the platform standard |
| 10036 | ERR_ITEMNAME_OVER_COUNT| The item name is over the length limit |
| 10037 | ERR_ITEMDESC_OVER_COUNT| The description of the item is over the length limit |
| 55001 | ERROR_SHOW_SHOP_NOT_EXIST| The shop doesn't exist |
| 10027 | ERR_ITEM_PRICE_ILLEGAL| The item price doesn't meet the platform standard |
| 80113 | ERRNO_ILLEGAL_ITEM_STATUS| The item status doesn't meet the platform standard |
| 58003 | ERROR_SHOW_SOLDINFO_ILLEGAL| The sell information doesn't meet the platform standard |
| 58005 | ERROR_SHOW_SOLDINFO_DAY_ILLEGAL| The information of the available for sale date doesn't meet the platform standard |
| 59002 | ERROR_SHOW_SOLDINFO_COUNT| The sell information is over the length limit |
| 58004 | ERROR_SHOW_SOLDINFO_BEGINEND_ILLEGAL| The beginning and end time of the sell information doesn't meet the platform standard |
| 10304 | ERR_SOLD_INFO_TIME_CONTAINS_INTERSECTION| The selling time has a conflict |
| 10041 | ERR_ITEM_EXT_ID_COUNT| The item ext_id is over the length limit |
| 10005 | ERR_ITEM_NOT_EXIST| The item doesn't exist |
| 80114 | ERRNO_MODIFiER_GROUP_NOT_EXIST| The modifier group doesn't exist |
| 80115 | ERRNO_ITEM_TOTAL_NUM_EXCEEDS_LIMIT| The total number of items exceeds the limit |
| 10302 | ERR_ITEM_OVER_CATE_NUM| The total number of categories exceeds the limit |
| 80116 | ERRNO_ITEM_IN_CATE_NUM_EXCEEDS_LIMIT| The total number of the item within a category exceeds the limit |
| 80117 | ERRNO_CATE_IN_CATE_NUM_EXCEEDS_LIMIT| The total number of the subcategory within a category exceeds the limit |
| 10051 | ERR_ITEM_LEVEL_TO_MUCH| The level of the items didn't pass the verification |
| 80001 | ERRNO_TASK_SYS_ERR| The system has errors |
| 55002 | ERROR_SHOP_BUSINESS_TYPE| It has errors when obtaining the business type |
| 80118 | ERRNO_SHOP_HAS_NON_AFFILIATE_MENU| The shop has a nonaffiliate menu |
| 80119 | ERRNO_SHOP_MENU_BUSINESS_TYPE_NOT_MATCH| The menu does not match the business type of the shop |
| 80120 | ERRNO_SHOP_CATE_BUSINESS_TYPE_NOT_MATCH| The category does not match the business type of the shop |
| 80121 | ERRNO_SHOP_ITEM_BUSINESS_TYPE_NOT_MATCH| The item does not match the business type of the shop |
| 80122 | ERRNO_SHOP_BRAND_NOT_MATCH| The brand does not match the shop |
| 80125 | ERRNO_MENU_BUSINESS_TYPE_NOT_SUPPORT| The business type of the menu is not supported |
| 80126 | ERRNO_MENU_NOT_EXIST| The menu does not exist |
| 80127 | ERRNO_CATE_NOT_EXIST| The category does not exist |
| 80128 | ERRNO_DUPLICATE_CATE_ID| The category id is duplicated |
| 80129 | ERRNO_DUPLICATE_ITEM_ID| The item id is duplicated |
| 80130 | ERRNO_DUPLICATE_MODIFIER_GROUP_ID| The modifier group id is duplicated |
| 80131 | ERRNO_DUPLICATE_ITEM_IN_MENU| The menu appears duplicate items |
| 80132 | ERRNO_DUPLICATE_ITEM_IN_MODIFIER_GROUP| The modifier group has duplicate items |
| 80133 | ERRNO_DUPLICATE_MODIFIER_GROUP_IN_ITEM| The item has duplicate modifier groups |
| 80134 | ERRNO_MENU_IS_EMPTY| The menu is empty |
| 80135 | ERRNO_CATE_IS_EMPTY| The category is empty |
| 80136 | ERRNO_ITEM_IS_EMPTY| The item is empty |
| 80137 | ERRNO_SUBCATE_ITEM_IN_CATE| There are both subcategories and items directly bound to the category at the same time |
| 80138 | ERRNO_MENU_NAME_OVER_COUNT| The name of the menu is over the length limit |
| 80139 | ERRNO_CATE_NAME_OVER_COUNT| The name of the category is over the length limit |
| 10036 | ERR_ITEMNAME_OVER_COUNT| The name of the item is over the length limit |
| 80140 | ERRNO_MODIFIER_GROUP_NAME_OVER_COUNT| The name of the item is over the length limit |
| 80102 | ERRNO_TASK_PARAM_ERR| The task parameters have errors |
| 80123 | ERRNO_SHOP_CITY_NOT_MATCH| The shop does not match the city |
| 80124 | ERRNO_SHOP_COUNTRY_NOT_MATCH| The shop does not match the country |
| 80103 | ERRNO_TASK_DB_ERR| The task database has errors |
| 80141 | ERRNO_DUPLICATE_ITEM_NAME| The item name is duplicated with others |
| 80142 | ERRNO_MENU_HAS_CHANGED| The data on the menu has changed |
| 80143 | ERR_CATE_LEVEL_TO_MUCH| The category level exceeds the limit |
| 80144 | ERRNO_CATE_NAME_NOT_IN_LIST| The category name is not in the optional range |
| 80145 | ERRNO_ILLEGAL_ENUM| There are errors in enumeration value verification |
| 80146 | ERRNO_GROCEY_CATE_HAS_CHANGED | The structure of the menu category has changed |
| 80147	| ERRNO_MENU_EXT_ID_COUNT | The menu ext_id is over the length limit |
| 80148 | ERRNO_MG_EXT_ID_COUNT | The multiplier-group ext_id is over the length limit |
| 80149 | ERRNO_ITEM_HAS_RING | The structure of the items contains the same elements. E.g. The modifier group of an item contains this item itself, the sub item of an item is the item itself, etc.  |
### Response Example

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
                        "operationType":"uploadTaskDone",
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