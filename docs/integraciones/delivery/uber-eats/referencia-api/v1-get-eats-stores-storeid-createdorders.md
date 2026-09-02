<!-- fuente: https://developer.uber.com/docs/eats/references/api/v1/get-eats-stores-storeid-createdorders -->
## Get Active Created Orders

`GEThttps://api.uber.com/v1/eats/stores/{store_id}/created-orders`

**Access to These APIs May Require Written Approval From Uber**

Uber’s APIs are always under development and as such are subject to changes according to our Versioning & Upgrade policy. As part of Uber’s ongoing privacy improvements, we’ve updated our Developer API program with new scope access policies for third party applications. For further information, please refer to our Getting Started guide in the navigation panel.

This endpoint allows a developer to retrieve all orders for a given restaurant that are in the `CREATED` state. This state is designated as after an eater places the order, and before a restaurant manipulates the order via the [Accept Order API](post-eats-orders-orderid-acceptposorder), [Deny Order API](post-eats-orders-orderid-denyposorder), or physically accepts it in Uber Eats Orders. Orders are sorted from oldest to most recent in the response body.

Note the developer account may only read from restaurants with which it is affiliated with in the restaurant’s “Users” list in Uber Eats Manager.

##### Authorization

OAuth 2.0 Bearer token with the `eats.store.orders.read` scope. For more information, see [Authentication](/docs/eats/guides/authentication).

##### Path Parameters

| Name | Type | Description |
| --- | --- | --- |
| `store_id` | `string` | Unique identifying string for a restaurant on Uber Eats, provided by Uber. |

##### Query Parameters

| Name | Type | Description |
| --- | --- | --- |
| `limit` | `number` | The maximum number of orders to return. |

#### Request Parameters

No request body.

#### Response - Body

| Name | Type | Description |
| --- | --- | --- |
| orders | list<[Order](#response-order)\> | An array of orders in the `CREATED` state for this restaurant from oldest to youngest placed on the Uber Eats platform. |

#### Response - Order

| Name | Type | Description |
| --- | --- | --- |
| `id` | `string` | Unique identifier for the order, provided by Uber Eats. |
| `current_state` | `string` (enum) | The current state of the order. Will always be `CREATED` |
| `placed_at` | `string` | The time at which the order was placed, represented in ISO 8601 format - e.g. “2019-05-14T15:16:54.723Z” |

##### Request Example

```
curl -X GET \
  -H 'authorization: Bearer YOUR_TOKEN' \
  https://api.uber.com/v1/eats/stores/5e3d0095-1bf0-4896-af2e-f1a1182d16fc/created-orders?limit=2
```

#### Response Example

```
HTTP/2 200
```
```
{
  "orders": [
    {
      "id": "6f31ed52-3cf3-4bdf-8ed1-19d9c80ab625",
      "current_state": "CREATED",
      "placed_at": "2019-09-23T16:16:30Z"
    },
    {
      "id": "d1372440-f03a-41e5-a292-99494fbb33ac",
      "current_state": "CREATED",
      "placed_at": "2019-09-23T16:20:11Z"
    }
  ]
}
```

[

Authorization

](#authorization)[

Path Parameters

](#path-parameters)[

Query Parameters

](#query-parameters)[

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
