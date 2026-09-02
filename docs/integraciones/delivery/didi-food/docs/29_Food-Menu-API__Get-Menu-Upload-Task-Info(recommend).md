<!-- id=1942 path=Food Menu API > Get Menu Upload Task Info(recommend) -->
## Get Menu Upload Task Info (Recommended)

`POST` [https://openapi.didi-food.com/v1/item/item/getMenuTaskInfo](https://openapi.didi-food.com/v1/item/item/getMenuTaskInfo)

If a certain menu has passed through DiDiFood first filter, the **Get Menu Upload Task Info** endpoint will return a detailed information for the menu upload tasks status under  **Upload Store Menu Details (v2 and v3) API**. To get the entire menu, you need to use the **Get Store Menu Details API**.

> **Important:**
> This endpoint is still under continuous improvement, there are certain errors that are still being reported under the status **success** even that it has errors, therefore it is suggested to also consider a whether the response contains a key `failed list`.

### Request Path Parameters

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `auth_token` | string | The `auth_token` for the shop. | Yes | ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU= |
| `task_id` | long | ID of the task returned in the upload response | Yes | 3458764763916271683 |


### Response Body Parameters - Status for the Task

| **Status (of the task)** | **Description** | **Additional  Info** |
|--------------------------|-----------------|-----------------|
| 0                        | waiting         ||
| 1                        | success         ||
| 2                        | failed          ||
| 3                        | waitRetry       |DiDiFood internal system is processing the tasks, therefore the retry will be performed by DiDiFood. No action is required by external parties. |
| 4                        | running         ||
| 5                        | partial success  |When the menu presents errors that will not affect the process flow of an order execution, however it is suggested to check the details with the purpose to improve the parts with error |

### Response Body Parameters - Operation Type

> Provides information about which part of the menu has been executed successfully.

|Operation Type|Description|Additional Info|
|---|---|---|
|menuCreate|Create menu|If the menu doesn't exist, it will be created.|
|menuUpdate|Update menu|If the menu exists, it will be updated.|
|cateCreate|Create category|If the category doesn't exist, it will be created.|
|cateUpdate|Update category|If the category exists, it will be updated.|
|cateDel|Delete category|If the category exists in DiDi’s menu but not in the uploaded json, it will be deleted.|
|itemCreate|Create item|If the item doesn't exist, it will be created.|
|itemUpdate|Update item|If the item exists, it will be updated.|
|itemDel|Delete item|If the item exists in DiDi’s menu but not in the uploaded json, it will be deleted.|
|imageUrlCheck|Check head_img for item|The head_img has errors or doesn’t satisfy the requirements.|
|itemSoldInfoIntl|Check sold_info_intl|The sold_info_intl has errors.|
|itemSoldInfo|check sold_info|If sold_info is being used, it will always show the error: "deprecated, please use sold_info_intl.|
|parameterBuild|check upload parameters|DIDI not pass the parameter check|
|uploadMidGift|upload middle file|If it fails, it will prompt|
|createUploadTask|create upload menu task|failed to call the underlying item interface|
|uploadTaskDone|upload menu has been finished|Key points for judging the completion of the entire upload menu|
|imageUpdate|start updating images|download images and checking|


### Response Body Parameters - UploadTaskDone Error

> * Please drag to the left if it is not fully displayed.
> * This is provided under the key `failed list` under the object of each operation type to provide further information about the part of the menu that has an error.

|Error Code|Short description V2|Menu upload blocker|Parameters related to the error|Short description V1|Explanation|
|---|---|---|---|---|---|
|80001|ERRNO_TASK_SYS_ERR|Blocker|-|SystemError|system error|
|80104|ERRNO_DATA_LINK_IS_EMPTY|Blocker|-|DataIsEmpty|source link is empty or null|
|80102|ERRNO_EXT_MENU_ID_IS_EMPTY|Blocker|name|BrandMenuIdIs0|The brandMenuID/extID of the menu is 0 or empty.|
|80103|ERRNO_EXT_CATE_ID_IS_EMPTY|Blocker|name|BrandCateIdIsEmpty|The brandID/extID of the category is 0 or empty.|
|80105|ERRNO_EXT_ITEM_ID_IS_EMPTY|Blocker|name|BrandItemIdIsEmpty|The brandID/extID of the item is 0 or empty.|
|80106|ERRNO_EXT_MODIFIER_GROUP_ID_IS_EMPTY|Blocker|name|BrandModifierGroupIdIsEmpty|The brandID/extID of the option group is 0 or empty.|
|80107|ERRNO_CATE_NAME_HAS_SENSITIVE_WORD||name, id|CateNameVerificationFailed|The category name contains sensitive or restricted words.|
|80108|ERRNO_CATE_EXT_ID_COUNT||name, id||The category ExtID exceeds 150 characters. Please shorten it.|
|80109|ERRNO_ITEM_NAME_HAS_SENSITIVE_WORD||name, id|ItemNameVerificationFailedItemName|The item name contains sensitive or restricted words.|
|80110|ERRNO_ITEM_DESC_HAS_SENSITIVE_WORD||name, id|ItemShortDescVerificationFailedItemShortDesc|The item description contains sensitive words.|
|80111|ERRNO_ITEM_PRICE_MODIFY_VERIFICATION_FAILED||name, id|ItemVerificationFailed|Item price update exceeds allowed range, please re-adjust the price to the allowed range|
|80112|ERRNO_ILLEGAL_PURCHASE_LIMIT||name, id|ItemVerificationFailed|The purchase quantity limit is invalid.|
|10036|ERR_ITEMNAME_OVER_COUNT||name, id|ItemVerificationFailed|The item name exceeds the allowed length. Please shorten it.|
|10037|ERR_ITEMDESC_OVER_COUNT||name, id|ItemVerificationFailed|The item description exceeds the allowed length. Please shorten it.|
|55001|ERROR_SHOW_SHOP_NOT_EXIST|Blocker|-|ItemVerificationFailed|Unable to find the destination store for menu mapping. Please ensure that the store is correctly mapped with the app_shop_id or that the auth_token is correct.|
|10027|ERR_ITEM_PRICE_ILLEGAL||name, id|ItemVerificationFailed|Error in the price lowest denomination, must be integers. E.g. 12.34 should input 1234.|
|80113|ERRNO_ILLEGAL_ITEM_STATUS||name, id|ItemVerificationFailed|The item status is invalid (can only set as 'available - 1' or 'unavailable -2').|
|58003|ERROR_SHOW_SOLDINFO_ILLEGAL||name, id|ItemVerificationFailed|The item selling information is invalid.|
|58005|ERROR_SHOW_SOLDINFO_DAY_ILLEGAL||name, id|ItemVerificationFailed|The item selling date is invalid.|
|59002|ERROR_SHOW_SOLDINFO_COUNT||name, id|ItemVerificationFailed|The item selling information exceeds the the allowed length. Please shorten it.|
|58004|ERROR_SHOW_SOLDINFO_BEGINEND_ILLEGAL||name, id|ItemVerificationFailed|The item selling start and/or end time is invalid. It can only be from 00:00 to 23:59.|
|10304|ERR_SOLD_INFO_TIME_CONTAINS_INTERSECTION||name, id|ItemVerificationFailed|There is a time overlap in the selling schedule of the items. Time overlap is not allowed.|
|10041|ERR_ITEM_EXT_ID_COUNT||name, id|ItemVerificationFailed|The app_item_id (ext_id) exceeds the the allowed length. Please shorten it.|
|10005|ERR_ITEM_NOT_EXIST|Blocker|id (DiDiFood internal ref: relatedID)|ItemNotExist|System error - the item doesn't exist in DiDi system|
|80114|ERRNO_MODIFiER_GROUP_NOT_EXIST|Blocker|id (DiDiFood internal ref: relatedID)|MgNotExist|System error - the modifier group doesn't exist in DiDi system|
|80115|ERRNO_ITEM_TOTAL_NUM_EXCEEDS_LIMIT|Blocker|val = itemNum, limit = limitNum|ItemTotalNumNotOver|The total number of items exceeds the allowed. Please contact DiDi API team for a solution.|
|10302|ERR_ITEM_OVER_CATE_NUM|Blocker|val = cateNum, limit = limitNum|ItemNumCanNotOver|The total number of categories exceeds the the allowed. Please contact DiDi API team for a solution.|
|80116|ERRNO_ITEM_IN_CATE_NUM_EXCEEDS_LIMIT|Blocker|name, id (DiDiFood internal ref: category extID or brandID), val = itemNum, limit = limitNum|ItemNumCanNotOver|The total number of items under a category exceeds the allowed. Please contact DiDi API team for a solution.|
|80117|ERRNO_CATE_IN_CATE_NUM_EXCEEDS_LIMIT|Blocker|name, id (DiDiFood internal ref: category extID or brandID), val = cateNum, limit = limitNum|ItemNumCanNotOver|The total number of subcategories under a category exceeds the allowed. Please contact DiDi API team for a solution.|
|10051|ERR_ITEM_LEVEL_TO_MUCH|Blocker|name, id|LevelTotalNumNotOver|The total number of levels under an item exceeds the allowed.|
|80001|ERRNO_TASK_SYS_ERR|Blocker|-|ErrorShopBusinessType|System error - Failed to get store business type|
|55002|ERROR_SHOP_BUSINESS_TYPE|Blocker|-|ErrorShopBusinessType|The store business type doesn't support the uploaded menu.|
|80118|ERRNO_SHOP_HAS_NON_AFFILIATE_MENU|Blocker|-|ErrorShopBusinessType|The uploaded menu contains items that are not supported by the store business type.|
|80119|ERRNO_SHOP_MENU_BUSINESS_TYPE_NOT_MATCH|Blocker|-|ErrorShopBusinessType|The store business type doesn't support the uploaded menu.|
|80120|ERRNO_SHOP_CATE_BUSINESS_TYPE_NOT_MATCH|Blocker|name, id|ErrorShopBusinessType|The store business type doesn't support the uploaded menu category.|
|80121|ERRNO_SHOP_ITEM_BUSINESS_TYPE_NOT_MATCH|Blocker|name, id|ErrorShopBusinessType|The store business type doesn't support the uploaded menu item.|
|80127|ERRNO_MENU_CANNOT_MERGE|-|-|ErrorShopBusinessType|Retail format cannot merge menus.|
|80122|ERRNO_SHOP_BRAND_NOT_MATCH|Blocker|-|ShopBrandNotMatch|The store and the brand don't match.|
|80125|ERRNO_MENU_BUSINESS_TYPE_NOT_SUPPORT|Blocker|-|ErrnoInvalidParam|The store business type doesn't support the uploaded menu.|
|80126|ERRNO_MENU_NOT_EXIST|Blocker|id (DiDiFood internal ref: relatedID)|ErrnoInvalidParam|System error -- Menu RelatedID and Map don't match|
|80127|ERRNO_CATE_NOT_EXIST|Blocker|id (DiDiFood internal ref: relatedID)|ErrnoInvalidParam|System error -- Menu Category RelatedID and Map don't match|
|80128|ERRNO_DUPLICATE_CATE_ID|Blocker|extID|ErrnoInvalidParam|Category ID and/or Brand ID duplicated|
|80129|ERRNO_DUPLICATE_ITEM_ID|Blocker|extID|ErrnoInvalidParam|app_item_ID and/or Brand ID duplicated|
|80130|ERRNO_DUPLICATE_MODIFIER_GROUP_ID|Blocker|extID|ErrnoInvalidParam|Modifier group ID and/or Brand ID duplicated|
|80131|ERRNO_DUPLICATE_ITEM_IN_MENU|Blocker|name, id|ErrnoInvalidParam|Duplicated items under the same menu is not allowed|
|80132|ERRNO_DUPLICATE_ITEM_IN_MODIFIER_GROUP|Blocker|name, id|ErrnoInvalidParam|Duplicated items under the same category is not allowed|
|80133|ERRNO_DUPLICATE_MODIFIER_GROUP_IN_ITEM|Blocker|name, id|ErrnoInvalidParam|Duplicated modifier under the same item is not allowed|
|-|-|-|-|ErrnoInvalidParam|V1 structure menu is nil.|
|-|-|-|-|ErrnoInvalidParam|V1 structure category list is empty.|
|-|-|-|-|ErrnoInvalidParam|V1 structure category is nil.|
|-|-|-|-|ErrnoInvalidParam|V1 structure category contails an empty item ID list.|
|-|-|-|-|ErrnoInvalidParam|V1 structure category contails an item with empty information.|
|-|-|-|-|ErrnoInvalidParam|V1 structure contains both category and item nested in the category section|
|80134|ERRNO_MENU_IS_EMPTY|Blocker|-|ErrnoInvalidParam|V2 structure does not contain any menu information.|
|80135|ERRNO_CATE_IS_EMPTY|Blocker|-|ErrnoInvalidParam|V2 structure does not contain any category information.|
|80136|ERRNO_ITEM_IS_EMPTY||name, id|ErrnoInvalidParam|V2 structure does not contain any item information.|
|80137|ERRNO_SUBCATE_ITEM_IN_CATE||name, id|ErrnoInvalidParam|V2 structure contains both category and item nested in the category section|
|80148|ERRNO_MENU_CANNOT_MERGE|-|-|ErrnoInvalidParam|Merging menus is not supported (with subcategories).|
|80138|ERRNO_MENU_NAME_OVER_COUNT||id (DiDiFood internal ref: extID)|ErrnoInvalidParam|Menu name exceeds the allowed length or is null|
|80139|ERRNO_CATE_NAME_OVER_COUNT||id (DiDiFood internal ref: extID)|ErrnoInvalidParam|Category name exceeds the allowed length or is null|
|10036|ERR_ITEMNAME_OVER_COUNT||id (DiDiFood internal ref: extID)|ErrnoInvalidParam|Item name exceeds the allowed length or is null.|
|80140|ERRNO_MODIFIER_GROUP_NAME_OVER_COUNT||id (DiDiFood internal ref: extID)|ErrnoInvalidParam|Modifier group name exceeds the allowed length or is null.|
|80012|ERRNO_TASK_PARAM_ERR|Blocker|-|ErrnoInvalidParam|Error in parameters|
|80123|ERRNO_SHOP_CITY_NOT_MATCH|Blocker|-|ShopCityNotMatch|The store and the city does not match|
|80124|ERRNO_SHOP_COUNTRY_NOT_MATCH|Blocker|-|ShopCountryNotMatch|The store and the country does not match|
|80013|ERRNO_TASK_DB_ERR|Blocker|-|DBErr|Abnormal operation in the database|
|80141|ERRNO_DUPLICATE_ITEM_NAME||name|GroceryItemNameDuplicate|Duplicated item name is not allowed|
|80142|ERRNO_MENU_HAS_CHANGED|Blocker|-|-|System error -- Menu data change|
|80143|ERRNO_CATE_LEVEL_TO_MUCH||name, id|-|The number of category levels has exceeded the allowed|
|80144|ERRNO_CATE_NAME_NOT_IN_LIST||name, id|-|The category name is not within the allowed names by DiDi|
|80145|ERRNO_ILLEGAL_ENUM||name, id, val = EnumName|-|Parameter verification error|
|80147|ERRNO_MENU_EXT_ID_COUNT||name, id|-|app_item_ID exceeds 150 characters|
|80148|ERRNO_MG_EXT_ID_COUNT||name, id|-|Modifier group ID exceeds 150 characters|
|80149|ERRNO_ITEM_HAS_RING|Blocker|name, id|-|The modifier under the item is creating a loop creating an infinite selection|
|80150|ERRNO_ITEM_MG_CACHE_OVER_LENGTH||name, id|-|The number of modifier groups under an item exceeds the allowed|
|10063|ERR_MG_ITEM_NUM_ILLEGAL||extID|-|The number of subitems that can be purchased under a modifier group does not meet the requirements set by DiDi|
|10065|ERR_MG_BUY_MODE_ILLEGAL||extID|-|Option to purchase more than 1 portion is mandatory under this modifier group|
|80146|ERRNO_GROCEY_CATE_HAS_CHANGED|-|-|-|The category, in which an item is under, can't be changed in a grocery menu|
|80151|ERRNO_GROCEY_CANNOT_CREATE_CATE|-|-|-|It is not allowed to create a new category under a grocery menu|
| 100101 | ERROR_ACTIVITY_PRICE_NOT_ZERO    | -    | name，id  |- | The discounted price cannot be 0. If it is empty, the price will be sold at the original price. |
| 100102 | ERROR_DISCOUNT_SMALL             | -    | name，id  |- | The discount rate should be greater than or equal to 1%off. |
| 100103 | ERROR_ACTIVITY_PRICE_NOT_GREATER_PRICE | - | name，id |- | The discount price cannot be greater than or equal to the original price. |
| 100104 | ERROR_ACTIVITY_PRICE             | -    | name，id  |- | The discounted price format is incorrect. |
| 100105 | ERROR_ALCOHOL_NOT_PROMO           | -    | name，id  |- | Drinks are not included in the promotion. |
| 100106 | ERROR_TOBACCO_NOT_PROMO           | -    | name，id  |- | Tobaccos are not included in the promotion. |
| 100201 | WARNING_ITEM_HAS_OTHER_PROMO     | -    | name，id  |- | Please note: There is a high-priority promo for this item, and the promo ID is: xxx, xxx; The discounted price is only allowed after the high-priority promo ends. |
| 100202 | WARNING_PEOMO_ITEM_RPICE_REPLACE | -    | name，id  |- | Please note: The item is in the promo, and the original price has been updated. The promo ID is: xxx, xxx; |
| 100999 | ERROR_SYSTEM_PARAMETER_ERROR | -    | name，id  |- | System parameter error |

### Response Example

```json
{
    "errno": 0,
    "errmsg": "ok",
    "requestId": "0a0f262c600e7ac66111d550283cc902",
    "time": 1611561671,
    "data": {
        "taskID": 5764609212392804069,
        "createTime": 1611217015,
        "status": 5,
        "message": "partial success",
        "appShopID": "001",
        "operationList": [
            {
                "operationType": "menuUpdate",
                "successList": [
                    "1"
                ]
            },
            {
                "operationType": "cateUpdate",
                "successList": [
                    "4",
                    "5",
                    "1",
                    "3",
                    "2"
                ]
            },
            {
                "operationType": "itemUpdate",
                "successList": [
                    "28033_1_7",
                    "23090_1_7",
                    "14089_1_7",
                    "22006_1_10",
                    "25004_1_7"
                ]
            },
            {
                "operationType": "imageUrlCheck",
                "successList": [
                    "23098_1_7",
                    "13003_1_7",
                    "12010_1_7",
                    "10273_1_7",
                    "11008_1_7"
                ],
                "failedList": [
                    {
                        "operationType": "imageUrlCheck",
                        "status": 0,
                        "message": "Head -: unsupported protocol scheme",
                        "createTime": 1611217028,
                        "itemID": 5764611457673265185,
                        "itemName": "Pan de queso para compartir",
                        "appItemID": "10322_2_7",
                        "itemImageURL": "-"
                    }
                ]
            }
        ]
    }
}
```