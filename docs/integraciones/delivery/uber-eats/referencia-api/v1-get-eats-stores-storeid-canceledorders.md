<!-- fuente: https://developer.uber.com/docs/eats/references/api/v1/get-eats-stores-storeid-canceledorders -->
## Get Latest Canceled Orders

`GEThttps://api.uber.com/v1/eats/stores/{store_id}/canceled-orders`

**Access to These APIs May Require Written Approval From Uber**

Uber’s APIs are always under development and as such are subject to changes according to our Versioning & Upgrade policy. As part of Uber’s ongoing privacy improvements, we’ve updated our Developer API program with new scope access policies for third party applications. For further information, please refer to our Getting Started guide in the navigation panel.

This endpoint allows a developer to retrieve all orders for a given restaurant that are in the `CANCELED` state within the last 2 hours. This state is reached if a developer cancels the order via the [Cancel Order API](post-eats-orders-orderid-cancel), manually through Uber Eats Orders, or the order is canceled by a member of the support team for other reasons. Orders are sorted in order of recency in the response body.

Note the developer account may only read from restaurants with which it is affiliated in the restaurant’s “Users” list in Uber Eats Manager.

##### Authorization

OAuth 2.0 Bearer token with the `eats.orders` or `eats.deliveries` scope. For more information, see [Authentication](/docs/eats/guides/authentication).

##### Path Parameters

| Name | Type | Description |
| --- | --- | --- |
| `store_id` | `string` | Unique identifying string for a restaurant on Uber Eats, provided by Uber. |

#### Request Parameters

No request body.

#### Response - Body

| Name | Type | Description |
| --- | --- | --- |
| orders | list<[Order](#response-order)\> | An array of orders in canceled/failed state for this restaurant from youngest to oldest that have been canceled over the past 2 hours placed on the Uber Eats platform. |

#### Response - Order

| Name | Type | Description |
| --- | --- | --- |
| `id` | `string` | Unique identifier for the order, provided by Uber Eats. |
| `current_state` | `string` (enum) | The current state of the order. Will always be `CANCELED` |
| `placed_at` | `string` | The time at which the order was placed, represented in ISO 8601 format - e.g. “2019-05-14T15:16:54.723Z” |

##### Request Example

```
curl -X GET \
  -H 'authorization: Bearer YOUR_TOKEN' \
  https://api.uber.com/v1/eats/stores/5e3d0095-1bf0-4896-af2e-f1a1182d16fc/canceled-orders
```

#### Response Example

```
HTTP/2 200
```
```
{
  "orders": [
    {
      "id": "d5bca2e7-db70-4bae-9331-fa4412786879",
      "current_state": "CANCELED",
      "placed_at": "2019-09-24T19:59:02Z"
    }
  ]
}
```

[

Authorization

](#authorization)[

Path Parameters

](#path-parameters)[

Request Parameters

](#request-parameters)[

Response - Body

](#response-body)[

Response - Order

](#response-order)[

Request Example

](#request-example)[

Response Example

](#response-example)
