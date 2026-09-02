<!-- id=1922 path=Store API > Update Store Information(recommend) -->
## Update Store Information(recommend)

`POST` [https://openapi.didi-food.com/v1/shop/shop/update](https://openapi.didi-food.com/v1/shop/shop/update)

The **Update Store Information** endpoint allows a developer to update the shop's basic information with optional fields.

### Request Body Parameters

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `auth_token` | string | The `auth_token` for the shop. | Yes | ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU= |
| `shop_phone` | json | A json structure of the phone number of the store. Check the details below. | No  |     |
| `biz_day_time` | json | A json structure with the days and times when the store will be set as open. Check the details below. | No  |     |
| `biz_holiday_time` | json | A json structure to set a rule for a specific special day. Check the details below. | No  |     |
| `promise_produce_time` | int | The average amount of time **in seconds** the store needs to prepare the orders. **Note:** Be as accurate as possible to provide the best experience to the customer. | No  | 600 |
| `shop_logo` | string | The URL for the logo of the store. | No  | https://example.com/abc.jpg |
| `shop_head_img` | string | The URL for the head image of the store. This is the main image displayed to the eater when browsing for a store. **Requirement:** Hosted on a secure connection (SSL), file size with less than 10MB. **Formats supported:** JPEG, PNG or GIF. **Recommended resolution:** 2880 x 2304px. | No  | https://example.com/abc.jpg |
| `shop_front_photo` | string | The URL for the front of the shop. **Requirement:** File size with less than 10MB. **Formats supported:** JPEG, PNG or GIF. | No  | https://example.com/abc.jpg |
| `shop_surrounding_photo` | string | The URL for the surroundings of the shop. **Requirement:** File size with less than 10MB. **Formats supported:** JPEG, PNG or GIF. | No  | https://example.com/abc.jpg |
| `building_entrance_photo` | string | The URL for the building entrance of the shop. **Requirement:** File size with less than 10MB. **Formats supported:** JPEG, PNG or GIF. | No  | https://example.com/abc.jpg |
| `main_category_ids` | json | A json structure with the store business category ids. You can get all valid category ids that can be used with the **Get Shop Categories** endpoint. **NOTE:** Setting an accurate category information helps the platform with recommendation and improve purchase conversion rate. | No  |     |

### Request Body Parameters for shop_phone

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `callingCode` | int | The country code of the phone number. | Yes | 52  |
| `phone` | int | The phone number of the store. **Note:** It must be a valid phone number and can't be 0. | Yes | 15011498822 |
| `type` | int | 0: Mobile phone (_default_); 1: Landline | Yes | 0   |

### Request Body Parameters for biz_day_time

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `bizDay` | int array | Days in which the item is sold. **Accepted values** from 1 (Monday) to 7 (Sunday). | Yes | [1,2,3,4,5,6,7] |
| `bizTime` | list[struct] | Begin and end times when the store should open and close. **Time format:** HH:mm. **Accepted values:** from 00:00 to 23:59.| Yes | [{"begin":"00:00","end":"23:59"}] |

### Request Body Parameters for biz_holiday_time

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `bizHoliday` | string | Day to follow a specific rule. **Date format:** yyyy-MM-dd | Yes | "2021-02-03" |
| `restAllDay` | bool | true: The store will be closed for the entire day; false: The store will be in business following the time specified in `bizTime`. | Yes | false |
| `bizTime` | list[struct] | Begin and end times when the store should open and close. **Time format:** HH:mm. **Accepted values:** from 00:00 to 23:59. | No. Required when `restAllDay` is false. | [{"begin":"00:00","end":"23:59"}] |

### Request Body Parameters for main_category_id

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `mainCategoryId` | string | The main category for the store. | Yes | "200001545088714" |
| `secondCategoryId` | string | The secondary category for the store. | No  | "20000897046510" |
| `thirdCategoryId` | string | The third category for the store. | No  | "200001641902623" |

### Response Body Parameters

| **Name** | **Type** | **Description** | **Example** |
| --- | --- | --- | --- |
| `shop_phone` | bool | The result of setting the `shop_phone`. | true |
| `biz_day_time` | bool | The result of setting the `biz_day_time`. | true |
| `biz_holiday_time` | bool | The result of setting the `biz_holiday_time`. | true |
| `promise_produce_time` | bool | The result of setting the `avg_product_time`. | true |
| `shop_logo` | bool | The response will always be true. The actual result will be notified by the webhook **imageAuditStatus**, usually in 24 hours. | true |
| `shop_head_img` | bool | The response will always be true. The actual result will be notified by the webhook **imageAuditStatus**, usually in 24 hours. | true |
| `shop_front_photo` | bool | The response will always be true. The actual result will be notified by the webhook **imageAuditStatus**, usually in a minute. | true |
| `shop_surrounding_photo` | bool | The response will always be true. The actual result will be notified by the webhook **imageAuditStatus**, usually in a minute. | true |
| `building_entrance_photo` | bool | The response will always be true. The actual result will be notified by the webhook **imageAuditStatus**, usually in a minute. | true |
| `main_category_ids` | bool | The result of setting the `main_category_ids`. | No  |

### Request Example

```json
{
    "auth_token":"ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU=",
    "shop_phone":[
        {
            "callingCode":52,
            "phone":15011498822,
            "type":0
        }
    ],
    "biz_day_time":[
        {
            "bizDay":[
                1,
                2,
                3,
                4,
                5
            ],
            "bizTime":[
                {
                    "begin":"08:00",
                    "end":"20:00"
                }
            ]
        },
        {
            "bizDay":[
                6,
                7
            ],
            "bizTime":[
                {
                    "begin":"07:00",
                    "end":"21:00"
                }
            ]
        }
    ],
    "biz_holiday_time":[
        {
            "bizHoliday":"2021-02-03",
            "restAllDay":false,
            "bizTime":[
                {
                    "begin":"00:00",
                    "end":"14:59"
                }
            ]
        }
    ],
    "promise_produce_time":180,
    "shop_logo":"https://example.com/abc.jpg",
    "shop_head_img":"https://example.com/abc.jpg",
    "shop_front_photo":"https://example.com/abc.jpg",
    "shop_surrounding_photo":"https://example.com/abc.jpg",
    "building_entrance_photo":"https://example.com/abc.jpg",
    "main_category_ids":{
        "mainCategoryId":"200001545088714",
        "secondCategoryId":"20000897046510",
        "thirdCategoryId":"200001641902623"
    }
}
```

### Response Example

```json
{
    "errno":0,
    "errmsg":"ok",
    "requestId":"2281991a24d4db7d",
    "time":1568711984,
    "data":{
        "shop_phone":true,
        "biz_day_time":false,
        "biz_holiday_time":true,
        "promise_produce_time":true,
        "shop_logo":true,
        "shop_head_img":true,
        "shop_front_photo":true,
        "shop_surrounding_photo":true,
        "building_entrance_photo":true,
        "main_category_ids":true
    }
}
```