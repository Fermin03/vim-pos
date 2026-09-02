<!-- fuente: https://developer.uber.com/docs/eats/references/api/v1/post-eats-order-orderid-acceptposorder -->
## Accept Order

`POSThttps://api.uber.com/v1/eats/orders/{order_id}/accept_pos_order`

**Access to These APIs May Require Written Approval From Uber**

Uber’s APIs are always under development and as such are subject to changes according to our Versioning & Upgrade policy. As part of Uber’s ongoing privacy improvements, we’ve updated our Developer API program with new scope access policies for third party applications. For further information, please refer to our Getting Started guide in the navigation panel.

This endpoint allows a developer to accept an order on behalf of a merchant. You must be the store’s nominated order manager app to call this endpoint.

##### Authorization

OAuth 2.0 Bearer token with the `eats.order` scope. For more information, see [Authentication](/docs/eats/guides/authentication).

##### Path Parameters

| Name | Type | Description |
| --- | --- | --- |
| `order_id` | `UUID` | Unique identifier representing an order on Uber Eats. |

##### Request Example

```
{
  "reason": "Accepted by Rosie F.",
  "external_reference_id": "Check #146",
  "fields_relayed": {
    "order_special_instructions": true,
    "promotions": true
  },
  "order_pickup_instructions": "The lobby is closed, please use the drive-thru lane"
}
```

##### Request Parameters

| Name | Type | Description |
| --- | --- | --- |
| `reason` | `string` | Reason or note for acceptance. |
| `pickup_time` | `integer` (optional) | Time when order will be ready for pick-up, specified as a Unix timestamp (seconds since Jan 1, 1970). |
| `external_reference_id` | `string` (optional) | Used to assign a custom/3rd-party order ID. This can be subsequently retrieved using the [GET /<order\_uuid>](/docs/eats/api/v2/get-eats-order-orderid) endpoint. |
| `fields_relayed` | [FieldsRelayed {}](#request-body-parameters-fieldsrelayed) (optional) | Used to surface the Eats features supported by the order integration. |
| `order_pickup_instructions` | `string` (optional) | Update an individual order’s pickup instructions for the courier. |

##### Request Body Parameters - FieldsRelayed

| Name | Type | Description |
| --- | --- | --- |
| `order_special_instructions` | `boolean` (optional) | Set as true if the order integration supports [order-level special instructions](/docs/eats/api/v2/get-eats-order-orderid#response-body-cart). |
| `item_special_instructions` | `boolean` (optional) | Set as true if the order integration supports [item-level special instructions](/docs/eats/api/v2/get-eats-order-orderid#response-body-item). |
| `item_special_requests` | `boolean` (optional) | Set as true if the order integration supports [special requests](/docs/eats/api/v2/get-eats-order-orderid#response-body-special-requests). |
| `promotions` | `boolean` (optional) | Set as true if the order integration supports [Eats promotions](/docs/eats/api/v2/get-eats-order-orderid#response-body-promotions). |

##### Response

`Status-Code: 204 No Content`

This endpoint returns an empty response body.

[

Authorization

](#authorization)[

Path Parameters

](#path-parameters)[

Request Example

](#request-example)[

Request Parameters

](#request-parameters)[

Request Body Parameters - FieldsRelayed

](#request-body-parameters-fieldsrelayed)[

Response

](#response)
