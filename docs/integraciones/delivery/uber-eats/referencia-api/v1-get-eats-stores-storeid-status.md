<!-- fuente: https://developer.uber.com/docs/eats/references/api/v1/get-eats-stores-storeid-status -->
## Get Restaurant Status

`GEThttps://api.uber.com/v1/eats/store/{store_id}/status`

**Access to These APIs May Require Written Approval From Uber**

Uber’s APIs are always under development and as such are subject to changes according to our Versioning & Upgrade policy. As part of Uber’s ongoing privacy improvements, we’ve updated our Developer API program with new scope access policies for third party applications. For further information, please refer to our Getting Started guide in the navigation panel.

This _Get Restaurant Status_ endpoint retrieves the online status of a restaurant.

##### Authorization

OAuth 2.0 Bearer token with the `eats.store` scope. For more information, see [Authentication](/docs/eats/guides/authentication).

##### Path Parameters

| Name | Type | Description |
| --- | --- | --- |
| `store_id` | `string` | Unique identifier representing a store. |

##### Response

```
{
    "status": "OFFLINE",
    "offlineReason": "OUT_OF_MENU_HOURS"
}
```

##### Response Body Parameters

| Name | Type | Description |
| --- | --- | --- |
| `status` | `string` | Field indicating the online status of the restaurant. |
| `offlineReason` | `string` | Field indicating the reason the restaurant is offline.  
  
**POSSIBLE VALUES**:
-   `OUT_OF_MENU_HOURS`: Restaurant is outside of business hours
-   `INVISIBLE`: Restaurant is not visible in app
-   `PAUSED_BY_UBER`: Restaurant was paused by Uber; shows as “Currently Unavailable” in app
-   `PAUSED_BY_RESTAURANT`: Restaurant paused themselves; shows as “Currently Unavailable” in app

 |

[

Authorization

](#authorization)[

Path Parameters

](#path-parameters)[

Response

](#response)[

Response Body Parameters

](#response-body-parameters)
