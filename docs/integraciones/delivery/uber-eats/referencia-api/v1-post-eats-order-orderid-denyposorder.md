<!-- fuente: https://developer.uber.com/docs/eats/references/api/v1/post-eats-order-orderid-denyposorder -->
## Deny Order

`POSThttps://api.uber.com/v1/eats/orders/{order_id}/deny_pos_order`

**Access to These APIs May Require Written Approval From Uber**

Uber’s APIs are always under development and as such are subject to changes according to our Versioning & Upgrade policy. As part of Uber’s ongoing privacy improvements, we’ve updated our Developer API program with new scope access policies for third party applications. For further information, please refer to our Getting Started guide in the navigation panel.

This endpoint allows a developer to reject an order coming from Uber on behalf of a merchant. This does not necessarily cancel the order immediately, as the store might still want to accept orders on their in-store tablet. You must be the store’s nominated order manager app to call this endpoint.

##### Authorization

OAuth 2.0 Bearer token with the `eats.order` scope. For more information, see [Authentication](/docs/eats/guides/authentication).

##### Path Parameters

| Name | Type | Description |
| --- | --- | --- |
| `order_id` | `string` | Unique identifier representing an order on Uber Eats. |

##### Request Example

```
{
   "reason": {
      "explanation":"failed to submit order",
      "code":"ITEM_AVAILABILITY",
      "out_of_stock_items":[
         "540cb880-0286-417b-9c6c-be586fd50f76",
         "094f3308-4389-4ce5-bf30-ce9e09c6ed1c"
      ],
      "invalid_items":[
         "1cd26db9-6be3-4b0a-9216-e4868c5d79ec"
      ]
   }
}
```

##### Request Body

| Name | Type | Description |
| --- | --- | --- |
| `reason` | `object` | Object containing details about the order denial. |
| `reason.explanation` | `string` | Reason or note for denial. |
| `reason.code` | `string enum` | Reason code from set list of possible predefined values. Examples for each can be found [here](#request-body-allowed-reason-codes). |
| `reason.out_of_stock_items` | `array[]` (optional) | Array of identifiers of out of stock items. |
| `reason.invalid_items` | `array` (optional) | Array of identifiers of invalid items. |

##### Response

`Status-Code: 204 No Content`

This endpoint returns an empty response body.

##### Request Body - Allowed Reason Codes

| Reason Code | Examples |
| --- | --- |
| `STORE_CLOSED` | 
-   Store closed
-   Orders submitted outside of operational hours
-   Holiday Hours not honored

 |
| `POS_NOT_READY` | 

-   Sale ring up in progress
-   Drawer/Till open
-   End of Day batchout in progress

 |
| `POS_OFFLINE` | 

-   POS Offline
-   Internet Outage
-   Technical issue in-store

 |
| `ITEM_AVAILABILITY` | 

-   Order contains out of stock items
-   Item not available during service hours (Breakfast, Lunch, Late Night, etc.)

 |
| `MISSING_ITEM` | 

-   Order is missing a required menu selection
-   Item is missing a required choice selection
-   Invalid quantity rules set in menu on parent modifier group

 |
| `MISSING_INFO` | 

-   Missing Required Order detail
-   Item is missing a required choice selection

 |
| `PRICING` | 

-   Mismatch in item pricing
-   Mismatch in expected subtotal
-   Incorrect Tender format

 |
| `CAPACITY` | 

-   No open capacity slots
-   Invalid pickup times
-   Rejected due to busy store

 |
| `ADDRESS` | 

-   Missing required address
-   Invalid geo-coordinates and/or textual identifier

 |
| `SPECIAL_INSTRUCTIONS` | 

-   Item level instructions on UberEats order
-   Allergen Info provided on UberEats order
-   Utensil opt-in / opt-out instruction

 |
| `OTHER` | 

-   Generic Error Response
-   Blank/Null Response

 |

[

Authorization

](#authorization)[

Path Parameters

](#path-parameters)[

Request Example

](#request-example)[

Request Body

](#request-body)[

Response

](#response)[

Request Body - Allowed Reason Codes

](#request-body-allowed-reason-codes)
