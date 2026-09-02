<!-- id=1944 path=Food Menu API > Update One Item -->
## Update One Item V3

`POST` [https://openapi.didi-food.com/v3/item/item/updateItem](https://openapi.didi-food.com/v3/item/item/updateItem)

The **Update One Item** endpoint gives you the ability to update one item already uploaded to a menu. You can change all fields but the `app_item_id`.

> **NOTE**
> 
> It is **NOT** possible to update a promotion set with the menu with this endpoint. If you want to update a certain item promotion, please resubmit the whole menu through the corresponding

### Request Body Parameters 

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- |--------------| --- |
| `auth_token` | string | The `auth_token` for the shop. | Yes          | ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU= |
| `app_item_id` | string | All of the IDs for the items provided by the restaurant. | Yes          | Hamburguesas01 |
| `app_external_id` | string/json | Free-form text field reserved for the restaurant's use, e.g. for POS integrations. | No           | {"key":"value"} |
| `item_name` | string | Item name to be displayed. Max length: 50 characters. | Yes          | Hamburguesas |
| `short_desc` | string | An optional description for the Item. Max length: 300 characters. | No           | null |
| `sold_info_intl` | list[struct] | Sales period per day. The continuous time span during which the item is available. | No           |     |
| `head_img` | string | The URL for the item’s image.  **Requirements:** Hosted on a secure connection (SSL); File size with less than 10MB; Min. width and height: 320px; Max. width and height: 1144px.  **Formats supported:** JPEG, PNG or GIF. | No           | https://imgurl.host/static/rlabtest/ |
| `price` | int | The price to charge for ordering the item. Allows overrides from items selected in modifier groups.  **Note:** Price is always an integer value (never decimals) because the price is set in the lowest denomination (e.g. cents for MX currency, not Peso). | Yes          | 100 |
| `tax_rate` | int | The tax rate of item per 1000. **Note:** Only support for **Japan**, and it's required in Japan. | No           | 800 |
| `priority` | int | The priority (order) of the item to be displayed in C-App. | No           | 1   |
| `status` | int | Status of the item to be shown in C-App. 1: Available; 2: Unavailable. | Yes          | 1   |
| `is_sold_separately` | bool | true: The item can be sold separately; false: The item can only be sold as part of a modifier group. | Yes          | true   |
| `tax_info_list ` | list[struct] | Tax information for the item. See TaxInfo structure below for details. | No | [] |

### Request Body Parameters - sold_info_intl

The time span information to make an item visible.

| **Name** | **Type** | **Description** | **Required** | **Example** |
|---|---|---|---|---|
| `time`  | array | Beginning and end times when the item should be made available.  **Time format:** HH:mm. | Yes. Leave empty to specify the whole day. | {"begin":"10:00","end":"12:00"} |
| `day` | array | Days in which the item is sold.  **Accepted values** from 1 (Monday) to 7 (Sunday).      | Yes. Leave empty if `specialDay` is specified. | [1,2,3,4,5,6,7]                 |
| `specialDay` | array | Special rules for specific special day(s).  **Date format:** yyyy-MM-dd                  | No | ["2020-12-25", "2020-12-26"] |

### Request Body Parameters - tax_info_list

Detailed tax configuration for an item. It is a list of tax objects, each with a tax type and rate.  
**Validation rules**:

- If `type` is not empty, then `rate` is **required**; otherwise the whole item creation will fail with error: 
- `type` is an enum: `1` = IVA, `2` = IEPS.
- `rate` is an integer representing the tax value in basis points (e.g. 16.00% → 1600).
  - If `type = 1` (IVA), `rate` **must be 0 or 1600** (16.00%). Any other value will cause an error.
  - If `type = 2` (IEPS), `rate` **must be between 0 and 10000** (inclusive). Any other value will cause an error.
- If `type` is empty, `rate` is optional and will be ignored.

| **Name** | **Type** | **Description**  | **Required** |  **Example**  |
|---|---|---|---|---|
| `type` | int | Tax type. `1` = IVA, `2` = IEPS. | No. Required if `rate` is provided. | 1 |
| `rate` | int | Tax rate in integer (e.g. 1600 for 16.00%).  If `type=1`, must be `0` or `1600`. If `type=2`, must be between `0` and `10000`. | No. Required if `type` is not empty. |1600 |

### Request Example

```json
{
	"auth_token":"MWM2ZDI1N2Q2ODRiNDcxZmNlM2IwNDhiMjNmNDkyNDE=",
	"item_name":"item_3",
	"priority":4,
	"short_desc":"",
	"price":3000,
	"status":2,
	"app_item_id":"item_3",
	"is_sold_separately":true,
	"tax_info":[
		{
			"taxType":0,
			"taxRate":1600
		}
	]
}
```

### Response Example

```json
{
    "errno":0,
    "errmsg":"ok",
    "requestId":"1e0767f77b1219ce",
    "time":1627543538,
    "data":{

    }
}
```
