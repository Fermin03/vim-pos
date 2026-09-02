<!-- fuente: https://developer.uber.com/docs/eats/references/api/v1/get-eats-stores-storeid -->
## Get Store Details

`GEThttps://api.uber.com/v1/eats/stores/{store_id}`

**Access to These APIs May Require Written Approval From Uber**

Uber’s APIs are always under development and as such are subject to changes according to our Versioning & Upgrade policy. As part of Uber’s ongoing privacy improvements, we’ve updated our Developer API program with new scope access policies for third party applications. For further information, please refer to our Getting Started guide in the navigation panel.

This _Get Store Details_ endpoint allows a developer pull the metadata about a specific store.

##### Authorization

OAuth 2.0 Bearer token with the `eats.store` scope. For more information, see [Authentication](/docs/eats/guides/authentication).

##### Path Parameters

| Name | Type | Description |
| --- | --- | --- |
| `store_id` | `string` | Unique identifier representing a store. |

##### Response

```
{
  "name": "Sushi Sushi Sushi",
  "store_id": "7e973b58-40b7-4bd8-b01c-c7d1cbd194f6",
  "location": {
    "address": "636 W 28th Street",
    "address_2": "Floor 3",
    "city": "New York",
    "country": "US",
    "postal_code": "10001",
    "state": "NY",
    "latitude": 40.7527198,
    "longitude": -74.00635
  },
  "contact_emails": [
    "owner@example.com",
    "announcements+uber@example.com",
    "store-east@example.com"
  ],
  "raw_hero_url": "https://www.example.com/hero_url_east.png",
  "price_bucket": "$$$",
  "avg_prep_time": 5,
  "status": "active",
  "merchant_store_id": "42",
  "timezone": "America/New_York",
  "web_url": "https://www.ubereats.com/new-york/east-coast-sushi",
  "pos_data": {
    "integration_enabled": true,
    "order_manager_client_id": "XxXxXxXxXxXxXxXxXxXxX",
    "integrator_store_id": "mypos-sushi3-42",
    "integrator_brand_id": "sushi3",
    "store_configuration_data": "{\"hideMenuItems\": [\"salmon\", \"yellowtail\"]}",
    "is_order_manager_pending": true
  }
}
```

##### Response Body Parameters

| Name | Type | Description |
| --- | --- | --- |
| `name` | `string` | The name of the store. This is the same name that is displayed to eaters in Uber Eats. |
| `store_id` | `string` | Globally unique private identifier of the store. |
| `location` | `object` | Object representing the physical location of the store. |
| `contact_emails` | `array` | Array of emails meant to receive regular communications from Uber. |
| `raw_hero_url` | `string` | URL of the main image displayed to the eater when browsing for a store. SSL Required. Recommended resolution: `2880x2304`. |
| `price_bucket` | `string` | The price range of items available at the restaurant. Valid buckets are `$`, `$$`, `$$$`, `$$$$`. |
| `avg_prep_time` | `integer` | Average amount of time preparing an order takes, in minutes. |
| `status` | `string` | Current operational status of the store. Valid values: `active`, `pending_review`, `deleted`, `rejected`. |
| `merchant_store_id`  
~`partner_store_id`~ | `string` | The store ID provided to Uber for merchant mapping and reporting purposes. This field will be omitted if a mapping has not been set up. To update the `merchant_store_id` for a given store, the merchant should contact their Uber account team. Each integration partner can store and update their own IDs via [`PATCH /pos_data`](/docs/eats/api/v1/patch-eats-stores-storeid-posdata). |
| `timezone` | `string` | IANA timezone of the store. |
| `web_url` | `string` | The public URL that customers can use to place orders against this store. |
| `pos_data` | POSData | A subset of the information available from the [`GET /pos_data`](/docs/eats/api/v1/get-eats-stores-storeid-posdata) endpoint. |

##### Response Body Parameters - Location

| Name | Type | Description |
| --- | --- | --- |
| `address` | string | The top address line of the store location. |
| `address_2` | string | The second address line of the store location such as the floor or suite. This field is optional. |
| `city` | string | The city of the store location. |
| `state` | string | The state or province of the store location such as `CA`. |
| `postal_code` | string | The postal code of the store location. |
| `country` | string | The country of the delivery pickup location such as `US`. |
| `latitude` | float | (Optional) Latitude of the store location. |
| `longitude` | float | (Optional) Longitude of the store location. |

[

Authorization

](#authorization)[

Path Parameters

](#path-parameters)[

Response

](#response)[

Response Body Parameters

](#response-body-parameters)[

Response Body Parameters - Location

](#response-body-parameters-location)
