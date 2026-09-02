<!-- fuente: https://developer.uber.com/docs/eats/references/api/v1/post-eats-order-orderid-cancel -->
## Cancel Order

`POSThttps://api.uber.com/v1/eats/orders/{order_id}/cancel`

**Access to These APIs May Require Written Approval From Uber**

Uber’s APIs are always under development and as such are subject to changes according to our Versioning & Upgrade policy. As part of Uber’s ongoing privacy improvements, we’ve updated our Developer API program with new scope access policies for third party applications. For further information, please refer to our Getting Started guide in the navigation panel.

This endpoint allows a developer to cancel live orders by their UUID. If the order is already in a terminal state, or the order never existed, then this endpoint will return a 404.

Note the developer account may only read from restaurants with which it is affiliated in the restaurant’s “Users” list in Uber Eats Manager.

##### Authorization

OAuth 2.0 Bearer token with the `eats.order` or `eats.deliveries` scopes. For more information, see [Authentication](/docs/eats/guides/authentication).

##### Path Parameters

| Name | Type | Description |
| --- | --- | --- |
| `order_id` | `string` | Unique identifying string for an order on Uber Eats |

##### Request Parameters

| Name | Type | Description |
| --- | --- | --- |
| `reason` | `string enum` | The reason for canceling the order.  
  
Allowed values:
-   `OUT_OF_ITEMS`
-   `KITCHEN_CLOSED`
`CUSTOMER_CALLED_TO_CANCEL`-   `RESTAURANT_TOO_BUSY`
-   `CANNOT_COMPLETE_CUSTOMER_NOTE`
-   `OTHER`

 |
| `details` | `string` (optional) | Reason if `OTHER` above is selected. |
| `cancelling_party` | `string enum` | The party responsible for canceling the order. This field is only used for Uber Direct. Allowed values:

-   `MERCHANT`
-   `CUSTOMER`

 |

#### Response Parameters

Empty response body

##### Request Example

```
curl -X POST \
  -H 'authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"reason":"CANNOT_COMPLETE_CUSTOMER_NOTE","details":"note is impossible"}' \
  https://api.uber.com/v1/eats/orders/3206c818-6008-42e8-8e2f-f87048ff7c1c/cancel
```

#### Response Example

```
HTTP/2 200

{}
```

[

Authorization

](#authorization)[

Path Parameters

](#path-parameters)[

Request Parameters

](#request-parameters)[

Response Parameters

](#response-parameters)[

Request Example

](#request-example)[

Response Example

](#response-example)
