<!-- fuente: https://developer.uber.com/docs/eats/references/api/v1/post-eats-orders-orderid-restaurantdelivery-status -->
## Update Delivery Status

`POSThttps://api.uber.com/v1/eats/orders/{order_id}/restaurantdelivery/status`

**Access to These APIs May Require Written Approval From Uber**

Uber’s APIs are always under development and as such are subject to changes according to our Versioning & Upgrade policy. As part of Uber’s ongoing privacy improvements, we’ve updated our Developer API program with new scope access policies for third party applications. For further information, please refer to our Getting Started guide in the navigation panel.

For orders that are delivered by merchant-coordinated couriers, the _Update Delivery Status_ endpoint allows a developer to mark the delivery status of an order as ‘started’, ‘arriving’, or ‘delivered’. This endpoint is not compatible with Uber-coordinated delivery or pickup orders.

##### Authorization

OAuth 2.0 Bearer token with the `eats.store.orders.restaurantdelivery.status` scope. For more information, see [Authentication](/docs/eats/guides/authentication).

##### Path Parameters

| Name | Type | Description |
| --- | --- | --- |
| `order_id` | `string` | Unique identifier representing an order on Uber Eats. |

##### Request Body Parameters

| Name | Type | Description |
| --- | --- | --- |
| `status` | `string` **(enum)** | The delivery status for the order.  
  
**ALLOWED VALUES**:
-   `started`
-   `arriving`
-   `delivered`

  
**Note**: While not required, usage of all statuses is recommended to keep customers as informed as possible on the status of their order. |

##### Response

`Status-Code: 204 No Content`

This endpoint returns an empty response body.

##### Request Example

```
{
  "status": "delivered"
}
```

[

Authorization

](#authorization)[

Path Parameters

](#path-parameters)[

Request Body Parameters

](#request-body-parameters)[

Response

](#response)[

Request Example

](#request-example)
