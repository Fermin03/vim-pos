<!-- id=2034 path=Food Menu API > Get Image Url List -->
## Get Image Url List

`GET`  [https://openapi.didi-food.com/v3/image/image/getImageUploadInfoPageList](https://openapi.didi-food.com/v3/image/image/getImageUploadInfoPageList)

The **Get Image Url List** endpoint provides the ability to get the image urls on our storage services which were uploaded by **Upload Image** endpoint.

### Request Body Parameters

| **Name**       | **Type** | **Description**                                              | **Required** | **Example**                                                  |
| -------------- | -------- | ------------------------------------------------------------ | ------------ | ------------------------------------------------------------ |
| `auth_token`   | string   | The `auth_token` for the shop.                               | Yes          | ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU=                 |
| `current_page` | int      | The page number which you want to get.  **Note:** Default value is `1` | No           | 1                                                            |
| `page_size`    | int      | The number of record which you want to get in every page.   **Note:** Default value is `20` | No           | 20                                                           |
| `gift_url`     | string   | The field of  `giftUrl` which returned by **Upload Image** endpoint. | No           | Please refer to the field of `giftUrl` in the response example.|
| `ext`          | string   | The key word which you want to find with fuzzy search.  **Note:** The search rule is according to what you filled with while using **Upload Image** endpoint. | No           | {{`shop_id`}}, or {{`shop_id`}}-{{`app_item_id`}} and so on. such as :1152921645439779073 |

### Response Body Parameters

| **Name**              | **Type**     | **Description**                                                                                                              | **Example** |
|-----------------------| ------------ |------------------------------------------------------------------------------------------------------------------------------| ----------- |
| `totalNum`            | int          | The total number of records under your search condition.                                                                     | 21          |
| `pageCount`           | int          | The number of page under your search condition.                                                                              | 3           |
| `currentPage`         | int          | The page number which you want to get.                                                                                       | 1           |
| `pageSize`            | int          | The number of record which you want to get in every page.                                                                    | 10          |
| `imageUploadInfoList` | list[struct] | Search result under your condition.  **Note:** The detail of struct is similar to the response of **Upload Image** endpoint. |             |

### Response Example

```json
{
    "errno":0,
    "errmsg":"ok",
    "requestId":"cdf5c0fe6b768627",
    "time":1642072758,
    "data":{
        "totalNum":1,
        "pageCount":1,
        "currentPage":1,
        "pageSize":10,
        "imageUploadInfoList":[
            {
                "giftKey":"20d753636d0a36364e6b43507389b58c",
                "giftUrl":"http://10.14.128.20:8002/static/soda_public/img_20d753636d0a36364e6b43507389b58c.jpg",
                "imageSize":35,
                "ext":"1152921645439779073-drink_cola_mid",
                "createTime":1642067358,
                "updateTime":1642067358
            }
        ]
    }
}
```