<!-- fuente: https://developer.uber.com/docs/eats/references/api/v1/post-eats-stores-storeid-status -->
## Set Restaurant Status

`POSThttps://api.uber.com/v1/eats/store/{store_id}/status`

**Access to These APIs May Require Written Approval From Uber**

Uber’s APIs are always under development and as such are subject to changes according to our Versioning & Upgrade policy. As part of Uber’s ongoing privacy improvements, we’ve updated our Developer API program with new scope access policies for third party applications. For further information, please refer to our Getting Started guide in the navigation panel.

This _Set Restaurant Status_ endpoint sets the online status of a restaurant.

##### Authorization

OAuth 2.0 Bearer token with the `eats.store.status.write` scope. For more information, see [Authentication](/docs/eats/guides/authentication).

##### Path Parameters

| Name | Type | Description |
| --- | --- | --- |
| `store_id` | `string` | Unique identifier representing a store. |

##### Request Body Parameters

| Name | Type | Description |
| --- | --- | --- |
| `status` | string (**enum**) | The desired status of the restaurant.  
  
**ALLOWED VALUES**:
-   `ONLINE`: Accepting new orders
-   `PAUSED`: Not accepting orders, show as “currently unavailable” in app

 |
| `paused_until` | string | The timestamp until which a store will not be accepting new orders.  
  
**ALLOWED FORMATS**:

-   `YYYY-MM-DDT00:00:00+00:00`
-   `YYYY-MM-DDT00:00:00Z`

 |
| `reason` | string | The reason for the change of status. |

##### Example Request

```
{
  "status": "PAUSED",
  "paused_until": "2022-01-06T03:02:11.999+12:00",
  "reason": "Store is unable to accept orders"
}
```

##### Response

```
Status-Code: 204 No Content
```

[

Authorization

](#authorization)[

Path Parameters

](#path-parameters)[

Request Body Parameters

](#request-body-parameters)[

Example Request

](#example-request)[

Response

](#response)
