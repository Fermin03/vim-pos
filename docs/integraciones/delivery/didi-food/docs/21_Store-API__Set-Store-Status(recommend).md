<!-- id=1926 path=Store API > Set Store Status(recommend) -->
## Set Store Status

The **Set Store Status** endpoint allows developers to change the status of a store. 
The `biz_status` sets if a store is **online or offline**. If it’s set offline, the store won’t appear open for customers until `biz_status` is set online again by this endpoint or be open manually using B-App.

> **NOTE:**
> If the store is closed manually using B-App, the store needs to be open again manually by the app and won’t follow the settings established by the API.

The `auto_switch` sets **how the store goes online or offline** and only takes effect when  `biz_status` is set online.

> **IMPORTANT:**
> We'll send a webhook with type _shopStatus_ when the status of the store changes. Read more in **Store Webhooks**.

### Basic Information

| **Name** | **Description** |
| --- | --- |
| `URL` | [https://openapi.didi-food.com/v1/shop/shop/setStatus](http://openapi.didi-food.com/v1/shop/shop/setStatus) |
| `Method` | POST |
| `Permission` | Available |

### Request Body Parameters

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `auth_token` | string | The `auth_token` for the shop. | Yes | ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU= |
| `biz_status` | int | 1: Online; 2: Offline | Yes | 1   |
| `auto_switch` | int | 1: Manual Online, 2: Auto Online; **Note:** If `biz_status` is offline, it will be disabled regardless of the `auto_switch` value. In either mode, the store will automatically go offline at the scheduled closing time. | Yes | 1   |

### Response Body Parameters

| **Name** | **Type** | **Description** | **Example** |
| --- | --- | --- | --- |
| `biz_status` | bool | The setting of `biz_status`. true: online; false: offline | true |
| `auto_switch` | bool | The setting of `auto_switch`. true: enabled; false: disabled | true |
| `sub_biz_status` | int | The store's real-time detailed business status as described below. | 1   |

### Response Body for sub_biz_status

| **sub_biz_status** | **Description** |
| --- | --- |
| 0   | Default. |
| 1   | Store Opened. |
| 2   | Business Paused. It will be auto opened if `auto_switch` is set to 1 or 3. |
| 3   | Business Closed. It won’t open until the store is open manually. |
| 4   | Store Disconnected. 99Food’s merchant app is offline because of network connection or other reasons. |
| 5   | Store closed for the day. The store isn’t in business’ time and will be auto opened if `auto_switch` is set to 1 or 3. |
| 6   | Store blocked. The store is closed for some bad reason and can’t be open using the app or API. Contact your 99Food’s Rep to understand the case. |
| 7   | Store closed by system control. The store is closed if there’s no rider online. |

### Response Body errno

| **errno** | **Description** |
| --- | --- |
| 10001 | System error. |
| 10002 | Parameter error. |
| 10100 | Get `auth_token` failed. |
| 10102 | `auth_token` has expired. Please refresh it. |
| 11010 | Unable to go online. If you can’t solve this problem after several attempts, contact your 99Food’s Rep. |
| 11037 | Service not yet available in this area. |
| 11040 | Unable to search for perimeter. |
| 11044 | Unable to update store’s operating status. |
| 11053 | Get shop detail fail. |
| 56101 | Incorrect store status. |
| 58001 | Illegal business hours. |
| 90041 | Get shop is empty. |
| 990002 | Parameter error. |

### Request Example

```json
{
    "auth_token":"ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU=",
    "biz_status":1,
    "auto_switch":1
}
```

### Response Example

```json
{
    "errno":0,
    "errmsg":"ok",
    "requestId":"2282831c626d56b8",
    "time":1568711365,
    "data":{
        "biz_status":true,
        "auto_switch":true,
        "sub_biz_status":1
    }
}
```